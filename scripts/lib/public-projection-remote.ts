import { randomUUID } from "node:crypto";
import { publicBackfillStatements } from "../../packages/db/src/public-backfill-sql.ts";
import type { Query, Statement } from "./d1-remote.ts";

const runKey = "public_remote_rebuild_run";
const keys = [
  "public_projection_enabled",
  "public_projection_ready",
  "public_content_revision",
  "public_backfill_cursor",
  runKey,
];
export async function remoteProjectionStatus(query: Query) {
  const [result] = await query([
    {
      sql: `SELECT key,value FROM site_state WHERE key IN (${keys.map(() => "?").join(",")})`,
      params: keys,
    },
  ]);
  return Object.fromEntries(
    (result?.results ?? []).map((row) => [String(row.key), String(row.value)]),
  );
}
function gate(state: Record<string, string>, ready = "0") {
  if (
    state.public_projection_enabled !== "1" ||
    state.public_projection_ready !== ready ||
    !/^\d+$/.test(state.public_content_revision ?? "")
  )
    throw new Error("Projection gate is not ready for this operation");
}
function integer(value: unknown) {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) throw new Error("Invalid projection integer");
  return result;
}
const active = `(SELECT value FROM site_state WHERE key='${runKey}')=?
  AND (SELECT value FROM site_state WHERE key='public_projection_ready')='0'
  AND (SELECT value FROM site_state WHERE key='public_projection_enabled')='1'`;

export async function startRemoteProjection(query: Query, restart = false) {
  const state = await remoteProjectionStatus(query);
  if (!restart && state[runKey]) return state;
  await query([
    { sql: "SELECT promotion_order,username_key FROM public_listing LIMIT 0" },
    { sql: "SELECT tier,is_public FROM public_promotion_state LIMIT 0" },
    { sql: "SELECT order_revision FROM public_counts LIMIT 0" },
    { sql: "SELECT * FROM public_listing_source LIMIT 0" },
  ]);
  const revision = state.public_content_revision;
  // One write claims this generation. A concurrent start/restart cannot satisfy the old revision again.
  const run = randomUUID();
  const changes: Statement[] = [
    ["public_projection_ready", "0"],
    ["public_projection_enabled", "1"],
    ["public_backfill_cursor", "0"],
  ].map(([key, value]) => ({
    sql: `INSERT INTO site_state(key,value) SELECT ?,? WHERE
      (SELECT value FROM site_state WHERE key=?)=? ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    params: [key ?? "", value ?? "", runKey, run],
  }));
  changes.push({
    sql: `INSERT INTO site_state(key,value) SELECT 'public_content_revision','1' WHERE
      (SELECT value FROM site_state WHERE key=?)=? ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)`,
    params: [runKey, run],
  });
  await query([
    {
      sql: `INSERT INTO site_state(key,value) SELECT ?,? WHERE
      COALESCE((SELECT value FROM site_state WHERE key='public_content_revision'),'')=?
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
      params: [runKey, run, revision ?? ""],
    },
    ...changes,
  ]);
  const current = await remoteProjectionStatus(query);
  if (current[runKey] !== run) throw new Error("Concurrent projection start; inspect status");
  return current;
}

export async function stepRemoteProjection(query: Query, limit = 100) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Batch size must be 1..100");
  const state = await remoteProjectionStatus(query);
  gate(state);
  const run = state[runKey];
  if (!run) throw new Error("Start the remote rebuild first");
  const cursor = integer(state.public_backfill_cursor);
  const [page] = await query([
    { sql: "SELECT id FROM entries WHERE id>? ORDER BY id LIMIT ?", params: [cursor, limit] },
  ]);
  const last = page?.results.at(-1)?.id;
  if (last !== undefined)
    await query(publicBackfillStatements(cursor, integer(last), { key: runKey, value: run }));
  return { ...(await remoteProjectionStatus(query)), exhausted: last === undefined };
}

export async function cleanupRemoteProjection(query: Query, after = 0, limit = 100) {
  integer(after);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Batch size must be 1..100");
  const state = await remoteProjectionStatus(query);
  gate(state);
  if (!state[runKey]) throw new Error("Start the remote rebuild first");
  const [page] = await query([
    {
      sql: `SELECT entry_id FROM public_listing WHERE entry_id>?
    UNION SELECT entry_id FROM public_promotion_state WHERE entry_id>? ORDER BY entry_id LIMIT ?`,
      params: [after, after, limit],
    },
  ]);
  const ids = (page?.results ?? []).map((row) => integer(row.entry_id));
  if (ids.length)
    await query(
      ["public_listing", "public_promotion_state"].map((table) => ({
        sql: `DELETE FROM ${table} WHERE entry_id IN (SELECT value FROM json_each(?))
      AND NOT EXISTS(SELECT 1 FROM entries WHERE id=entry_id) AND ${active}`,
        params: [JSON.stringify(ids), state[runKey] ?? ""],
      })),
    );
  await query([
    {
      sql: `DELETE FROM public_page_anchors WHERE rowid IN
    (SELECT rowid FROM public_page_anchors ORDER BY created_at LIMIT ?) AND ${active}`,
      params: [limit, state[runKey] ?? ""],
    },
  ]);
  const current = await remoteProjectionStatus(query);
  if (
    current[runKey] !== state[runKey] ||
    current.public_projection_ready !== "0" ||
    current.public_projection_enabled !== "1"
  )
    throw new Error("Projection changed during cleanup; restart cleanup");
  const [anchors] = await query([{ sql: "SELECT rowid FROM public_page_anchors LIMIT 1" }]);
  return {
    scanned: ids.length,
    next: ids.length === limit ? ids.at(-1) : null,
    anchorsRemaining: Boolean(anchors?.results.length),
  };
}

/** Full administrative audit, streamed through bounded indexed reads. No global COUNT/EXCEPT in D1. */
export async function auditRemoteProjection(query: Query) {
  const state = await remoteProjectionStatus(query);
  const revision = state.public_content_revision;
  if (!/^\d+$/.test(revision ?? "")) throw new Error("Invalid projection revision");
  const [unsupported] = await query([
    {
      sql: `SELECT id FROM entries WHERE id<=0 UNION ALL SELECT id FROM entries WHERE id>9007199254740991
        UNION ALL SELECT entry_id FROM public_listing WHERE entry_id<=0
        UNION ALL SELECT entry_id FROM public_listing WHERE entry_id>9007199254740991
        UNION ALL SELECT entry_id FROM public_promotion_state WHERE entry_id<=0
        UNION ALL SELECT entry_id FROM public_promotion_state WHERE entry_id>9007199254740991 LIMIT 1`,
    },
  ]);
  if (unsupported?.results.length) throw new Error("Unsupported source ID range");
  const totals = { missing: 0, extra: 0, promotionState: 0, counters: 0, anchors: 0 };
  if (state.public_projection_ready === "0") {
    const [anchors] = await query([{ sql: "SELECT rowid FROM public_page_anchors LIMIT 1" }]);
    totals.anchors = anchors?.results.length ? 1 : 0;
  }
  const expected = new Map<string, number>();
  const repairs = new Map<string, number>();
  let cursor = 0;
  const check = async () => {
    const current = await remoteProjectionStatus(query);
    if (
      current.public_content_revision !== revision ||
      current[runKey] !== state[runKey] ||
      current.public_projection_ready !== state.public_projection_ready ||
      current.public_projection_enabled !== state.public_projection_enabled
    )
      throw new Error("Projection changed during audit; restart audit");
  };
  while (true) {
    const [page] = await query([
      { sql: "SELECT id FROM entries WHERE id>? ORDER BY id LIMIT 100", params: [cursor] },
    ]);
    const ids = (page?.results ?? []).map((row) => integer(row.id));
    if (!ids.length) break;
    const arg = JSON.stringify(ids);
    const [source, actual, promotion] = await query([
      {
        sql: "SELECT * FROM public_listing_source WHERE entry_id IN (SELECT value FROM json_each(?))",
        params: [arg],
      },
      {
        sql: "SELECT * FROM public_listing WHERE entry_id IN (SELECT value FROM json_each(?))",
        params: [arg],
      },
      {
        sql: `SELECT e.id FROM entries e LEFT JOIN public_promotion_state p ON p.entry_id=e.id
        WHERE e.id IN (SELECT value FROM json_each(?)) AND
        (p.entry_id IS NULL OR p.is_public!=(e.status='approved') OR p.tier NOT IN(0,1,2,3))`,
        params: [arg],
      },
    ]);
    const identity = (row: Record<string, unknown>) =>
      JSON.stringify([
        row.scope,
        row.entry_id,
        row.username,
        row.member_order,
        row.latest_order,
        row.promotion_order,
        row.username_key,
      ]);
    const wanted = new Set((source?.results ?? []).map(identity));
    const found = new Set((actual?.results ?? []).map(identity));
    totals.missing += [...wanted].filter((item) => !found.has(item)).length;
    totals.extra += [...found].filter((item) => !wanted.has(item)).length;
    totals.promotionState += promotion?.results.length ?? 0;
    for (const row of source?.results ?? [])
      expected.set(String(row.scope), (expected.get(String(row.scope)) ?? 0) + 1);
    cursor = ids.at(-1) ?? cursor;
    await check();
  }
  for (const table of ["public_listing", "public_promotion_state"]) {
    cursor = 0;
    while (true) {
      const [page] = await query([
        {
          sql: `SELECT DISTINCT entry_id FROM ${table} WHERE entry_id>? ORDER BY entry_id LIMIT 100`,
          params: [cursor],
        },
      ]);
      const ids = (page?.results ?? []).map((row) => integer(row.entry_id));
      if (!ids.length) break;
      const [orphans] = await query([
        {
          sql: `SELECT entry_id FROM ${table}
        WHERE entry_id IN (SELECT value FROM json_each(?)) AND NOT EXISTS(SELECT 1 FROM entries WHERE id=entry_id)`,
          params: [JSON.stringify(ids)],
        },
      ]);
      if (table === "public_listing") totals.extra += orphans?.results.length ?? 0;
      else totals.promotionState += orphans?.results.length ?? 0;
      cursor = ids.at(-1) ?? cursor;
      await check();
    }
  }
  let scope = "";
  let firstScope = true;
  while (true) {
    const [page] = await query([
      {
        sql: `SELECT scope,count,order_revision FROM public_counts WHERE scope${firstScope ? ">=" : ">"}? ORDER BY scope LIMIT 100`,
        params: [scope],
      },
    ]);
    const rows = page?.results ?? [];
    firstScope = false;
    if (!rows.length) break;
    for (const row of rows) {
      const key = String(row.scope);
      const count = expected.get(key) ?? 0;
      if (
        row.count !== count ||
        !Number.isSafeInteger(row.order_revision) ||
        Number(row.order_revision) < 0
      )
        repairs.set(key, count);
      expected.delete(key);
    }
    scope = String(rows.at(-1)?.scope);
    await check();
  }
  for (const [scope, count] of expected) repairs.set(scope, count);
  totals.counters = repairs.size;
  await check();
  return { state, totals, repairs };
}

export async function finishRemoteProjection(query: Query, repairCounts = false) {
  const audit = await auditRemoteProjection(query);
  gate(audit.state, audit.state.public_projection_ready === "1" ? "1" : "0");
  if (
    audit.totals.missing ||
    audit.totals.extra ||
    audit.totals.promotionState ||
    audit.totals.anchors
  )
    throw new Error(`Projection data audit failed: ${JSON.stringify(audit.totals)}`);
  if (repairCounts) {
    gate(audit.state);
    if (!audit.state[runKey]) throw new Error("Start the remote rebuild first");
    const statements = [...audit.repairs].map(
      ([scope, count]): Statement => ({
        sql: `INSERT INTO public_counts(scope,count,order_revision) SELECT ?,?,1 WHERE ${active}
        AND (SELECT value FROM site_state WHERE key='public_content_revision')=? ON CONFLICT(scope)
        DO UPDATE SET count=excluded.count,order_revision=CASE WHEN order_revision>=0 AND typeof(order_revision)='integer' THEN order_revision+1 ELSE 1 END`,
        params: [
          scope,
          count,
          audit.state[runKey] ?? "",
          audit.state.public_content_revision ?? "",
        ],
      }),
    );
    for (let start = 0; start < statements.length; start += 50)
      await query(statements.slice(start, start + 50));
    const current = await remoteProjectionStatus(query);
    if (
      current.public_content_revision !== audit.state.public_content_revision ||
      current[runKey] !== audit.state[runKey]
    )
      throw new Error("Projection changed during count repair; audit again");
    return current;
  }
  if (audit.totals.counters) throw new Error("Counter audit failed; repair counts before finish");
  if (audit.state.public_projection_ready === "1") return remoteProjectionStatus(query);
  if (!audit.state[runKey]) throw new Error("Start the remote rebuild first");
  await query([
    {
      sql: `UPDATE site_state SET value='1' WHERE key='public_projection_ready'
    AND ${active} AND (SELECT value FROM site_state WHERE key='public_content_revision')=?
    AND NOT EXISTS(SELECT 1 FROM public_page_anchors)`,
      params: [audit.state[runKey] ?? "", audit.state.public_content_revision ?? ""],
    },
  ]);
  const final = await remoteProjectionStatus(query);
  if (
    final.public_projection_ready !== "1" ||
    final.public_content_revision !== audit.state.public_content_revision ||
    final[runKey] !== audit.state[runKey]
  )
    throw new Error("Concurrent write prevented publication; inspect status and audit again");
  return final;
}
