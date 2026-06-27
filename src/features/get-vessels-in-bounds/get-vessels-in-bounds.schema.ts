import { z } from 'zod';

const longitude = z.coerce.number().min(-180).max(180);
const latitude = z.coerce.number().min(-90).max(90);

export const getVesselsInBoundsQuerySchema = z
  .object({
    swLng: longitude,
    swLat: latitude,
    neLng: longitude,
    neLat: latitude,
  })
  .refine((data) => data.swLng < data.neLng, {
    message: 'swLng must be less than neLng',
    path: ['swLng'],
  })
  .refine((data) => data.swLat < data.neLat, {
    message: 'swLat must be less than neLat',
    path: ['swLat'],
  });

export type GetVesselsInBoundsQuery = z.infer<typeof getVesselsInBoundsQuerySchema>;
