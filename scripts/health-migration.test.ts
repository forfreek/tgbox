import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";

const dir = path.resolve(import.meta.dirname, "../packages/db/migrations");
test("health migration upgrades legacy data without rewriting publication or inventing evidence", () => {
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && f < "0027")
      .sort())
      db.exec(readFileSync(path.join(dir, file), "utf8"));
    db.prepare(
      "INSERT INTO entries(id,username,kind,category_id,title,listed_at,status,liveness,fail_count,updated_at) VALUES(1,'legacy_bot','bot',1,'Legacy',1,'hidden_by_system','banned',12,1)",
    ).run();
    const before = db.prepare("SELECT * FROM entries WHERE id=1").get();
    db.exec(readFileSync(path.join(dir, "0027_entry_health.sql"), "utf8"));
    assert.deepEqual(db.prepare("SELECT * FROM entries WHERE id=1").get(), before);
    assert.equal(db.prepare("SELECT count(*) n FROM entry_health").get()?.n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM entry_health_evidence").get()?.n, 0);
    // Additive migration leaves the safe previous application's entry reads intact.
    assert.equal(
      db.prepare("SELECT status FROM entries WHERE id=1").get()?.status,
      "hidden_by_system",
    );
    assert.throws(() =>
      db
        .prepare(
          "INSERT INTO entry_health(entry_id,binding_username,binding_kind,public_state) VALUES(1,'legacy_bot','bot','banned')",
        )
        .run(),
    );
  } finally {
    db.close();
  }
});
