import { z } from 'zod';

export const vesselSummarySchema = z.object({
  mmsi: z.string(),
  name: z.string().nullable(),
  vesselType: z.number().nullable(),
  location: z
    .object({
      type: z.literal('Point'),
      coordinates: z.tuple([z.number(), z.number()]),
    })
    .optional(),
  sog: z.number().nullable(),
  cog: z.number().nullable(),
  heading: z.number().nullable(),
  lastSeen: z.date(),
});

export type VesselSummary = z.infer<typeof vesselSummarySchema>;
