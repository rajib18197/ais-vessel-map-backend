import * as AisDecoderModule from 'ais-stream-decoder';
import type AisDecoderType from 'ais-stream-decoder';
import { z } from 'zod';
import { logger } from '../../shared/logger/logger.js';
import type {
  VesselUpdate,
  VesselUpdateBase,
  VesselPositionUpdate,
  VesselStaticUpdate,
} from './ais-feed.types.js';
import {
  HEADING_NOT_AVAILABLE,
  POSITION_REPORT_TYPES,
  STATIC_REPORT_TYPES,
} from '../../config/constants.js';

/* Zod Schema for incoming stream data (Idea is: Parse, Don't Validate)
 We use .passthrough() because stream decoders often append metadata fields
 we don't care about.
*/
const rawAisMessageSchema = z
  .object({
    type: z.number(),
    mmsi: z.number(),
    lat: z.number().nullish(),
    lon: z.number().nullish(),
    speedOverGround: z.number().nullish(),
    courseOverGround: z.number().nullish(),
    heading: z.number().nullish(),
    name: z.string().nullish(),
    typeAndCargo: z.number().nullish(),
    sentences: z.array(z.string()).nullish(),
  })
  .passthrough();

type RawAisMessage = z.infer<typeof rawAisMessageSchema>;

const mod = AisDecoderModule as unknown as Record<string, unknown>;

const ResolvedAisDecoder = (
  typeof mod.default === 'function'
    ? mod.default
    : typeof (mod.default as Record<string, unknown>)?.default === 'function'
      ? (mod.default as Record<string, unknown>).default
      : null
) as typeof AisDecoderType | null;

if (!ResolvedAisDecoder) {
  throw new Error(
    'ais-stream-decoder failed to resolve: could not find a constructor at ' +
      '.default or .default.default. Check the CJS/ESM interop in ais-feed-decoder.service.ts.',
  );
}

const AisDecoder = ResolvedAisDecoder;

export function createAisDecoderStream(
  onMessage: (update: VesselUpdate, rawSentence: string) => void,
): AisDecoderType {
  const decoder = new AisDecoder();

  decoder.on('data', (raw: unknown) => {
    try {
      const rawObj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      const parsed = rawAisMessageSchema.parse(rawObj);

      const update = normalizeMessage(parsed);
      if (update) {
        const rawSentence = parsed.sentences?.[parsed.sentences.length - 1] ?? '';
        onMessage(update, rawSentence);
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to parse incoming AIS stream message');
    }
  });

  decoder.on('error', (err: Error) => {
    logger.warn({ err: err.message }, 'AIS stream decode error');
  });

  return decoder;
}

// Update normalizeMessage to safely filter out both null and undefined
function normalizeMessage(raw: RawAisMessage): VesselUpdate | null {
  if (!raw.mmsi) return null;

  const isPositionReport = (POSITION_REPORT_TYPES as readonly number[]).includes(raw.type);
  const isStaticReport = (STATIC_REPORT_TYPES as readonly number[]).includes(raw.type);

  if (!isPositionReport && !isStaticReport) return null;

  const base: VesselUpdateBase = {
    mmsi: raw.mmsi,
    receivedAt: new Date(),
  };

  const trimmedName = raw.name?.trim();
  if (trimmedName) base.name = trimmedName;

  if (raw.typeAndCargo != null) base.vesselType = raw.typeAndCargo;

  if (isPositionReport) {
    if (raw.lat == null || raw.lon == null) return null;

    const positionUpdate: VesselPositionUpdate = {
      ...base,
      hasPosition: true,
      lat: raw.lat,
      lon: raw.lon,
    };

    if (raw.speedOverGround != null) positionUpdate.sog = raw.speedOverGround;
    if (raw.courseOverGround != null) positionUpdate.cog = raw.courseOverGround;
    if (raw.heading != null && raw.heading !== HEADING_NOT_AVAILABLE) {
      positionUpdate.heading = raw.heading;
    }

    return positionUpdate;
  }

  return {
    ...base,
    hasPosition: false,
  } satisfies VesselStaticUpdate;
}
