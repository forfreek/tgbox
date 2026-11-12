import type { EntryKind } from "@tgbox/shared";
import { and, desc, eq, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "./access.ts";
import { getPublicRevision } from "./public-projection.ts";
import { categories, entries, entryStats, entryTags, publicListing, tags } from "./schema.ts";

/** Public fields only. Moderation counters and translation job metadata stay private. */
const publicFields = {
  id: entries.id,
  username: entries.username,
  startPayload: entries.startPayload,
  kind: entries.kind,
  categoryId: categories.id,
  category: categories.slug,
  title: entries.title,
  description: entries.description,
  descriptionZh: entries.descriptionZh,
  descriptionEn: entries.descriptionEn,
  lang: entries.lang,
  verified: entries.verified,
  avatarVersion: entries.avatarVersion,
  tgCreatedAt: entries.tgCreatedAt,
  listedAt: entries.listedAt,
  updatedAt: entries.updatedAt,
  isPromoted: entries.isPromoted,
  hidePosts: entries.hidePosts,
  members: entryStats.members,
  activityTier: entryStats.activityTier,
};

function publicRows(db: Db) {
  return db
    .select(publicFields)
    .from(entries)
    .innerJoin(categories, eq(categories.id, entries.categoryId))
    .leftJoin(entryStats, eq(entryStats.entryId, entries.id));
}

/** Always reads authority, including when used to validate a cached detail response. */
export async function getPublicEntry(db: Db, username: string) {
  const [entry] = await publicRows(db)
    .where(and(eq(entries.username, username.toLowerCase()), eq(entries.status, "approved")))
    .limit(1);
  if (!entry) return undefined;
  const entryTagRows = await db
    .select({
      id: tags.id,
      slug: tags.slug,
      nameZh: tags.nameZh,
      nameEn: tags.nameEn,
    })
    .from(entryTags)
    .innerJoin(tags, eq(tags.id, entryTags.tagId))
    .where(eq(entryTags.entryId, entry.id))
    .orderBy(tags.id);
  return { ...entry, tags: entryTagRows };
}

export type PublicEntry = NonNullable<Awaited<ReturnType<typeof getPublicEntry>>>;
export type PublicLatestCursor = { listedAt: number; username: string };
export type PublicLatestQuery = {
  kind?: EntryKind;
  categoryId?: number;
  after?: PublicLatestCursor;
  limit?: number;
};

/** Latest listings use a stable seek cursor. No page-size-dependent OFFSET. */
export async function listPublicLatest(db: Db, query: PublicLatestQuery = {}) {
  const limit = query.limit ?? 60;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 60) {
    throw new RangeError("Public page limit must be an integer between 1 and 60");
  }
  const after = query.after;
  if (after && (!Number.isSafeInteger(after.listedAt) || typeof after.username !== "string")) {
    throw new RangeError("Invalid latest listing cursor");
  }
  const rows = await publicRows(db)
    .where(
      and(
        eq(entries.status, "approved"),
        query.kind === undefined ? undefined : eq(entries.kind, query.kind),
        query.categoryId === undefined ? undefined : eq(entries.categoryId, query.categoryId),
        after === undefined ? undefined : lte(entries.listedAt, after.listedAt),
        after === undefined
          ? undefined
          : or(
              lt(entries.listedAt, after.listedAt),
              and(
                eq(entries.listedAt, after.listedAt),
                sql`${entries.username} > ${after.username}`,
              ),
            ),
      ),
    )
    .orderBy(desc(entries.listedAt), entries.username)
    .limit(limit + 1);
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    next: rows.length > limit && last ? { listedAt: last.listedAt, username: last.username } : null,
  };
}

export type PublicScope =
  | { kind: "all" }
  | { kind: "type"; type: EntryKind }
  | { kind: "category"; id: number }
  | { kind: "tag"; id: number };
export type PublicDirectoryCursor = {
  order: number;
  username: string;
  revision: string;
  scope: string;
  sort: "members" | "latest";
};

/** Scope-specific sort indexes avoid scanning unrelated entries for sparse tags. */
export async function listPublicDirectory(
  db: Db,
  query: {
    scope: PublicScope;
    sort: "members" | "latest";
    limit?: number;
    after?: PublicDirectoryCursor;
  },
) {
  const limit = query.limit ?? 60;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 60)
    throw new RangeError("Invalid page size");
  const after = query.after;
  if (after && (!Number.isSafeInteger(after.order) || typeof after.username !== "string")) {
    throw new RangeError("Invalid directory cursor");
  }
  const revision = await getPublicRevision(db);
  if (after && after.revision !== revision)
    throw new Error("Public directory changed; restart pagination");
  const scope =
    query.scope.kind === "all"
      ? "all"
      : query.scope.kind === "type"
        ? `kind:${query.scope.type}`
        : `${query.scope.kind}:${query.scope.id}`;
  if (after && (after.scope !== scope || after.sort !== query.sort)) {
    throw new RangeError("Cursor belongs to another listing");
  }
  const order = query.sort === "members" ? publicListing.memberOrder : publicListing.latestOrder;
  const rows = await db
    .select({ ...publicFields, order })
    .from(publicListing)
    .innerJoin(entries, eq(entries.id, publicListing.entryId))
    .innerJoin(categories, eq(categories.id, entries.categoryId))
    .leftJoin(entryStats, eq(entryStats.entryId, entries.id))
    .where(
      and(
        eq(publicListing.scope, scope),
        eq(entries.status, "approved"),
        after
          ? sql`(${order}, ${publicListing.username}) > (${after.order}, ${after.username})`
          : undefined,
      ),
    )
    .orderBy(order, publicListing.username)
    .limit(limit + 1);
  // A concurrent mutation cannot publish data under an obsolete cache revision.
  if ((await getPublicRevision(db)) !== revision)
    throw new Error("Public directory changed; retry");
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    revision,
    next:
      rows.length > limit && last
        ? { order: last.order, username: last.username, revision, scope, sort: query.sort }
        : null,
  };
}
