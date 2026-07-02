# Architecture

This document covers how the system is put together, why the database schema looks the way it does, the reasoning behind the API's design, and exactly how raw NMEA sentences turn into vessel data on the map. For setup and run instructions, see the main [README](../README.md).

---

## 1. System architecture

### Overview

![System architecture diagram: AIS feed flows through a TCP/UDP socket, sentence deduper, decoder, and persistence layer into MongoDB, which is read by both the WebSocket broadcaster and the REST API; a cleanup job separately prunes stale records; the frontend receives both WebSocket events and REST responses.](./architecture-diagram.svg)

The numbered badges above the ingestion pipeline (1–4) correspond to the step-by-step walkthrough in [§4, NMEA decoding implementation](#4-nmea-decoding-implementation) below.

Two things are worth noticing about this shape. First, **ingestion and delivery are decoupled through an event emitter, not a direct function call.** The AIS pipeline doesn't know WebSocket clients exist — it just emits an event after a successful database write. The WebSocket handler is just one listener among potentially several; a second consumer (metrics, alerting, an audit log) could subscribe to the same events without either side changing. Second, **the REST API and the WebSocket stream both read from the same MongoDB collection as their single source of truth** — there's no separate in-memory cache that could drift out of sync with what's actually persisted.

### Folder structure

The code is organized around **vertical feature slices** rather than horizontal layers like "controllers" and "services." Each feature under `src/features/` owns everything it needs — router, usecase, Zod schema, and tests — end to end:

```
src/
  config/            # env.ts (validated env vars), constants.ts (AIS type table, thresholds)
  features/
    ais-feed/               # TCP/UDP connection, dedup, decoding, persistence
    get-all-vessels/        # GET /api/vessels
    get-vessel/              # GET /api/vessels/:mmsi
    get-vessels-in-bounds/  # GET /api/vessels/in-bounds
    stream-vessels/          # WebSocket handler
    cleanup-vessels/         # scheduled job that deletes stale vessel records
    vessels.router.ts        # composes the above into one Express router
  shared/
    db/            # Mongoose connection + Vessel model
    errors/        # AppError, ValidationError, 404 handler
    events/        # typed EventEmitter bridging AIS ingestion → WebSocket broadcast
    logger/        # Pino instance
    middleware/     # request logging, Zod-based request validation, global error handler
    utils/         # catchAsync (wraps async route handlers so thrown errors reach Express)
  app.ts           # Express app: middleware stack, routes
  server.ts        # HTTP server, WebSocket server, DB connection, graceful shutdown
```

A usecase never imports Express types, and a router never talks to Mongoose directly — the handler is the only thing that touches both. That boundary is what makes each usecase testable with a mocked model and no HTTP layer involved at all (see the `.test.ts` files alongside each usecase).

### Process lifecycle

`server.ts` is the only file that knows about startup and shutdown ordering. On boot: connect to MongoDB → build the Express app → attach a `ws` WebSocket server to the _same_ HTTP server (one port, not two) → start listening → start the AIS feed connection → start the cleanup job.

On `SIGTERM`/`SIGINT`, that order runs in reverse: stop the AIS feed and cleanup job first (so nothing new gets written mid-shutdown), tell every connected WebSocket client the server is going away (close code `1001`, not just a silently dropped connection), close the HTTP server, then disconnect from MongoDB. A 10-second watchdog timer forces an exit if any step hangs, so a stuck connection can't prevent a deploy from completing.

The WebSocket layer also runs a 30-second heartbeat independent of shutdown: every client gets pinged, and any client that didn't respond to the _previous_ ping gets terminated. This catches connections that went silently dead (closed laptop lid, dropped mobile network) without waiting on a TCP-level timeout that can take minutes to fire on its own.

---

## 2. Database schema design

A single `Vessel` collection in MongoDB, keyed by a unique `mmsi`:

| Field group   | Fields                                                                                                                             | Notes                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Identity      | `mmsi`                                                                                                                             | Unique index — this is what every upsert matches on                      |
| Position      | `location`, `sog`, `cog`, `heading`                                                                                                | `location` is a GeoJSON `Point`, `[lon, lat]` order per the GeoJSON spec |
| Voyage/static | `name`, `vesselType`, `navStatus`, `rot`, `callsign`, `imo`, `destination`, ETA fields, `draught`, four dimension fields, `classB` | All nullable — a vessel might have only sent a position report so far    |
| Bookkeeping   | `lastSeen`, `rawSentence`, `createdAt`/`updatedAt`                                                                                 | `lastSeen` drives both the active-vessel filter and the cleanup job      |

**Indexes:**

- `location: '2dsphere'` (sparse) — supports the `in-bounds` endpoint's `$geoWithin: { $box: [...] }` query. Sparse because a vessel that's only sent a static report has no `location` yet.
- `lastSeen: 1` — supports both the 15-minute active-vessel filter used by every read endpoint, and the 24-hour stale-vessel cleanup query.
- `navStatus: 1` — not yet used by an endpoint, but included for a filter-by-status feature that's a likely next addition (e.g., "show only underway vessels").

**Why upsert-by-MMSI instead of insert-then-update:** `applyVesselUpdate` calls `findOneAndUpdate({ mmsi }, { $set: setFields }, { upsert: true })` in a single atomic operation. This is what the assignment means by "handle vessel position updates" and "handle duplicate MMSI entries" — there's no separate "does this vessel exist?" check followed by a conditional insert or update, which would leave a window for two updates to the same vessel to race each other. `setFields` is also built to contain _only_ the fields the incoming message actually carried, so a static-only report (like a type-24 message with no position) can never accidentally null out a vessel's last known coordinates.

**Why a 15-minute active window instead of returning every vessel ever seen:** AIS coverage is regional and vessels move in and out of range constantly. Without a recency filter, the map would accumulate every vessel the feed has ever mentioned, including ones that sailed out of range hours ago. `ACTIVE_VESSEL_WINDOW_MS` (15 minutes) keeps every read endpoint showing only vessels plausibly still nearby.

**Why a separate 24-hour cleanup job on top of that:** the active-window filter hides old vessels from API responses, but the records still sit in MongoDB indefinitely unless something removes them. `cleanup-vessels.job.ts` runs every 30 minutes and permanently deletes any vessel untouched for 24+ hours, so the collection doesn't grow without bound over a long-running deployment.

---

## 3. API design decisions

### Endpoints

| Method | Path                     | Description                                                                     |
| ------ | ------------------------ | ------------------------------------------------------------------------------- |
| `GET`  | `/api/vessels`           | All vessels seen in the last 15 minutes                                         |
| `GET`  | `/api/vessels/:mmsi`     | Full detail for one vessel by its 9-digit MMSI                                  |
| `GET`  | `/api/vessels/in-bounds` | Vessels within a map viewport (`swLng`, `swLat`, `neLng`, `neLat` query params) |
| `GET`  | `/health`                | Liveness check — unauthenticated, unrate-limited                                |
| WS     | `/ws/vessels`            | Real-time vessel stream (see below)                                             |

Every REST response follows the same envelope — `{ status, results?, data }` — so the frontend has exactly one shape to parse regardless of which endpoint it called.

### Request validation

`validatedRoute` wraps a handler with Zod schemas for `body`/`query`/`params`, parses the request against them before the handler ever runs, and attaches the validated (and type-coerced) result to the request object. A malformed request — say, an `mmsi` that isn't exactly 9 digits, or an `in-bounds` box where the southwest corner isn't actually southwest of the northeast one — never reaches business logic at all; it's rejected at the boundary with a structured 400 response listing exactly which field failed and why.

### Response validation

Validation isn't only applied to inbound requests. `getAllVessels`, `getVesselByMmsi`, and `getVesselsInBounds` all run their MongoDB results through a Zod schema (`vesselSummarySchema` / `vesselDetailSchema`) before returning them. This means a schema drift in the database — a field that became nullable, a type that changed — surfaces immediately as a clear parse error in the logs, instead of silently shipping an unexpected shape to the frontend and breaking something two layers downstream.

### Error handling

`globalErrorHandler` recognizes five distinct failure types and normalizes all of them into the same `{ status, message }` shape:

- `AppError` — the app's own operational errors (404s, validation failures), passed through as-is.
- Mongoose `CastError` — an invalid value for a typed field (e.g., a non-numeric MMSI).
- Mongoose `ValidationError` — a document that failed schema validation on write.
- MongoDB duplicate-key error (code `11000`) — a race that got past the upsert logic.
- `ZodError` — validation failures that escape the `validatedRoute` wrapper.

In development, responses include the stack trace. In production, only `AppError`'s (operational, expected errors) return their message to the client; anything else is logged internally with full detail and the client sees a generic "Something went wrong" — so an unexpected internal failure never leaks implementation details to an API consumer.

### Rate limiting and security headers

Every `/api` route sits behind `express-rate-limit` (300 requests per 15-minute window per client). `helmet` sets standard security headers, `cors` is scoped to an explicit origin allowlist read from `ALLOWED_ORIGINS`, and `hpp` guards against HTTP parameter pollution (e.g., `?swLng=1&swLng=2` resolving unpredictably). CORS is also restricted to `GET` only, since this API doesn't expose any mutating endpoints to the frontend.

### WebSocket protocol

On connect, the server immediately sends a full snapshot of every currently active vessel:

```json
{ "event": "vessel:snapshot", "data": [/* VesselSummary[] */] }
```

After that, one event per change, as it happens:

```json
{ "event": "vessel:created", "data": { /* VesselSummary */ } }
{ "event": "vessel:updated", "data": { /* VesselSummary */ } }
```

Sending a full snapshot on **every** connection — including reconnects after a dropped socket — is a deliberate design choice: it means the frontend never needs a separate REST call to resync after a disconnect. Whatever the client's state was before, the fresh snapshot fully replaces it, so there's no window where the client is running on stale partial data while waiting for a resync request to complete.

---

## 4. NMEA decoding implementation

Turning a raw AIS feed into vessel data happens in five steps, each owned by its own file:

**1. Line reconstruction (`ais-feed-connection.service.ts`).**
AIS feeds arrive over a raw TCP or UDP socket, not a message-oriented protocol — a single `data` event can contain half a sentence, several sentences, or a sentence split across two events. For TCP, incoming bytes are appended to a buffer and split on newlines; anything after the last newline is held back as a partial line until the rest of it arrives in a future chunk. UDP framing is simpler (each datagram is typically already a complete line or set of lines), but the same line-splitting logic is reused for consistency.

**2. Deduplication (`ais-feed-dedup.service.ts`).**
Real AIS aggregators commonly forward the exact same sentence more than once — the same broadcast picked up by multiple shore-station receivers and relayed twice. This is filtered _before_ decoding, using a 5-second rolling window keyed on the raw sentence text itself. Deduplication has to happen at this stage rather than after decoding: by the time a duplicate reaches the decoder, its internal state for reassembling multipart sentences may have already consumed part of the pair, corrupting reconstruction of a _different_, legitimate multipart message arriving in between.

**3. Decoding and validation (`ais-feed-decoder.service.ts`).**
Surviving lines are written into `ais-stream-decoder`, which parses the NMEA armor and reassembles multipart sentences into a single decoded message. Because that library ships with inconsistent CJS/ESM interop across environments, the module's export is resolved defensively at import time — checking for a constructor at `.default` or `.default.default` — and the module throws a clear error immediately at startup if neither shape matches, rather than failing confusingly on the first incoming message. Every decoded message is then parsed against a Zod schema (`rawAisMessageSchema`) before touching any domain logic; a message that doesn't match is logged and dropped, so a decoder bug or unexpected message variant can't crash the ingestion pipeline or write garbage into MongoDB.

**4. Classification and normalization (`normalizeMessage`).**
Each validated message is classified as a position report or a static report using the single lookup table in `constants.ts` (`AIS_MESSAGE_TYPES`), which also determines whether the transmitting vessel is AIS Class A or Class B. Type 24 (Class B static data) is handled as a special case: it's transmitted as two separate single-sentence messages — Part A carries the vessel name, Part B carries callsign, dimensions, and vessel type — so the normalizer only writes name fields when `partNum === 0` and only writes callsign/dimension fields when `partNum === 1`. Without this split, a Part B message arriving after Part A would overwrite the name field with nothing, since Part B's raw payload never contains one.

**5. Persistence (`applyVesselUpdate`, covered in [Database schema design](#2-database-schema-design)).**
The normalized `VesselUpdate` is upserted into MongoDB by MMSI, and a `vessel:created`/`vessel:updated` event is emitted for the WebSocket layer to pick up.

### Fields decoded

| Field                                                | Source AIS message types                       |
| ---------------------------------------------------- | ---------------------------------------------- |
| MMSI                                                 | All supported types                            |
| Position (lat/lon)                                   | 1, 2, 3, 18, 19, 27                            |
| SOG / COG / Heading                                  | 1, 2, 3, 18, 19, 27                            |
| Vessel name                                          | 5 (Class A static), 24 Part A (Class B static) |
| Vessel type                                          | 5, 24 Part B                                   |
| Nav status, rate of turn                             | 1, 2, 3                                        |
| Callsign, IMO, destination, ETA, draught, dimensions | 5, 24 Part B                                   |

This is not the full ITU-R M.1371 message catalogue — only the types this pipeline actively decodes are listed in `AIS_MESSAGE_TYPES`. Adding support for a new type is a one-line addition to that table, and every derived list (`POSITION_REPORT_TYPES`, `STATIC_REPORT_TYPES`, `CLASS_B_REPORT_TYPES`) picks it up automatically.
