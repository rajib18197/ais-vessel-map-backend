import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { env } from './config/env.js';
import { logger } from './shared/logger/logger.js';
import { connectDB, disconnectDB } from './shared/db/connection.js';
import { createApp } from './app.js';
import { startAisFeed, stopAisFeed } from './features/ais-feed/ais-feed.bootstrap.js';
import { registerVesselStream } from './features/stream-vessels/stream-vessels.handler';
import { startCleanupJob, stopCleanupJob } from './features/cleanup-vessels/cleanup-vessels.job.js';

/**
 * App starts here:
 */
async function bootstrap(): Promise<void> {
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'UNCAUGHT EXCEPTION — shutting down');
    process.exit(1);
  });

  await connectDB(env.DATABASE_URL, { usePublicDns: true });
  logger.info('MongoDB connection established');

  const app = createApp();
  const httpServer = createServer(app);

  // Single WS server shares the HTTP server's port — no second port to manage.
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/vessels' });
  registerVesselStream(wss);

  httpServer.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT} (${env.NODE_ENV})`);
  });

  // Starts the TCP/UDP AIS feed connection
  startAisFeed();
  startCleanupJob();

  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'UNHANDLED REJECTION — shutting down gracefully');
    httpServer.close(() => process.exit(1));
  });

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`${signal} received — shutting down gracefully`);

    stopAisFeed();
    stopCleanupJob();

    wss.clients.forEach((client) => client.close(1001, 'Server shutting down'));
    wss.close();

    httpServer.close(async () => {
      await disconnectDB();
      logger.info('Process terminated');
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Graceful shutdown timed out — forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

// -----------------
// simulator/ais-simulator.js
// Run with: node simulator/ais-simulator.js
// Simulates the backend WebSocket + REST API with moving vessels
// so you can test the frontend without the live AIS feed.
//
// Exposes:
//   GET  http://localhost:3001/api/vessels
//   GET  http://localhost:3001/api/vessels/:mmsi
//   WS   ws://localhost:3001/ws/vessels

// import { createServer } from 'http';
// import { WebSocketServer } from 'ws';

// // ─── Dummy vessel data — real MMSI format, San Diego bay area ────────────────

// const DUMMY_VESSELS = [
//   {
//     mmsi: '338123001',
//     name: 'PACIFIC PIONEER',
//     vesselType: 31, // Tug
//     lat: 32.7157,
//     lon: -117.2306,
//     sog: 4.2,
//     cog: 45,
//     heading: 47,
//   },
//   {
//     mmsi: '338123002',
//     name: 'SURF RIDER',
//     vesselType: 37, // Pleasure
//     lat: 32.7089,
//     lon: -117.2198,
//     sog: 0,
//     cog: 182,
//     heading: 180,
//   },
//   {
//     mmsi: '338123003',
//     name: 'BLUE HORIZON',
//     vesselType: 36, // Sailing
//     lat: 32.7201,
//     lon: -117.2401,
//     sog: 6.1,
//     cog: 270,
//     heading: 268,
//   },
//   {
//     mmsi: '338123004',
//     name: 'HARBOR QUEEN',
//     vesselType: 6, // Passenger
//     lat: 32.7145,
//     lon: -117.175,
//     sog: 12.4,
//     cog: 135,
//     heading: 133,
//   },
//   {
//     mmsi: '338123005',
//     name: 'STORM CHASER',
//     vesselType: 37,
//     lat: 32.732,
//     lon: -117.228,
//     sog: 0.3,
//     cog: 90,
//     heading: null,
//   },
//   {
//     mmsi: '338123006',
//     name: 'CORAL WIND',
//     vesselType: 36,
//     lat: 32.705,
//     lon: -117.235,
//     sog: 5.8,
//     cog: 315,
//     heading: 312,
//   },
//   {
//     mmsi: '338123007',
//     name: 'NIGHT WATCH',
//     vesselType: 31,
//     lat: 32.698,
//     lon: -117.215,
//     sog: 3.1,
//     cog: 200,
//     heading: 198,
//   },
//   {
//     mmsi: '338123008',
//     name: null, // vessel with no name — tests Unknown vessel rendering
//     vesselType: 37,
//     lat: 32.726,
//     lon: -117.198,
//     sog: 0,
//     cog: null,
//     heading: null,
//   },
//   {
//     mmsi: '338123009',
//     name: 'SILVER WAKE',
//     vesselType: null, // unknown type
//     lat: 32.718,
//     lon: -117.21,
//     sog: 8.7,
//     cog: 60,
//     heading: 62,
//   },
//   {
//     mmsi: '338123010',
//     name: 'DEEP BLUE',
//     vesselType: 36,
//     lat: 32.74,
//     lon: -117.245,
//     sog: 0,
//     cog: 178,
//     heading: null,
//   },
// ];

// // ─── Vessel state — mutable, updated each tick ───────────────────────────────

// const vesselState = DUMMY_VESSELS.map((v) => ({
//   mmsi: v.mmsi,
//   name: v.name,
//   vesselType: v.vesselType,
//   lat: v.lat,
//   lon: v.lon,
//   sog: v.sog,
//   cog: v.cog,
//   heading: v.heading,
//   lastSeen: new Date().toISOString(),
// }));

// // ─── Movement simulation ──────────────────────────────────────────────────────

// const KNOT_TO_DEG_PER_SECOND = 1 / 3600 / 60; // rough approximation

// function moveVessel(vessel) {
//   if (!vessel.sog || vessel.sog < 0.5) {
//     // Stationary — drift slightly
//     vessel.lat += (Math.random() - 0.5) * 0.00005;
//     vessel.lon += (Math.random() - 0.5) * 0.00005;
//     return;
//   }

//   const cogRad = ((vessel.cog ?? 0) * Math.PI) / 180;
//   const distanceDeg = vessel.sog * KNOT_TO_DEG_PER_SECOND * UPDATE_INTERVAL_MS;

//   vessel.lat += Math.cos(cogRad) * distanceDeg;
//   vessel.lon += Math.sin(cogRad) * distanceDeg;

//   // Occasionally vary SOG slightly for realism
//   vessel.sog = Math.max(0, vessel.sog + (Math.random() - 0.5) * 0.3);
//   vessel.sog = Math.round(vessel.sog * 10) / 10;

//   vessel.lastSeen = new Date().toISOString();
// }

// // ─── Shape helpers — match backend API shape exactly ─────────────────────────

// function toApiShape(vessel) {
//   return {
//     mmsi: vessel.mmsi,
//     name: vessel.name,
//     vesselType: vessel.vesselType,
//     location: {
//       type: 'Point',
//       coordinates: [vessel.lon, vessel.lat], // GeoJSON: [lon, lat]
//     },
//     sog: vessel.sog,
//     cog: vessel.cog,
//     heading: vessel.heading,
//     lastSeen: vessel.lastSeen,
//   };
// }

// // ─── HTTP server — REST endpoints ─────────────────────────────────────────────

// const httpServer = createServer((req, res) => {
//   // CORS — allow frontend dev server
//   res.setHeader('Access-Control-Allow-Origin', '*');
//   res.setHeader('Content-Type', 'application/json');

//   const url = new URL(req.url, `http://localhost`);

//   // GET /api/vessels
//   if (url.pathname === '/api/vessels' && req.method === 'GET') {
//     const vessels = vesselState.map(toApiShape);
//     res.writeHead(200);
//     res.end(
//       JSON.stringify({
//         status: 'success',
//         results: vessels.length,
//         data: { vessels },
//       }),
//     );
//     return;
//   }

//   // GET /api/vessels/:mmsi
//   const mmsiMatch = url.pathname.match(/^\/api\/vessels\/(\d{9})$/);
//   if (mmsiMatch && req.method === 'GET') {
//     const mmsi = mmsiMatch[1];
//     const vessel = vesselState.find((v) => v.mmsi === mmsi);
//     if (!vessel) {
//       res.writeHead(404);
//       res.end(
//         JSON.stringify({
//           status: 'fail',
//           message: `Vessel with MMSI ${mmsi} not found`,
//         }),
//       );
//       return;
//     }
//     res.writeHead(200);
//     res.end(
//       JSON.stringify({
//         status: 'success',
//         data: { vessel: toApiShape(vessel) },
//       }),
//     );
//     return;
//   }

//   // Health check
//   if (url.pathname === '/health') {
//     res.writeHead(200);
//     res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
//     return;
//   }

//   res.writeHead(404);
//   res.end(JSON.stringify({ status: 'fail', message: 'Not found' }));
// });

// // ─── WebSocket server ─────────────────────────────────────────────────────────

// const wss = new WebSocketServer({ server: httpServer, path: '/ws/vessels' });

// function broadcast(event, data) {
//   const payload = JSON.stringify({ event, data });
//   for (const client of wss.clients) {
//     if (client.readyState === client.OPEN) {
//       client.send(payload);
//     }
//   }
// }

// // Send snapshot immediately on connection — same as real backend
// wss.on('connection', (socket) => {
//   console.log('[WS] Client connected');

//   const snapshot = vesselState.map(toApiShape);
//   socket.send(JSON.stringify({ event: 'vessel:snapshot', data: snapshot }));

//   socket.on('close', () => console.log('[WS] Client disconnected'));
// });

// // ─── Update loop ──────────────────────────────────────────────────────────────

// const UPDATE_INTERVAL_MS = 2000; // update every 2 seconds

// // Pick a different subset of vessels each tick to simulate
// // some vessels updating frequently and others rarely
// setInterval(() => {
//   // Update 3–6 random vessels per tick
//   const count = Math.floor(Math.random() * 4) + 3;
//   const shuffled = [...vesselState].sort(() => Math.random() - 0.5);
//   const toUpdate = shuffled.slice(0, count);

//   for (const vessel of toUpdate) {
//     moveVessel(vessel);
//     broadcast('vessel:updated', toApiShape(vessel));
//   }
// }, UPDATE_INTERVAL_MS);

// // Every 15 seconds — simulate a new vessel appearing
// setInterval(() => {
//   const newVessel = {
//     mmsi: `3381${Math.floor(Math.random() * 90000 + 10000)}`,
//     name: ['SEA EAGLE', 'WAVE RUNNER', 'TIDE CHASER', 'PORT PILOT'][Math.floor(Math.random() * 4)],
//     vesselType: [36, 37, 31][Math.floor(Math.random() * 3)],
//     lat: 32.68 + Math.random() * 0.08,
//     lon: -117.26 + Math.random() * 0.1,
//     sog: Math.round(Math.random() * 8 * 10) / 10,
//     cog: Math.floor(Math.random() * 360),
//     heading: Math.floor(Math.random() * 360),
//     lastSeen: new Date().toISOString(),
//   };

//   vesselState.push(newVessel);
//   broadcast('vessel:created', toApiShape(newVessel));
//   console.log(`[SIM] New vessel appeared: ${newVessel.name} (${newVessel.mmsi})`);

//   // Remove it after 30 seconds so the list doesn't grow forever
//   setTimeout(() => {
//     const idx = vesselState.findIndex((v) => v.mmsi === newVessel.mmsi);
//     if (idx !== -1) vesselState.splice(idx, 1);
//     console.log(`[SIM] Vessel left: ${newVessel.name} (${newVessel.mmsi})`);
//   }, 30_000);
// }, 15_000);

// // ─── Start ────────────────────────────────────────────────────────────────────

// const PORT = 3000;

// httpServer.listen(PORT, () => {
//   console.log(`
// ╔══════════════════════════════════════════════╗
// ║         AIS Feed Simulator running           ║
// ╠══════════════════════════════════════════════╣
// ║  REST  http://localhost:${PORT}/api/vessels     ║
// ║  WS    ws://localhost:${PORT}/ws/vessels        ║
// ║                                              ║
// ║  ${vesselState.length} vessels · updates every 2s            ║
// ║  New vessel appears every 15s               ║
// ╚══════════════════════════════════════════════╝
//   `);
// });
