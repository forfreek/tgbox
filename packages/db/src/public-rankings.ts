import { growthFromBaseline, type RankItem, RankingsData } from "@tgbox/shared";
import { type Db, getSiteStates } from "./access.ts";
import {
  getPublicRevision,
  publicReadStateKeys,
  publicRevisionFromState,
} from "./public-projection.ts";

const day = 86400000;
const forever = Number.MAX_SAFE_INTEGER;
const enabledKey = "public_rankings_enabled";
const boards = {
  weeklyGrowth: {
    filter: "r.week_growth>0",
    order: "r.week_growth DESC,r.week_pct_order DESC,r.username_key",
  },
  monthlyGrowth: {
    filter: "r.month_growth>0",
    order: "r.month_growth DESC,r.month_pct_order DESC,r.username_key",
  },
  newest: { filter: "1=1", order: "r.listed_at DESC,r.username_key" },
  active: {
    filter: "r.activity_tier>0",
    order: "r.activity_tier DESC,r.member_order DESC,r.username_key",
  },
};
type Board = keyof typeof boards;

function time(now: number) {
  if (!Number.isSafeInteger(now) || !Number.isFinite(new Date(now).getTime()))
    throw new RangeError("Invalid ranking time");
}
function limitOf(limit: number) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError("Invalid ranking batch size");
}
function usernameKey(username: string) {
  if (!/^[A-Za-z0-9_]+$/.test(username)) throw new Error("Invalid Telegram ranking username");
  // Primary ASCII Telegram name, then ICU's lowercase-before-uppercase tertiary order.
  return (
    username.toLowerCase().replaceAll("_", "!") +
    " " +
    Array.from(username, (char) => (/[A-Z]/.test(char) ? "1" : "0")).join("")
  );
}

export async function beginPublicRankings(db: Db) {
  await getPublicRevision(db);
  await db.$client.batch([
    db.$client.prepare(`INSERT INTO site_state(key,value) SELECT 'public_rank_count','0'
      WHERE NOT EXISTS(SELECT 1 FROM public_rankings LIMIT 1) ON CONFLICT(key) DO NOTHING`),
    db.$client.prepare(`INSERT INTO site_state(key,value) SELECT 'public_rank_revision','0'
      WHERE NOT EXISTS(SELECT 1 FROM public_rankings LIMIT 1) ON CONFLICT(key) DO NOTHING`),
    db.$client.prepare(`INSERT INTO site_state(key,value) SELECT 'public_rankings_enabled','1'
      WHERE EXISTS(SELECT 1 FROM site_state WHERE key='public_rank_count')
      AND EXISTS(SELECT 1 FROM site_state WHERE key='public_rank_revision')
      ON CONFLICT(key) DO UPDATE SET value='1'`),
  ]);
  const state = await getSiteStates(db, [enabledKey, "public_rank_count", "public_rank_revision"]);
  if (
    state[enabledKey] !== "1" ||
    !/^\d+$/.test(state.public_rank_count ?? "") ||
    !/^\d+$/.test(state.public_rank_revision ?? "")
  )
    throw new Error("Ranking metadata requires audit");
}

/** Seed at most 100 source IDs. The caller persists the returned cursor outside public requests. */
export async function seedPublicRankings(db: Db, cursor = 0, limit = 100) {
  limitOf(limit);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new RangeError("Invalid ranking cursor");
  const state = await getSiteStates(db, [...publicReadStateKeys, enabledKey]);
  publicRevisionFromState(state);
  if (state[enabledKey] !== "1") throw new Error("Public rankings disabled");
  const rows = await db.$client
    .prepare("SELECT id FROM entries WHERE id>? ORDER BY id LIMIT ?")
    .bind(cursor, limit)
    .all<{ id: number }>();
  const last = rows.results.at(-1)?.id;
  if (last === undefined) return { done: true, cursor };
  await db.$client
    .prepare(`INSERT INTO public_rankings(entry_id) SELECT id FROM entries
    WHERE id>? AND id<=? AND status='approved'
    AND (SELECT value FROM site_state WHERE key='public_rankings_enabled')='1'
    ON CONFLICT(entry_id) DO NOTHING`)
    .bind(cursor, last)
    .run();
  return { done: false, cursor: last };
}

/** Indexed dirty/due work only. Initial seeding remains an explicit bounded backfill operation. */
export async function listPublicRankingWork(db: Db, now: number, limit = 100) {
  time(now);
  limitOf(limit);
  const dirty = await db.$client
    .prepare("SELECT entry_id FROM public_rankings WHERE dirty=1 ORDER BY entry_id LIMIT ?")
    .bind(limit)
    .all<{ entry_id: number }>();
  if (dirty.results.length) return dirty.results.map((row) => row.entry_id);
  const due = await db.$client
    .prepare(`SELECT entry_id FROM public_rankings WHERE dirty=0 AND valid_until<=?
    ORDER BY valid_until,entry_id LIMIT ?`)
    .bind(now, limit)
    .all<{ entry_id: number }>();
  return due.results.map((row) => row.entry_id);
}

type Source = {
  id: number;
  username: string;
  listed_at: number;
  members: number | null;
  activity_tier: RankItem["activityTier"];
  generation: string | null;
  phase: string | null;
  week_base: number | null;
  month_base: number | null;
  week_next: number | null;
  month_next: number | null;
  dirty: number | null;
  evaluated_at: number | null;
  valid_until: number | null;
};
/** Four indexed baseline/boundary seeks and one conditional publication for a single entry. */
export async function preparePublicRanking(db: Db, entryId: number, now: number) {
  time(now);
  if (!Number.isSafeInteger(entryId) || entryId < 1) throw new RangeError("Invalid ranking entry");
  const state = await getSiteStates(db, [...publicReadStateKeys, enabledKey]);
  const revision = publicRevisionFromState(state);
  if (state[enabledKey] !== "1") return { status: "disabled" as const };
  const source = await db.$client
    .prepare(`SELECT e.id,e.username,e.listed_at,s.members,s.activity_tier,m.generation,m.phase,
    CASE WHEN m.phase='ready' AND s.members IS NOT NULL THEN (SELECT members FROM history_baselines WHERE entry_id=e.id AND sampled_at<=? ORDER BY sampled_at DESC LIMIT 1) END AS week_base,
    CASE WHEN m.phase='ready' AND s.members IS NOT NULL THEN (SELECT members FROM history_baselines WHERE entry_id=e.id AND sampled_at<=? ORDER BY sampled_at DESC LIMIT 1) END AS month_base,
    CASE WHEN m.phase='ready' AND s.members IS NOT NULL THEN (SELECT sampled_at FROM history_baselines WHERE entry_id=e.id AND sampled_at>? ORDER BY sampled_at LIMIT 1) END AS week_next,
    CASE WHEN m.phase='ready' AND s.members IS NOT NULL THEN (SELECT sampled_at FROM history_baselines WHERE entry_id=e.id AND sampled_at>? ORDER BY sampled_at LIMIT 1) END AS month_next,
    r.dirty,r.evaluated_at,r.valid_until
    FROM entries e JOIN categories c ON c.id=e.category_id LEFT JOIN entry_stats s ON s.entry_id=e.id
    LEFT JOIN history_mirrors m ON m.entry_id=e.id AND m.username=e.username AND m.listed_at=e.listed_at
    LEFT JOIN public_rankings r ON r.entry_id=e.id
    WHERE e.id=? AND e.status='approved' AND (s.members IS NULL OR NOT EXISTS(SELECT 1 FROM history_writes WHERE entry_id=e.id))`)
    .bind(now - 6 * day, now - 27 * day, now - 6 * day, now - 27 * day, entryId)
    .first<Source>();
  if (!source || (source.members !== null && !["ready", "invalid"].includes(source.phase ?? "")))
    return { status: "needs_history" as const };
  if (source.evaluated_at !== null && source.evaluated_at > now)
    throw new Error("Ranking clock moved backwards");
  if (source.dirty === 0 && (source.valid_until ?? 0) > now) return { status: "ready" as const };
  const week = growthFromBaseline(source.members, source.week_base);
  const month = growthFromBaseline(source.members, source.month_base);
  const validUntil =
    source.members === null
      ? forever
      : Math.min(
          source.week_next === null ? forever : source.week_next + 6 * day,
          source.month_next === null ? forever : source.month_next + 27 * day,
        );
  const result = await db.$client
    .prepare(`INSERT INTO public_rankings
    (entry_id,username_key,members,week_growth,week_pct,week_pct_order,month_growth,month_pct,month_pct_order,
      member_order,listed_at,activity_tier,dirty,evaluated_at,valid_until)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,0,?,? FROM entries e WHERE e.id=? AND e.username=? AND e.listed_at=? AND e.status='approved'
    AND (SELECT value FROM site_state WHERE key='public_content_revision')=?
    AND (SELECT value FROM site_state WHERE key='public_rankings_enabled')='1'
    AND (SELECT value FROM site_state WHERE key='public_projection_enabled')='1'
    AND (SELECT value FROM site_state WHERE key='public_projection_ready')='1'
    AND (?=0 OR (EXISTS(SELECT 1 FROM history_mirrors WHERE entry_id=e.id AND generation=? AND phase=?)
      AND NOT EXISTS(SELECT 1 FROM history_writes WHERE entry_id=e.id)))
    AND EXISTS(SELECT 1 FROM categories WHERE id=e.category_id)
    AND NOT EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id
      AND (r.evaluated_at>? OR (r.dirty=0 AND r.valid_until>?)))
    ON CONFLICT(entry_id) DO UPDATE SET username_key=excluded.username_key,members=excluded.members,
    week_growth=excluded.week_growth,week_pct=excluded.week_pct,week_pct_order=excluded.week_pct_order,
    month_growth=excluded.month_growth,month_pct=excluded.month_pct,month_pct_order=excluded.month_pct_order,
    member_order=excluded.member_order,listed_at=excluded.listed_at,activity_tier=excluded.activity_tier,
    dirty=0,evaluated_at=excluded.evaluated_at,valid_until=excluded.valid_until`)
    .bind(
      source.id,
      usernameKey(source.username),
      source.members,
      week?.growth ?? null,
      week?.growthPct ?? null,
      week?.growthPct ?? 0,
      month?.growth ?? null,
      month?.growthPct ?? null,
      month?.growthPct ?? 0,
      source.members ?? -1,
      source.listed_at,
      source.activity_tier,
      now,
      validUntil,
      source.id,
      source.username,
      source.listed_at,
      revision,
      source.members === null ? 0 : 1,
      source.generation,
      source.phase,
      now,
      now,
    )
    .run();
  return {
    status: result.meta.changes ? ("ready" as const) : ("contended" as const),
    validUntil,
    rowsWritten: result.meta.rows_written,
  };
}

type Row = {
  username: string;
  kind: RankItem["kind"];
  title: string;
  members: number | null;
  activity_tier: RankItem["activityTier"];
  listed_at: number;
  week_growth: number | null;
  week_pct: number | null;
  month_growth: number | null;
  month_pct: number | null;
};

/** All rows must be complete and time-valid before any Top 50 is exposed. */
export async function readPublicRankings(db: Db, now: () => number = Date.now) {
  const started = now();
  time(started);
  const state = await getSiteStates(db, [
    ...publicReadStateKeys,
    enabledKey,
    "public_rank_count",
    "public_rank_evaluated_max",
    "public_rank_revision",
  ]);
  const revision = publicRevisionFromState(state);
  if (state[enabledKey] !== "1") return { status: "needs_preparation" as const };
  const count = Number(state.public_rank_count);
  const evaluated = Number(state.public_rank_evaluated_max ?? String(Number.MIN_SAFE_INTEGER));
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isSafeInteger(evaluated) ||
    !/^\d+$/.test(state.public_rank_revision ?? "")
  )
    throw new Error("Invalid ranking state");
  const gate = await db.$client
    .prepare(`SELECT
    COALESCE((SELECT count FROM public_counts WHERE scope='all'),0) AS expected,
    (SELECT entry_id FROM public_rankings WHERE dirty=1 ORDER BY entry_id LIMIT 1) AS dirty,
    (SELECT valid_until FROM public_rankings WHERE dirty=0 ORDER BY valid_until,entry_id LIMIT 1) AS due`)
    .first<{ expected: number; dirty: number | null; due: number | null }>();
  if (
    !gate ||
    count !== gate.expected ||
    gate.dirty !== null ||
    (gate.due !== null && gate.due <= started) ||
    evaluated > started
  )
    return { status: "needs_preparation" as const };
  const output = {} as Record<Board, RankItem[]>;
  for (const board of Object.keys(boards) as Board[]) {
    const { filter, order } = boards[board];
    const rows = await db.$client
      .prepare(`SELECT e.username,e.kind,e.title,r.members,r.activity_tier,r.listed_at,
      r.week_growth,r.week_pct,r.month_growth,r.month_pct FROM public_rankings r JOIN entries e ON e.id=r.entry_id
      WHERE r.dirty=0 AND e.status='approved' AND ${filter} ORDER BY ${order} LIMIT 50`)
      .all<Row>();
    output[board] = rows.results.map((row) => ({
      username: row.username,
      kind: row.kind,
      title: row.title,
      members: row.members,
      activityTier: row.activity_tier,
      listedAt: new Date(row.listed_at).toISOString(),
      growth: board === "monthlyGrowth" ? row.month_growth : row.week_growth,
      growthPct: board === "monthlyGrowth" ? row.month_pct : row.week_pct,
    }));
  }
  const finalState = await getSiteStates(db, [
    ...publicReadStateKeys,
    enabledKey,
    "public_rank_revision",
  ]);
  const finished = now();
  time(finished);
  if (
    publicRevisionFromState(finalState) !== revision ||
    finalState[enabledKey] !== "1" ||
    finalState.public_rank_revision !== state.public_rank_revision ||
    finished < started ||
    (gate.due !== null && finished >= gate.due)
  )
    throw new Error("Public rankings changed; retry");
  return {
    status: "ready" as const,
    contentRevision: revision,
    rankingRevision: state.public_rank_revision as string,
    validUntil: gate.due ?? forever,
    data: RankingsData.parse({ generatedAt: new Date(finished).toISOString(), ...output }),
  };
}
