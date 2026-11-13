import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { publicBackfillStatements } from "../packages/db/src/public-backfill-sql.ts";
import { remoteD1, type Statement } from "./lib/d1-remote.ts";
import {
  auditRemoteProjection,
  cleanupRemoteProjection,
  finishRemoteProjection,
  remoteProjectionStatus,
  startRemoteProjection,
  stepRemoteProjection,
} from "./lib/public-projection-remote.ts";

function fixture(size = 120) {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../packages/db/migrations/", import.meta.url);
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(file, dir), "utf8"));
  db.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<${size})
    INSERT INTO entries(username,kind,category_id,title,listed_at,updated_at)
    SELECT 'remote_'||i,'channel',1,'Entry '||i,1000,1000 FROM n;`);
  const calls: Statement[][] = [];
  let afterBatch: ((statements: Statement[]) => void) | undefined;
  const request: typeof fetch = async (_url, init) => {
    assert.equal(init?.redirect, "error");
    const { batch } = JSON.parse(String(init?.body)) as { batch: Statement[] };
    calls.push(batch);
    db.exec("BEGIN");
    try {
      const result = batch.map((input) => {
        const statement = db.prepare(input.sql);
        const params = input.params ?? [];
        if (statement.columns().length)
          return { success: true, results: statement.all(...params), meta: { changes: 0 } };
        const result = statement.run(...params);
        return { success: true, results: [], meta: { changes: Number(result.changes) } };
      });
      db.exec("COMMIT");
      afterBatch?.(batch);
      return Response.json({ success: true, result });
    } catch {
      db.exec("ROLLBACK");
      return Response.json({ success: false, result: [] });
    }
  };
  return {
    db,
    calls,
    query: remoteD1("account", "database", "test-token", request),
    hook: (callback: (statements: Statement[]) => void) => {
      afterBatch = callback;
    },
  };
}

test("remote rebuild resumes, cleans orphan data, repairs counters and publishes only audited state", async () => {
  const { db, query, calls } = fixture();
  try {
    db.exec(`INSERT INTO public_listing(scope,entry_id,username,member_order,latest_order,promotion_order,username_key)
      VALUES('all',999,'orphan',0,0,0,'orphan');
      INSERT INTO public_promotion_state(entry_id,is_public) VALUES(999,1); UPDATE public_counts SET count=99;`);
    const started = await startRemoteProjection(query);
    assert.equal(started.public_projection_ready, "0");
    assert.deepEqual(await startRemoteProjection(query), started);
    await assert.rejects(finishRemoteProjection(query), /audit failed/);
    for (let step = 0; step < 5; step++)
      if ((await stepRemoteProjection(query, 50)).exhausted) break;
    let after = 0;
    for (let step = 0; step < 10; step++) {
      const page = await cleanupRemoteProjection(query, after, 30);
      assert.ok(page.scanned <= 30);
      if (page.next === null || page.next === undefined) break;
      after = page.next;
    }
    const audit = await auditRemoteProjection(query);
    assert.equal(audit.totals.missing, 0);
    assert.equal(audit.totals.extra, 0);
    assert.equal(audit.totals.promotionState, 0);
    assert.ok(audit.totals.counters > 0);
    await assert.rejects(finishRemoteProjection(query), /Counter audit failed/);
    await finishRemoteProjection(query, true);
    assert.equal((await finishRemoteProjection(query)).public_projection_ready, "1");
    assert.equal((await finishRemoteProjection(query)).public_projection_ready, "1");
    assert.ok(calls.every((batch) => batch.length <= 50));
    assert.ok(calls.flat().every((statement) => !/\bCOUNT\s*\(|\bEXCEPT\b/i.test(statement.sql)));
    const source = calls
      .flat()
      .find((statement) => statement.sql.includes("FROM public_listing_source WHERE"));
    assert.ok(source);
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${source.sql}`).all(...(source.params ?? []));
    const text = plan.map((row) => row.detail).join("\n");
    assert.doesNotMatch(text, /SCAN e\b/);
  } finally {
    db.close();
  }
});

test("1001 entries use bounded audit pages and no global aggregate queries", async () => {
  const { db, query, calls } = fixture(1001);
  try {
    await startRemoteProjection(query);
    for (let step = 0; step < 12; step++) if ((await stepRemoteProjection(query)).exhausted) break;
    assert.equal((await finishRemoteProjection(query)).public_projection_ready, "1");
    const sourceBatches = calls
      .flat()
      .filter((statement) => statement.sql.includes("FROM public_listing_source WHERE"));
    assert.ok(sourceBatches.length >= 11);
    for (const batch of sourceBatches)
      assert.ok(JSON.parse(String(batch.params?.[0])).length <= 100);
    assert.ok(calls.flat().every((statement) => !/\bCOUNT\s*\(|\bEXCEPT\b/i.test(statement.sql)));
  } finally {
    db.close();
  }
});

test("restart generation blocks stale in-flight backfill", async () => {
  const { db, query } = fixture();
  try {
    const old = await startRemoteProjection(query);
    await startRemoteProjection(query, true);
    await query(
      publicBackfillStatements(0, 50, {
        key: "public_remote_rebuild_run",
        value: old.public_remote_rebuild_run ?? "",
      }),
    );
    assert.equal((await remoteProjectionStatus(query)).public_backfill_cursor, "0");
    assert.equal(db.prepare("SELECT count(*) AS n FROM public_listing").get()?.n, 0);
    await stepRemoteProjection(query, 50);
    assert.equal((await remoteProjectionStatus(query)).public_backfill_cursor, "50");
  } finally {
    db.close();
  }
});

test("audit detects source changes and failed batch leaves ready closed", async () => {
  const item = fixture();
  try {
    await startRemoteProjection(item.query);
    for (let step = 0; step < 3; step++) await stepRemoteProjection(item.query, 100);
    let changed = false;
    item.hook((batch) => {
      if (
        !changed &&
        batch.some((statement) => statement.sql.includes("FROM public_listing_source WHERE"))
      ) {
        changed = true;
        item.db.exec("UPDATE entries SET title='changed' WHERE id=1");
      }
    });
    await assert.rejects(finishRemoteProjection(item.query), /changed during audit/);
    assert.equal((await remoteProjectionStatus(item.query)).public_projection_ready, "0");
    await assert.rejects(
      item.query([
        { sql: "UPDATE site_state SET value='1' WHERE key='public_projection_ready'" },
        { sql: "INSERT INTO missing_remote_test_table VALUES(1)" },
      ]),
      /unsuccessful/,
    );
    assert.equal((await remoteProjectionStatus(item.query)).public_projection_ready, "0");
  } finally {
    item.db.close();
  }
});

test("publication CAS refuses a write after the final audit read", async () => {
  const item = fixture();
  try {
    await startRemoteProjection(item.query);
    for (let step = 0; step < 3; step++) await stepRemoteProjection(item.query, 100);
    let injected = false;
    const guarded = async (batch: Statement[]) => {
      if (
        !injected &&
        batch.some((statement) => statement.sql.includes("UPDATE site_state SET value='1'"))
      ) {
        injected = true;
        item.db.exec("UPDATE entries SET title='late write' WHERE id=1");
      }
      return item.query(batch);
    };
    await assert.rejects(finishRemoteProjection(guarded), /Concurrent write/);
    assert.equal((await remoteProjectionStatus(item.query)).public_projection_ready, "0");
  } finally {
    item.db.close();
  }
});

test("old anchors block publication and cleanup removes only a bounded batch", async () => {
  const { db, query } = fixture();
  try {
    await startRemoteProjection(query);
    for (let step = 0; step < 3; step++) await stepRemoteProjection(query, 100);
    db.exec(`WITH RECURSIVE n(i) AS(SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<101)
      INSERT INTO public_page_anchors(scope,sort,order_revision,page,promotion_order,order_value,username_key,created_at)
      SELECT 'all','members',1,i,0,0,'old',0 FROM n;`);
    await assert.rejects(finishRemoteProjection(query), /audit failed/);
    const page = await cleanupRemoteProjection(query, 0, 100);
    assert.equal(page.anchorsRemaining, true);
    assert.equal(db.prepare("SELECT count(*) AS n FROM public_page_anchors").get()?.n, 1);
    await cleanupRemoteProjection(query, page.next ?? 0, 100);
    assert.equal((await finishRemoteProjection(query)).public_projection_ready, "1");
  } finally {
    db.close();
  }
});

test("unsupported derived IDs are rejected and failed initialization rolls back", async () => {
  const { db, query } = fixture();
  try {
    db.exec(`CREATE TRIGGER fail_remote_start BEFORE INSERT ON site_state
      WHEN NEW.key='public_projection_ready' BEGIN SELECT RAISE(ABORT,'injected'); END;`);
    await assert.rejects(startRemoteProjection(query), /unsuccessful/);
    assert.equal((await remoteProjectionStatus(query)).public_remote_rebuild_run, undefined);
    db.exec("DROP TRIGGER fail_remote_start");
    await startRemoteProjection(query);
    db.exec(`INSERT INTO public_listing(scope,entry_id,username,member_order,latest_order,promotion_order,username_key)
      VALUES('all',0,'bad_id',0,0,0,'bad_id');`);
    await assert.rejects(auditRemoteProjection(query), /ID range/);
    assert.equal((await remoteProjectionStatus(query)).public_projection_ready, "0");
  } finally {
    db.close();
  }
});

test("remote CLI writes are dry-run without apply and transport errors never expose token", async () => {
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./public-projection-remote.ts", import.meta.url)),
      "start",
      "--account",
      "test",
      "--database",
      "test",
    ],
    { encoding: "utf8", env: { ...process.env, CLOUDFLARE_API_TOKEN: "" } },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).dryRun, true);
  const query = remoteD1(
    "test",
    "test",
    "secret-token",
    async () => new Response("secret-token", { status: 429 }),
  );
  await assert.rejects(
    query([{ sql: "SELECT 1" }]),
    (error: unknown) =>
      error instanceof Error &&
      error.message.includes("429") &&
      !error.message.includes("secret-token"),
  );
});
