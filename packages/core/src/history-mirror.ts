import {
  advanceHistoryMirror,
  type Db,
  getPublicRevision,
  getSiteState,
  invalidateHistoryMirror,
} from "@tgbox/db";
import { HISTORY_BYTE_LIMIT, normalizeHistory } from "./history-normalization.ts";

/** Independent of appendHistory's weekly skip. Every retry re-reads the persisted source object. */
export async function mirrorHistoryStep(
  db: Db,
  media: Pick<R2Bucket, "get" | "head">,
  entryId: number,
  now: number,
) {
  const sourceRevision = await getPublicRevision(db);
  const entry = await db.$client
    .prepare("SELECT id,username,listed_at FROM entries WHERE id=?")
    .bind(entryId)
    .first<{ id: number; username: string; listed_at: number }>();
  if (!entry) return { status: "missing" as const };
  const key = `history/${entry.username}.json`;
  const object = await media.get(key);
  let normalized: ReturnType<typeof normalizeHistory>;
  if (object && object.size > HISTORY_BYTE_LIMIT)
    normalized = { status: "oversized", rawPoints: 0, invalidTimes: 0, points: [] };
  else {
    const value = object ? await object.json().catch(() => undefined) : [];
    normalized = normalizeHistory(value);
  }
  const before = await media.head(key);
  if (before?.version !== object?.version || before?.etag !== object?.etag)
    throw new Error("History object changed; retry");
  const version = `history-v1:${object?.version ?? "missing"}`;
  const state = await advanceHistoryMirror(db, {
    entryId,
    username: entry.username,
    listedAt: entry.listed_at,
    sourceRevision,
    objectVersion: version,
    objectEtag: object?.etag ?? "missing",
    now,
    ...normalized,
  });
  if (!state || state.objectVersion !== version)
    throw new Error("History generation changed; retry");
  if (state.phase === "ready" || state.phase === "invalid") {
    try {
      const after = await media.head(key);
      if (after?.version !== object?.version || after?.etag !== object?.etag)
        throw new Error("History object changed; retry");
    } catch (error) {
      await invalidateHistoryMirror(db, entryId, state.generation);
      throw error;
    }
  }
  return { status: state.phase, state };
}

/** One entry/one phase per call. Cursor advances only after a complete or legacy-invalid result. */
export async function backfillHistoryMirrorStep(
  db: Db,
  media: Pick<R2Bucket, "get" | "head">,
  now: number,
) {
  const key = "public_history_backfill_cursor";
  const original = await getSiteState(db, key);
  const cursor = Number(original ?? "0");
  if (!Number.isSafeInteger(cursor) || cursor < 0)
    throw new Error("Invalid history backfill cursor");
  const entry = await db.$client
    .prepare("SELECT id FROM entries WHERE id>? ORDER BY id LIMIT 1")
    .bind(cursor)
    .first<{ id: number }>();
  if (!entry) return { status: "done" as const, cursor };
  const result = await mirrorHistoryStep(db, media, entry.id, now);
  if (result.status === "ready" || result.status === "invalid" || result.status === "missing") {
    const generation = "state" in result ? (result.state?.generation ?? "") : "";
    await db.$client
      .prepare(`INSERT INTO site_state(key,value) SELECT ?,? WHERE
      COALESCE((SELECT value FROM site_state WHERE key=?),'0')=?
      AND NOT EXISTS(SELECT 1 FROM entries WHERE id>? AND id<?)
      AND (NOT EXISTS(SELECT 1 FROM entries WHERE id=?) OR EXISTS(
        SELECT 1 FROM history_mirrors m JOIN entries e ON e.id=m.entry_id
        AND e.username=m.username AND e.listed_at=m.listed_at
        WHERE m.entry_id=? AND m.generation=? AND m.phase IN('ready','invalid')))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .bind(
        key,
        String(entry.id),
        key,
        String(cursor),
        cursor,
        entry.id,
        entry.id,
        entry.id,
        generation,
      )
      .run();
  }
  return {
    status: result.status,
    cursor: Number((await getSiteState(db, key)) ?? "0"),
    entryId: entry.id,
  };
}
