import { SiteSettings, settingsDefaults } from "@tgbox/shared";
import { and, eq, gt, inArray, isNull, lte, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "./access.ts";
import { getPublicRevision } from "./public-projection.ts";
import { PUBLIC_TIME_INFINITY, validatePublicTime } from "./public-promotions.ts";
import { categories, entries, promotions, publicCounts, settings, tags } from "./schema.ts";

const promotionFields = {
  id: promotions.id,
  kind: promotions.kind,
  entryUsername: promotions.entryUsername,
  banner: promotions.banner,
  startsAt: promotions.startsAt,
  endsAt: promotions.endsAt,
};

/** Homepage totals are fixed-key reads of transactionally maintained counts. */
export async function getPublicTotals(db: Db) {
  await getPublicRevision(db);
  const rows = await db
    .select()
    .from(publicCounts)
    .where(inArray(publicCounts.scope, ["all", "kind:channel", "kind:group", "kind:bot"]));
  const counts = new Map(rows.map((row) => [row.scope, row.count]));
  return {
    total: counts.get("all") ?? 0,
    channel: counts.get("kind:channel") ?? 0,
    group: counts.get("kind:group") ?? 0,
    bot: counts.get("kind:bot") ?? 0,
  };
}

/** Taxonomy pages are bounded. The frontend retains category.sort as the display order. */
export async function listPublicTaxonomy(
  db: Db,
  query: { type: "categories" | "tags"; afterId?: number; limit?: number },
) {
  const limit = query.limit ?? 60;
  const afterId = query.afterId ?? 0;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !Number.isSafeInteger(afterId) ||
    afterId < 0
  ) {
    throw new RangeError("Invalid taxonomy page");
  }
  await getPublicRevision(db);
  const table = query.type === "categories" ? categories : tags;
  const prefix = query.type === "categories" ? "category:" : "tag:";
  const rows = await db
    .select({
      id: table.id,
      slug: table.slug,
      nameZh: table.nameZh,
      nameEn: table.nameEn,
      ...(query.type === "categories"
        ? { kind: categories.kind, sort: categories.sort, icon: categories.icon }
        : {}),
      count: sql<number>`coalesce(${publicCounts.count}, 0)`,
    })
    .from(table)
    .leftJoin(publicCounts, eq(publicCounts.scope, sql`${prefix} || ${table.id}`))
    .where(gt(table.id, afterId))
    .orderBy(table.id)
    .limit(limit + 1);
  return {
    items: rows.slice(0, limit),
    next: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null,
  };
}

/** Parses only site settings; payment credentials and private bot configuration never enter this DTO. */
export async function getPublicSiteSettings(db: Db) {
  const [row] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "site"))
    .limit(1);
  let value: unknown;
  try {
    value = row ? JSON.parse(row.value) : undefined;
  } catch {
    value = undefined;
  }
  const parsed = SiteSettings.safeParse(
    typeof value === "object" && value !== null ? { ...settingsDefaults.site, ...value } : value,
  );
  return parsed.success ? parsed.data : settingsDefaults.site;
}

/** Expired and future promotions are excluded even before the hourly maintenance runs. */
export async function listPublicPromotions(
  db: Db,
  query: { now: number; after?: { endsAt: number; id: number }; limit?: number },
) {
  const limit = query.limit ?? 60;
  if (!Number.isSafeInteger(query.now) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError("Invalid promotion page");
  const after = query.after;
  if (after && (!Number.isSafeInteger(after.endsAt) || !Number.isSafeInteger(after.id)))
    throw new RangeError("Invalid promotion cursor");
  const select = (boundary: SQL | undefined, readLimit: number) =>
    db
      .select(promotionFields)
      .from(promotions)
      .leftJoin(entries, eq(entries.username, promotions.entryUsername))
      .where(
        and(
          boundary ?? gt(promotions.endsAt, query.now),
          lte(promotions.startsAt, query.now),
          or(isNull(promotions.entryUsername), eq(entries.status, "approved")),
        ),
      )
      .orderBy(promotions.endsAt, promotions.id)
      .limit(readLimit);
  // Equality on ends_at lets the composite index seek directly to id within a tie.
  const sameEnd = after
    ? and(
        eq(promotions.endsAt, after.endsAt),
        gt(promotions.id, after.id),
        gt(promotions.endsAt, query.now),
      )
    : undefined;
  const rows = await select(sameEnd, limit + 1);
  if (after && rows.length < limit + 1) {
    rows.push(
      ...(await select(
        gt(promotions.endsAt, Math.max(query.now, after.endsAt)),
        limit + 1 - rows.length,
      )),
    );
  }
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, next: rows.length > limit && last ? { endsAt: last.endsAt, id: last.id } : null };
}

export type PublicPromotionScanCursor = {
  endsAt: number;
  id: number;
  revision: string;
  evaluatedAt: number;
};

/** Bounded candidate batch for preparation. An empty items array may still have a continuation. */
export async function scanPublicPromotions(
  db: Db,
  query: { now: number; after?: PublicPromotionScanCursor; batchSize?: number },
) {
  validatePublicTime(query.now);
  const size = query.batchSize ?? 100;
  if (!Number.isSafeInteger(size) || size < 1 || size > 100)
    throw new RangeError("Invalid promotion scan size");
  const after = query.after;
  if (
    after &&
    (!Number.isSafeInteger(after.endsAt) ||
      after.endsAt <= query.now ||
      !Number.isSafeInteger(after.id) ||
      typeof after.revision !== "string" ||
      !/^\d+$/.test(after.revision) ||
      after.evaluatedAt !== query.now)
  )
    throw new RangeError("Invalid promotion scan cursor");
  const revision = await getPublicRevision(db);
  if (after && after.revision !== revision) throw new Error("Public promotions changed; restart");
  const select = (boundary: SQL | undefined, limit: number) => {
    // LIMIT is inside the subquery so status and start-time filters cannot widen the source scan.
    const candidates = db
      .select(promotionFields)
      .from(promotions)
      .where(boundary)
      .orderBy(promotions.endsAt, promotions.id)
      .limit(limit)
      .as("candidates");
    return db
      .select({
        id: candidates.id,
        kind: candidates.kind,
        entryUsername: candidates.entryUsername,
        banner: candidates.banner,
        startsAt: candidates.startsAt,
        endsAt: candidates.endsAt,
        status: entries.status,
      })
      .from(candidates)
      .leftJoin(entries, eq(entries.username, candidates.entryUsername))
      .orderBy(candidates.endsAt, candidates.id);
  };
  const rows = await select(
    after
      ? and(eq(promotions.endsAt, after.endsAt), gt(promotions.id, after.id))
      : gt(promotions.endsAt, query.now),
    size,
  );
  if (after && rows.length < size) {
    rows.push(...(await select(gt(promotions.endsAt, after.endsAt), size - rows.length)));
  }
  let validUntil = PUBLIC_TIME_INFINITY;
  const items = [];
  for (const { status, ...row } of rows) {
    validUntil = Math.min(
      validUntil,
      row.endsAt,
      row.startsAt > query.now ? row.startsAt : PUBLIC_TIME_INFINITY,
    );
    if (row.startsAt <= query.now && (row.entryUsername === null || status === "approved"))
      items.push(row);
  }
  if ((await getPublicRevision(db)) !== revision)
    throw new Error("Public promotions changed; restart");
  const last = rows.at(-1);
  return {
    items,
    revision,
    evaluatedAt: query.now,
    validUntil,
    scanned: rows.length,
    next:
      rows.length === size && last
        ? { endsAt: last.endsAt, id: last.id, revision, evaluatedAt: query.now }
        : null,
  };
}
