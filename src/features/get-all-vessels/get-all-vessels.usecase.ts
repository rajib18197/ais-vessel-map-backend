import { ACTIVE_VESSEL_WINDOW_MS } from '../../config/constants';
import { Vessel } from '../../shared/db/models/vessel.model';
import { vesselSummarySchema, type VesselSummary } from './get-all-vessels.types';
import { z } from 'zod';

export async function getAllVessels(): Promise<VesselSummary[]> {
  const vessels = await Vessel.find({
    lastSeen: { $gte: new Date(Date.now() - ACTIVE_VESSEL_WINDOW_MS) },
  })
    .select('mmsi name vesselType location sog cog heading lastSeen -_id')
    .lean()
    .exec();

  return z.array(vesselSummarySchema).parse(vessels);
}
