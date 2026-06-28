import { z } from 'zod';

const geoPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([z.number(), z.number()]),
});

export const vesselDetailSchema = z
  .object({
    mmsi: z.string(),
    name: z.string().nullable(),
    location: geoPointSchema.optional(),
    sog: z.number().nullable(),
    cog: z.number().nullable(),
    heading: z.number().nullable(),
    vesselType: z.number().nullable(),

    navStatus: z.number().nullable(),
    rot: z.number().nullable(),
    callsign: z.string().nullable(),
    imo: z.number().nullable(),
    destination: z.string().nullable(),
    etaMonth: z.number().nullable(),
    etaDay: z.number().nullable(),
    etaHour: z.number().nullable(),
    etaMinute: z.number().nullable(),
    draught: z.number().nullable(),
    dimA: z.number().nullable(),
    dimB: z.number().nullable(),
    dimC: z.number().nullable(),
    dimD: z.number().nullable(),
    classB: z.boolean(),

    lastSeen: z.date(),
    createdAt: z.date().optional(),
    updatedAt: z.date().optional(),
  })
  .strict();

export type VesselDetail = z.infer<typeof vesselDetailSchema>;
