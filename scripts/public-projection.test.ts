import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  auditProjection,
  operateProjection,
  projectionStatus,
} from "./lib/public-projection-local.ts";

function migrated() {
  const db = new DatabaseSync(":memory:");
  const dir = new URL("../packages/db/migrations/", import.meta.url);
  for (const name of readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(new URL(name, dir), "utf8"));
  return db;
}
function finishSteps(db: DatabaseSync) {
  for (let step = 0; step < 100; step++) {
    if (projectionStatus(db).phase === "verify") return;
    operateProjection(db, "step", 2);
  }
  throw new Error("Rebuild failed to converge");
}
test("local repair removes paused-write orphans, resumes batches and audits before ready", () => {
  const db = migrated();
  try {
    db.exec(`INSERT INTO entries(username,kind,category_id,title,listed_at,updated_at)
      VALUES('local_a','channel',1,'A',1000,1000),('local_b','channel',1,'B',1001,1001);
      INSERT INTO public_listing(scope,entry_id,username,member_order,latest_order,promotion_order,username_key)
      VALUES('all',999,'orphan',0,0,0,'orphan');
      INSERT INTO public_promotion_state(entry_id,is_public) VALUES(999,1);
      UPDATE public_counts SET count=99;`);
    assert.ok(auditProjection(db).extra > 0);
    operateProjection(db, "start");
    assert.throws(() => operateProjection(db, "finish"), /verification/);
    operateProjection(db, "step", 1);
    const progress = projectionStatus(db);
    assert.deepEqual(operateProjection(db, "start"), progress);
    finishSteps(db);
    assert.equal(projectionStatus(db).ready, "0");
    assert.deepEqual(auditProjection(db), { missing: 0, extra: 0, counters: 0, promotionState: 0 });
    assert.equal(operateProjection(db, "finish").ready, "1");
    const revision = db
      .prepare("SELECT value FROM site_state WHERE key='public_content_revision'")
      .get()?.value;
    operateProjection(db, "finish");
    assert.equal(
      db.prepare("SELECT value FROM site_state WHERE key='public_content_revision'").get()?.value,
      revision,
    );
    assert.equal(operateProjection(db, "step").phase, "done");
    operateProjection(db, "restart");
    finishSteps(db);
    assert.equal(operateProjection(db, "finish").ready, "1");
  } finally {
    db.close();
  }
});
test("audit failure and failed step roll back progress with ready closed", () => {
  const db = migrated();
  try {
    db.exec(`INSERT INTO entries(username,kind,category_id,title,listed_at,updated_at)
      VALUES('local_a','channel',1,'A',1000,1000);`);
    operateProjection(db, "start");
    finishSteps(db);
    db.exec("UPDATE public_counts SET count=count+5 WHERE scope='all'");
    assert.throws(() => operateProjection(db, "finish"), /audit failed/);
    assert.equal(projectionStatus(db).ready, "0");
    operateProjection(db, "restart");
    for (let step = 0; step < 10 && projectionStatus(db).phase !== "backfill"; step++)
      operateProjection(db, "step");
    assert.equal(projectionStatus(db).phase, "backfill");
    db.exec(
      "CREATE TRIGGER fail_local_backfill BEFORE INSERT ON public_listing BEGIN SELECT RAISE(ABORT,'injected'); END;",
    );
    const before = projectionStatus(db);
    assert.throws(() => operateProjection(db, "step"), /injected/);
    assert.deepEqual(projectionStatus(db), before);
    db.exec("DROP TRIGGER fail_local_backfill");
    finishSteps(db);
    assert.equal(operateProjection(db, "finish").ready, "1");
  } finally {
    db.close();
  }
});
test("1001-entry rebuild stays in bounded ID batches while source writes continue", () => {
  const db = migrated();
  try {
    db.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<1001)
      INSERT INTO entries(username,kind,category_id,title,listed_at,updated_at)
      SELECT 'scale_'||i,'channel',1,'Entry '||i,1000,1000 FROM n;`);
    operateProjection(db, "start");
    let changed = false;
    for (let step = 0; step < 100 && projectionStatus(db).phase !== "verify"; step++) {
      const before = projectionStatus(db);
      const after = operateProjection(db, "step");
      if (before.phase === "backfill") {
        assert.ok(Number(after.backfillCursor) - Number(before.backfillCursor) <= 100);
        if (!changed && Number(after.backfillCursor) >= 500) {
          db.exec(`INSERT INTO entries(username,kind,category_id,title,listed_at,updated_at)
            VALUES('scale_new','channel',1,'New',2000,2000);
            DELETE FROM entries WHERE username='scale_1';
            UPDATE entries SET status='hidden_by_admin' WHERE username='scale_2';`);
          changed = true;
        }
      }
    }
    assert.ok(changed);
    assert.equal(operateProjection(db, "finish").ready, "1");
    assert.equal(
      db.prepare("SELECT count FROM public_counts WHERE scope='all'").get()?.count,
      1000,
    );
    assert.deepEqual(auditProjection(db), { missing: 0, extra: 0, counters: 0, promotionState: 0 });
  } finally {
    db.close();
  }
});

test("CLI status is read-only and process restarts retain progress", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "tgbox-projection-"));
  const file = path.join(dir, "copy.sqlite");
  const source = migrated();
  const script = new URL("./public-projection.ts", import.meta.url);
  try {
    source.prepare("VACUUM INTO ?").run(file);
    const invoke = (command: string) => {
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(script), command, "--database", file, "--batch", "1"],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout) as { phase: string; ready: string };
    };
    assert.equal(invoke("status").phase, "not_started");
    assert.equal(invoke("start").ready, "0");
    for (let step = 0; step < 30; step++) if (invoke("step").phase === "verify") break;
    assert.equal(invoke("finish").ready, "1");
    assert.deepEqual(invoke("audit"), { missing: 0, extra: 0, counters: 0, promotionState: 0 });
  } finally {
    source.close();
    // The directory is created by this test under tmpdir and contains only its SQLite copy.
    assert.ok(path.resolve(dir).startsWith(`${path.resolve(tmpdir())}${path.sep}`));
    assert.ok(path.basename(dir).startsWith("tgbox-projection-"));
    rmSync(dir, { recursive: true, force: true });
  }
});
