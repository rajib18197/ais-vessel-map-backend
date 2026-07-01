import { Vessel, type GeoPoint } from '../../shared/db/models/vessel.model.js';
import { vesselEmitter } from '../../shared/events/vessel.emitter.js';
import { logger } from '../../shared/logger/logger.js';
import type { VesselUpdate } from './ais-feed.types.js';

interface VesselSetFields {
  lastSeen: Date;
  rawSentence: string;
  location?: GeoPoint;
  sog?: number;
  cog?: number;
  heading?: number;
  name?: string;
  vesselType?: number;
  navStatus?: number;
  rot?: number;
  callsign?: string;
  imo?: number;
  destination?: string;
  etaMonth?: number;
  etaDay?: number;
  etaHour?: number;
  etaMinute?: number;
  draught?: number;
  dimA?: number;
  dimB?: number;
  dimC?: number;
  dimD?: number;
  classB?: boolean;
}

export async function applyVesselUpdate(update: VesselUpdate, rawSentence: string): Promise<void> {
  try {
    // Build only the fields that are present in the incoming update.
    const setFields: VesselSetFields = {
      lastSeen: update.receivedAt,
      rawSentence,
    };

    if (update.hasPosition) {
      setFields.location = {
        type: 'Point',
        coordinates: [update.lon, update.lat],
      } satisfies GeoPoint;
      if (update.sog != null) setFields.sog = update.sog;
      if (update.cog != null) setFields.cog = update.cog;
      if (update.heading != null) setFields.heading = update.heading;
    }

    if (update.name != null) setFields.name = update.name;
    if (update.vesselType != null) setFields.vesselType = update.vesselType;
    if (update.navStatus != null) setFields.navStatus = update.navStatus;
    if (update.rot != null) setFields.rot = update.rot;
    if (update.callsign != null) setFields.callsign = update.callsign;
    if (update.imo != null) setFields.imo = update.imo;
    if (update.destination != null) setFields.destination = update.destination;
    if (update.etaMonth != null) setFields.etaMonth = update.etaMonth;
    if (update.etaDay != null) setFields.etaDay = update.etaDay;
    if (update.etaHour != null) setFields.etaHour = update.etaHour;
    if (update.etaMinute != null) setFields.etaMinute = update.etaMinute;
    if (update.draught != null) setFields.draught = update.draught;
    if (update.dimA != null) setFields.dimA = update.dimA;
    if (update.dimB != null) setFields.dimB = update.dimB;
    if (update.dimC != null) setFields.dimC = update.dimC;
    if (update.dimD != null) setFields.dimD = update.dimD;
    if (update.classB != null) setFields.classB = update.classB;

    // Create a new vessel or update the existing one using its MMSI.
    const result = await Vessel.findOneAndUpdate(
      { mmsi: String(update.mmsi) },
      { $set: setFields },
      { upsert: true, returnDocument: 'after', includeResultMetadata: true },
    );

    const vessel = result.value;
    if (!vessel) return;

    const wasUpdated = result.lastErrorObject?.updatedExisting ?? false;
    vesselEmitter.emit(wasUpdated ? 'vessel:updated' : 'vessel:created', vessel);
  } catch (err) {
    logger.error({ err, mmsi: update.mmsi }, 'Failed to persist AIS vessel update');
  }
}
