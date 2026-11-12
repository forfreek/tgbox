import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, expect, test } from "vitest";
import {
  backfillPublicProjection,
  beginPublicProjection,
  createDb,
  getPublicSiteSettings,
  getPublicTotals,
  listPublicPromotions,
  listPublicTaxonomy,
} from "./index.ts";
import * as schema from "./schema.ts";

const db = createDb(env.DB);
const statements: { query: string; params: unknown[] }[] = [];
const traced = drizzle(env.DB, {
  schema,
  logger: {
    logQuery(query, params) {
      statements.push({ query, params });
    },
  },
});

// Fixed fixture SQL contains no semicolons inside values or trigger bodies.
async function fixture(sql: string) {
  await env.DB.batch(
    sql
      .split(";")
      .filter((query) => query.trim())
      .map((query) => env.DB.prepare(query)),
  );
}

beforeEach(async () => {
  await fixture(`DELETE FROM promotions;
    DELETE FROM entries;
    DELETE FROM categories;
    DELETE FROM tags;
    DELETE FROM public_listing;
    DELETE FROM public_counts;
    DELETE FROM site_state WHERE key LIKE 'public_%';
    DELETE FROM settings;`);
  await fixture(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<1000)
    INSERT INTO categories(id,slug,kind,name_zh,name_en,sort)
    SELECT i,'cost_'||i,'channel','分类'||i,'Category '||i,i FROM n;
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<1000)
    INSERT INTO tags(id,slug,name_zh,name_en) SELECT i,'cost_'||i,'标签'||i,'Tag '||i FROM n;
    INSERT INTO entries(username,kind,category_id,title,listed_at,updated_at)
    VALUES('cost_public','channel',1,'Public',1000,1000);
    INSERT INTO entries(username,kind,category_id,title,listed_at,updated_at,status)
    VALUES('cost_hidden','channel',1,'Hidden',1000,1000,'hidden_by_admin');`);
  await beginPublicProjection(db);
  while (!(await backfillPublicProjection(db)).done) {
    /* Two-entry fixture only. */
  }
  statements.length = 0;
});

async function budget(label: string, expectedStatements: number, maxRows: number) {
  expect(statements).toHaveLength(expectedStatements);
  let rowsRead = 0;
  const plans: string[] = [];
  for (const statement of statements) {
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${statement.query}`)
      .bind(...statement.params)
      .all<{ detail: string }>();
    const detail = plan.results.map((row) => row.detail).join("\n");
    expect(detail).not.toContain("TEMP B-TREE");
    expect(detail).not.toMatch(/\bSCAN\b/);
    plans.push(detail);
    const result = await env.DB.prepare(statement.query)
      .bind(...statement.params)
      .all();
    expect(result.meta.rows_written).toBe(0);
    rowsRead += result.meta.rows_read;
  }
  console.info("public operations SQL budget", {
    label,
    statements: statements.length,
    rowsRead,
    plans,
  });
  expect(rowsRead).toBeLessThanOrEqual(maxRows);
  return rowsRead;
}

test("taxonomy deep and terminal pages seek by id across 1000 rows", async () => {
  for (const type of ["categories", "tags"] as const) {
    for (const afterId of [0, 900, 1000]) {
      statements.length = 0;
      const page = await listPublicTaxonomy(traced, { type, afterId, limit: 60 });
      expect(page.items).toHaveLength(afterId === 1000 ? 0 : 60);
      expect(page.next).toBe(afterId === 1000 ? null : afterId + 60);
      if (page.items.length) expect(page.items[0]?.id).toBe(afterId + 1);
      await budget(`${type}/${afterId}`, 2, 260);
    }
  }
});

test("totals and settings use fixed indexed keys among 1000 unrelated keys", async () => {
  await fixture(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<1000)
    INSERT INTO public_counts(scope,count,order_revision) SELECT 'unused:'||i,0,0 FROM n;
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<1000)
    INSERT INTO settings(key,value,updated_at) SELECT 'private_'||i,'{}',0 FROM n;
    INSERT INTO settings(key,value,updated_at) VALUES('site','{"showAdSlots":true}',0);`);
  statements.length = 0;
  expect(await getPublicTotals(traced)).toEqual({ total: 1, channel: 1, group: 0, bot: 0 });
  await budget("totals", 2, 16);
  statements.length = 0;
  expect((await getPublicSiteSettings(traced)).showAdSlots).toBe(true);
  await budget("settings", 1, 4);
});

test("live promotions use the ends/id index with stable continuation", async () => {
  await fixture(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<120)
    INSERT INTO promotions(kind,entry_username,starts_at,ends_at,created_at)
    SELECT 'pin','cost_public',0,2000,0 FROM n;`);
  const first = await listPublicPromotions(traced, { now: 1000 });
  expect(first.items).toHaveLength(60);
  await budget("promotions/first", 1, 300);
  statements.length = 0;
  const second = await listPublicPromotions(traced, { now: 1000, after: first.next ?? undefined });
  expect(second.items).toHaveLength(60);
  expect(second.next).toBeNull();
  expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(120);
  await budget("promotions/continuation", 2, 140);
});

test("promotion pages match the live SQL contract across mixed end times and old cursors", async () => {
  await fixture(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<120)
    INSERT INTO promotions(kind,entry_username,starts_at,ends_at,created_at)
    SELECT 'pin',CASE WHEN i%5=0 THEN 'cost_hidden' WHEN i%7=0 THEN NULL ELSE 'cost_public' END,
    CASE WHEN i%3=0 THEN 1500 ELSE 0 END,900+(i%4)*500,0 FROM n;`);
  const baseline = await env.DB.prepare(`SELECT p.id,p.ends_at FROM promotions p
    LEFT JOIN entries e ON e.username=p.entry_username
    WHERE p.starts_at<=1000 AND p.ends_at>1000 AND (p.entry_username IS NULL OR e.status='approved')
    ORDER BY p.ends_at,p.id`).all<{ id: number; ends_at: number }>();
  for (const initial of [undefined, { endsAt: 900, id: 999999 }]) {
    let after = initial;
    const ids: number[] = [];
    for (let step = 0; step < 30; step++) {
      const page = await listPublicPromotions(db, { now: 1000, after, limit: 7 });
      ids.push(...page.items.map((row) => row.id));
      if (!page.next) break;
      after = page.next;
    }
    expect(ids).toEqual(baseline.results.map((row) => row.id));
  }
});

test("filtered promotion candidates expose the scan cost beyond the returned LIMIT", async () => {
  for (const size of [100, 1000]) {
    await fixture(`DELETE FROM promotions;
      WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<${size})
      INSERT INTO promotions(kind,entry_username,starts_at,ends_at,created_at)
      SELECT 'pin',CASE WHEN i%2=0 THEN 'cost_hidden' ELSE 'cost_public' END,
      CASE WHEN i%2=0 THEN 0 ELSE 2000 END,3000,0 FROM n;`);
    statements.length = 0;
    expect((await listPublicPromotions(traced, { now: 1000 })).items).toEqual([]);
    const rowsRead = await budget(`promotions/filtered-${size}`, 1, size * 4 + 10);
    expect(rowsRead).toBeGreaterThanOrEqual(size);
  }
});
