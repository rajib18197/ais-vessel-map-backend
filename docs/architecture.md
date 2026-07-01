# AIS Vessel Map Backend Architecture

This document describes the architecture, data model, API design, and AIS decoding implementation for the backend service.
It is written for a senior engineer audience with a focus on clarity, maintainability, and long-term operational quality.

---

## 1. System overview

This backend service is responsible for:

- ingesting a live AIS feed over TCP or UDP
- decoding AIS NMEA data into structured vessel updates
- persisting the latest vessel state into MongoDB
- exposing REST APIs for vessel lookup and geographic queries
- streaming live vessel updates to frontend clients over WebSocket
- cleaning up stale vessel records automatically

The system is intentionally small and focused: it uses one primary data model (`Vessel`), one persistence store, and two access paths (HTTP and WebSocket).

### Primary runtime components

- `src/server.ts`
  - bootstraps the app
  - connects to MongoDB
  - starts the Express HTTP server
  - starts the WebSocket server at `/ws/vessels`
  - starts AIS feed ingestion
  - starts the stale vessel cleanup job

- `src/app.ts`
  - configures security, CORS, compression, request logging, and rate limiting
  - mounts `/health` and `/api/vessels`
  - applies global error handling and not-found handling

- `src/features/ais-feed/*`
  - handles AIS feed connection, sentence deduplication, decoding, normalization, and persistence

- `src/shared/db/models/vessel.model.ts`
  - defines the MongoDB schema for vessel state
  - defines geospatial indexing for location queries

- `src/features/stream-vessels/stream-vessels.handler.ts`
  - exposes realtime updates to connected WebSocket clients

- `src/features/cleanup-vessels/cleanup-vessels.job.ts`
  - removes stale vessels that have not been seen for a configured time window

---

## 2. Architecture diagram

### Logical flow

```
[AIS Source TCP/UDP] --> [AIS Feed Connection] --> [Sentence Deduper] --> [AIS Decoder] --> [Normalize] --> [MongoDB Vessel Collection]
                                                                            |
                                                                            +--> [Event Emitter] --> [WebSocket Live Stream]

[Express HTTP] --> [GET /api/vessels] --> [Active Vessel Query]
                 [GET /api/vessels/:mmsi] --> [Single Vessel Lookup]
                 [GET /api/vessels/in-bounds] --> [Geospatial Query]
```

### Why this shape

- Feed ingestion is separated from persistence and API access.
- Live updates are event-driven, so the WebSocket layer stays lightweight.
- MongoDB holds the canonical state of each vessel.
- The API only returns active vessels, limiting stale data exposure.

---

## 3. Database schema design

The system uses a single MongoDB collection: `Vessel`.

### Vessel document shape

The `Vessel` schema is defined in `src/shared/db/models/vessel.model.ts`.
It stores the current best-known state for each vessel.

Key fields:

- `mmsi` (String, unique)
- `name` (String | null)
- `location` (GeoJSON Point)
- `sog` (Number | null)
- `cog` (Number | null)
- `heading` (Number | null)
- `vesselType` (Number | null)
- `navStatus` (Number | null)
- `rot` (Number | null)
- `callsign` (String | null)
- `imo` (Number | null)
- `destination` (String | null)
- `etaMonth`, `etaDay`, `etaHour`, `etaMinute` (Number | null)
- `draught` (Number | null)
- `dimA`, `dimB`, `dimC`, `dimD` (Number | null)
- `classB` (Boolean)
- `lastSeen` (Date)
- `rawSentence` (String | null)
- `createdAt`, `updatedAt` (auto timestamps)

### Index design

The schema defines three indexes:

- `location: 2dsphere`
  - Enables geospatial queries for bounding-box filtering.
  - Supports queries used by `/api/vessels/in-bounds`.

- `lastSeen`
  - Drives active vessel filtering and cleanup decisions.

- `navStatus`
  - Supports optional future filtering by navigation status.

### Design rationale

- A single collection keeps the model easy to reason about.
- The vessel document is effectively a materialized view of the latest AIS state.
- `lastSeen` is the truth for freshness: it is updated for every received AIS message.
- `rawSentence` is stored for traceability and debugging.
- Geospatial indexing is required for efficient map-based queries.

---

## 4. API design and decisions

The public API is intentionally small and predictable. It is designed for frontend mapping clients and lightweight analytics.

### API surface

- `GET /health`
  - health check endpoint
  - returns service status and timestamp

- `GET /api/vessels`
  - returns all vessels seen within the active vessel window
  - selects only summary fields
  - excludes raw debugging data

- `GET /api/vessels/:mmsi`
  - returns the full vessel detail document for a single MMSI
  - validates that `mmsi` is a 9-digit string
  - returns `404` when missing

- `GET /api/vessels/in-bounds`
  - returns active vessels inside a bounding box
  - requires `swLng`, `swLat`, `neLng`, and `neLat`
  - validates coordinate ranges and box ordering

- `WS /ws/vessels`
  - provides a real-time vessel snapshot and live updates

### Design choices

- Only `GET` endpoints are exposed.
- The API does not mutate vessel state; state changes are driven by the AIS feed.
- Request validation is centralized in `src/shared/middleware/validate.middleware.ts` using `zod`.
- Errors are handled by the global error middleware in `src/shared/middleware/error.middleware.ts`.
- Rate limiting is applied to all `/api` requests with `express-rate-limit`.
- CORS is configured with origin control and only `GET` allowed.

### Active vessel window

Active vessels are defined by `ACTIVE_VESSEL_WINDOW_MS` in `src/config/constants.ts`.
The current value is `15 minutes`.
This means the API returns only vessels that have been observed recently.

### Route validation details

- `GET /api/vessels/:mmsi`
  - `mmsi` must match `^\d{9}$`

- `GET /api/vessels/in-bounds`
  - longitudes must be between `-180` and `180`
  - latitudes must be between `-90` and `90`
  - `swLng < neLng`
  - `swLat < neLat`

### Response shapes

`/api/vessels` and `/api/vessels/in-bounds` return `VesselSummary` objects.
`/api/vessels/:mmsi` returns a `VesselDetail` object.
Validation schemas are defined in:

- `src/features/get-all-vessels/get-all-vessels.types.ts`
- `src/features/get-vessel/get-vessel-by-mmsi.types.ts`

This keeps the API contract explicit and consistent.

---

## 5. NMEA / AIS decoding implementation

This backend does not parse raw NMEA manually. It relies on a specialized AIS decoding library and a small normalization layer.

### Feed input

The feed source is configured in `src/config/env.ts`:

- `AIS_FEED_HOST`
- `AIS_FEED_PORT`
- `AIS_FEED_PROTOCOL` (`tcp` or `udp`)
- `AIS_FEED_RECONNECT_DELAY_MS`

The feed startup happens in `src/features/ais-feed/ais-feed.bootstrap.ts`.
If configuration is missing, the feed is skipped gracefully.

### Connection layer

`src/features/ais-feed/ais-feed-connection.service.ts`

- supports TCP and UDP transport
- for TCP, it buffers incoming chunks and splits on `\n` / `\r\n`
- for UDP, it splits each datagram on newline boundaries
- it hands each trimmed line to the deduper
- it reconnects automatically after errors or disconnects

This makes the connection layer robust for noisy AIS sources.

### Deduplication

`src/features/ais-feed/ais-feed-dedup.service.ts`

- AIS feeds often repeat the same raw sentence multiple times
- deduplication happens before decoding
- this avoids duplicate updates and unnecessary database writes
- the deduper key is the raw sentence text itself

### Decoder layer

`src/features/ais-feed/ais-feed-decoder.service.ts`

- wraps the third-party `ais-stream-decoder` module
- listens for `data` events from the decoder
- parses the decoder output with a `zod` schema
- normalizes the output into a domain-friendly shape
- extracts the last raw sentence from `parsed.sentences`

### Normalization rules

The system only keeps AIS message types it actively understands.
Supported types are derived from a single source of truth in `src/config/constants.ts`.

Supported AIS message kinds:

- position reports: `1`, `2`, `3`, `18`, `19`, `27`
- static reports: `5`, `24`

`24` is handled carefully because it is a multipart static report:

- Part A contains the vessel name
- Part B contains callsign, dimensions, and type information

The normalizer preserves:

- vessel identity fields (`mmsi`, `callsign`, `imo`, `name`)
- position fields (`lat`, `lon`, `sog`, `cog`, `heading`)
- vessel attributes (`vesselType`, `navStatus`, `rot`, `destination`, `eta`, `draught`, `dimensions`)
- class B indicator derived from message type

It ignores unsupported AIS message types and silently drops invalid messages.

---

## 6. Failure handling and recovery

The service is designed to tolerate transient failures without requiring
manual intervention.

### AIS feed disconnects

The feed connection layer automatically reconnects after
`AIS_FEED_RECONNECT_DELAY_MS`.

Temporary network failures therefore do not require process restarts.

### Invalid AIS messages

Malformed or unsupported AIS messages are logged and discarded.

The service continues processing subsequent messages.

### Database failures

MongoDB connection events are monitored through Mongoose connection
listeners.

Connection errors, disconnects, and reconnections are logged to aid
operational debugging.

### WebSocket client failures

Heartbeat ping/pong checks run every 30 seconds.

Clients that stop responding are terminated automatically to prevent
resource leaks.

---

## 7. Observability

The service uses structured logging through `pino`.

Log events include:

- AIS feed connection lifecycle
- database connection state changes
- HTTP request completion
- websocket client connections
- cleanup job execution
- application startup and shutdown

Request logs include:

- request id
- method
- path
- status code
- duration
- client IP

Sensitive fields such as authentication headers, cookies, passwords, and
API keys are automatically redacted.
---

## 8. Security considerations

The HTTP API applies several defensive middleware layers:

- `helmet` for secure HTTP headers
- `cors` with explicit origin allowlists
- `hpp` to prevent HTTP parameter pollution
- `compression` for response optimization
- `express-rate-limit` for abuse protection

Only `GET` endpoints are exposed.

The backend does not provide public mutation endpoints; vessel state is
derived exclusively from the AIS feed.

---

## 9. Persistence flow

`src/features/ais-feed/ais-feed.usecase.ts`

- receives normalized `VesselUpdate`
- maps the update to an atomic MongoDB update payload
- `findOneAndUpdate` with `upsert: true`
- stores `lastSeen` as the receive timestamp
- stores `rawSentence` for traceability
- emits either `vessel:created` or `vessel:updated`

This design means each vessel document is the current state, not a log of history.

### Why `findOneAndUpdate` with upsert

- avoids duplicate vessel documents
- updates only changed fields
- makes persistence idempotent for repeated AIS messages

### Why store `rawSentence`

- gives operators a way to inspect the literal AIS input that produced the current state
- useful for debugging feed decoding, checksum mismatches, or anomalous vessels

---

## 10. Realtime streaming

The live stream is implemented in `src/features/stream-vessels/stream-vessels.handler.ts`.

WebSocket behavior:

- on connect, send a `vessel:snapshot` event with current active vessels
- then broadcast `vessel:created` and `vessel:updated` events
- use heartbeat ping/pong every 30 seconds
- remove listeners when the WebSocket server closes

This approach provides a reliable first snapshot plus incremental updates.

### Event bus

The broadcasting layer listens to `vesselEmitter`:

- `vesselEmitter` is a typed singleton event emitter
- it is defined in `src/shared/events/vessel.emitter.ts`
- it supports two event types: `vessel:updated` and `vessel:created`

The emitter decouples persistence from streaming, which is a high-quality separation of concerns.

---

## 11. Cleanup and operational hygiene

Stale data cleanup is implemented in `src/features/cleanup-vessels/cleanup-vessels.job.ts`.

- vessels not seen for `STALE_VESSEL_THRESHOLD_MS` are deleted
- the threshold is currently 24 hours
- cleanup runs immediately on startup and then every 30 minutes

This keeps the database from accumulating dead vessels and makes active-vessel queries meaningful.

---

## 12. Design decisions

### Single source of truth

- `src/config/constants.ts` defines supported AIS message types in one table.
- all derived arrays (`POSITION_REPORT_TYPES`, `STATIC_REPORT_TYPES`, `CLASS_B_REPORT_TYPES`) come from that table.

This prevents inconsistencies and makes feature extension safe.

### Clear separation of concerns

- connection, deduping, decoding, normalization, persistence, API, and streaming are all separate modules.
- each feature owns one responsibility.

### Defensive validation

- `zod` validates both incoming HTTP requests and AIS decoder output.
- request validation is centralized.
- invalid AIS sentences are logged and dropped without crashing the service.

### Operational resilience

- network reconnect logic for AIS feed
- WebSocket heartbeat to drop dead clients
- global error handler for HTTP
- rate limiting and security middleware on Express

### Simplicity in the data model

- a single `Vessel` collection avoids join complexity.
- position snapshots are current-state only.
- stale cleanup keeps the model bounded.

---

## 13. Testing strategy

The project currently focuses on unit testing.

Testing principles:

- database access is mocked
- use cases are tested independently from Express handlers
- validation behavior is tested through Zod schemas
- query construction is verified explicitly

Examples include:

- active vessel filtering
- geospatial bounding box queries
- empty result handling
- coordinate ordering validation

The test suite can be extended in the future with:

- integration tests using an in-memory MongoDB instance
- websocket lifecycle tests
- end-to-end AIS feed simulations

---

## 14. Key file map

- `src/server.ts` — startup, DB connect, HTTP + WS server, feed + cleanup lifecycle
- `src/app.ts` — Express app configuration and routes
- `src/features/vessels.router.ts` — route composition
- `src/features/get-all-vessels/*` — list active vessels
- `src/features/get-vessel/*` — vessel lookup by MMSI
- `src/features/get-vessels-in-bounds/*` — spatial query by bounding box
- `src/features/ais-feed/*` — feed connection, dedupe, decode, update persistence
- `src/features/stream-vessels/stream-vessels.handler.ts` — live websocket broadcasting
- `src/shared/db/models/vessel.model.ts` — MongoDB schema and indexes
- `src/shared/middleware/validate.middleware.ts` — schema-driven request validation
- `src/shared/events/vessel.emitter.ts` — typed event bus for vessel updates

---

## 15. Conclusions

This backend is built as a long-term, maintainable service:

- it accepts live AIS feeds and keeps a canonical vessel state
- it exposes a stable API and a live stream for frontend clients
- it is defensive about bad input and stale data
- it keeps domain logic small, explicit, and traceable
