import { Vessel } from '../../shared/db/models/vessel.model.js';
import { vesselEmitter } from '../../shared/events/vessel.emitter.js';
import { logger } from '../../shared/logger/logger.js';
import type { VesselUpdate } from './ais-feed.types.js';

export async function applyVesselUpdate(update: VesselUpdate, rawSentence: string): Promise<void> {
  try {
    const setFields: Record<string, unknown> = {
      lastSeen: update.receivedAt,
      rawSentence,
    };

    if (update.hasPosition) {
      setFields.location = {
        type: 'Point',
        coordinates: [update.lon, update.lat],
      };
      if (update.sog != null) setFields.sog = update.sog;
      if (update.cog != null) setFields.cog = update.cog;
      if (update.heading != null) setFields.heading = update.heading;
    }

    if (update.name) setFields.name = update.name;
    if (update.vesselType != null) setFields.vesselType = update.vesselType;

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
