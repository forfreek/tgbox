import { env } from "cloudflare:workers";
import { expect, test } from "vitest";
import { resetAnalytics } from "../test/reset.ts";
import { readSearchAdmin } from "./admin.ts";
import { AuthenticatedSearch } from "./auth.ts";
import { defaultSettings } from "./config.ts";
import { refreshSearchPublication } from "./publication.ts";
import { beijingDay, DAY_MS } from "./time.ts";
import { writeSearch } from "./writer.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      CAPACITY_RUN: boolean;
    }
  }
}
const db = env.ANALYTICS_DB;
const now = Date.parse("2026-11-28T00:05:00+08:00");
const query = (view: string) => ({
  version: 1,
  view,
  from: "2026-08-31",
  to: "2026-11-28",
  size: 100,
});
test.skipIf(!env.CAPACITY_RUN)(
  "ranking 7x10000 contributions/500 rules and 90-day 45000 aggregates/5000 jobs",
  async () => {
    await resetAnalytics();
    await db
      .prepare("UPDATE search_settings SET value=?")
      .bind(JSON.stringify({ ...defaultSettings, publication: true, jobs: true }))
      .run();
    await db.batch(
      Array.from({ length: 500 }, (_, i) =>
        db
          .prepare(
            "INSERT INTO search_keyword_rules(pattern,match_mode,status,enabled,updated_at) VALUES(?,'exact','hidden',1,?)",
          )
          .bind(`blocked ${i}`, now),
      ),
    );
    for (let age = 1; age <= 7; age++)
      await db
        .prepare(
          "WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<9999) INSERT INTO search_daily_identities(day,keyword,identity,source,locale,eligible,last_seen_at) SELECT ?,'word '||(i%100),printf('%064x',i),'bot','en',1,? FROM n",
        )
        .bind(beijingDay(now - age * DAY_MS), now)
        .run();
    const values = new Map<string, string>();
    const cache = {
      get: async (key: string) => values.get(key) ?? null,
      put: async (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const started = Date.now();
    const publication = await refreshSearchPublication(
      {
        db,
        cache,
        enabled: true,
        now: () => now + Date.now() - started,
        recommended: async () => [],
      },
      "cron",
    );
    const job = await db
      .prepare("SELECT rows_read,rows_written,processed FROM search_job_runs")
      .first();
    const publicationWallMs = Date.now() - started;
    expect(publication.status).toBe("succeeded");
    for (let age = 0; age < 90; age++)
      await db
        .prepare(
          "WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<499) INSERT INTO search_daily_stats(day,keyword,display_keyword,source,locale,searches,results,updated_at) SELECT ?,'word '||i,'word '||i,'bot','en',1,1,? FROM n",
        )
        .bind(beijingDay(now - age * DAY_MS), now)
        .run();
    await db
      .prepare(
        "WITH RECURSIVE n(i) AS (SELECT 2 UNION ALL SELECT i+1 FROM n WHERE i<5001) INSERT INTO search_job_runs(run_id,kind,status,fence,started_at,finished_at,duration_ms) SELECT 'history-'||i,'manual','succeeded',i,?,?,0 FROM n",
      )
      .bind(now, now)
      .run();
    const readStart = Date.now();
    const view = await readSearchAdmin(db, cache, query("keywords"), now);
    if (view.kind !== "keywords") throw Error("view");
    expect(view.total).toBe(500);
    expect(view.rows).toHaveLength(100);
    console.log(
      "ANALYTICS_CAPACITY",
      JSON.stringify({
        identities: 70000,
        rules: 500,
        stats: 45000,
        jobs: 5001,
        publication,
        publicationWallMs,
        job,
        adminWallMs: Date.now() - readStart,
        adminUsage: view.usage,
      }),
    );
    expect({ job, adminUsage: view.usage }).toMatchSnapshot();
    // Same rule set at the highest supported event budget; no production database is queried.
    for (let age = 1; age <= 7; age++)
      await db
        .prepare(
          "WITH RECURSIVE n(i) AS (SELECT 10000 UNION ALL SELECT i+1 FROM n WHERE i<99999) INSERT INTO search_daily_identities(day,keyword,identity,source,locale,eligible,last_seen_at) SELECT ?,'word '||(i%100),printf('%064x',i),'bot','en',1,? FROM n",
        )
        .bind(beijingDay(now - age * DAY_MS), now)
        .run();
    await db.prepare("UPDATE search_control SET fence=5001 WHERE id=1").run();
    await db
      .prepare("UPDATE search_settings SET version=version+1,value=? WHERE id=1")
      .bind(
        JSON.stringify({
          ...defaultSettings,
          publication: true,
          jobs: true,
          dailyBudget: 100000,
          cleanupBatch: 1000,
        }),
      )
      .run();
    const highStart = Date.now();
    const high = await refreshSearchPublication(
      {
        db,
        cache,
        enabled: true,
        now: () => now + Date.now() - highStart,
        recommended: async () => [],
      },
      "cron",
    );
    expect(high.status).toBe("succeeded");
    const highJob = await db
      .prepare("SELECT rows_read,rows_written,processed FROM search_job_runs WHERE fence=5002")
      .first();
    console.log(
      "MAX_RANKING_CAPACITY",
      JSON.stringify({ identities: 700000, rules: 500, wallMs: Date.now() - highStart, highJob }),
    );
    expect(highJob).toMatchSnapshot();
    // Maximum keyword/rule length and contains matching exercise the other supported rule mode.
    const prefix = "资源目录".repeat(15);
    await db
      .prepare(
        "UPDATE search_daily_identities SET keyword=?||printf('%04d',CAST(substr(keyword,6) AS INTEGER))",
      )
      .bind(prefix)
      .run();
    await db
      .prepare(
        "UPDATE search_keyword_rules SET match_mode='contains',pattern=?||printf('%04d',id+1000)",
      )
      .bind(prefix)
      .run();
    const containsStart = Date.now();
    const contains = await refreshSearchPublication(
      {
        db,
        cache,
        enabled: true,
        now: () => now + Date.now() - containsStart,
        recommended: async () => [],
      },
      "cron",
    );
    expect(contains.status).toBe("succeeded");
    const containsJob = await db
      .prepare("SELECT rows_read,rows_written,processed FROM search_job_runs WHERE fence=5003")
      .first();
    expect(containsJob).toMatchSnapshot();
    console.log(
      "CONTAINS_CAPACITY",
      JSON.stringify({
        identities: 700000,
        rules: 500,
        characters: 64,
        wallMs: Date.now() - containsStart,
        containsJob,
      }),
    );
  },
  180000,
);

test.skipIf(!env.CAPACITY_RUN)(
  "high keyword cardinality with maximum contains rules",
  async () => {
    await resetAnalytics();
    await db
      .prepare("UPDATE search_settings SET value=?")
      .bind(
        JSON.stringify({
          ...defaultSettings,
          publication: true,
          jobs: true,
          dailyBudget: 100000,
          cleanupBatch: 1000,
        }),
      )
      .run();
    await db.batch(
      Array.from({ length: 500 }, (_, i) =>
        db
          .prepare(
            "INSERT INTO search_keyword_rules(pattern,match_mode,status,enabled,updated_at) VALUES(?,'contains','hidden',1,?)",
          )
          .bind(`blocked ${i}`, now),
      ),
    );
    for (let age = 1; age <= 7; age++)
      await db
        .prepare(
          "WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<99999) INSERT INTO search_daily_identities(day,keyword,identity,source,locale,eligible,last_seen_at) SELECT ?,'resource '||CAST((?+i)/5 AS INTEGER),printf('%064x',?+i),'bot','en',1,? FROM n",
        )
        .bind(beijingDay(now - age * DAY_MS), age * 100000, age * 100000, now)
        .run();
    const cache = {
      get: async (key: string) => values.get(key) ?? null,
      put: async (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const values = new Map<string, string>();
    const start = Date.now();
    const result = await refreshSearchPublication(
      {
        db,
        cache,
        enabled: true,
        now: () => now + Date.now() - start,
        recommended: async () => [],
      },
      "cron",
    );
    expect(result.status).toBe("succeeded");
    const job = await db
      .prepare("SELECT rows_read,rows_written,processed FROM search_job_runs")
      .first();
    console.log(
      "KEYWORD_CARDINALITY_CAPACITY",
      JSON.stringify({
        identities: 700000,
        keywords: 140000,
        containsRules: 500,
        wallMs: Date.now() - start,
        job,
      }),
    );
    expect(job).toMatchSnapshot();
  },
  180000,
);

test.skipIf(!env.CAPACITY_RUN)(
  "accepted-event budget does not falsely claim to bound concurrent core proof attempts",
  async () => {
    await resetAnalytics();
    await db
      .prepare("UPDATE search_settings SET value=?")
      .bind(JSON.stringify({ ...defaultSettings, enabled: true, bot: true, dailyBudget: 1 }))
      .run();
    const secret = "capacity-only-key".repeat(3);
    let calls = 0;
    let release: (() => void) | null = null;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const auth = await Promise.all(
      Array.from({ length: 24 }, (_, i) => AuthenticatedSearch.bot(secret, i + 1, now)),
    );
    const reports = await Promise.all(
      auth.map((a) =>
        writeSearch(
          {
            db,
            secret,
            enabled: true,
            now: () => now,
            verifyResult: async () => {
              if (++calls === 24) {
                if (!release) throw new Error("Capacity barrier was not initialized");
                release();
              }
              await barrier;
              return true;
            },
          },
          {
            version: 1,
            eventId: crypto.randomUUID(),
            keyword: "shared word",
            trigger: "manual",
            reportedResult: "results",
            locale: "en",
          },
          a,
        ),
      ),
    );
    expect(reports.filter((r) => r.outcome.status === "accepted")).toHaveLength(1);
    expect(calls).toBe(24);
    console.log(
      "PROOF_RACE",
      JSON.stringify({
        attempts: 24,
        proofCalls: calls,
        accepted: 1,
        reads: reports.reduce((n, r) => n + r.usage.rowsRead, 0),
        writes: reports.reduce((n, r) => n + r.usage.rowsWritten, 0),
      }),
    );
  },
  30000,
);

test.skipIf(!env.CAPACITY_RUN)(
  "drains maximum configured rolling rate expiry in bounded batches",
  async () => {
    await resetAnalytics();
    await db
      .prepare("UPDATE search_settings SET value=?")
      .bind(
        JSON.stringify({
          ...defaultSettings,
          jobs: true,
          dailyBudget: 100000,
          sessionIssuesPerDay: 100000,
          verificationsPerDay: 100000,
          cleanupBatch: 2000,
        }),
      )
      .run();
    await db
      .prepare(
        "WITH RECURSIVE n(i) AS (SELECT 0 UNION ALL SELECT i+1 FROM n WHERE i<1200015) INSERT INTO search_rate_limits(scope,subject,window,count,expires_at) SELECT 'ip',printf('%064x',i),'old',1,? FROM n",
      )
      .bind(now - 1)
      .run();
    const start = Date.now();
    const result = await refreshSearchPublication(
      {
        db,
        enabled: true,
        cache: {
          get: async () => null,
          put: async () => {
            throw Error("Publication is disabled");
          },
        },
        now: () => now + Date.now() - start,
        recommended: async () => [],
      },
      "cron",
    );
    expect(result.status).toBe("succeeded");
    expect(await db.prepare("SELECT COUNT(*) n FROM search_rate_limits").first("n")).toBe(0);
    const job = await db
      .prepare("SELECT rows_read,rows_written,status FROM search_job_runs")
      .first();
    expect(job).toMatchSnapshot();
    console.log(
      "CLEANUP_CAPACITY",
      JSON.stringify({ rows: 1200016, batch: 2000, wallMs: Date.now() - start, job }),
    );
  },
  180000,
);
