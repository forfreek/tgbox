import { and, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "./access.ts";
import { type PublicScope, publicFields, publicScopeKey } from "./public.ts";
import {
  getPublicRevision,
  publicReadStateKeys,
  publicRevisionFromState,
} from "./public-projection.ts";
import {
  PUBLIC_TIME_INFINITY,
  refreshPublicPromotions,
  validatePublicTime,
} from "./public-promotions.ts";
import {
  publicPageAnchors as anchors,
  categories,
  entries,
  entryStats,
  publicPromotionState as promotions,
  publicCounts,
  publicListing,
  siteState,
} from "./schema.ts";

export const PUBLIC_PAGE_SIZE = 60;
export const PUBLIC_PAGE_JUMP = 10;
export type PublicPageQuery = {
  scope: PublicScope;
  sort: "members" | "latest";
  page: number;
  now: number;
  expectedOrderRevision?: number;
};
type PageKey = { entryId: number; promotionOrder: number; order: number; usernameKey: string };
type Anchor = { page: number; promotionOrder: number; orderValue: number; usernameKey: string };

function validate(query: PublicPageQuery) {
  validatePublicTime(query.now);
  if (
    !Number.isSafeInteger(query.page) ||
    query.page < 1 ||
    !["members", "latest"].includes(query.sort)
  ) {
    throw new RangeError("Invalid public page");
  }
  if (
    query.expectedOrderRevision !== undefined &&
    (!Number.isSafeInteger(query.expectedOrderRevision) || query.expectedOrderRevision < 0)
  ) {
    throw new RangeError("Invalid expected ordering revision");
  }
  return publicScopeKey(query.scope);
}

async function context(db: Db, query: PublicPageQuery) {
  const scope = validate(query);
  const [states, counts, expired, future, boundary] = await db.batch([
    db.select().from(siteState).where(inArray(siteState.key, publicReadStateKeys)),
    db.select().from(publicCounts).where(eq(publicCounts.scope, scope)).limit(1),
    db
      .select({ id: promotions.entryId })
      .from(promotions)
      .where(and(eq(promotions.isPublic, true), lte(promotions.validUntil, query.now)))
      .orderBy(promotions.validUntil, promotions.entryId)
      .limit(1),
    db
      .select({ id: promotions.entryId })
      .from(promotions)
      .where(and(eq(promotions.isPublic, true), gt(promotions.validFrom, query.now)))
      .orderBy(promotions.validFrom, promotions.entryId)
      .limit(1),
    db
      .select({ until: promotions.validUntil })
      .from(promotions)
      .where(eq(promotions.isPublic, true))
      .orderBy(promotions.validUntil, promotions.entryId)
      .limit(1),
  ]);
  const revision = publicRevisionFromState(
    Object.fromEntries(states.map((row) => [row.key, row.value])),
  );
  const total = counts[0]?.count ?? 0;
  const orderRevision = counts[0]?.orderRevision ?? 0;
  if (
    !Number.isSafeInteger(total) ||
    total < 0 ||
    !Number.isSafeInteger(orderRevision) ||
    orderRevision < 0
  ) {
    throw new Error("Invalid public listing counters");
  }
  return {
    scope,
    revision,
    orderRevision,
    total,
    totalPages: Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE)),
    promotionsReady: expired.length === 0 && future.length === 0,
    validUntil: boundary[0]?.until ?? PUBLIC_TIME_INFINITY,
  };
}

type Context = Awaited<ReturnType<typeof context>>;

async function verify(db: Db, ctx: Context) {
  if ((await getPublicRevision(db)) !== ctx.revision) throw new Error("Public page changed; retry");
}

function missing(query: PublicPageQuery, ctx: Context) {
  return (
    query.page > ctx.totalPages ||
    (ctx.total === 0 && ["category", "tag"].includes(query.scope.kind))
  );
}

async function nearestAnchor(db: Db, query: PublicPageQuery, ctx: Context): Promise<Anchor> {
  const [anchor] = await db
    .select()
    .from(anchors)
    .where(
      and(
        eq(anchors.scope, ctx.scope),
        eq(anchors.sort, query.sort),
        eq(anchors.orderRevision, ctx.orderRevision),
        lte(anchors.page, query.page),
      ),
    )
    .orderBy(desc(anchors.page))
    .limit(1);
  return anchor ?? { page: 1, promotionOrder: 0, orderValue: 0, usernameKey: "" };
}

function keys(
  db: Db,
  query: PublicPageQuery,
  ctx: Context,
  anchor: Anchor,
  offset: number,
  limit: number,
) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > PUBLIC_PAGE_SIZE * PUBLIC_PAGE_JUMP) {
    throw new RangeError("Public page seek exceeds budget");
  }
  const order = query.sort === "members" ? publicListing.memberOrder : publicListing.latestOrder;
  return db
    .select({
      entryId: publicListing.entryId,
      promotionOrder: publicListing.promotionOrder,
      order,
      usernameKey: publicListing.usernameKey,
    })
    .from(publicListing)
    .where(
      and(
        eq(publicListing.scope, ctx.scope),
        anchor.page === 1
          ? undefined
          : sql`(${publicListing.promotionOrder},${order},${publicListing.usernameKey}) >
        (${anchor.promotionOrder},${anchor.orderValue},${anchor.usernameKey})`,
      ),
    )
    .orderBy(publicListing.promotionOrder, order, publicListing.usernameKey)
    .offset(offset)
    .limit(limit);
}

async function hydrate(db: Db, pageKeys: PageKey[]) {
  if (pageKeys.length === 0) return [];
  const rows = await db
    .select({ ...publicFields, paidTier: promotions.tier })
    .from(entries)
    .innerJoin(categories, eq(categories.id, entries.categoryId))
    .leftJoin(entryStats, eq(entryStats.entryId, entries.id))
    .leftJoin(promotions, eq(promotions.entryId, entries.id))
    .where(
      and(
        eq(entries.status, "approved"),
        inArray(
          entries.id,
          pageKeys.map((key) => key.entryId),
        ),
      ),
    );
  if (rows.length !== pageKeys.length) throw new Error("Public page projection changed; retry");
  const byId = new Map(
    rows.map(({ paidTier, ...row }) => [
      row.id,
      {
        ...row,
        promo:
          row.isPromoted || paidTier === 3
            ? ("pin" as const)
            : paidTier === 2
              ? ("category_pin" as const)
              : paidTier === 1
                ? ("highlight" as const)
                : null,
      },
    ]),
  );
  return pageKeys.map((key) => {
    const row = byId.get(key.entryId);
    if (!row) throw new Error("Public page entry missing");
    return row;
  });
}

/** Read-only numbered page. Cold deep pages explicitly request bounded preparation. */
export async function readPublicPage(db: Db, query: PublicPageQuery) {
  const ctx = await context(db, query);
  const metadata = {
    revision: ctx.revision,
    orderRevision: ctx.orderRevision,
    total: ctx.total,
    totalPages: ctx.totalPages,
    page: query.page,
    validUntil: ctx.validUntil,
  };
  if (
    query.expectedOrderRevision !== undefined &&
    query.expectedOrderRevision !== ctx.orderRevision
  ) {
    await verify(db, ctx);
    return { status: "changed" as const, ...metadata };
  }
  if (missing(query, ctx)) {
    await verify(db, ctx);
    return { status: "not_found" as const, ...metadata };
  }
  if (!ctx.promotionsReady) {
    await verify(db, ctx);
    return { status: "needs_preparation" as const, reason: "promotions" as const, ...metadata };
  }
  const anchor = await nearestAnchor(db, query, ctx);
  if (query.page - anchor.page > PUBLIC_PAGE_JUMP) {
    await verify(db, ctx);
    return { status: "needs_preparation" as const, reason: "anchor" as const, ...metadata };
  }
  const pageKeys = await keys(
    db,
    query,
    ctx,
    anchor,
    (query.page - anchor.page) * PUBLIC_PAGE_SIZE,
    PUBLIC_PAGE_SIZE,
  );
  const items = await hydrate(db, pageKeys);
  await verify(db, ctx);
  return { status: "ready" as const, items, ...metadata };
}

/** Prepares at most two 600-key jumps. A continuation advances from the persisted anchor. */
export async function preparePublicPage(db: Db, query: PublicPageQuery) {
  validate(query);
  const promotionWork = await refreshPublicPromotions(db, query.now);
  if (!promotionWork.ready)
    return { ready: false, reason: "promotions" as const, preparedThrough: 0 };
  const ctx = await context(db, query);
  if (
    query.expectedOrderRevision !== undefined &&
    query.expectedOrderRevision !== ctx.orderRevision
  ) {
    await verify(db, ctx);
    return { ready: false, reason: "changed" as const, preparedThrough: 0 };
  }
  if (!ctx.promotionsReady)
    return { ready: false, reason: "promotions" as const, preparedThrough: 0 };
  if (missing(query, ctx)) {
    await verify(db, ctx);
    return { ready: true, reason: "not_found" as const, preparedThrough: query.page };
  }
  let anchor = await nearestAnchor(db, query, ctx);
  for (let step = 0; step < 2 && anchor.page < query.page; step++) {
    const target = Math.min(query.page, anchor.page + PUBLIC_PAGE_JUMP);
    const [key] = await keys(
      db,
      query,
      ctx,
      anchor,
      (target - anchor.page) * PUBLIC_PAGE_SIZE - 1,
      1,
    );
    if (!key) throw new Error("Public page anchor source changed; retry");
    await verify(db, ctx);
    await db
      .insert(anchors)
      .values({
        scope: ctx.scope,
        sort: query.sort,
        orderRevision: ctx.orderRevision,
        page: target,
        promotionOrder: key.promotionOrder,
        orderValue: key.order,
        usernameKey: key.usernameKey,
        createdAt: query.now,
      })
      .onConflictDoNothing();
    anchor = {
      page: target,
      promotionOrder: key.promotionOrder,
      orderValue: key.order,
      usernameKey: key.usernameKey,
    };
  }
  await verify(db, ctx);
  return {
    ready: anchor.page === query.page,
    reason: "anchor" as const,
    preparedThrough: anchor.page,
  };
}

/** Bounded retention cleanup, intended for the existing maintenance workflow. */
export async function prunePublicPageAnchors(db: Db, before: number, limit = 100) {
  validatePublicTime(before);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError("Invalid anchor cleanup limit");
  return db.$client
    .prepare(`DELETE FROM public_page_anchors WHERE rowid IN (
    SELECT rowid FROM public_page_anchors WHERE created_at < ? ORDER BY created_at LIMIT ?)`)
    .bind(before, limit)
    .run();
}
