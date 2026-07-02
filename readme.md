# AIS Vessel Map — Backend

A Node.js/Express service that connects to a live AIS (Automatic Identification System) feed, decodes raw NMEA sentences into vessel positions, stores them in MongoDB, and streams updates to clients in real time over WebSocket.

This repo is the backend half of the project. The companion frontend (React + Leaflet) consumes the REST API and WebSocket stream this service exposes.

For a deep dive into how the system fits together — data flow, database schema, API design decisions, and exactly how NMEA decoding works — see [`docs/architecture.md`](./docs/architecture.md).

---

## What it does

- Opens a raw TCP or UDP connection to an AIS feed and reads NMEA `AIVDM`/`AIVDO` sentences off the wire.
- Decodes those sentences into vessel data — MMSI, name, position, speed, course, heading, vessel type, and a good deal more.
- Upserts each decoded update into MongoDB, keyed by MMSI, so a vessel's record is always current rather than duplicated.
- Broadcasts every create/update over WebSocket to all connected clients, and sends a full snapshot to any client that just connected.
- Exposes a REST API for fetching the current vessel list, a single vessel's full detail, or vessels within a map viewport.

A few things worth knowing that go beyond the core requirements — AIS sentence deduplication, runtime response validation, graceful shutdown, a WebSocket heartbeat, unit-tested usecases, and more — are covered in the architecture doc rather than repeated here.

---

## Tech stack

| Layer         | Choice                                                             |
| ------------- | ------------------------------------------------------------------ |
| Runtime       | Node.js + TypeScript                                               |
| Web framework | Express 5                                                          |
| Database      | MongoDB via Mongoose (2dsphere geospatial index)                   |
| Real-time     | `ws` (native WebSocket server, sharing the HTTP server's port)     |
| AIS decoding  | `ais-stream-decoder`                                               |
| Validation    | Zod (env vars, incoming AIS messages, API request/response shapes) |
| Logging       | Pino (pretty-printed in development)                               |
| Security      | Helmet, CORS, HPP, rate limiting                                   |
| Testing       | Jest + ts-jest                                                     |

---

## Getting started

### 1. Clone and install

```bash
git clone <this-repo-url>
cd ais-vessel-map-backend
npm install
```

This project doesn't pin a Node version via `engines`, but the type definitions target a recent major version — a current Node LTS release is a safe bet. If you hit odd type errors, check `node -v` first.

### 2. Configure environment variables

Copy the example file and fill it in:

```bash
cp .env.example .env
```

```env
# Application
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# Database — your own MongoDB instance (local or Atlas)
DATABASE_URL=mongodb+srv://<USERNAME>:<PASSWORD>@<CLUSTER>.mongodb.net/ais-vessel-map?retryWrites=true&w=majority

# AIS Feed
AIS_FEED_HOST=
AIS_FEED_PORT=
AIS_FEED_PROTOCOL=tcp
AIS_FEED_RECONNECT_DELAY_MS=5000
```

`DATABASE_URL` is the only variable that's actually required — the process won't start without it, since environment variables are validated on boot (see the architecture doc). Everything else falls back to a sane default.

### 3. Connecting to the AIS feed

Fill in `AIS_FEED_HOST` and `AIS_FEED_PORT` with the connection details you were given, and set `AIS_FEED_PROTOCOL` to whichever of `tcp` or `udp` matches. If you leave `AIS_FEED_HOST`/`AIS_FEED_PORT` blank, the server still starts and serves the API and WebSocket normally — it just logs a warning and skips connecting to the feed, so you can develop against the REST/WebSocket layer without a live feed available.

If the feed connection drops, it reconnects automatically after `AIS_FEED_RECONNECT_DELAY_MS` (5 seconds by default).

### 4. Run it

```bash
npm run dev      # tsx watch — restarts on file changes
```

The server listens on `PORT` (default `3000`), and the WebSocket endpoint shares that same port at `/ws/vessels`.

### 5. Build and run for production

```bash
npm run build     # tsc — compiles to dist/
npm run start     # node dist/server.js
```

### 6. Tests and linting

```bash
npm test           # jest --selectProjects unit
npm run lint       # eslint
npm run format:check
npm run check      # lint + format:check + test, all together
```

---

## API reference

All endpoints are prefixed with `/api/vessels` and rate-limited (300 requests per 15-minute window, per client). Full design rationale — validation approach, error handling, response envelope — is in [`docs/architecture.md`](./docs/architecture.md#3-api-design-decisions).

| Method | Path                     | Description                                                                                  |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------- |
| `GET`  | `/api/vessels`           | All vessels seen in the last 15 minutes                                                      |
| `GET`  | `/api/vessels/:mmsi`     | Full detail for one vessel by its 9-digit MMSI                                               |
| `GET`  | `/api/vessels/in-bounds` | Vessels within a map viewport (`swLng`, `swLat`, `neLng`, `neLat` query params)              |
| `GET`  | `/health`                | Liveness check (unauthenticated, unrate-limited)                                             |
| WS     | `/ws/vessels`            | Real-time vessel stream — snapshot on connect, then `vessel:created`/`vessel:updated` events |

Every REST response follows the same envelope:

```json
{ "status": "success", "results": 12, "data": { "vessels": [/* ... */] } }
```

---

## Project structure

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
docs/
  architecture.md  # system design, database schema, API decisions, NMEA decoding
```

---

## Notes

- If `AIS_FEED_HOST`/`AIS_FEED_PORT` aren't set, the app runs but never receives vessel data — that's expected, not a bug, and it's logged clearly at startup.
