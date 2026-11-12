import { env } from "cloudflare:workers";
import { type RankItem, RankingsData } from "@tgbox/shared";
import { beforeAll, beforeEach, expect, test } from "vitest";

// P1-5 query prototypes. These tables exist only inside this test database.
// Production schema, write hooks and rollout are separate implementation nodes.
const now = Date.UTC(2026, 10, 12);
const day = 86_400_000;
const queries = {
  weeklyGrowth: {
    filter: "r.week_growth > 0",
    order: "r.week_growth DESC, coalesce(r.week_pct, 0) DESC, r.username",
    index: "rank_design_week",
  },
  monthlyGrowth: {
    filter: "r.month_growth > 0",
    order: "r.month_growth DESC, coalesce(r.month_pct, 0) DESC, r.username",
    index: "rank_design_month",
  },
  newest: {
    filter: "1 = 1",
    order: "r.listed_at DESC, r.username",
    index: "rank_design_newest",
  },
  active: {
    filter: "r.activity_tier > 0",
    order: "r.activity_tier DESC, coalesce(r.members, -1) DESC, r.username",
    index: "rank_design_active",
  },
};
type Board = keyof typeof queries;
type RankRow = {
  username: string;
  kind: RankItem["kind"];
  title: string;
  members: number | null;
  week_growth: number | null;
  week_pct: number | null;
  month_growth: number | null;
  month_pct: number | null;
  listed_at: number;
  activity_tier: RankItem["activityTier"];
};

beforeAll(async () => {
  const statements = [
    `CREATE TABLE rank_design_history (
      entry_id INTEGER NOT NULL, sampled_at INTEGER NOT NULL, members INTEGER NOT NULL,
      PRIMARY KEY (entry_id, sampled_at))`,
    `CREATE TABLE rank_design_projection (
      entry_id INTEGER PRIMARY KEY, username TEXT NOT NULL,
      is_public INTEGER NOT NULL, members INTEGER,
      week_growth INTEGER, week_pct REAL, month_growth INTEGER, month_pct REAL,
      listed_at INTEGER NOT NULL, activity_tier INTEGER)`,
    `CREATE INDEX rank_design_week ON rank_design_projection
      (week_growth DESC, coalesce(week_pct, 0) DESC, username)
      WHERE is_public = 1 AND week_growth > 0`,
    `CREATE INDEX rank_design_month ON rank_design_projection
      (month_growth DESC, coalesce(month_pct, 0) DESC, username)
      WHERE is_public = 1 AND month_growth > 0`,
    `CREATE INDEX rank_design_newest ON rank_design_projection
      (listed_at DESC, username) WHERE is_public = 1`,
    `CREATE INDEX rank_design_active ON rank_design_projection
      (activity_tier DESC, coalesce(members, -1) DESC, username)
      WHERE is_public = 1 AND activity_tier > 0`,
  ];
  await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM rank_design_history"),
    env.DB.prepare("DELETE FROM rank_design_projection"),
    env.DB.prepare("DELETE FROM entries WHERE username LIKE 'rank_design_%'"),
  ]);
});

function boardSql(board: Board) {
  const { filter, order } = queries[board];
  return `SELECT e.username, e.kind, e.title, r.members, r.week_growth, r.week_pct,
    r.month_growth, r.month_pct, r.listed_at, r.activity_tier
    FROM rank_design_projection r JOIN entries e ON e.id = r.entry_id
    WHERE r.is_public = 1 AND e.status = 'approved' AND ${filter}
    ORDER BY ${order} LIMIT 50`;
}

async function add(id: number, growth: number | null, percentage?: number | null) {
  const username = `rank_design_${String(id).padStart(4, "0")}`;
  const base = percentage === null ? 0 : percentage ? ((growth ?? 0) * 100) / percentage : 1000;
  const members = growth === null ? null : base + growth;
  const pct = growth === null ? null : percentage === undefined ? growth / 10 : percentage;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO entries
      (id, username, kind, category_id, title, listed_at, updated_at, is_promoted)
      VALUES (?, ?, 'channel', 1, ?, ?, ?, ?)`).bind(
      id,
      username,
      username,
      now - day,
      now,
      id === 1 ? 1 : 0,
    ),
    env.DB.prepare(`INSERT INTO rank_design_projection
      (entry_id, username, is_public, members, week_growth, week_pct,
        month_growth, month_pct, listed_at, activity_tier)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, 2)`).bind(
      id,
      username,
      members,
      growth,
      pct,
      growth,
      pct,
      now - day,
    ),
  ]);
}

test("6/27-day base lookups use the history key, including exact cutoff and zero base", async () => {
  for (const [age, members] of [
    [40, 0],
    [27, 800],
    [8, 900],
    [6, 1000],
    [1, 1100],
    [-1, 9999],
  ] as const) {
    await env.DB.prepare("INSERT INTO rank_design_history VALUES (1, ?, ?)")
      .bind(now - age * day, members)
      .run();
  }
  for (const [days, expected] of [
    [6, 1000],
    [27, 800],
    [35, 0],
  ] as const) {
    const sql = `SELECT sampled_at, members FROM rank_design_history
      WHERE entry_id = ? AND sampled_at <= ? ORDER BY sampled_at DESC LIMIT 1`;
    const row = await env.DB.prepare(sql)
      .bind(1, now - days * day)
      .first<{ members: number }>();
    expect(row?.members).toBe(expected);
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .bind(1, now - days * day)
      .all<{ detail: string }>();
    expect(plan.results.map((item) => item.detail).join("\n")).toContain(
      "sqlite_autoindex_rank_design_history",
    );
  }
  expect(
    await env.DB.prepare(`SELECT members FROM rank_design_history
    WHERE entry_id = 2 AND sampled_at <= ? ORDER BY sampled_at DESC LIMIT 1`)
      .bind(now)
      .first(),
  ).toBeNull();
});

test("four Top 50 queries use ordered indexes with bounded reads on 1000 candidates", async () => {
  for (let id = 1; id <= 1000; id++) await add(id, id);
  const boards: Record<Board, RankItem[]> = {
    weeklyGrowth: [],
    monthlyGrowth: [],
    newest: [],
    active: [],
  };
  for (const board of Object.keys(queries) as Board[]) {
    const sql = boardSql(board);
    const result = await env.DB.prepare(sql).all<RankRow>();
    boards[board] = result.results.map((row) => ({
      username: row.username,
      kind: row.kind,
      title: row.title,
      members: row.members,
      listedAt: new Date(row.listed_at).toISOString(),
      activityTier: row.activity_tier,
      growth: board === "monthlyGrowth" ? row.month_growth : row.week_growth,
      growthPct: board === "monthlyGrowth" ? row.month_pct : row.week_pct,
    }));
    expect(result.results).toHaveLength(50);
    expect(result.meta.rows_read).toBeLessThanOrEqual(160);
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).all<{ detail: string }>();
    const details = plan.results.map((row) => row.detail).join("\n");
    expect(details).toContain(queries[board].index);
    expect(details).not.toContain("TEMP B-TREE");
    expect(result.results[0]?.username).toBe(
      board === "newest" ? "rank_design_0001" : "rank_design_1000",
    );
    console.info("rank design read budget", {
      board,
      candidates: 1000,
      rowsRead: result.meta.rows_read,
    });
  }
  expect(RankingsData.parse({ generatedAt: new Date(now).toISOString(), ...boards })).toBeDefined();
  const write = await env.DB.prepare(`UPDATE rank_design_projection
    SET members = members + 10, week_growth = week_growth + 10, week_pct = week_pct + 1,
      month_growth = month_growth + 10, month_pct = month_pct + 1
    WHERE entry_id = 1000`).run();
  expect(write.meta.rows_written).toBeLessThanOrEqual(12);
  console.info("rank design projection write budget", { rowsWritten: write.meta.rows_written });
}, 30_000);

test("growth filters, null percentages, live labels and authority gates preserve ranking contracts", async () => {
  await add(1, 100, null);
  await add(2, 100, 20);
  await add(3, 0);
  await add(4, -10);
  await add(5, null);
  const board = () => env.DB.prepare(boardSql("weeklyGrowth")).all<RankRow>();
  expect((await board()).results.map((row) => row.username)).toEqual([
    "rank_design_0002",
    "rank_design_0001",
  ]);
  await env.DB.prepare("UPDATE entries SET title = 'updated', kind = 'bot' WHERE id = 2").run();
  expect((await board()).results[0]).toMatchObject({ title: "updated", kind: "bot" });
  await env.DB.prepare(
    "UPDATE rank_design_projection SET activity_tier = 0 WHERE entry_id IN (3,4)",
  ).run();
  expect(
    (await env.DB.prepare(boardSql("active")).all<RankRow>()).results.map((row) => row.username),
  ).toEqual(["rank_design_0002", "rank_design_0001", "rank_design_0005"]);
  // Deliberately leave the derived row stale to exercise the final authority check.
  await env.DB.prepare("UPDATE entries SET status = 'hidden_by_admin' WHERE id = 2").run();
  expect((await board()).results.map((row) => row.username)).toEqual(["rank_design_0001"]);
  expect((await board()).results[0]?.week_pct).toBeNull();
  await env.DB.prepare("DELETE FROM entries WHERE id = 1").run();
  expect((await board()).results).toEqual([]);
});

test("time alone makes a younger history point eligible for the next baseline", async () => {
  await env.DB.prepare("INSERT INTO rank_design_history VALUES (1, ?, 1000)")
    .bind(now - 6 * day + 1)
    .run();
  const sql = `SELECT members FROM rank_design_history WHERE entry_id = 1
    AND sampled_at <= ? ORDER BY sampled_at DESC LIMIT 1`;
  expect(
    await env.DB.prepare(sql)
      .bind(now - 6 * day)
      .first(),
  ).toBeNull();
  expect(
    await env.DB.prepare(sql)
      .bind(now + 1 - 6 * day)
      .first(),
  ).toEqual({ members: 1000 });
});
