import { BannerContent, ProductKind } from "@tgbox/shared";
import { eq } from "drizzle-orm";
import type { Db } from "./access.ts";
import { type PublicJsonCache, readPublicCached } from "./public-cache.ts";
import { type PublicPromotionScanCursor, scanPublicPromotions } from "./public-operations.ts";
import { getPublicRevision } from "./public-projection.ts";
import { PUBLIC_TIME_INFINITY, validatePublicTime } from "./public-promotions.ts";
import { siteState } from "./schema.ts";

type Promotion = Awaited<ReturnType<typeof scanPublicPromotions>>["items"][number];
type Query = { kind: ProductKind; limit: number };
type Preparation = Query & {
  format: 1;
  revision: string;
  evaluatedAt: number;
  validUntil: number;
  items: Promotion[];
  next: PublicPromotionScanCursor | null;
  hasMore: boolean;
};

function key(query: Query) {
  ProductKind.parse(query.kind);
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100)
    throw new RangeError("Invalid prepared promotion limit");
  // Fixed slots bound storage across content revisions and evaluation times.
  return `public_promotion_preparation:${query.kind}:${query.limit}`;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid promotion preparation object");
  return value as Record<string, unknown>;
}

function integer(value: unknown) {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    throw new Error("Invalid promotion preparation integer");
  return value;
}

function parse(value: unknown, query: Query): Preparation {
  const row = record(value);
  if (
    row.format !== 1 ||
    row.kind !== query.kind ||
    row.limit !== query.limit ||
    typeof row.revision !== "string" ||
    !/^\d+$/.test(row.revision) ||
    typeof row.hasMore !== "boolean" ||
    !Array.isArray(row.items) ||
    row.items.length > query.limit
  )
    throw new Error("Invalid promotion preparation");
  const evaluatedAt = integer(row.evaluatedAt);
  validatePublicTime(evaluatedAt);
  const validUntil = integer(row.validUntil);
  if (validUntil <= evaluatedAt) throw new Error("Invalid promotion preparation interval");
  const items = row.items.map((value): Promotion => {
    const item = record(value);
    const kind = ProductKind.parse(item.kind);
    if (
      kind !== query.kind ||
      (item.entryUsername !== null && typeof item.entryUsername !== "string")
    )
      throw new Error("Invalid prepared promotion scope");
    const startsAt = integer(item.startsAt);
    const endsAt = integer(item.endsAt);
    if (startsAt > evaluatedAt || endsAt < validUntil)
      throw new Error("Invalid prepared promotion time");
    return {
      id: integer(item.id),
      kind,
      entryUsername: item.entryUsername,
      banner: item.banner === null ? null : BannerContent.parse(item.banner),
      startsAt,
      endsAt,
    };
  });
  let next: PublicPromotionScanCursor | null = null;
  if (row.next !== null) {
    const cursor = record(row.next);
    if (cursor.revision !== row.revision || cursor.evaluatedAt !== evaluatedAt)
      throw new Error("Invalid preparation cursor version");
    const endsAt = integer(cursor.endsAt);
    if (endsAt <= evaluatedAt) throw new Error("Invalid preparation cursor time");
    next = { id: integer(cursor.id), endsAt, revision: row.revision, evaluatedAt };
  }
  return {
    ...query,
    format: 1,
    revision: row.revision,
    evaluatedAt,
    validUntil,
    items,
    next,
    hasMore: row.hasMore,
  };
}

async function load(db: Db, stateKey: string) {
  const [row] = await db
    .select({ value: siteState.value })
    .from(siteState)
    .where(eq(siteState.key, stateKey))
    .limit(1);
  return row?.value ?? null;
}

/** Advances exactly one bounded batch. Prepared output contains only the requested first N items. */
export async function preparePublicPromotions(
  db: Db,
  query: Query,
  options: { now: () => number; batchSize?: number },
) {
  const stateKey = key(query);
  const batchSize = options.batchSize ?? 100;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new RangeError("Invalid promotion preparation batch size");
  const startedAt = options.now();
  validatePublicTime(startedAt);
  const revision = await getPublicRevision(db);
  const original = await load(db, stateKey);
  let previous: Preparation | undefined;
  try {
    previous = parse(JSON.parse(original ?? "null"), query);
  } catch {
    /* Invalid derived preparation is rebuilt from authority. */
  }
  if (
    previous &&
    (previous.revision !== revision ||
      previous.evaluatedAt > startedAt ||
      previous.validUntil <= startedAt)
  )
    previous = undefined;
  if (previous?.next === null) {
    if ((await getPublicRevision(db)) !== revision)
      throw new Error("Public promotions changed; retry");
    const finishedAt = options.now();
    validatePublicTime(finishedAt);
    if (finishedAt < previous.evaluatedAt || finishedAt >= previous.validUntil)
      throw new Error("Public promotions expired; retry");
    return { status: "ready" as const, scanned: 0 };
  }
  const evaluatedAt = previous?.evaluatedAt ?? startedAt;
  const batch = await scanPublicPromotions(db, {
    now: evaluatedAt,
    after: previous?.next ?? undefined,
    batchSize,
  });
  if (batch.revision !== revision) throw new Error("Public promotions changed; retry");
  const matching = batch.items.filter((item) => item.kind === query.kind);
  const existing = previous?.items ?? [];
  const state = parse(
    {
      ...query,
      format: 1,
      revision,
      evaluatedAt,
      validUntil: Math.min(previous?.validUntil ?? PUBLIC_TIME_INFINITY, batch.validUntil),
      items: [...existing, ...matching.slice(0, query.limit - existing.length)],
      hasMore: (previous?.hasMore ?? false) || existing.length + matching.length > query.limit,
      next: batch.next,
    },
    query,
  );
  // CAS prevents a slower concurrent batch from replacing newer progress or ready output.
  const result = await db.$client
    .prepare(`INSERT INTO site_state(key,value)
    SELECT ?,? WHERE (SELECT value FROM site_state WHERE key='public_content_revision')=?
      AND (SELECT value FROM site_state WHERE key='public_projection_enabled')='1'
      AND (SELECT value FROM site_state WHERE key='public_projection_ready')='1'
    ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE site_state.value IS ?`)
    .bind(stateKey, JSON.stringify(state), revision, original)
    .run();
  if ((await getPublicRevision(db)) !== revision)
    throw new Error("Public promotions changed; retry");
  const finishedAt = options.now();
  validatePublicTime(finishedAt);
  if (finishedAt < evaluatedAt || finishedAt >= state.validUntil)
    throw new Error("Public promotions expired; retry");
  if (!result.meta.changes) return { status: "contended" as const, scanned: batch.scanned };
  return {
    status: state.next === null ? ("ready" as const) : ("pending" as const),
    scanned: batch.scanned,
  };
}

/** Cache faults fall back to the completed D1 preparation. Missing preparation never triggers a scan. */
export async function readPreparedPublicPromotions(
  db: Db,
  cache: PublicJsonCache | null,
  query: Query,
  options: { now: () => number; maxAgeMs: number },
) {
  const stateKey = key(query);
  const decode = (value: unknown) => {
    const state = parse(value, query);
    const now = options.now();
    validatePublicTime(now);
    if (state.next !== null || now < state.evaluatedAt || now >= state.validUntil)
      throw new Error("Public promotions need preparation");
    return state;
  };
  return readPublicCached(
    db,
    cache,
    ["prepared-promotions-v1", query.kind, query.limit],
    decode,
    async () => {
      const state = decode(JSON.parse((await load(db, stateKey)) ?? "null"));
      if (state.revision !== (await getPublicRevision(db)))
        throw new Error("Public promotions need preparation");
      return { value: state, validUntil: state.validUntil };
    },
    options,
  );
}
