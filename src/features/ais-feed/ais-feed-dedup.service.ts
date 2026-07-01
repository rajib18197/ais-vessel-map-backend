/**
 * Raw AIS feeds commonly forward the exact same NMEA sentence more than
 * once — the same VHF slot picked up by multiple shore-station receivers
 * and relayed by the aggregator. This is a transport-level artifact, not
 * a decoding concern, so it's filtered here, before any line reaches the
 * decoder. Deduping after decode would be too late: by then the decoder's
 * internal multipart-reassembly state may have already consumed a part.
 *
 * The dedup key is the raw sentence text itself. Two different vessels
 * could in principle produce the same payload string within the window,
 * but the AIS payload is checksum-protected and MMSI-prefixed, so an
 * exact byte match within a few seconds is, in practice, the same
 * broadcast relayed twice — not a coincidence worth modeling.
 */

export interface SentenceDeduperOptions {
  windowMs: number;
  maxEntries: number;
}

export interface SentenceDeduper {
  isDuplicate: (line: string) => boolean;
  size: () => number;
}

const DEFAULT_OPTIONS: SentenceDeduperOptions = {
  windowMs: 5_000,
  maxEntries: 10_000,
};

export function createSentenceDeduper(
  options: Partial<SentenceDeduperOptions> = {},
): SentenceDeduper {
  const { windowMs, maxEntries } = { ...DEFAULT_OPTIONS, ...options };

  const seenAt = new Map<string, number>();

  // Remove old entries that are outside the dedupe time window.
  function evictExpired(now: number): void {
    const expiredKeys: string[] = [];

    seenAt.forEach((timestamp, line) => {
      if (now - timestamp > windowMs) {
        expiredKeys.push(line);
      }
    });

    for (let i = 0; i < expiredKeys.length; i += 1) {
      const key = expiredKeys[i];
      if (key !== undefined) seenAt.delete(key);
    }
  }

  // Keep the cache size under the configured limit.
  function evictOverCapacity(): void {
    while (seenAt.size > maxEntries) {
      let oldestKey: string | undefined;
      seenAt.forEach((_timestamp, line) => {
        if (oldestKey === undefined) oldestKey = line;
      });

      if (oldestKey === undefined) break;
      seenAt.delete(oldestKey);
    }
  }

  function isDuplicate(line: string): boolean {
    const now = Date.now();
    evictExpired(now);

    if (seenAt.has(line)) {
      return true;
    }

    seenAt.set(line, now);
    evictOverCapacity();
    return false;
  }

  function size(): number {
    return seenAt.size;
  }

  return { isDuplicate, size };
}
