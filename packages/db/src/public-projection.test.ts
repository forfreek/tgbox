import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, beforeEach, expect, test } from "vitest";
import {
  backfillPublicProjection,
  beginPublicProjection,
  createDb,
  getPublicEntry,
  getPublicRevision,
  getPublicSiteSettings,
  getPublicTotals,
  insertApprovedEntry,
  listCategories,
  listPublicDirectory,
  listPublicPromotions,
  listPublicTaxonomy,
  listTags,
  readPublicCached,
  setEntryStatus,
  setEntryTags,
  syncTaxonomy,
  upsertEntryStats,
} from "./index.ts";
import * as schema from "./schema.ts";

const db = createDb(env.DB);
let categoryId: number;
let tagId: number;
beforeAll(async () => {
  await syncTaxonomy(db);
  const category = (await listCategories(db)).find((row) => row.kind === "channel");
  const tag = (await listTags(db))[0];
  if (!category || !tag) throw new Error("Missing taxonomy");
  categoryId = category.id;
  tagId = tag.id;
});
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM site_state WHERE key LIKE 'public_%'"),
    env.DB.prepare("DELETE FROM public_listing"),
    env.DB.prepare("DELETE FROM entries_fts"),
    env.DB.prepare("DELETE FROM entry_tags"),
    env.DB.prepare("DELETE FROM entry_stats"),
    env.DB.prepare("DELETE FROM entries"),
  ]);
});
async function add(username: string, members: number | null, tagged = false) {
  return insertApprovedEntry(db, {
    entry: { username, kind: "channel", categoryId, title: username, listedAt: 1000 },
    stats: { members, online: null, activityTier: 2, statsWrittenAt: 1000 },
    tagIds: tagged ? [tagId] : [],
    now: 1000,
  });
}
async function finish() {
  for (let i = 0; i < 100; i++) {
    if ((await backfillPublicProjection(db, 100)).done) return;
  }
  throw new Error("Backfill failed to finish");
}

test("backfill resumes while writes, hides and new entries remain synchronized", async () => {
  const first = await add("first", 5, true);
  const second = await add("second", null, true);
  await expect(getPublicRevision(db)).rejects.toThrow("not ready");
  await beginPublicProjection(db);
  expect((await backfillPublicProjection(db, 1)).done).toBe(false);
  await setEntryStatus(db, first.id, "hidden_by_admin", 2000);
  await add("third", 100, true);
  await beginPublicProjection(db); // restart must preserve its cursor
  await finish();
  const page = await listPublicDirectory(db, {
    scope: { kind: "tag", id: tagId },
    sort: "members",
  });
  expect(page.items.map((row) => row.username)).toEqual(["third", "second"]);
  await upsertEntryStats(db, {
    entryId: second.id,
    members: 200,
    online: null,
    activityTier: 2,
    statsWrittenAt: 3000,
  });
  expect(
    (
      await listPublicDirectory(db, {
        scope: { kind: "category", id: categoryId },
        sort: "members",
      })
    ).items[0]?.username,
  ).toBe("second");
  await setEntryTags(db, second.id, [], 3000);
  expect(
    (
      await listPublicDirectory(db, { scope: { kind: "tag", id: tagId }, sort: "members" })
    ).items.map((row) => row.username),
  ).toEqual(["third"]);
  const revision = await getPublicRevision(db);
  await env.DB.prepare("UPDATE entries SET description_en = 'translated' WHERE id = ?")
    .bind(second.id)
    .run();
  expect(await getPublicRevision(db)).not.toBe(revision);
  await env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(second.id).run();
  expect(
    (await listPublicDirectory(db, { scope: { kind: "all" }, sort: "members" })).items.map(
      (row) => row.username,
    ),
  ).toEqual(["third"]);
});

test("all public source table write families invalidate a warm cache transactionally", async () => {
  await add("write_audit", 10, true);
  await beginPublicProjection(db);
  await finish();
  const mutations = [
    "UPDATE entries SET title='edited' WHERE username='write_audit'",
    "UPDATE entries SET description='source',description_zh=NULL,description_en=NULL WHERE username='write_audit'",
    "UPDATE entries SET description_en='translated' WHERE username='write_audit'",
    "UPDATE entries SET hide_posts=1,is_promoted=1 WHERE username='write_audit'",
    "UPDATE entries SET status='hidden_by_admin' WHERE username='write_audit'",
    "UPDATE entries SET status='approved' WHERE username='write_audit'",
    "UPDATE entry_stats SET members=20 WHERE entry_id=(SELECT id FROM entries WHERE username='write_audit')",
    "DELETE FROM entry_stats WHERE entry_id=(SELECT id FROM entries WHERE username='write_audit')",
    `UPDATE categories SET name_en='Audited' WHERE id=${categoryId}`,
    `UPDATE tags SET name_en='Audited' WHERE id=${tagId}`,
    `DELETE FROM entry_tags WHERE tag_id=${tagId}`,
    `INSERT INTO entry_tags(entry_id,tag_id) SELECT id,${tagId} FROM entries WHERE username='write_audit'`,
    "INSERT INTO hidden_posts(entry_id,post_id,created_at) SELECT id,123,0 FROM entries WHERE username='write_audit'",
    "DELETE FROM hidden_posts WHERE post_id=123",
    "INSERT INTO promotions(kind,entry_username,starts_at,ends_at,created_at) VALUES('pin','write_audit',0,5000,0)",
    "UPDATE promotions SET starts_at=2000 WHERE entry_username='write_audit'",
    "DELETE FROM promotions WHERE entry_username='write_audit'",
    "INSERT INTO settings(key,value,updated_at) VALUES('site','{}',0) ON CONFLICT(key) DO UPDATE SET value='{}'",
    "UPDATE settings SET value='{\"hidePostMedia\":true}' WHERE key='site'",
    "DELETE FROM settings WHERE key='site'",
    "INSERT INTO products(kind,name_zh,name_en,days,price_stars,price_usdt,slots) VALUES('banner','测试','Audit',7,10,'1',1)",
    "UPDATE products SET active=0 WHERE name_en='Audit'",
    "DELETE FROM products WHERE name_en='Audit'",
    "DELETE FROM entries WHERE username='write_audit'",
  ];
  const values = new Map<string, string>();
  const cache = {
    get: async (key: string) => values.get(key) ?? null,
    put: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  let loads = 0;
  const read = () =>
    readPublicCached(
      db,
      cache,
      ["write-audit"],
      (value) => {
        if (typeof value !== "string") throw new Error("Invalid revision payload");
        return value;
      },
      async () => {
        loads++;
        return { value: await getPublicRevision(db) };
      },
      { now: () => 1000, maxAgeMs: 1000 },
    );
  for (const mutation of mutations) {
    const before = await read();
    const loaded = loads;
    expect(await read()).toBe(before);
    expect(loads).toBe(loaded);
    await env.DB.prepare(mutation).run();
    expect(await read(), mutation).not.toBe(before);
    expect(loads).toBe(loaded + 1);
  }
});

test("member cursor is stable and rejected after authority changes", async () => {
  await beginPublicProjection(db);
  await finish();
  await add("a", 10);
  await add("b", 10);
  await add("c", null);
  const first = await listPublicDirectory(db, {
    scope: { kind: "all" },
    sort: "members",
    limit: 1,
  });
  if (!first.next) throw new Error("Missing cursor");
  const second = await listPublicDirectory(db, {
    scope: { kind: "all" },
    sort: "members",
    after: first.next,
  });
  expect(second.items.map((row) => row.username)).toEqual(["b", "c"]);
  await expect(
    listPublicDirectory(db, { scope: { kind: "all" }, sort: "latest", after: first.next }),
  ).rejects.toThrow("another listing");
  await add("d", 20);
  await expect(
    listPublicDirectory(db, { scope: { kind: "all" }, sort: "members", after: first.next }),
  ).rejects.toThrow("changed");
});

test("actual sparse-tag SQL uses scope sort indexes and bounded reads", async () => {
  // More unrelated rows than the result page, with just one entry in the requested tag.
  for (let i = 0; i < 1000; i++) await add(`large_${i}`, i, i === 50);
  await beginPublicProjection(db);
  await finish();
  const statements: { query: string; params: unknown[] }[] = [];
  const traced = drizzle(env.DB, {
    schema,
    logger: {
      logQuery(query, params) {
        statements.push({ query, params });
      },
    },
  });
  for (const sort of ["members", "latest"] as const) {
    const page = await listPublicDirectory(traced, { scope: { kind: "tag", id: tagId }, sort });
    expect(page.items.map((row) => row.username)).toEqual(["large_50"]);
    const statement = [...statements]
      .reverse()
      .find((row) => row.query.includes('from "public_listing"'));
    if (!statement) throw new Error("Missing directory SQL");
    const prepared = env.DB.prepare(statement.query).bind(...statement.params);
    const result = await prepared.all();
    expect(result.meta.rows_read).toBeLessThan(30);
    const baseline = await env.DB.prepare(`SELECT e.id FROM entries e
      LEFT JOIN entry_stats s ON s.entry_id = e.id WHERE e.status = 'approved'
      AND EXISTS (SELECT 1 FROM entry_tags et WHERE et.entry_id = e.id AND et.tag_id = ?)
      ORDER BY coalesce(s.members, -1) DESC, e.username LIMIT 61`)
      .bind(tagId)
      .all();
    expect(baseline.meta.rows_read).toBeGreaterThan(result.meta.rows_read * 10);
    console.info("public listing read budget", {
      sort,
      fixtureEntries: 1000,
      baselineRowsRead: baseline.meta.rows_read,
      projectedRowsRead: result.meta.rows_read,
    });
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${statement.query}`)
      .bind(...statement.params)
      .all<{ detail: string }>();
    const details = plan.results.map((row) => row.detail).join("\n");
    expect(details).toContain(`public_listing_${sort}`);
    expect(details).not.toContain("TEMP B-TREE");
  }
  const write = await env.DB.prepare(`UPDATE entry_stats SET members = members + 1
    WHERE entry_id = (SELECT id FROM entries WHERE username = 'large_50')`).run();
  expect(write.meta.rows_written).toBeLessThan(40);
  console.info("public listing stats write budget", { rowsWritten: write.meta.rows_written });
}, 30_000);

test("counts and bounded taxonomy follow approved state and stats preserve counts", async () => {
  await beginPublicProjection(db);
  await finish();
  const row = await add("counts", 100, true);
  expect(await getPublicTotals(db)).toEqual({ total: 1, channel: 1, group: 0, bot: 0 });
  await upsertEntryStats(db, {
    entryId: row.id,
    members: 300,
    online: null,
    activityTier: 2,
    statsWrittenAt: 3000,
  });
  expect((await getPublicTotals(db)).total).toBe(1);
  const taxonomy = await listPublicTaxonomy(db, { type: "tags", afterId: tagId - 1, limit: 1 });
  expect(taxonomy.items[0]).toMatchObject({ id: tagId, count: 1 });
  await setEntryStatus(db, row.id, "hidden_by_system", 4000);
  expect((await getPublicTotals(db)).total).toBe(0);
  expect(
    (await listPublicTaxonomy(db, { type: "categories", afterId: categoryId - 1, limit: 1 }))
      .items[0],
  ).toMatchObject({ count: 0, kind: "channel" });
});

test("site settings preserve partial legacy values and public promotions enforce time and state", async () => {
  const row = await add("promo", 100);
  await env.DB.prepare("INSERT INTO settings (key,value,updated_at) VALUES ('site',?,0)")
    .bind(JSON.stringify({ showAdSlots: true }))
    .run();
  expect((await getPublicSiteSettings(db)).showAdSlots).toBe(true);
  for (const [start, end] of [
    [0, 100],
    [0, 1000],
    [600, 1200],
  ]) {
    await env.DB.prepare(
      "INSERT INTO promotions (kind,entry_username,starts_at,ends_at,created_at) VALUES ('pin','promo',?,?,0)",
    )
      .bind(start, end)
      .run();
  }
  expect((await listPublicPromotions(db, { now: 500 })).items).toHaveLength(1);
  expect((await listPublicPromotions(db, { now: 1000 })).items).toHaveLength(1);
  await setEntryStatus(db, row.id, "hidden_by_admin", 1000);
  expect((await listPublicPromotions(db, { now: 1000 })).items).toHaveLength(0);
});

test("versioned cache avoids reloads, expires on time, and never reuses a hidden entry", async () => {
  const row = await add("cache", 100);
  await beginPublicProjection(db);
  await finish();
  const stored = new Map<string, string>();
  const cache = {
    get: async (key: string) => stored.get(key) ?? null,
    put: async (key: string, value: string) => {
      stored.set(key, value);
    },
  };
  const parse = (value: unknown) => {
    if (typeof value !== "number") throw new Error("Invalid count");
    return value;
  };
  let reads = 0;
  let now = 1000;
  const load = async () => {
    reads++;
    return { value: (await getPublicTotals(db)).total, validUntil: 2000 };
  };
  const options = { now: () => now, maxAgeMs: 60_000 };
  const read = () => readPublicCached(db, cache, ["totals", "zh"], parse, load, options);
  expect(await read()).toBe(1);
  expect(await read()).toBe(1);
  expect(reads).toBe(1);
  now = 2000;
  await expect(read()).rejects.toThrow("expired");
  expect(reads).toBe(2);
  now = 1500;
  await setEntryStatus(db, row.id, "hidden_by_admin", 3000);
  expect(await read()).toBe(0);
  expect(reads).toBe(3);
  const broken = {
    get: async () => {
      throw new Error("cache unavailable");
    },
    put: async () => {
      throw new Error("write failed");
    },
  };
  expect(await readPublicCached(db, broken, ["totals"], parse, load, options)).toBe(0);
  await expect(
    readPublicCached(
      db,
      null,
      ["race"],
      parse,
      async () => {
        await setEntryStatus(db, row.id, "approved", 4000);
        return { value: 0 };
      },
      options,
    ),
  ).rejects.toThrow("changed");
});

test("cache I/O cannot publish an entry hidden during get or put", async () => {
  const row = await add("cache_io", 100);
  await beginPublicProjection(db);
  await finish();
  for (const phase of ["get", "put"] as const) {
    await setEntryStatus(db, row.id, "approved", 1000);
    const stored = new Map<string, string>();
    let hide = false;
    const cache = {
      get: async (key: string) => {
        if (hide && phase === "get") await setEntryStatus(db, row.id, "hidden_by_admin", 2000);
        return stored.get(key) ?? null;
      },
      put: async (key: string, value: string) => {
        stored.set(key, value);
        if (hide && phase === "put") await setEntryStatus(db, row.id, "hidden_by_admin", 2000);
      },
    };
    const read = () =>
      readPublicCached(
        db,
        cache,
        [phase],
        (value) => value,
        async () => ({ value: await getPublicEntry(db, "cache_io") }),
        { now: () => 1000, maxAgeMs: 1000 },
      );
    if (phase === "get") await read();
    hide = true;
    await expect(read()).rejects.toThrow("changed");
  }
});

test("slow cache I/O and clock rollback cannot publish outside the time interval", async () => {
  await beginPublicProjection(db);
  await finish();
  let time = 1000;
  const stored = new Map<string, string>();
  let afterPut = 1000;
  const cache = {
    get: async (key: string) => stored.get(key) ?? null,
    put: async (key: string, value: string) => {
      stored.set(key, value);
      time = afterPut;
    },
  };
  const read = (parse = (value: unknown) => value) =>
    readPublicCached(db, cache, ["time"], parse, async () => ({ value: 1, validUntil: 2000 }), {
      now: () => time,
      maxAgeMs: 1000,
    });
  afterPut = 2000;
  await expect(read()).rejects.toThrow("expired");
  time = 1000;
  await expect(
    read((value) => {
      time = 2000;
      return value;
    }),
  ).rejects.toThrow("expired");
  stored.clear();
  time = 1000;
  afterPut = 999;
  await expect(read()).rejects.toThrow("expired");
  // A cache object from a future interval must be ignored after clock rollback.
  afterPut = 999;
  expect(await read()).toBe(1);
  await expect(
    readPublicCached(
      db,
      null,
      [],
      (value) => value,
      async () => ({ value: 1, validUntil: NaN }),
      { now: () => 1000, maxAgeMs: 1000 },
    ),
  ).rejects.toThrow("validity");
});

test("cache hit costs only two indexed authority reads and skips the detail loader", async () => {
  await add("cache_budget", 100);
  await beginPublicProjection(db);
  await finish();
  const statements: { query: string; params: unknown[] }[] = [];
  const traced = drizzle(env.DB, {
    schema,
    logger: {
      logQuery(query, params) {
        statements.push({ query, params });
      },
    },
  });
  const stored = new Map<string, string>();
  const cache = {
    get: async (key: string) => stored.get(key) ?? null,
    put: async (key: string, value: string) => {
      stored.set(key, value);
    },
  };
  let loads = 0;
  const read = () =>
    readPublicCached(
      traced,
      cache,
      ["detail", "zh", "cache_budget"],
      (value) => value,
      async () => {
        loads++;
        return { value: await getPublicEntry(traced, "cache_budget") };
      },
      { now: () => 1000, maxAgeMs: 1000 },
    );
  for (const phase of ["miss", "hit"] as const) {
    statements.length = 0;
    await read();
    expect(loads).toBe(1);
    expect(statements).toHaveLength(phase === "miss" ? 4 : 2);
    let rowsRead = 0;
    for (const statement of statements) {
      const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${statement.query}`)
        .bind(...statement.params)
        .all<{ detail: string }>();
      const details = plan.results.map((row) => row.detail).join("\n");
      expect(details).toContain("INDEX");
      expect(details).not.toContain("SCAN");
      const result = await env.DB.prepare(statement.query)
        .bind(...statement.params)
        .all();
      rowsRead += result.meta.rows_read;
      expect(result.meta.rows_written).toBe(0);
    }
    expect(rowsRead).toBeLessThanOrEqual(phase === "miss" ? 30 : 12);
    console.info("cache authority budget", { phase, statements: statements.length, rowsRead });
  }
});

test("disabled authority rejects cached reads", async () => {
  await beginPublicProjection(db);
  await finish();
  await env.DB.prepare(
    "UPDATE site_state SET value = '0' WHERE key = 'public_projection_enabled'",
  ).run();
  await expect(
    readPublicCached(
      db,
      { get: async () => '{"value":1,"expiresAt":99999}', put: async () => {} },
      ["stale"],
      (value) => value,
      async () => ({ value: 0 }),
      { now: () => 1000, maxAgeMs: 1000 },
    ),
  ).rejects.toThrow("not ready");
});

test("a failed D1 batch rolls back authority, projections and revision together", async () => {
  const row = await add("atomic", 10, true);
  await beginPublicProjection(db);
  await finish();
  const revision = await getPublicRevision(db);
  await expect(
    env.DB.batch([
      env.DB.prepare("UPDATE entries SET status = 'hidden_by_admin' WHERE id = ?").bind(row.id),
      env.DB.prepare("INSERT INTO entry_tags (entry_id, tag_id) VALUES (?, ?)").bind(row.id, tagId),
    ]),
  ).rejects.toThrow();
  expect(await getPublicRevision(db)).toBe(revision);
  expect((await getPublicTotals(db)).total).toBe(1);
  expect(
    (await listPublicDirectory(db, { scope: { kind: "tag", id: tagId }, sort: "members" })).items,
  ).toHaveLength(1);
});
