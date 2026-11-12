import { and, eq, gt, sql } from "drizzle-orm";
import { batchWrite, type Db, getSiteStates } from "./access.ts";
import { entries, siteState } from "./schema.ts";

const enabledKey = "public_projection_enabled";
const readyKey = "public_projection_ready";
const cursorKey = "public_backfill_cursor";
const revisionKey = "public_content_revision";
export const publicReadStateKeys = [enabledKey, readyKey, revisionKey];

/** Explicit opt-in. Projection writes start only when rollout is enabled. */
export async function beginPublicProjection(db: Db) {
  await db.batch([
    db.insert(siteState).values({ key: revisionKey, value: "0" }).onConflictDoNothing(),
    db.insert(siteState).values({ key: readyKey, value: "0" }).onConflictDoNothing(),
    db.insert(siteState).values({ key: cursorKey, value: "0" }).onConflictDoNothing(),
    db.insert(siteState).values({ key: enabledKey, value: "1" }).onConflictDoNothing(),
  ]);
}

/** One indexed state read per request can gate versioned cached results. */
export async function getPublicRevision(db: Db) {
  return publicRevisionFromState(await getSiteStates(db, publicReadStateKeys));
}

export function publicRevisionFromState(state: Record<string, string | undefined>) {
  if (state[enabledKey] !== "1" || state[readyKey] !== "1") {
    throw new Error("Public projection is not ready");
  }
  const revision = state[revisionKey];
  if (revision === undefined || !/^\d+$/.test(revision)) throw new Error("Invalid public revision");
  return revision;
}

/** Resumable, bounded, idempotent backfill. Progress and data commit in the same D1 batch. */
export async function backfillPublicProjection(db: Db, limit = 100) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError("Backfill limit must be between 1 and 100");
  }
  const state = await getSiteStates(db, [enabledKey, readyKey, cursorKey]);
  if (state[enabledKey] !== "1") throw new Error("Public projection is disabled");
  if (state[readyKey] === "1") return { done: true, cursor: Number(state[cursorKey]) };
  const cursor = Number(state[cursorKey]);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new Error("Invalid backfill cursor");
  const rows = await db
    .select({ id: entries.id })
    .from(entries)
    .where(gt(entries.id, cursor))
    .orderBy(entries.id)
    .limit(limit);
  const last = rows.at(-1)?.id;
  if (last === undefined) {
    await db.update(siteState).set({ value: "1" }).where(eq(siteState.key, readyKey));
    return { done: true, cursor };
  }
  const guard = sql`(SELECT value FROM site_state WHERE key = ${cursorKey}) = ${String(cursor)}
    AND (SELECT value FROM site_state WHERE key=${enabledKey})='1'
    AND (SELECT value FROM site_state WHERE key=${readyKey})='0'`;
  await batchWrite(db, [
    sql`INSERT INTO public_promotion_state(entry_id,is_public,valid_until)
      SELECT e.id,e.status='approved',CASE WHEN EXISTS
        (SELECT 1 FROM promotions p WHERE p.entry_username=e.username) THEN 0 ELSE 9007199254740991 END
      FROM entries e WHERE e.id > ${cursor} AND e.id <= ${last} AND ${guard}
      ON CONFLICT(entry_id) DO UPDATE SET is_public=excluded.is_public,tier=0,valid_from=0,
        valid_until=excluded.valid_until,input_revision=input_revision+1,evaluation_key=''`,
    sql`DELETE FROM public_listing WHERE entry_id > ${cursor} AND entry_id <= ${last} AND ${guard}`,
    sql`INSERT INTO public_listing SELECT * FROM public_listing_source
      WHERE entry_id > ${cursor} AND entry_id <= ${last} AND ${guard}`,
    sql`UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)
      WHERE key=${revisionKey} AND ${guard}`,
    db
      .update(siteState)
      .set({ value: String(last) })
      .where(and(eq(siteState.key, cursorKey), eq(siteState.value, String(cursor)), guard)),
  ]);
  return { done: false, cursor: last };
}

/** Invalidates derived media data after a successful R2 write. Callers must await this. */
export async function invalidatePublicMedia(db: Db) {
  await db
    .update(siteState)
    .set({ value: sql`CAST(CAST(value AS INTEGER) + 1 AS TEXT)` })
    .where(eq(siteState.key, revisionKey));
}
