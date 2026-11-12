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
  options: { now: () => number; maxAgeMs: number },
) {
  if (
    !Number.isSafeInteger(options.maxAgeMs) ||
    options.maxAgeMs < 1 ||
    options.maxAgeMs > 300_000
  ) {
    throw new RangeError("Cache age must be between 1 and 300000ms");
  }
  const revision = await getPublicRevision(db);
  const key = JSON.stringify(["tgbox-public-v1", revision, ...keyParts]);
  let cached: T | undefined;
  if (cache) {
    try {
      const text = await cache.get(key);
      const envelope: unknown = text === null ? null : JSON.parse(text);
      if (
        typeof envelope === "object" &&
        envelope !== null &&
        "expiresAt" in envelope &&
        typeof envelope.expiresAt === "number" &&
        Number.isFinite(envelope.expiresAt) &&
        envelope.expiresAt > options.now() &&
        "value" in envelope
      ) {
        cached = parse(envelope.value);
      }
    } catch {
      /* Unavailable or malformed derived cache falls back to authority. */
    }
  }
  const loaded = cached === undefined ? await load() : undefined;
  const value = loaded ? parse(loaded.value) : cached;
  if (value === undefined) throw new Error("Public cache values must be defined");
  if ((await getPublicRevision(db)) !== revision) throw new Error("Public content changed; retry");
  if (cache && loaded) {
    const now = options.now();
    const expiresAt = Math.min(now + options.maxAgeMs, loaded.validUntil ?? Infinity);
    if (Number.isFinite(expiresAt) && expiresAt > now) {
      try {
        await cache.put(
          key,
          JSON.stringify({ value, expiresAt }),
          Math.ceil((expiresAt - now) / 1000),
        );
      } catch {
        /* A cache write failure does not change a successful authoritative read. */
      }
    }
  }
  return value;
}
