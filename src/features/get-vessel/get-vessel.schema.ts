import { z } from 'zod';

export const getVesselParamsSchema = z.object({
  mmsi: z.string().regex(/^\d{9}$/, 'MMSI must be exactly 9 digits'),
});
