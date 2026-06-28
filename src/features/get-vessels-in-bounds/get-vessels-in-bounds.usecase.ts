import { ACTIVE_VESSEL_WINDOW_MS } from '../../config/constants.js';
import { Vessel } from '../../shared/db/models/vessel.model.js';
import {
  vesselSummarySchema,
  type VesselSummary,
} from '../get-all-vessels/get-all-vessels.types.js';
import type { BoundsOptions } from './get-vessels-in-bounds.types.js';
import { z } from 'zod';

export async function getVesselsInBounds(bounds: BoundsOptions): Promise<VesselSummary[]> {
  const vessels = await Vessel.find({
    lastSeen: { $gte: new Date(Date.now() - ACTIVE_VESSEL_WINDOW_MS) },
    location: {
      $geoWithin: {
        $box: [
          [bounds.swLng, bounds.swLat],
          [bounds.neLng, bounds.neLat],
        ],
      },
    },
  })
    .select('mmsi name vesselType location sog cog heading lastSeen')
    .lean();

  return z.array(vesselSummarySchema).parse(vessels);
}

// http://localhost:3000/api/vessels/in-bounds?swLng=-117.25&swLat=32.70&neLng=-117.20&neLat=32.72
// http://localhost:3000/api/vessels
