import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("history migration allows source writes between statements and clears reused identities", () => {
  const db = new DatabaseSync(":memory:");
  const dir = fileURLToPath(new URL("../packages/db/migrations/", import.meta.url));
  const target = "0026_public_history_mirror.sql";
  try {
    for (const file of readdirSync(dir)
      .filter((name) => name.endsWith(".sql") && name < target)
      .sort())
      db.exec(readFileSync(path.join(dir, file), "utf8"));
    db.exec("INSERT INTO site_state(key,value) VALUES('public_history_backfill_cursor','100')");
    const write = () => {
      db.exec(`INSERT INTO entries(id,username,kind,category_id,title,listed_at,updated_at)
        VALUES(1,'upgrade_test','channel',1,'Upgrade',1000,1000);
        UPDATE entries SET username='upgrade_renamed',listed_at=1001 WHERE id=1;
        DELETE FROM entries WHERE id=1;`);
    };
    write();
    for (const statement of readFileSync(path.join(dir, target), "utf8").split(
      "--> statement-breakpoint",
    )) {
      db.exec(statement);
      write();
    }
    db.exec(`INSERT INTO entries(id,username,kind,category_id,title,listed_at,updated_at)
      VALUES(1,'upgrade_test','channel',1,'Upgrade',1000,1000);
      INSERT INTO history_mirrors(entry_id,username,listed_at,object_version,object_etag,generation,phase,
        raw_points,point_count,invalid_times,updated_at)
      VALUES(1,'upgrade_test',1000,'v','e','g','ready',1,1,0,1000);
      INSERT INTO history_baselines VALUES(1,1000,10,0);
      UPDATE site_state SET value='100' WHERE key='public_history_backfill_cursor';
      UPDATE entries SET username='upgrade_renamed' WHERE id=1;`);
    assert.equal(db.prepare("SELECT count(*) AS n FROM history_mirrors").get()?.n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM history_baselines").get()?.n, 0);
    assert.equal(
      db.prepare("SELECT value FROM site_state WHERE key='public_history_backfill_cursor'").get()
        ?.value,
      "0",
    );
    db.exec("DELETE FROM entries WHERE id=1");
    write();
  } finally {
    db.close();
  }
});
