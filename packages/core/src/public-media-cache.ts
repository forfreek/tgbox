import { type Db, type PublicJsonCache, readPublicCached } from "@tgbox/db";

/** R2 identity participates in the cache key even when a subsequent D1 write failed. */
export async function readPublicMediaCached<T>(
  db: Db,
  media: Pick<R2Bucket, "head" | "get">,
  cache: PublicJsonCache | null,
  key: string,
  keyParts: readonly (string | number)[],
  parse: (value: unknown) => T,
  load: (object: R2ObjectBody | null) => Promise<T>,
  options: { now: () => number; maxAgeMs: number },
) {
  const before = await media.head(key);
  return readPublicCached(
    db,
    cache,
    ["public-media-v1", key, before?.version ?? "missing", before?.etag ?? "missing", ...keyParts],
    parse,
    async () => {
      const object = await media.get(key);
      if (object?.version !== before?.version || object?.etag !== before?.etag)
        throw new Error("Public media changed; retry");
      return { value: await load(object) };
    },
    {
      ...options,
      validateDependencies: async () => {
        const after = await media.head(key);
        if (after?.version !== before?.version || after?.etag !== before?.etag)
          throw new Error("Public media changed; retry");
      },
    },
  );
}
