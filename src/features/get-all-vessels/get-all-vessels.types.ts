import { z } from 'zod';

export const vesselSummarySchema = z.object({
  mmsi: z.string(),
  name: z.string().nullable().optional(),
  vesselType: z.number().nullable().optional(),
  location: z
    .object({
      type: z.literal('Point'),
      coordinates: z.tuple([z.number(), z.number()]),
    })
    .optional(),
  sog: z.number().nullable().optional(),
  cog: z.number().nullable().optional(),
  heading: z.number().nullable().optional(),
  lastSeen: z.date(),
});

export type VesselSummary = z.infer<typeof vesselSummarySchema>;
