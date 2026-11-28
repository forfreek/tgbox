import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { resetAnalytics } from "../test/reset.ts";
import { defaultSettings, SearchSettings } from "./config.ts";
import { readPublishedSearches, refreshSearchPublication } from "./publication.ts";

const db = env.ANALYTICS_DB;
const now = Date.parse("2026-11-28T00:05:00+08:00");
const values = new Map<string, string>();
const cache = {
  get: async (key: string) => values.get(key) ?? null,
  put: async (key: string, value: string) => {
    values.set(key, value);
  },
};
const kv = cache;
const deps = () => ({
  db,
  cache: kv,
  enabled: true,
  now: () => now,
  recommended: async () => ["推荐资源"],
});
beforeEach(async () => {
  await resetAnalytics();
  values.clear();
  await db
    .prepare("UPDATE search_settings SET value=? WHERE id=1")
    .bind(JSON.stringify({ ...defaultSettings, jobs: true, publication: true }))
    .run();
});
async function contribution(word: string, day: string, id: number) {
  await db
    .prepare(
      "INSERT INTO search_daily_identities(day,keyword,identity,source,locale,eligible,last_seen_at) VALUES(?,?,?,'bot','zh',1,?)",
    )
    .bind(day, word, id.toString(16).padStart(64, "0"), now)
    .run();
}
test("cross-day identities count only their latest day; stable ranking and complete-day window", async () => {
  for (let i = 1; i <= 5; i++) {
    await contribution("older", "2026-11-21", i);
    await contribution("older", "2026-11-27", i);
    await contribution("recent", "2026-11-26", i);
    await contribution("today", "2026-11-28", i);
  }
  for (let i = 1; i <= 6; i++) await contribution("six", "2026-11-27", i);
  expect((await refreshSearchPublication(deps(), "cron")).status).toBe("succeeded");
  const result = await readPublishedSearches(db, kv, true);
  expect(result?.window).toEqual({ from: "2026-11-21", to: "2026-11-27" });
  expect(result?.items.map((x) => x.keyword)).toEqual(["six", "older", "recent"]);
  const snapshot = await db
    .prepare("SELECT ranking_json FROM search_job_runs")
    .first<string>("ranking_json");
  expect(JSON.parse(snapshot ?? "[]")).toEqual([
    { keyword: "six", identities: 6, score: 6 },
    { keyword: "older", identities: 5, score: 5 },
    { keyword: "recent", identities: 5, score: 3 },
  ]);
  expect(await db.prepare("SELECT status FROM search_job_runs").first()).toEqual({
    status: "succeeded",
  });
  const cost = await db
    .prepare("SELECT rows_read,rows_written,processed,published FROM search_job_runs")
    .first();
  expect(cost).toMatchSnapshot();
});

test("minimum identities, stable ties, review rules and manual operation with cron disabled", async () => {
  for (let i = 1; i <= 5; i++) {
    await contribution("alpha", "2026-11-27", i);
    await contribution("bravo", "2026-11-27", i);
    await contribution("blocked", "2026-11-27", i);
    if (i < 5) await contribution("small", "2026-11-27", i);
  }
  await db
    .prepare(
      "INSERT INTO search_keyword_rules(pattern,match_mode,status,enabled,updated_at) VALUES('block','contains','pending',1,?)",
    )
    .bind(now)
    .run();
  await db
    .prepare("UPDATE search_settings SET value=? WHERE id=1")
    .bind(JSON.stringify({ ...defaultSettings, jobs: false, publication: true }))
    .run();
  expect((await refreshSearchPublication(deps(), "cron")).status).toBe("disabled");
  expect((await refreshSearchPublication(deps(), "manual")).status).toBe("succeeded");
  expect((await readPublishedSearches(db, kv, true))?.items.map((i) => i.keyword)).toEqual([
    "alpha",
    "bravo",
  ]);
});
test("cold start is explicitly recommended; hidden/blacklist/pending rules revoke cached lists", async () => {
  await refreshSearchPublication(deps(), "manual");
  expect((await readPublishedSearches(db, kv, true))?.type).toBe("recommended");
  await db
    .prepare(
      "INSERT INTO search_keyword_rules(pattern,match_mode,status,enabled,updated_at) VALUES('推荐资源','exact','hidden',1,?)",
    )
    .bind(now)
    .run();
  expect(await readPublishedSearches(db, kv, true)).toBeNull();
  await refreshSearchPublication(deps(), "manual");
  expect((await readPublishedSearches(db, kv, true))?.items).toEqual([]);
});
test("concurrent cron/manual runs use one atomic lease", async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let entered: () => void = () => undefined;
  const enteredPromise = new Promise<void>((r) => {
    entered = r;
  });
  const first = refreshSearchPublication(
    {
      ...deps(),
      recommended: async () => {
        entered();
        await gate;
        return ["推荐资源"];
      },
    },
    "cron",
  );
  await enteredPromise;
  expect((await refreshSearchPublication(deps(), "manual")).status).toBe("busy");
  release();
  expect((await first).status).toBe("succeeded");
});
test("cache failure preserves previous pointer and invalid payload fails closed", async () => {
  await refreshSearchPublication(deps(), "manual");
  const old = await db.prepare("SELECT publication_key FROM search_control").first();
  const faulty = new Proxy(kv, {
    get(target, key) {
      if (key === "put")
        return async () => {
          throw new Error("cache unavailable");
        };
      return Reflect.get(target, key);
    },
  });
  expect((await refreshSearchPublication({ ...deps(), cache: faulty }, "manual")).status).toBe(
    "failed",
  );
  expect(await db.prepare("SELECT publication_key FROM search_control").first()).toEqual(old);
  for (const key of values.keys()) values.set(key, "{}");
  expect(await readPublishedSearches(db, kv, true)).toBeNull();
});
test("revision change during cache read is caught by the final primary check", async () => {
  await refreshSearchPublication(deps(), "manual");
  const racing = new Proxy(kv, {
    get(target, key) {
      if (key === "get")
        return async (name: string) => {
          await db.prepare("UPDATE search_settings SET version=version+1").run();
          return values.get(name) ?? null;
        };
      return Reflect.get(target, key);
    },
  });
  expect(await readPublishedSearches(db, racing, true)).toBeNull();
});

test("cleanup failure is recorded without undoing an already published valid snapshot", async () => {
  const fault = new Proxy(db, {
    get(target, key) {
      if (key === "prepare")
        return (sql: string) => {
          if (sql.startsWith("DELETE FROM search_daily_stats"))
            throw new Error("cleanup unavailable");
          return target.prepare(sql);
        };
      if (key === "batch") return target.batch.bind(target);
      return Reflect.get(target, key);
    },
  });
  const outcome = await refreshSearchPublication({ ...deps(), db: fault }, "manual");
  expect(outcome).toMatchObject({ status: "failed", published: true, reason: "cleanup" });
  expect(await db.prepare("SELECT status,reason,published FROM search_job_runs").first()).toEqual({
    status: "failed",
    reason: "cleanup",
    published: 1,
  });
  expect((await readPublishedSearches(db, kv, true))?.type).toBe("recommended");
});

test("expired lease is recovered and an old runner cannot overwrite its superseded status", async () => {
  let clock = now;
  let release: () => void = () => undefined;
  let entered: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const ready = new Promise<void>((r) => {
    entered = r;
  });
  const first = refreshSearchPublication(
    {
      ...deps(),
      now: () => clock,
      recommended: async () => {
        entered();
        await gate;
        return ["旧推荐"];
      },
    },
    "cron",
  );
  await ready;
  clock += 120001;
  expect((await refreshSearchPublication({ ...deps(), now: () => clock }, "manual")).status).toBe(
    "succeeded",
  );
  release();
  expect((await first).status).toBe("failed");
  expect(
    (await db.prepare("SELECT status FROM search_job_runs ORDER BY fence").all()).results,
  ).toEqual([{ status: "superseded" }, { status: "succeeded" }]);
  expect((await readPublishedSearches(db, kv, true))?.items[0]?.keyword).toBe("推荐资源");
});

test("cleanup drains more than one batch and keeps the retention boundary", async () => {
  await db
    .prepare("UPDATE search_settings SET value=? WHERE id=1")
    .bind(
      JSON.stringify({
        ...defaultSettings,
        jobs: true,
        publication: true,
        cleanupBatch: 10,
        dailyBudget: 100,
        sessionIssuesPerDay: 100,
        verificationsPerDay: 10,
      }),
    )
    .run();
  for (let i = 1; i <= 25; i++) await contribution("expired", "2026-11-20", i);
  await contribution("retained", "2026-11-21", 1);
  await refreshSearchPublication(deps(), "manual");
  expect((await db.prepare("SELECT keyword FROM search_daily_identities").all()).results).toEqual([
    { keyword: "retained" },
  ]);
});

test("publication can be disabled independently while scheduled retention still runs", async () => {
  expect(
    SearchSettings.safeParse({ ...defaultSettings, aggregateRetentionDays: 7, windowDays: 7 })
      .success,
  ).toBe(false);
  await db
    .prepare("UPDATE search_settings SET value=? WHERE id=1")
    .bind(JSON.stringify({ ...defaultSettings, jobs: true, publication: false }))
    .run();
  await contribution("expired", "2026-11-20", 1);
  for (const day of ["2026-08-30", "2026-08-31"])
    await db
      .prepare(
        "INSERT INTO search_daily_stats(day,keyword,display_keyword,source,locale,updated_at) VALUES(?,'retention','retention','bot','zh',?)",
      )
      .bind(day, now)
      .run();
  expect(
    await refreshSearchPublication(
      {
        ...deps(),
        recommended: async () => {
          throw new Error("must not query recommendations");
        },
      },
      "cron",
    ),
  ).toMatchObject({ status: "succeeded", published: false });
  expect(values.size).toBe(0);
  expect((await db.prepare("SELECT keyword FROM search_daily_identities").all()).results).toEqual(
    [],
  );
  expect((await db.prepare("SELECT day FROM search_daily_stats").all()).results).toEqual([
    { day: "2026-08-31" },
  ]);
});

test("a later D1 failure rolls back both the authority pointer and private ranking snapshot", async () => {
  await refreshSearchPublication(deps(), "manual");
  const old = await db.prepare("SELECT publication_key FROM search_control").first();
  let fail = true;
  const fault = new Proxy(db, {
    get(target, key) {
      if (key === "prepare") return target.prepare.bind(target);
      if (key === "batch")
        return async (statements: D1PreparedStatement[]) => {
          if (fail) {
            fail = false;
            return target.batch([
              ...statements,
              target.prepare("SELECT invalid_column FROM missing_publication_table"),
            ]);
          }
          return target.batch(statements);
        };
      return Reflect.get(target, key);
    },
  });
  expect((await refreshSearchPublication({ ...deps(), db: fault }, "manual")).status).toBe(
    "failed",
  );
  expect(await db.prepare("SELECT publication_key FROM search_control").first()).toEqual(old);
  expect(
    await db
      .prepare(
        "SELECT published,ranking_json,status FROM search_job_runs ORDER BY fence DESC LIMIT 1",
      )
      .first(),
  ).toEqual({ published: 0, ranking_json: "[]", status: "failed" });
});

test("safety filtering precedes Top6 truncation, including legacy approved unsafe contributions", async () => {
  for (let word = 0; word < 6; word++) {
    const keyword = `广告合作${word}`;
    await db
      .prepare(
        "INSERT INTO search_keyword_rules(pattern,match_mode,status,enabled,updated_at) VALUES(?,'exact','approved',1,?)",
      )
      .bind(keyword, now)
      .run();
    for (let id = 1; id <= 6; id++) await contribution(keyword, "2026-11-27", id);
  }
  for (let word = 0; word < 7; word++)
    for (let id = 1; id <= 5; id++) await contribution(`alpha${word}`, "2026-11-27", id);
  await refreshSearchPublication(deps(), "manual");
  expect((await readPublishedSearches(db, kv, true))?.items.map((i) => i.keyword)).toEqual([
    "alpha0",
    "alpha1",
    "alpha2",
    "alpha3",
    "alpha4",
    "alpha5",
  ]);
});

test("lost lease cannot publish and retention keeps exactly eight identity dates including today", async () => {
  await contribution("expired", "2026-11-20", 1);
  await contribution("retained", "2026-11-21", 1);
  await refreshSearchPublication(deps(), "manual");
  expect(await db.prepare("SELECT keyword FROM search_daily_identities").all()).toMatchObject({
    results: [{ keyword: "retained" }],
  });
  const original = await db.prepare("SELECT publication_key FROM search_control").first();
  const lost = new Proxy(kv, {
    get(target, key) {
      if (key === "put")
        return async (name: string, value: string) => {
          await db
            .prepare(
              "UPDATE search_control SET lease_token='new-owner',fence=fence+1,lease_until=?",
            )
            .bind(now + 120000)
            .run();
          await target.put(name, value);
        };
      return Reflect.get(target, key);
    },
  });
  expect((await refreshSearchPublication({ ...deps(), cache: lost }, "manual")).status).toBe(
    "failed",
  );
  expect(await db.prepare("SELECT publication_key FROM search_control").first()).toEqual(original);
  expect(await db.prepare("SELECT lease_token FROM search_control").first()).toEqual({
    lease_token: "new-owner",
  });
});
