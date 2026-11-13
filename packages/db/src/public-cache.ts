import type { Db } from "./access.ts";
import { getPublicRevision } from "./public-projection.ts";

/** Adapter for a derived JSON cache. Authority and invalidation live in D1. */
export interface PublicJsonCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
}

/** Versioned read protocol, shared by future Worker cache adapters. */
export async function readPublicCached<T>(
  db: Db,
  cache: PublicJsonCache | null,
  keyParts: readonly (string | number)[],
  parse: (value: unknown) => T,
  load: () => Promise<{ value: T; validUntil?: number }>,
  options: { now: () => number; maxAgeMs: number; validateDependencies?: () => Promise<void> },
) {
  if (
    !Number.isSafeInteger(options.maxAgeMs) ||
    options.maxAgeMs < 1 ||
    options.maxAgeMs > 300_000
  ) {
    throw new RangeError("Cache age must be between 1 and 300000ms");
  }
  const now = () => {
    const value = options.now();
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Invalid cache time");
    return value;
  };
  const startedAt = now();
  const revision = await getPublicRevision(db);
  const key = JSON.stringify(["tgbox-public-v2", revision, ...keyParts]);
  let cached: T | undefined;
  let expiresAt = startedAt + options.maxAgeMs;
  let validFrom = startedAt;
  if (cache) {
    try {
      const text = await cache.get(key);
      const envelope: unknown = text === null ? null : JSON.parse(text);
      if (
        typeof envelope === "object" &&
        envelope !== null &&
        "expiresAt" in envelope &&
        typeof envelope.expiresAt === "number" &&
        Number.isSafeInteger(envelope.expiresAt) &&
        envelope.expiresAt > now() &&
        "validFrom" in envelope &&
        typeof envelope.validFrom === "number" &&
        Number.isSafeInteger(envelope.validFrom) &&
        envelope.validFrom >= 0 &&
        envelope.validFrom <= now() &&
        envelope.expiresAt > envelope.validFrom &&
        "value" in envelope
      ) {
        cached = parse(envelope.value);
        expiresAt = envelope.expiresAt;
        validFrom = envelope.validFrom;
      }
    } catch {
      /* Unavailable or malformed derived cache falls back to authority. */
    }
  }
  const loaded = cached === undefined ? await load() : undefined;
  const value = loaded ? parse(loaded.value) : cached;
  if (value === undefined) throw new Error("Public cache values must be defined");
  if (loaded) {
    if (loaded.validUntil !== undefined && !Number.isSafeInteger(loaded.validUntil))
      throw new RangeError("Invalid public validity boundary");
    expiresAt = Math.min(expiresAt, loaded.validUntil ?? Infinity);
  }
  if (cache && loaded && now() < expiresAt) {
    try {
      await cache.put(
        key,
        JSON.stringify({ value, validFrom, expiresAt }),
        Math.ceil((expiresAt - now()) / 1000),
      );
    } catch {
      /* A cache write failure does not change a successful authoritative read. */
    }
  }
  // Cache I/O can await concurrent writes or cross a natural promotion boundary.
  await options.validateDependencies?.();
  if ((await getPublicRevision(db)) !== revision) throw new Error("Public content changed; retry");
  const finishedAt = now();
  if (finishedAt < validFrom || finishedAt >= expiresAt)
    throw new Error("Public content expired; retry");
  return value;
}
