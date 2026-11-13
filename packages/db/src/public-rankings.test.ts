import { env } from "cloudflare:workers";
import { growthFromBaseline, type RankItem } from "@tgbox/shared";
import { beforeAll, beforeEach, expect, test } from "vitest";
import { normalizeHistory } from "../../core/src/history-normalization.ts";
import {
  backfillPublicProjection,
  beginHistoryWrite,
  beginPublicProjection,
  beginPublicRankings,
  createDb,
  getPublicRevision,
  getSiteState,
  insertApprovedEntry,
  listCategories,
  listPublicRankingWork,
  preparePublicRanking,
  readPublicRankings,
  seedPublicRankings,
  setSiteState,
  syncTaxonomy,
} from "./index.ts";

const db = createDb(env.DB);
const now = Date.UTC(2026, 10, 13);
const day = 86400000;
let categoryId: number;
beforeAll(async () => {
  await syncTaxonomy(db);
  const category = (await listCategories(db)).find((row) => row.kind === "channel");
  if (!category) throw new Error("Missing category");
  categoryId = category.id;
});
beforeEach(async () => {
  await env.DB.batch(
    ["entries_fts", "entries", "entry_stats", "entry_tags", "public_rankings", "site_state"].map(
      (table) => env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
});
const history = [
  { t: new Date(now - 40 * day).toISOString(), members: 10 },
  { t: new Date(now - 8 * day).toISOString(), members: 20 },
];
async function mirror(id: number, points = history) {
  const e = await env.DB.prepare("SELECT username,listed_at FROM entries WHERE id=?")
    .bind(id)
    .first<{ username: string; listed_at: number }>();
  if (!e) throw new Error("Missing source");
  const normalized = normalizeHistory(points);
  await env.DB.prepare(`INSERT INTO history_mirrors(entry_id,username,listed_at,object_version,object_etag,generation,phase,raw_points,point_count,invalid_times,updated_at)
    VALUES(?,?,?,'test','etag',?,'ready',?,?,0,?) ON CONFLICT(entry_id) DO UPDATE SET phase='ready',generation=excluded.generation`)
    .bind(
      id,
      e.username,
      e.listed_at,
      crypto.randomUUID(),
      points.length,
      normalized.points.length,
      now,
    )
    .run();
  await env.DB.prepare("DELETE FROM history_baselines WHERE entry_id=?").bind(id).run();
  for (const point of normalized.points)
    await env.DB.prepare("INSERT INTO history_baselines VALUES(?,?,?,?)")
      .bind(id, point.sampledAt, point.members, point.ordinal)
      .run();
}
async function add(
  username: string,
  members: number | null = 100,
  points = history,
  tier: RankItem["activityTier"] = 2,
  listedAt = now,
) {
  const id = (
    await insertApprovedEntry(db, {
      entry: {
        username:
          username === username.toLowerCase()
            ? username
            : `case_fixture_${crypto.randomUUID().replaceAll("-", "")}`,
        kind: "channel",
        categoryId,
        title: username,
        listedAt,
      },
      stats: { members, online: null, activityTier: tier, statsWrittenAt: now },
      tagIds: [],
      now,
    })
  ).id;
  if (username !== username.toLowerCase())
    await env.DB.prepare("UPDATE entries SET username=? WHERE id=?").bind(username, id).run();
  await mirror(id, points);
  return id;
}
async function enable() {
  await beginPublicProjection(db);
  for (let batch = 0; batch < 100; batch++) if ((await backfillPublicProjection(db)).done) break;
  await beginPublicRankings(db);
}
async function prepare(ids: number[], at = now) {
  for (const id of ids) expect((await preparePublicRanking(db, id, at)).status).toBe("ready");
}
async function ready(at = now) {
  const result = await readPublicRankings(db, () => at);
  if (result.status !== "ready") throw new Error("Rankings not ready");
  return result;
}
function observed(
  after: (sql: string) => Promise<void>,
  sqls: { sql: string; params: unknown[] }[] = [],
) {
  const wrap = (
    statement: D1PreparedStatement,
    sql: string,
    params: unknown[],
  ): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, key) {
        if (key === "bind")
          return (...values: unknown[]) => wrap(target.bind(...values), sql, values);
        if (key === "all" || key === "raw" || key === "first")
          return async (...args: unknown[]) => {
            const result = await Reflect.apply(Reflect.get(target, key), target, args);
            sqls.push({ sql, params });
            await after(sql);
            return result;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  return createDb(
    new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare") return (sql: string) => wrap(target.prepare(sql), sql, []);
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
}

test("disabled, empty, incomplete and missing-history states never publish a partial ranking", async () => {
  await beginPublicProjection(db);
  await backfillPublicProjection(db);
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  await beginPublicRankings(db);
  expect((await ready()).data.newest).toEqual([]);
  const id = await add("ranking_first");
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  await env.DB.prepare("DELETE FROM history_mirrors WHERE entry_id=?").bind(id).run();
  expect((await preparePublicRanking(db, id, now)).status).toBe("needs_history");
  await mirror(id);
  await prepare([id]);
  expect((await ready()).data.newest[0]?.username).toBe("ranking_first");
});

test("bounded seeding preserves incomplete coverage until every approved entry is prepared", async () => {
  const ids = [await add("rank_seed_a"), await add("rank_seed_b"), await add("rank_seed_c")];
  await env.DB.prepare("UPDATE entries SET status='hidden_by_admin' WHERE id=?").bind(ids[1]).run();
  await enable();
  let cursor = 0;
  for (let batch = 0; batch < 4; batch++) {
    const result = await seedPublicRankings(db, cursor, 1);
    cursor = result.cursor;
    if (result.done) break;
  }
  expect(cursor).toBe(ids[2]);
  expect(await getSiteState(db, "public_rank_count")).toBe("2");
  await prepare([ids[0] as number]);
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  await prepare([ids[2] as number]);
  expect((await ready()).data.newest).toHaveLength(2);
});

test("four boards preserve rounding, null/zero bases, ties, case and underscore locale ordering", async () => {
  const names = [
    "a_rank",
    "arank",
    "a0rank",
    "A_rank",
    "aRank",
    "_rankA",
    "0rank_",
    "aa_rank",
    ...Array.from({ length: 55 }, (_, index) => `ranking_${String(index).padStart(3, "0")}`),
  ];
  const items: RankItem[] = [];
  const monthly: RankItem[] = [];
  const ids: number[] = [];
  for (const [index, name] of names.entries()) {
    const members = index % 11 === 0 ? null : index % 7 === 0 ? 0 : 100;
    const points =
      index % 9 === 0 ? [{ t: new Date(now - 40 * day).toISOString(), members: 0 }] : history;
    const tier = index % 5 === 0 ? 0 : 2;
    ids.push(await add(name, members, points, tier));
    const weekBase =
      [...points].reverse().find((point) => Date.parse(point.t) <= now - 6 * day)?.members ?? null;
    const monthBase =
      [...points].reverse().find((point) => Date.parse(point.t) <= now - 27 * day)?.members ?? null;
    const week = growthFromBaseline(members, weekBase);
    const month = growthFromBaseline(members, monthBase);
    const row: RankItem = {
      username: name,
      title: name,
      kind: "channel",
      members,
      activityTier: tier,
      listedAt: new Date(now).toISOString(),
      growth: week?.growth ?? null,
      growthPct: week?.growthPct ?? null,
    };
    items.push(row);
    monthly.push({ ...row, growth: month?.growth ?? null, growthPct: month?.growthPct ?? null });
  }
  await enable();
  await prepare(ids);
  await env.DB.prepare("UPDATE entries SET is_promoted=1 WHERE id=?").bind(ids[0]).run();
  const data = (await ready()).data;
  const growthOrder = (a: RankItem, b: RankItem) =>
    (b.growth ?? 0) - (a.growth ?? 0) ||
    (b.growthPct ?? 0) - (a.growthPct ?? 0) ||
    a.username.localeCompare(b.username);
  const expected = {
    generatedAt: new Date(now).toISOString(),
    weeklyGrowth: [...items]
      .filter((row) => (row.growth ?? 0) > 0)
      .sort(growthOrder)
      .slice(0, 50),
    monthlyGrowth: [...monthly]
      .filter((row) => (row.growth ?? 0) > 0)
      .sort(growthOrder)
      .slice(0, 50),
    newest: [...items].sort((a, b) => a.username.localeCompare(b.username)).slice(0, 50),
    active: [...items]
      .filter((row) => (row.activityTier ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.activityTier ?? 0) - (a.activityTier ?? 0) ||
          (b.members ?? -1) - (a.members ?? -1) ||
          a.username.localeCompare(b.username),
      )
      .slice(0, 50),
  };
  expect(JSON.parse(JSON.stringify(data))).toEqual(JSON.parse(JSON.stringify(expected)));
}, 30000);

test("stats, status, identity and deletion remain atomic with ranking invalidation", async () => {
  const id = await add("rank_mutable");
  await enable();
  await prepare([id]);
  await env.DB.prepare("UPDATE entry_stats SET members=200 WHERE entry_id=?").bind(id).run();
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  await prepare([id]);
  expect((await ready()).data.weeklyGrowth[0]?.growth).toBe(180);
  await env.DB.prepare("UPDATE entries SET title='New title' WHERE id=?").bind(id).run();
  expect((await ready()).data.newest[0]?.title).toBe("New title");
  await env.DB.prepare("UPDATE entries SET status='hidden_by_admin' WHERE id=?").bind(id).run();
  expect((await ready()).data.newest).toEqual([]);
  await env.DB.prepare("UPDATE entries SET status='approved',username='rank_renamed' WHERE id=?")
    .bind(id)
    .run();
  expect((await preparePublicRanking(db, id, now)).status).toBe("needs_history");
  await mirror(id);
  await prepare([id]);
  expect((await ready()).data.newest[0]?.username).toBe("rank_renamed");
  await env.DB.prepare("DELETE FROM entries WHERE id=?").bind(id).run();
  expect(await getSiteState(db, "public_rank_count")).toBe("0");
  expect((await ready()).data.newest).toEqual([]);
});

test("natural cutoff expiry requires indexed preparation and only advances ranking revision", async () => {
  const id = await add("rank_due", 30, [
    { t: new Date(now - 40 * day).toISOString(), members: 10 },
    { t: new Date(now - 6 * day + 1).toISOString(), members: 20 },
  ]);
  await enable();
  await prepare([id]);
  expect((await ready()).data.weeklyGrowth[0]?.growth).toBe(20);
  expect((await readPublicRankings(db, () => now + 1)).status).toBe("needs_preparation");
  expect(await listPublicRankingWork(db, now + 1)).toEqual([id]);
  const sourceRevision = await getPublicRevision(db);
  await prepare([id], now + 1);
  expect(await getPublicRevision(db)).toBe(sourceRevision);
  expect((await ready(now + 1)).data.weeklyGrowth[0]?.growth).toBe(10);
  const version = await getSiteState(db, "public_rank_revision");
  await prepare([id], now + 1);
  expect(await getSiteState(db, "public_rank_revision")).toBe(version);
});

test("pending history intent blocks preparation and source changes reject delayed publication", async () => {
  const id = await add("rank_pending");
  await enable();
  await prepare([id]);
  await setSiteState(db, "public_history_writes_enabled", "1");
  await beginHistoryWrite(
    db,
    {
      entryId: id,
      username: "rank_pending",
      listedAt: now,
      token: "rank-intent",
      baseEtag: null,
      sampledAt: now,
      members: 200,
    },
    await getPublicRevision(db),
  );
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  expect((await preparePublicRanking(db, id, now)).status).toBe("needs_history");
});

test("disable/re-enable retains source invalidation and initial seeding detects missing rows", async () => {
  const id = await add("rank_reenable");
  await enable();
  await prepare([id]);
  await setSiteState(db, "public_rankings_enabled", "0");
  await env.DB.prepare("UPDATE entry_stats SET members=200 WHERE entry_id=?").bind(id).run();
  const other = await add("rank_added_off");
  await beginPublicRankings(db);
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  await seedPublicRankings(db);
  await prepare([id, other]);
  expect((await ready()).data.newest).toHaveLength(2);
});

test("a delayed entry preparation cannot overwrite concurrently changed members", async () => {
  const id = await add("rank_prepare_race");
  await enable();
  await prepare([id]);
  await env.DB.prepare("UPDATE entry_stats SET members=200 WHERE entry_id=?").bind(id).run();
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, key) {
        if (key === "bind") return (...values: unknown[]) => wrap(target.bind(...values), sql);
        if (
          key === "run" &&
          sql.startsWith("INSERT INTO public_rankings") &&
          sql.includes("week_growth")
        )
          return async () => {
            await env.DB.prepare("UPDATE entry_stats SET members=300 WHERE entry_id=?")
              .bind(id)
              .run();
            return target.run();
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  const traced = createDb(
    new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
  expect((await preparePublicRanking(traced, id, now)).status).toBe("contended");
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  await prepare([id]);
  expect((await ready()).data.weeklyGrowth[0]?.growth).toBe(280);
});

test("invalid history retains null growth and clock reversal rejects prepared future values", async () => {
  const id = await add("rank_invalid");
  await enable();
  await env.DB.prepare("UPDATE history_mirrors SET phase='invalid' WHERE entry_id=?")
    .bind(id)
    .run();
  await prepare([id], now + 1);
  expect((await ready(now + 1)).data.newest[0]?.growth).toBeNull();
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  await expect(preparePublicRanking(db, id, now)).rejects.toThrow("backwards");
  await expect(seedPublicRankings(db, 0, 101)).rejects.toThrow("batch");
  await expect(listPublicRankingWork(db, Number.NaN)).rejects.toThrow("time");
});

test("stats key moves and mirror identity repairs invalidate every affected ranking row", async () => {
  const first = await add("rank_move_a");
  const second = await add("rank_move_b", 200);
  await enable();
  await prepare([first, second]);
  await env.DB.prepare("DELETE FROM entry_stats WHERE entry_id=?").bind(second).run();
  await env.DB.prepare("UPDATE entry_stats SET entry_id=? WHERE entry_id=?")
    .bind(second, first)
    .run();
  expect(await listPublicRankingWork(db, now)).toEqual([first, second]);
  await prepare([first, second]);
  const data = (await ready()).data;
  expect(data.newest.find((row) => row.username === "rank_move_a")?.members).toBeNull();
  expect(data.newest.find((row) => row.username === "rank_move_b")?.members).toBe(100);
  await env.DB.prepare("UPDATE history_mirrors SET username='wrong_identity' WHERE entry_id=?")
    .bind(second)
    .run();
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  expect((await preparePublicRanking(db, second, now)).status).toBe("needs_history");
});

test("orphan categories cannot expose entries omitted by the existing snapshot", async () => {
  const id = await add("rank_orphan_category");
  await enable();
  await prepare([id]);
  await env.DB.prepare("UPDATE entries SET category_id=999999 WHERE id=?").bind(id).run();
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  expect((await preparePublicRanking(db, id, now)).status).toBe("needs_history");
  await env.DB.prepare("UPDATE entries SET category_id=? WHERE id=?").bind(categoryId, id).run();
  await prepare([id]);
  await env.DB.prepare(`INSERT INTO categories(id,slug,kind,name_zh,name_en,sort,icon)
    SELECT 999998,slug||'_rank_temp',kind,name_zh,name_en,sort,icon FROM categories WHERE id=?`)
    .bind(categoryId)
    .run();
  await env.DB.prepare("UPDATE entries SET category_id=999998 WHERE id=?").bind(id).run();
  await prepare([id]);
  await env.DB.prepare("DELETE FROM categories WHERE id=999998").run();
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  expect((await preparePublicRanking(db, id, now)).status).toBe("needs_history");
});

test("unknown members preserve the existing null-growth fast path without requiring history", async () => {
  const id = await add("rank_null_members", null);
  await enable();
  await env.DB.prepare("DELETE FROM history_mirrors WHERE entry_id=?").bind(id).run();
  await prepare([id]);
  expect((await ready()).data.newest[0]?.growth).toBeNull();
  expect((await ready()).validUntil).toBe(Number.MAX_SAFE_INTEGER);
  await env.DB.prepare("UPDATE entry_stats SET members=100 WHERE entry_id=?").bind(id).run();
  expect((await readPublicRankings(db, () => now)).status).toBe("needs_preparation");
  expect((await preparePublicRanking(db, id, now)).status).toBe("needs_history");
});

test("rank-only concurrent updates reject a response without changing the content revision", async () => {
  const id = await add("rank_race");
  await enable();
  await prepare([id]);
  const revision = await getPublicRevision(db);
  let changed = false;
  const traced = observed(async (sql) => {
    if (!changed && sql.includes("FROM public_rankings r JOIN entries")) {
      changed = true;
      await env.DB.prepare("UPDATE public_rankings SET evaluated_at=evaluated_at WHERE entry_id=?")
        .bind(id)
        .run();
    }
  });
  await expect(readPublicRankings(traced, () => now)).rejects.toThrow("changed");
  expect(await getPublicRevision(db)).toBe(revision);
});

test("deadline is checked after final D1 I/O", async () => {
  const id = await add("rank_io_clock", 30, [
    { t: new Date(now - 6 * day + 1).toISOString(), members: 10 },
  ]);
  await enable();
  await prepare([id]);
  let clock = now;
  let states = 0;
  const traced = observed(async (sql) => {
    if (sql.includes('from "site_state"') && ++states === 2) clock = now + 1;
  });
  await expect(readPublicRankings(traced, () => clock)).rejects.toThrow("changed");
  expect(states).toBe(2);
});

test("1000 candidates use four ordered Top 50 indexes and bounded preparation queues", async () => {
  for (let start = 1; start <= 1000; start += 100) {
    await env.DB.batch(
      Array.from({ length: 100 }, (_, index) => {
        const id = start + index;
        const name = `cost_rank_${String(id).padStart(4, "0")}`;
        return env.DB.prepare(`INSERT INTO entries(id,username,kind,category_id,title,listed_at,updated_at)
        VALUES(?,?,'channel',?,?,?,?)`).bind(id, name, categoryId, name, now, now);
      }),
    );
  }
  await enable();
  for (let start = 1; start <= 1000; start += 100)
    await env.DB.batch(
      Array.from({ length: 100 }, (_, index) => {
        const id = start + index;
        const name = `cost_rank_${String(id).padStart(4, "0")}`;
        return env.DB.prepare(`INSERT INTO public_rankings(entry_id,username_key,members,member_order,week_growth,week_pct,week_pct_order,
        month_growth,month_pct,month_pct_order,listed_at,activity_tier,dirty,evaluated_at,valid_until)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,2,0,?,?)`).bind(
          id,
          name,
          id + 1000,
          id + 1000,
          id,
          id / 10,
          id / 10,
          id,
          id / 10,
          id / 10,
          now,
          now,
          Number.MAX_SAFE_INTEGER,
        );
      }),
    );
  const captured: { sql: string; params: unknown[] }[] = [];
  expect(
    (
      await readPublicRankings(
        observed(async () => {}, captured),
        () => now,
      )
    ).status,
  ).toBe("ready");
  const metrics = [];
  for (const query of captured.filter((row) =>
    row.sql.includes("FROM public_rankings r JOIN entries"),
  )) {
    const result = await env.DB.prepare(query.sql)
      .bind(...query.params)
      .all();
    expect(result.results).toHaveLength(50);
    expect(result.meta.rows_read).toBeLessThanOrEqual(160);
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
      .bind(...query.params)
      .all<{ detail: string }>();
    const details = plan.results.map((row) => row.detail).join(" ");
    expect(details).toMatch(/public_rank_(week|month|newest|active)/);
    expect(details).not.toContain("TEMP B-TREE");
    metrics.push(result.meta.rows_read);
  }
  expect(metrics).toHaveLength(4);
  let totalRows = 0;
  for (const query of captured)
    totalRows += (
      await env.DB.prepare(query.sql)
        .bind(...query.params)
        .all()
    ).meta.rows_read;
  expect(captured).toHaveLength(7);
  expect(totalRows).toBeLessThanOrEqual(450);
  const dirtyPlan = await env.DB.prepare(
    "EXPLAIN QUERY PLAN SELECT entry_id FROM public_rankings WHERE dirty=1 ORDER BY entry_id LIMIT 100",
  ).all<{ detail: string }>();
  expect(dirtyPlan.results.map((row) => row.detail).join(" ")).toContain("public_rank_dirty");
  const duePlan = await env.DB.prepare(
    "EXPLAIN QUERY PLAN SELECT entry_id FROM public_rankings WHERE dirty=0 AND valid_until<=? ORDER BY valid_until,entry_id LIMIT 100",
  )
    .bind(now)
    .all<{ detail: string }>();
  expect(duePlan.results.map((row) => row.detail).join(" ")).toContain("public_rank_due");
  expect(captured.some((row) => /count\s*\(\s*\*\s*\)/i.test(row.sql))).toBe(false);
  await env.DB.prepare(
    "INSERT INTO entry_stats(entry_id,members,activity_tier,stats_written_at) VALUES(1000,2000,2,?)",
  )
    .bind(now)
    .run();
  await mirror(1000);
  const prepared = await preparePublicRanking(db, 1000, now);
  expect(prepared.status).toBe("ready");
  expect("rowsWritten" in prepared ? prepared.rowsWritten : Infinity).toBeLessThanOrEqual(16);
  console.info("actual four ranking budget", {
    boards: metrics,
    sql: captured.length,
    totalRows,
    prepared,
  });
}, 60000);
