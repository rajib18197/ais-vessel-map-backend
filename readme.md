# AIS Vessel Map — Backend

Real-time vessel tracking backend that connects to a live AIS (Automatic
Identification System) TCP feed, decodes NMEA sentences, stores vessel
positions in MongoDB, and streams live updates to frontend clients over
WebSocket.

---

## Requirements

- Node.js v18 or higher (developed on v24.16.0)
- MongoDB Atlas account (or local MongoDB instance)
- Access to an AIS TCP feed

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/your-username/ais-vessel-map-backend.git
cd ais-vessel-map-backend
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set the following:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=your_mongodb_connection_string
LOG_LEVEL=debug

AIS_FEED_HOST=
AIS_FEED_PORT=
AIS_FEED_PROTOCOL=tcp
AIS_FEED_RECONNECT_DELAY_MS=5000
```

`DATABASE_URL` should be a full MongoDB connection string.
For Atlas it looks like:
`mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/ais-vessel-map`

### 4. Run the development server

```bash
npm run dev
```

The server starts on `http://localhost:3000` by default.

You should see log output confirming:

- MongoDB connection established
- Server running on port 3000
- AIS TCP feed connected

---

## Connecting to the AIS Feed

The backend connects to the AIS feed automatically on startup using the
`AIS_FEED_HOST`, `AIS_FEED_PORT`, and `AIS_FEED_PROTOCOL` values in your
`.env` file.

No manual action is needed. If the connection drops, the backend
reconnects automatically after `AIS_FEED_RECONNECT_DELAY_MS` milliseconds
(default: 5000ms).

---

## API Endpoints

| Method | Endpoint                 | Description                               |
| ------ | ------------------------ | ----------------------------------------- |
| GET    | `/health`                | Health check                              |
| GET    | `/api/vessels`           | All vessels active in the last 15 minutes |
| GET    | `/api/vessels/:mmsi`     | Single vessel by MMSI                     |
| GET    | `/api/vessels/in-bounds` | Vessels within a geographic bounding box  |
| WS     | `/ws/vessels`            | Real-time vessel position stream          |

### GET /api/vessels/in-bounds

Query parameters:

| Param | Type   | Description                        |
| ----- | ------ | ---------------------------------- |
| swLng | number | South-west longitude (-180 to 180) |
| swLat | number | South-west latitude (-90 to 90)    |
| neLng | number | North-east longitude (-180 to 180) |
| neLat | number | North-east latitude (-90 to 90)    |

Example:

### WebSocket

Connect to `ws://localhost:3000/ws/vessels`.

On connection you receive an immediate snapshot of all active vessels:

```json
{ "event": "vessel:snapshot", "data": [...] }
```

Subsequent updates arrive as:

```json
{ "event": "vessel:updated", "data": { ... } }
{ "event": "vessel:created", "data": { ... } }
```

---

## Running Tests

```bash
npm test
```

---

## Building for Production

```bash
npm run build
npm start
```
