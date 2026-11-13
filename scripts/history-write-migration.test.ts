import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("history write upgrade preserves source writes, atomic intent invalidation and identity cleanup", () => {
  const db = new DatabaseSync(":memory:");
  const dir = fileURLToPath(new URL("../packages/db/migrations/", import.meta.url));
  const target = "0027_public_history_write.sql";
  try {
    for (const file of readdirSync(dir)
      .filter((name) => name.endsWith(".sql") && name < target)
      .sort())
      db.exec(readFileSync(path.join(dir, file), "utf8"));
    const write = () =>
      db.exec(`INSERT INTO entries(id,username,kind,category_id,title,listed_at,updated_at)
      VALUES(1,'upgrade_write','channel',1,'Upgrade',1000,1000);
      UPDATE entries SET username='upgrade_renamed' WHERE id=1;
      DELETE FROM entries WHERE id=1;`);
    write();
    for (const statement of readFileSync(path.join(dir, target), "utf8").split(
      "--> statement-breakpoint",
    )) {
      db.exec(statement);
      write();
    }
    db.exec(`INSERT INTO entries(id,username,kind,category_id,title,listed_at,updated_at)
      VALUES(1,'upgrade_write','channel',1,'Upgrade',1000,1000);
      INSERT INTO site_state(key,value) VALUES('public_content_revision','100');
      INSERT INTO history_mirrors(entry_id,username,listed_at,object_version,object_etag,generation,phase,
        raw_points,point_count,invalid_times,updated_at)
      VALUES(1,'upgrade_write',1000,'v','e','g','ready',0,0,0,1000);
      INSERT INTO history_writes VALUES(1,'upgrade_write',1000,'token',NULL,1000,10);`);
    assert.equal(db.prepare("SELECT phase FROM history_mirrors").get()?.phase, "stale");
    assert.equal(
      db.prepare("SELECT value FROM site_state WHERE key='public_content_revision'").get()?.value,
      "101",
    );
    db.exec("BEGIN; DELETE FROM history_writes; ROLLBACK;");
    assert.equal(db.prepare("SELECT count(*) AS n FROM history_writes").get()?.n, 1);
    assert.equal(
      db.prepare("SELECT value FROM site_state WHERE key='public_content_revision'").get()?.value,
      "101",
    );
    db.exec("UPDATE entries SET listed_at=1001 WHERE id=1;");
    assert.equal(db.prepare("SELECT count(*) AS n FROM history_writes").get()?.n, 0);
    assert.ok(
      Number(db.prepare("SELECT value FROM site_state WHERE key='dirty_since'").get()?.value) >
        1000,
    );
    db.exec("DELETE FROM entries WHERE id=1;");
    write();
  } finally {
    db.close();
  }
});
