import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("ranking upgrade allows source writes between statements and maintains counters while disabled", () => {
  const db = new DatabaseSync(":memory:");
  const dir = fileURLToPath(new URL("../packages/db/migrations/", import.meta.url));
  const target = "0028_public_rankings.sql";
  try {
    for (const file of readdirSync(dir)
      .filter((name) => name.endsWith(".sql") && name < target)
      .sort())
      db.exec(readFileSync(path.join(dir, file), "utf8"));
    const write = () =>
      db.exec(`INSERT INTO entries(id,username,kind,category_id,title,listed_at,updated_at)
      VALUES(1,'upgrade_rank','channel',1,'Rank',1000,1000);
      INSERT INTO entry_stats(entry_id,members,stats_written_at) VALUES(1,10,1000);
      UPDATE entries SET username='upgrade_renamed' WHERE id=1;
      DELETE FROM entries WHERE id=1; DELETE FROM entry_stats WHERE entry_id=1;`);
    write();
    for (const statement of readFileSync(path.join(dir, target), "utf8").split(
      "--> statement-breakpoint",
    )) {
      db.exec(statement);
      write();
    }
    assert.equal(
      db.prepare("SELECT value FROM site_state WHERE key='public_rank_count'").get()?.value,
      "0",
    );
    db.exec(`INSERT INTO site_state(key,value) VALUES('public_rankings_enabled','1'),('public_content_revision','100');
      INSERT INTO entries(id,username,kind,category_id,title,listed_at,updated_at)
      VALUES(1,'upgrade_rank','channel',1,'Rank',1000,1000);
      INSERT INTO entry_stats(entry_id,members,stats_written_at) VALUES(1,10,1000);`);
    assert.equal(
      db.prepare("SELECT value FROM site_state WHERE key='public_rank_count'").get()?.value,
      "1",
    );
    const sourceRevision = db
      .prepare("SELECT value FROM site_state WHERE key='public_content_revision'")
      .get()?.value;
    db.exec("UPDATE public_rankings SET dirty=0,evaluated_at=1000,valid_until=2000;");
    assert.equal(
      db.prepare("SELECT value FROM site_state WHERE key='public_content_revision'").get()?.value,
      sourceRevision,
    );
    db.exec(`UPDATE site_state SET value='0' WHERE key='public_rankings_enabled';
      UPDATE entry_stats SET members=20 WHERE entry_id=1;`);
    assert.equal(db.prepare("SELECT dirty FROM public_rankings").get()?.dirty, 1);
    db.exec("UPDATE entries SET status='hidden_by_admin' WHERE id=1;");
    assert.equal(
      db.prepare("SELECT value FROM site_state WHERE key='public_rank_count'").get()?.value,
      "0",
    );
  } finally {
    db.close();
  }
});
