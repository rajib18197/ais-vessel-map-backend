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
  /** How long a sentence is remembered before it can be seen again as "new". */
  windowMs: number;
  /** Hard cap on tracked sentences, to bound memory under sustained high throughput. */
  maxEntries: number;
}

export interface SentenceDeduper {
  /** Returns true if this exact line was already seen within the window. */
  isDuplicate: (line: string) => boolean;
  /** Number of sentences currently tracked (for diagnostics/tests). */
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

  // Map preserves insertion order in JS, which lets us evict the oldest
  // entry in O(1) via the iterator without a separate queue structure.
  const seenAt = new Map<string, number>();

  function evictExpired(now: number): void {
    // forEach (not for...of) so this works under any target without
    // --downlevelIteration — Map.prototype.forEach has been available
    // since ES5, unlike the Map iterator protocol. We collect expired
    // keys first and delete after, rather than deleting mid-callback:
    // mutating a Map while forEach is walking it is well-defined for
    // deletions of already-visited keys, but collecting first keeps the
    // eviction logic obviously correct without relying on that guarantee.
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

  function evictOverCapacity(): void {
    while (seenAt.size > maxEntries) {
      // forEach again, for the same reason as evictExpired: avoids
      // depending on the Map iterator protocol (.keys()/.entries()),
      // which needs an ES2015+ lib even outside of for...of contexts.
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
