import { and, eq, gt, lte, sql } from "drizzle-orm";
import { batchWrite, type Db } from "./access.ts";
import { getPublicRevision } from "./public-projection.ts";
import { entries, publicPromotionState as state } from "./schema.ts";

export const PUBLIC_TIME_INFINITY = Number.MAX_SAFE_INTEGER;

export function validatePublicTime(now: number) {
  if (!Number.isSafeInteger(now) || now < 0 || now >= PUBLIC_TIME_INFINITY) {
    throw new RangeError("Invalid public evaluation time");
  }
}

/** Both bounds are checked so a clock rollback also requires re-evaluation. */
async function dueEntries(db: Db, now: number, limit: number) {
  const select = () =>
    db
      .select({ state, username: entries.username })
      .from(state)
      .innerJoin(entries, eq(entries.id, state.entryId));
  const [expired, future] = await db.batch([
    select()
      .where(and(eq(state.isPublic, true), lte(state.validUntil, now)))
      .orderBy(state.validUntil, state.entryId)
      .limit(limit),
    select()
      .where(and(eq(state.isPublic, true), gt(state.validFrom, now)))
      .orderBy(state.validFrom, state.entryId)
      .limit(limit),
  ]);
  return [
    ...new Map([...expired, ...future].map((row) => [row.state.entryId, row])).values(),
  ].slice(0, limit);
}

/** Bounded preparation, shared by future write/Cron/SSR orchestration. */
export async function refreshPublicPromotions(db: Db, now: number, limit = 20) {
  validatePublicTime(now);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 20)
    throw new RangeError("Invalid promotion batch size");
  await getPublicRevision(db);
  const due = await dueEntries(db, now, limit);
  let processed = 0;
  for (const row of due) {
    const id = row.state.entryId;
    const username = row.username;
    const results = await db.$client.batch([
      db.$client
        .prepare(`SELECT coalesce(max(CASE kind WHEN 'pin' THEN 3 WHEN 'category_pin' THEN 2 WHEN 'highlight' THEN 1 ELSE 0 END),0) AS value
        FROM promotions WHERE entry_username=? AND ends_at>? AND starts_at<=?`)
        .bind(username, now, now),
      db.$client
        .prepare(
          "SELECT coalesce(max(starts_at),0) AS value FROM promotions WHERE entry_username=? AND starts_at<=?",
        )
        .bind(username, now),
      db.$client
        .prepare(
          "SELECT coalesce(min(starts_at),9007199254740991) AS value FROM promotions WHERE entry_username=? AND starts_at>?",
        )
        .bind(username, now),
      db.$client
        .prepare(
          "SELECT coalesce(max(ends_at),0) AS value FROM promotions WHERE entry_username=? AND ends_at<=?",
        )
        .bind(username, now),
      db.$client
        .prepare(
          "SELECT coalesce(min(ends_at),9007199254740991) AS value FROM promotions WHERE entry_username=? AND ends_at>?",
        )
        .bind(username, now),
    ]);
    const value = (index: number) => {
      const record = results[index]?.results[0] as { value: number } | undefined;
      if (!record || !Number.isSafeInteger(record.value))
        throw new Error("Invalid promotion evaluation");
      return record.value;
    };
    const tier = value(0);
    const validFrom = Math.max(value(1), value(3));
    const validUntil = Math.min(value(2), value(4));
    if (validFrom > now || validUntil <= now) throw new Error("Invalid promotion time interval");
    const token = crypto.randomUUID();
    const won = sql`EXISTS (SELECT 1 FROM public_promotion_state WHERE entry_id=${id} AND evaluation_key=${token})`;
    const written = await batchWrite(db, [
      db
        .update(state)
        .set({ tier, validFrom, validUntil, evaluationKey: token })
        .where(
          and(
            eq(state.entryId, id),
            eq(state.isPublic, true),
            eq(state.inputRevision, row.state.inputRevision),
            eq(state.validFrom, row.state.validFrom),
            eq(state.validUntil, row.state.validUntil),
          ),
        ),
      sql`UPDATE public_listing SET promotion_order=CASE
        WHEN scope GLOB 'tag:*' THEN 0
        WHEN (SELECT is_promoted FROM entries WHERE id=${id})=1 OR ${tier}=3 THEN -2
        WHEN scope GLOB 'category:*' AND ${tier}=2 THEN -1 ELSE 0 END
        WHERE entry_id=${id} AND ${won}`,
      sql`UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)
        WHERE key='public_content_revision' AND ${won}`,
    ]);
    if ((written[0]?.meta.changes ?? 0) > 0) processed++;
  }
  return {
    attempted: due.length,
    processed,
    statements: 5 + 8 * due.length,
    ready: (await dueEntries(db, now, 1)).length === 0,
  };
}
