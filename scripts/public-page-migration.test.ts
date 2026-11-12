import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

test("numbered-page schema upgrade keeps source writes valid and requires a fresh projection", () => {
  const db = new DatabaseSync(":memory:");
  const dir = fileURLToPath(new URL("../packages/db/migrations/", import.meta.url));
  const target = "0025_public_numbered_pages.sql";
  try {
    for (const file of readdirSync(dir)
      .filter((name) => name.endsWith(".sql") && name < target)
      .sort()) {
      db.exec(readFileSync(path.join(dir, file), "utf8"));
    }
    db.exec(`INSERT INTO site_state(key,value) VALUES
      ('public_projection_enabled','1'), ('public_projection_ready','1'),
      ('public_backfill_cursor','100'), ('public_content_revision','10');`);
    const write = (index: number) => {
      const username = `migration_${index}`;
      const inserted = db
        .prepare(`INSERT INTO entries(username,kind,category_id,title,listed_at,updated_at,is_promoted)
        VALUES (?,'channel',1,?,1000,1000,1)`)
        .run(username, username);
      db.prepare(
        "INSERT INTO entry_stats(entry_id,members,stats_written_at) VALUES (?,10,1000)",
      ).run(inserted.lastInsertRowid);
      db.prepare("UPDATE entries SET title='edited', updated_at=1001 WHERE id=?").run(
        inserted.lastInsertRowid,
      );
      const tagId = db.prepare("SELECT id FROM tags ORDER BY id LIMIT 1").get()?.id;
      assert.notEqual(tagId, undefined);
      db.prepare("INSERT INTO entry_tags(entry_id,tag_id) VALUES (?,?)").run(
        inserted.lastInsertRowid,
        tagId ?? null,
      );
      db.prepare("UPDATE entry_tags SET tag_id=tag_id WHERE entry_id=?").run(
        inserted.lastInsertRowid,
      );
      return username;
    };
    write(0);
    const statements = readFileSync(path.join(dir, target), "utf8").split(
      "--> statement-breakpoint",
    );
    for (let index = 0; index < statements.length; index++) {
      db.exec(statements[index] ?? "");
      write(index + 1);
    }
    assert.equal(
      db.prepare("SELECT value FROM site_state WHERE key='public_projection_enabled'").get()?.value,
      "1",
    );
    assert.equal(
      db.prepare("SELECT value FROM site_state WHERE key='public_projection_ready'").get()?.value,
      "0",
    );
    assert.equal(
      db.prepare("SELECT value FROM site_state WHERE key='public_backfill_cursor'").get()?.value,
      "0",
    );
    const last = `migration_${statements.length}`;
    assert.deepEqual(
      {
        ...db
          .prepare(
            "SELECT promotion_order,username_key FROM public_listing WHERE scope='all' AND username=?",
          )
          .get(last),
      },
      { promotion_order: -2, username_key: last.replaceAll("_", "!") },
    );
    assert.equal(db.prepare("SELECT count(*) AS n FROM entries").get()?.n, statements.length + 1);
  } finally {
    db.close();
  }
});
