export const ACTIVE_VESSEL_WINDOW_MS = 15 * 60 * 1000;
export const HEADING_NOT_AVAILABLE = 511;
// export const POSITION_REPORT_TYPES = [1, 2, 3, 18] as const;
// export const STATIC_REPORT_TYPES = [5, 24] as const;
// export const CLASS_B_REPORT_TYPES = [18, 19, 24] as const;

export const STALE_VESSEL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // run every 30 minutes

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_MAX_REQUESTS = 300;

/**
 * Single source of truth for every AIS message type this pipeline
 * understands. Each entry says what *kind* of report the type is and
 * which AIS class transmits it. Everything downstream — the position/
 * static type arrays, the Class B lookup — is derived from this table,
 * so there's exactly one place to update when a new message type is
 * added, and no way for the derived arrays to silently disagree with
 * each other.
 *
 * Only message types this pipeline actively decodes are listed. Adding
 * a row here is what "support a new AIS type" means in this codebase.
 */
const AIS_MESSAGE_TYPES = {
  1: { kind: 'position', aisClass: 'A' },
  2: { kind: 'position', aisClass: 'A' },
  3: { kind: 'position', aisClass: 'A' },
  5: { kind: 'static', aisClass: 'A' },
  18: { kind: 'position', aisClass: 'B' },
  19: { kind: 'position', aisClass: 'B' },
  24: { kind: 'static', aisClass: 'B' },
  27: { kind: 'position', aisClass: 'A' },
} as const satisfies Record<number, { kind: 'position' | 'static'; aisClass: 'A' | 'B' }>;

type AisMessageType = keyof typeof AIS_MESSAGE_TYPES;

function entriesOfKind(kind: 'position' | 'static'): readonly AisMessageType[] {
  return Object.entries(AIS_MESSAGE_TYPES)
    .filter(([, info]) => info.kind === kind)
    .map(([type]) => Number(type) as AisMessageType);
}

function entriesOfClass(aisClass: 'A' | 'B'): readonly AisMessageType[] {
  return Object.entries(AIS_MESSAGE_TYPES)
    .filter(([, info]) => info.aisClass === aisClass)
    .map(([type]) => Number(type) as AisMessageType);
}

export const POSITION_REPORT_TYPES = entriesOfKind('position');
export const STATIC_REPORT_TYPES = entriesOfKind('static');

/**
 * AIS message types transmitted by Class B transponders. There is no
 * `classB` field on the wire — this is derived from the message type
 * itself, since types 18/19/24 are Class B-only per the AIS spec.
 */
export const CLASS_B_REPORT_TYPES = entriesOfClass('B');
