import type { Db } from "./access.ts";
import type { historyWrites } from "./schema.ts";

export type HistoryWrite = typeof historyWrites.$inferSelect;

export async function getHistoryWrite(db: Db, entryId: number) {
  return db.$client
    .prepare(`SELECT w.entry_id AS entryId,w.username,w.listed_at AS listedAt,
    w.token,w.base_etag AS baseEtag,w.sampled_at AS sampledAt,w.members
    FROM history_writes w JOIN entries e ON e.id=w.entry_id AND e.username=w.username
    AND e.listed_at=w.listed_at WHERE w.entry_id=?`)
    .bind(entryId)
    .first<HistoryWrite>();
}

export async function beginHistoryWrite(db: Db, input: HistoryWrite, revision: string) {
  if (
    ![input.entryId, input.listedAt, input.sampledAt, input.members].every(Number.isSafeInteger) ||
    input.entryId < 1 ||
    !Number.isFinite(new Date(input.sampledAt).getTime()) ||
    !input.token
  )
    throw new RangeError("Invalid history write");
  const result = await db.$client
    .prepare(`INSERT INTO history_writes
    (entry_id,username,listed_at,token,base_etag,sampled_at,members)
    SELECT ?,?,?,?,?,?,? FROM entries WHERE id=? AND username=? AND listed_at=?
    AND (SELECT value FROM site_state WHERE key='public_history_writes_enabled')='1'
    AND (SELECT value FROM site_state WHERE key='public_projection_enabled')='1'
    AND (SELECT value FROM site_state WHERE key='public_projection_ready')='1'
    AND (SELECT value FROM site_state WHERE key='public_content_revision')=?
    ON CONFLICT(entry_id) DO NOTHING`)
    .bind(
      input.entryId,
      input.username,
      input.listedAt,
      input.token,
      input.baseEtag,
      input.sampledAt,
      input.members,
      input.entryId,
      input.username,
      input.listedAt,
      revision,
    )
    .run();
  return { write: await getHistoryWrite(db, input.entryId), rowsWritten: result.meta.rows_written };
}

/** Deleting the matching intent atomically invalidates the mirror and increments the latest revision. */
export async function finishHistoryWrite(db: Db, input: HistoryWrite) {
  const result = await db.$client
    .prepare(`DELETE FROM history_writes WHERE entry_id=? AND token=?
    AND EXISTS(SELECT 1 FROM entries WHERE id=history_writes.entry_id
      AND username=history_writes.username AND listed_at=history_writes.listed_at)`)
    .bind(input.entryId, input.token)
    .run();
  return result.meta.rows_written;
}
