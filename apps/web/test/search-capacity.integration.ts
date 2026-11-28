import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createDb, searchEntries } from "@tgbox/db";
import { expect, test } from "vitest";

declare global {
  namespace Cloudflare {
    interface Env {
      CAPACITY_RUN: boolean;
    }
  }
}

test.skipIf(!env.CAPACITY_RUN)(
  "core proof costs at current-scale and 10x resources, including unmatched two-character LIKE",
  async () => {
    await applyD1Migrations(env.DB, env.CORE_MIGRATIONS);
    const result = [];
    for (const size of [2500, 25000]) {
      await env.DB.prepare(
        "WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<?) INSERT OR IGNORE INTO entries(id,username,kind,category_id,title,description,listed_at,updated_at) SELECT i,'capacity_'||i,'channel',1,'普通资源 '||i,'容量夹具，不是生产数据',0,0 FROM n",
      )
        .bind(size)
        .run();
      await env.DB.prepare("DELETE FROM entries_fts").run();
      await env.DB.prepare(
        "INSERT INTO entries_fts(rowid,title,username,tag_names) SELECT id,title,username,'科技' FROM entries",
      ).run();
      const queries = [];
      for (const word of ["罕见", "科技", "no-matching-resource", "普通资源"]) {
        const q = searchEntries(createDb(env.DB), word, 1);
        if (!("toSQL" in q)) throw new Error("Expected a nonempty compiled query");
        const sql = q.toSQL();
        const started = Date.now();
        const rows = await env.DB.prepare(sql.sql)
          .bind(...sql.params)
          .all();
        queries.push({
          wordClass:
            word === "罕见"
              ? "two-char-miss"
              : word === "科技"
                ? "two-char-hit"
                : word === "普通资源"
                  ? "fts-hit"
                  : "fts-miss",
          matches: rows.results.length,
          read: rows.meta.rows_read,
          written: rows.meta.rows_written,
          wallMs: Date.now() - started,
          sqlMs: rows.meta.duration,
        });
        expect(rows.meta.rows_written).toBe(0);
      }
      expect(queries[0]?.matches).toBe(0);
      expect(queries[1]?.matches).toBe(1);
      result.push({ entries: size, queries });
    }
    console.log("CORE_CAPACITY", JSON.stringify(result));
    expect(
      result.map((r) => ({ ...r, queries: r.queries.map(({ wallMs, sqlMs, ...q }) => q) })),
    ).toMatchSnapshot();
  },
  180000,
);
