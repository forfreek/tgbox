import { eq } from "drizzle-orm";
import type { Db } from "./access.ts";
import { getPublicRevision } from "./public-projection.ts";
import { historyMirrors } from "./schema.ts";

export type HistoryMirrorInput = {
  entryId: number;
  username: string;
  listedAt: number;
  objectVersion: string;
  objectEtag: string;
  status: "valid" | "invalid" | "oversized";
  rawPoints: number;
  invalidTimes: number;
  now: number;
  sourceRevision: string;
  points: { sampledAt: number; members: number; ordinal: number }[];
};
export async function getHistoryMirror(db: Db, id: number) {
  return (await db.select().from(historyMirrors).where(eq(historyMirrors.entryId, id)).limit(1))[0];
}
const current = `EXISTS(SELECT 1 FROM history_mirrors m JOIN entries e ON e.id=m.entry_id
  AND e.username=m.username AND e.listed_at=m.listed_at WHERE m.entry_id=? AND m.generation=?
  AND NOT EXISTS(SELECT 1 FROM history_writes w WHERE w.entry_id=m.entry_id))
  AND (SELECT value FROM site_state WHERE key='public_content_revision')=?
  AND (SELECT value FROM site_state WHERE key='public_projection_enabled')='1'
  AND (SELECT value FROM site_state WHERE key='public_projection_ready')='1'`;
const bump = `UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)
  WHERE key='public_content_revision' AND ${current}`;

/** One bounded phase per invocation. Partial contents are never readable as complete baselines. */
export async function advanceHistoryMirror(db: Db, input: HistoryMirrorInput) {
  if (
    !Number.isSafeInteger(input.entryId) ||
    input.entryId < 1 ||
    input.points.length > 4096 ||
    !Number.isSafeInteger(input.now) ||
    !Number.isSafeInteger(input.listedAt) ||
    !Number.isSafeInteger(input.rawPoints) ||
    input.rawPoints < 0 ||
    !Number.isSafeInteger(input.invalidTimes) ||
    input.invalidTimes < 0
  )
    throw new RangeError("Invalid history mirror input");
  let previous = -Infinity;
  for (const point of input.points) {
    if (
      !Number.isSafeInteger(point.sampledAt) ||
      point.sampledAt <= previous ||
      !Number.isSafeInteger(point.members) ||
      !Number.isSafeInteger(point.ordinal) ||
      point.ordinal < 0
    )
      throw new RangeError("Invalid normalized history point");
    previous = point.sampledAt;
  }
  const revision = await getPublicRevision(db);
  if (revision !== input.sourceRevision) throw new Error("History source changed; retry");
  const state = await getHistoryMirror(db, input.entryId);
  if (
    !state ||
    state.username !== input.username ||
    state.listedAt !== input.listedAt ||
    state.objectVersion !== input.objectVersion ||
    state.objectEtag !== input.objectEtag ||
    state.phase === "stale"
  ) {
    const generation = crypto.randomUUID();
    const phase = input.status === "valid" ? "clean" : input.status;
    await db.$client.batch([
      db.$client
        .prepare(`INSERT INTO history_mirrors
        (entry_id,username,listed_at,object_version,object_etag,generation,phase,cursor,raw_points,point_count,invalid_times,updated_at,commit_token)
        SELECT ?,?,?,?,?,?,?,0,?,?,?,?,'' FROM entries WHERE id=? AND username=? AND listed_at=?
        AND NOT EXISTS(SELECT 1 FROM history_writes WHERE entry_id=entries.id)
        AND COALESCE((SELECT generation FROM history_mirrors WHERE entry_id=?),'')=?
        AND (SELECT value FROM site_state WHERE key='public_content_revision')=?
        AND (SELECT value FROM site_state WHERE key='public_projection_enabled')='1'
        AND (SELECT value FROM site_state WHERE key='public_projection_ready')='1'
        ON CONFLICT(entry_id) DO UPDATE SET username=excluded.username,listed_at=excluded.listed_at,
        object_version=excluded.object_version,object_etag=excluded.object_etag,generation=excluded.generation,
        phase=excluded.phase,cursor=0,raw_points=excluded.raw_points,point_count=excluded.point_count,
        invalid_times=excluded.invalid_times,updated_at=excluded.updated_at,commit_token=''`)
        .bind(
          input.entryId,
          input.username,
          input.listedAt,
          input.objectVersion,
          input.objectEtag,
          generation,
          phase,
          input.rawPoints,
          input.points.length,
          input.invalidTimes,
          input.now,
          input.entryId,
          input.username,
          input.listedAt,
          input.entryId,
          state?.generation ?? "",
          revision,
        ),
      db.$client.prepare(bump).bind(input.entryId, generation, revision),
    ]);
  } else if (state.phase === "clean") {
    await db.$client.batch([
      db.$client
        .prepare(`DELETE FROM history_baselines WHERE rowid IN
        (SELECT rowid FROM history_baselines WHERE entry_id=? ORDER BY sampled_at LIMIT 100)
        AND ${current} AND (SELECT phase FROM history_mirrors WHERE entry_id=?)='clean'`)
        .bind(input.entryId, input.entryId, state.generation, revision, input.entryId),
      db.$client
        .prepare(`UPDATE history_mirrors SET phase='write' WHERE entry_id=? AND generation=? AND phase='clean'
        AND ${current} AND NOT EXISTS(SELECT 1 FROM history_baselines WHERE entry_id=?)`)
        .bind(
          input.entryId,
          state.generation,
          input.entryId,
          state.generation,
          revision,
          input.entryId,
        ),
    ]);
  } else if (state.phase === "write") {
    if (state.pointCount !== input.points.length)
      throw new Error("History normalization changed; restart source generation");
    const chunk = input.points.slice(state.cursor, state.cursor + 100);
    const end = state.cursor + chunk.length;
    const token = crypto.randomUUID();
    const guard = `${current} AND (SELECT phase FROM history_mirrors WHERE entry_id=?)='write'
      AND (SELECT cursor FROM history_mirrors WHERE entry_id=?)=?`;
    const params = [
      input.entryId,
      state.generation,
      revision,
      input.entryId,
      input.entryId,
      state.cursor,
    ];
    const writes = [];
    if (chunk.length)
      writes.push(
        db.$client
          .prepare(`INSERT INTO history_baselines(entry_id,sampled_at,members,ordinal)
      SELECT ?,json_extract(value,'$.sampledAt'),json_extract(value,'$.members'),json_extract(value,'$.ordinal')
      FROM json_each(?) WHERE ${guard}`)
          .bind(input.entryId, JSON.stringify(chunk), ...params),
      );
    writes.push(
      db.$client
        .prepare(`UPDATE history_mirrors SET cursor=?,phase=?,commit_token=?,updated_at=?
      WHERE entry_id=? AND generation=? AND ${guard}`)
        .bind(
          end,
          end === state.pointCount ? "verify" : "write",
          token,
          input.now,
          input.entryId,
          state.generation,
          ...params,
        ),
    );
    await db.$client.batch(writes);
  } else if (state.phase === "verify") {
    const token = crypto.randomUUID();
    await db.$client.batch([
      db.$client
        .prepare(`UPDATE history_mirrors SET phase='ready',commit_token=?,updated_at=? WHERE entry_id=?
        AND generation=? AND phase='verify' AND cursor=point_count AND ${current}`)
        .bind(
          token,
          input.now,
          input.entryId,
          state.generation,
          input.entryId,
          state.generation,
          revision,
        ),
      db.$client
        .prepare(`${bump} AND (SELECT commit_token FROM history_mirrors WHERE entry_id=?)=?`)
        .bind(input.entryId, state.generation, revision, input.entryId, token),
    ]);
  }
  return getHistoryMirror(db, input.entryId);
}

export async function invalidateHistoryMirror(db: Db, id: number, generation: string) {
  await getPublicRevision(db);
  const token = crypto.randomUUID();
  await db.$client.batch([
    db.$client
      .prepare(
        "UPDATE history_mirrors SET phase='stale',commit_token=? WHERE entry_id=? AND generation=? AND phase!='stale'",
      )
      .bind(token, id, generation),
    db.$client
      .prepare(`UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)
        WHERE key='public_content_revision' AND EXISTS(SELECT 1 FROM history_mirrors
          WHERE entry_id=? AND generation=? AND commit_token=?)`)
      .bind(id, generation, token),
  ]);
}

/** Single indexed seek, with current entry identity and public status checked in the same query. */
export async function readHistoryBaseline(db: Db, entryId: number, cutoff: number) {
  if (!Number.isSafeInteger(entryId) || !Number.isSafeInteger(cutoff))
    throw new RangeError("Invalid history lookup");
  return db.$client
    .prepare(`SELECT m.phase,b.sampled_at,b.members FROM history_mirrors m
    JOIN entries e ON e.id=m.entry_id AND e.username=m.username AND e.listed_at=m.listed_at AND e.status='approved'
    LEFT JOIN history_baselines b ON m.phase='ready' AND b.entry_id=m.entry_id AND b.sampled_at=(SELECT sampled_at
      FROM history_baselines WHERE entry_id=m.entry_id AND sampled_at<=? ORDER BY sampled_at DESC LIMIT 1)
    WHERE m.entry_id=? AND NOT EXISTS(SELECT 1 FROM history_writes WHERE entry_id=m.entry_id)`)
    .bind(cutoff, entryId)
    .first<{ phase: string; sampled_at: number | null; members: number | null }>();
}
