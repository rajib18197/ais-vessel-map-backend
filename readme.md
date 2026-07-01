# AIS Vessel Map Backend

Real-time vessel tracking backend that connects to a live AIS (Automatic Identification System) feed, decodes NMEA vessel messages, stores vessel state in MongoDB, and streams live vessel updates to connected clients over WebSocket.

---

## Features

- Live AIS feed ingestion (TCP or UDP)
- Automatic AIS message decoding
- NMEA sentence deduplication
- MongoDB persistence with geospatial indexing
- Real-time vessel updates via WebSocket
- Geographic bounding-box queries
- Automatic stale-vessel cleanup
- Structured logging with Pino
- Request validation with Zod
- Graceful shutdown support
- Unit-tested business logic

---

## Tech Stack

- Node.js
- TypeScript
- Express
- MongoDB
- Mongoose
- WebSocket (`ws`)
- Zod
- Pino
- Jest

---

## Requirements

- Node.js v18 or higher (developed on v24.16.0)
- MongoDB Atlas account or local MongoDB instance
- Access to an AIS feed

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/ais-vessel-map-backend.git
cd ais-vessel-map-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a local environment file:

```bash
cp .env.example .env
```

Populate the values:

```env
NODE_ENV=development
PORT=3000

DATABASE_URL=mongodb+srv://...

LOG_LEVEL=debug

AIS_FEED_HOST=
AIS_FEED_PORT=
AIS_FEED_PROTOCOL=tcp
AIS_FEED_RECONNECT_DELAY_MS=5000
```

### Environment Variables

| Variable                    | Description                              |
| --------------------------- | ---------------------------------------- |
| NODE_ENV                    | Application environment                  |
| PORT                        | HTTP server port                         |
| DATABASE_URL                | MongoDB connection string                |
| LOG_LEVEL                   | Logging level                            |
| AIS_FEED_HOST               | AIS feed hostname                        |
| AIS_FEED_PORT               | AIS feed port                            |
| AIS_FEED_PROTOCOL           | tcp or udp                               |
| AIS_FEED_RECONNECT_DELAY_MS | Reconnect delay after feed disconnection |

---

### 4. Start the Development Server

```bash
npm run dev
```

The server starts on:

```text
http://localhost:3000
```

Expected startup logs:

```text
MongoDB connection established
AIS TCP feed connected
Server running on port 3000
```

---

## Available Scripts

| Command              | Description                              |
| -------------------- | ---------------------------------------- |
| npm run dev          | Start development server with hot reload |
| npm run build        | Compile TypeScript                       |
| npm start            | Start the production build               |
| npm test             | Run unit tests                           |
| npm run lint         | Run ESLint                               |
| npm run lint:fix     | Fix ESLint issues                        |
| npm run format       | Format source files                      |
| npm run format:check | Check formatting                         |
| npm run check        | Run lint, format checks, and tests       |

---

## AIS Feed Integration

The AIS feed connection starts automatically when the application boots.

Configuration is controlled through:

```env
AIS_FEED_HOST
AIS_FEED_PORT
AIS_FEED_PROTOCOL
AIS_FEED_RECONNECT_DELAY_MS
```

If the feed connection drops unexpectedly, the application automatically attempts to reconnect after the configured delay.

Duplicate NMEA sentences are filtered before decoding to avoid duplicate vessel updates and protect multipart AIS message assembly.

---

## API Endpoints

### Health Check

```http
GET /health
```

---

### Get All Active Vessels

```http
GET /api/vessels
```

Returns vessels seen within the active vessel window.

---

### Get Vessel By MMSI

```http
GET /api/vessels/:mmsi
```

Example:

```http
GET /api/vessels/123456789
```

---

### Get Vessels Within Bounds

```http
GET /api/vessels/in-bounds
```

Query Parameters:

| Parameter | Type   | Description          |
| --------- | ------ | -------------------- |
| swLng     | number | South-west longitude |
| swLat     | number | South-west latitude  |
| neLng     | number | North-east longitude |
| neLat     | number | North-east latitude  |

Example:

```http
GET /api/vessels/in-bounds?swLng=-117.25&swLat=32.70&neLng=-117.20&neLat=32.72
```

---

## WebSocket API

### Endpoint

```text
ws://localhost:3000/ws/vessels
```

### Initial Snapshot

Immediately after connecting:

```json
{
  "event": "vessel:snapshot",
  "data": [...]
}
```

### Vessel Created

```json
{
  "event": "vessel:created",
  "data": {}
}
```

### Vessel Updated

```json
{
  "event": "vessel:updated",
  "data": {}
}
```

---

## Project Structure

```text
src/
├── config/
├── features/
│   ├── ais-feed/
│   ├── cleanup-vessels/
│   ├── get-all-vessels/
│   ├── get-vessel/
│   ├── get-vessels-in-bounds/
│   └── stream-vessels/
├── shared/
│   ├── db/
│   ├── errors/
│   ├── events/
│   ├── logger/
│   ├── middleware/
│   └── utils/
├── app.ts
└── server.ts
```

---

## Testing

Run all tests:

```bash
npm test
```

The test suite covers:

- Query validation
- Vessel retrieval use cases
- Geospatial filtering logic
- Business rules
- Error handling

---

## Production Notes

The application:

- Uses MongoDB geospatial indexes for location queries
- Supports graceful shutdown
- Automatically reconnects to the AIS feed
- Streams updates over WebSocket
- Cleans up stale vessels periodically
- Shares HTTP and WebSocket traffic on a single port

---

## Architecture

Detailed architecture documentation is available in [here](docs/architecture.md).

This document describes:

- AIS ingestion flow
- Decoder pipeline
- Deduplication strategy
- Persistence layer
- Event-driven update flow
- WebSocket broadcasting
- Cleanup process
- Design decisions and trade-offs

## Demo Video

[Watch the demo video](demo/ais-vessel-map-demo.mp4)

The demo includes:

- Application running with live vessels on the map
- Hover tooltip functionality
- Real-time WebSocket updates
- Smooth vessel marker movement without page refresh
