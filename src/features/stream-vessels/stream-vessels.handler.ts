import type { WebSocket, WebSocketServer } from 'ws';
import { vesselEmitter } from '../../shared/events/vessel.emitter';
import { logger } from '../../shared/logger/logger';
import type { GeoPoint, VesselDoc } from '../../shared/db/models/vessel.model';
import { getAllVessels } from '../get-all-vessels/get-all-vessels.usecase';

const HEARTBEAT_INTERVAL_MS = 30_000;

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
}

interface VesselBroadcastPayload {
  mmsi: string;
  name: string | null;
  vesselType: number | null;
  location: GeoPoint | null;
  sog: number | null;
  cog: number | null;
  heading: number | null;
  lastSeen: Date;
}

// Return null if the vessel does not have valid coordinates.
function toGeoPoint(location: VesselDoc['location']): GeoPoint | null {
  const coords = location?.coordinates;

  if (!coords || coords.length !== 2) return null;

  const lon = coords[0];
  const lat = coords[1];

  if (lon === undefined || lat === undefined) return null;

  return { type: 'Point', coordinates: [lon, lat] };
}

// Convert a database vessel document into the data we send to clients.
function toPayload(vessel: VesselDoc): VesselBroadcastPayload {
  return {
    mmsi: vessel.mmsi,
    name: vessel.name ?? null,
    vesselType: vessel.vesselType ?? null,
    location: toGeoPoint(vessel.location),
    sog: vessel.sog ?? null,
    cog: vessel.cog ?? null,
    heading: vessel.heading ?? null,
    lastSeen: vessel.lastSeen,
  };
}

export function registerVesselStream(wss: WebSocketServer): void {
  // Periodically check that WebSocket clients are still connected.
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((client) => {
      const socket = client as TrackedSocket;
      if (socket.isAlive === false) {
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  // Send vessel updates to all connected WebSocket clients.
  const broadcast = (event: 'vessel:updated' | 'vessel:created', vessel: VesselDoc): void => {
    const payload = JSON.stringify({ event, data: toPayload(vessel) });

    wss.clients.forEach((client) => {
      if (client.readyState !== client.OPEN) return;
      try {
        client.send(payload);
      } catch (err) {
        logger.warn({ err }, 'Failed to send vessel update to a WS client');
      }
    });
  };

  const onUpdated = (vessel: VesselDoc) => broadcast('vessel:updated', vessel);
  const onCreated = (vessel: VesselDoc) => broadcast('vessel:created', vessel);

  vesselEmitter.on('vessel:updated', onUpdated);
  vesselEmitter.on('vessel:created', onCreated);

  wss.on('close', () => {
    clearInterval(heartbeatTimer);
    vesselEmitter.off('vessel:updated', onUpdated);
    vesselEmitter.off('vessel:created', onCreated);
  });

  wss.on('connection', async (socket: TrackedSocket, req) => {
    logger.info(
      {
        ip: req.socket.remoteAddress,
        clients: wss.clients.size,
      },
      'WebSocket client connected',
    );

    socket.isAlive = true;
    socket.on('pong', () => {
      socket.isAlive = true;
    });

    try {
      const vessels = await getAllVessels();

      // const unique = new Set(vessels.map((v) => v.mmsi));

      // logger.info(
      //   {
      //     total: vessels.length,
      //     unique: unique.size,
      //   },
      //   'Sending vessel snapshot',
      // );

      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ event: 'vessel:snapshot', data: vessels }));
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to send initial vessel snapshot to WS client');
    }

    socket.on('close', () => {
      logger.info(
        { ip: req.socket.remoteAddress, clients: wss.clients.size },
        'WebSocket client disconnected',
      );
    });

    socket.on('error', (err) => {
      logger.warn({ err: err.message }, 'WebSocket client socket error');
    });
  });
}
