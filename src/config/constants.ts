export const ACTIVE_VESSEL_WINDOW_MS = 15 * 60 * 1000;
export const HEADING_NOT_AVAILABLE = 511;
export const POSITION_REPORT_TYPES = [1, 2, 3, 18] as const;
export const STATIC_REPORT_TYPES = [5, 24] as const;

export const STALE_VESSEL_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // run every 30 minutes

// Rate limiting
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const RATE_LIMIT_MAX_REQUESTS = 300;
