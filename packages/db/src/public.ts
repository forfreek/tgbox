import type { EntryKind } from "@tgbox/shared";
import { and, desc, eq, lt, lte, or, sql } from "drizzle-orm";
import type { Db } from "./access.ts";
import { categories, entries, entryStats, entryTags, tags } from "./schema.ts";

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
