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
  CLASS_B_REPORT_TYPES,
} from '../../config/constants.js';

/* Zod Schema for incoming stream data (Idea is: Parse, Don't Validate)
 We use .passthrough() because stream decoders often append metadata fields
 we don't care about.

 Field names below are the *actual* `ais-stream-decoder` wire field names,
 not the schema's persisted field names — the two are deliberately
 different vocabularies, and the mapping between them happens once, in
 normalizeMessage, so nothing upstream or downstream has to know about it.
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
    navStatus: z.number().nullish(),
    rateOfTurn: z.number().nullish(),
    name: z.string().nullish(),
    typeAndCargo: z.number().nullish(),
    callsign: z.string().nullish(),
    imo: z.number().nullish(),
    destination: z.string().nullish(),
    draught: z.number().nullish(),
    etaMonth: z.number().nullish(),
    etaDay: z.number().nullish(),
    etaHour: z.number().nullish(),
    etaMinute: z.number().nullish(),
    dimBow: z.number().nullish(),
    dimStern: z.number().nullish(),
    dimPort: z.number().nullish(),
    dimStarboard: z.number().nullish(),
    /**
     * Only present on type 24 (Class B static data report), which is
     * transmitted as two *separate* single-sentence messages rather than
     * one multipart NMEA group: 0 = Part A (name only), 1 = Part B
     * (callsign/dimensions/type). The underlying decoder throws on any
     * other value, so 0|1 is a real constraint, not an assumption.
     */
    partNum: z.union([z.literal(0), z.literal(1)]).nullish(),
    /**
     * Type-24 Part B fields we deliberately don't persist yet (no slot
     * for them in the Vessel schema). Typed here rather than left to
     * `.passthrough()` so a future decision to store them is a one-line
     * change instead of a silent gap.
     */
    vendorId: z.string().nullish(),
    model: z.number().nullish(),
    serial: z.number().nullish(),
    mothershipMMSI: z.number().nullish(),
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

function normalizeMessage(raw: RawAisMessage): VesselUpdate | null {
  if (!raw.mmsi) return null;

  const isPositionReport = (POSITION_REPORT_TYPES as readonly number[]).includes(raw.type);
  const isStaticReport = (STATIC_REPORT_TYPES as readonly number[]).includes(raw.type);

  if (!isPositionReport && !isStaticReport) return null;

  const base: VesselUpdateBase = {
    mmsi: raw.mmsi,
    receivedAt: new Date(),
    classB: (CLASS_B_REPORT_TYPES as readonly number[]).includes(raw.type),
  };

  // Type 24 arrives as two independent single-sentence transmissions
  // (Part A / Part B), not a single multipart group — each carries a
  // disjoint subset of fields. Branching on partNum makes that explicit
  // instead of relying on the absent half's fields happening to be
  // undefined, which only works by coincidence for every other type.
  const isType24 = raw.type === 24;
  const isType24PartA = isType24 && raw.partNum === 0;
  const isType24PartB = isType24 && raw.partNum === 1;

  if (!isType24 || isType24PartA) {
    const trimmedName = raw.name?.trim();
    if (trimmedName) base.name = trimmedName;
  }

  if (!isType24 || isType24PartB) {
    if (raw.typeAndCargo != null) base.vesselType = raw.typeAndCargo;

    const trimmedCallsign = raw.callsign?.trim();
    if (trimmedCallsign) base.callsign = trimmedCallsign;

    // Schema fields dimA-D map to the decoder's bow/stern/port/starboard
    // axes. Auxiliary craft carry a mothershipMMSI instead of dimensions
    // in Part B (see ais-stream-decoder's isAuxiliaryCraft branch) — we
    // don't have a schema slot for that yet, so it's read into the raw
    // schema above but intentionally not mapped onto VesselUpdateBase.
    if (raw.dimBow != null) base.dimA = raw.dimBow;
    if (raw.dimStern != null) base.dimB = raw.dimStern;
    if (raw.dimPort != null) base.dimC = raw.dimPort;
    if (raw.dimStarboard != null) base.dimD = raw.dimStarboard;
  }

  if (raw.navStatus != null) base.navStatus = raw.navStatus;
  if (raw.rateOfTurn != null) base.rot = raw.rateOfTurn;
  if (raw.imo != null) base.imo = raw.imo;

  const trimmedDestination = raw.destination?.trim();
  if (trimmedDestination) base.destination = trimmedDestination;

  if (raw.etaMonth != null) base.etaMonth = raw.etaMonth;
  if (raw.etaDay != null) base.etaDay = raw.etaDay;
  if (raw.etaHour != null) base.etaHour = raw.etaHour;
  if (raw.etaMinute != null) base.etaMinute = raw.etaMinute;
  if (raw.draught != null) base.draught = raw.draught;

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
