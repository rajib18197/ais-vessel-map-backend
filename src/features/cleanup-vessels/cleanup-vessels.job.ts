import { CLEANUP_INTERVAL_MS, STALE_VESSEL_THRESHOLD_MS } from '../../config/constants.js';
import { Vessel } from '../../shared/db/models/vessel.model.js';
import { logger } from '../../shared/logger/logger.js';

let cleanupTimer: NodeJS.Timeout | null = null;

async function deleteStaleVessels(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - STALE_VESSEL_THRESHOLD_MS);
    const result = await Vessel.deleteMany({ lastSeen: { $lt: cutoff } });

    if (result.deletedCount > 0) {
      logger.info({ deletedCount: result.deletedCount }, 'Stale vessel cleanup completed');
    }
  } catch (err) {
    logger.error({ err }, 'Stale vessel cleanup job failed');
  }
}

export function startCleanupJob(): void {
  // Run once immediately on start, then on interval
  void deleteStaleVessels();
  cleanupTimer = setInterval(() => void deleteStaleVessels(), CLEANUP_INTERVAL_MS);
}

export function stopCleanupJob(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
