import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { resetAnalytics } from "../test/reset.ts";
import { changeSearchAdmin, readSearchAdmin } from "./admin.ts";
import { AdminSearchCommand } from "./admin-contracts.ts";
import { defaultSettings } from "./config.ts";
import { readPublishedSearches, refreshSearchPublication } from "./publication.ts";
import { beijingDay, DAY_MS } from "./time.ts";

const db = env.ANALYTICS_DB;
const now = Date.parse("2026-11-28T12:00:00+08:00");
const actor = "a".repeat(64);
const values = new Map<string, string>();
const cache = {
  get: async (key: string) => values.get(key) ?? null,
  put: async (key: string, value: string) => {
    values.set(key, value);
  },
};
const query = (view: string, extra: Record<string, unknown> = {}) => ({
  version: 1,
  view,
  from: "2026-11-22",
  to: "2026-11-28",
  ...extra,
});
const settings = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  action: "settings",
  expectedVersion: 1,
  value: { ...defaultSettings, ...extra },
});
const rule = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  action: "rule",
  id: 0,
  expectedRevision: 0,
  pattern: "臺灣",
  match: "exact",
  status: "hidden",
  enabled: true,
  ...extra,
});
const refresh = () =>
  refreshSearchPublication(
    { db, cache, enabled: true, now: () => now, recommended: async () => ["臺灣", "文档"] },
    "manual",
  );
beforeEach(async () => {
  await resetAnalytics();
  values.clear();
});

async function seed() {
  await db.batch([
    db.prepare(
      "INSERT INTO search_daily_stats(day,keyword,display_keyword,source,locale,searches,results,zero_results,updated_at) VALUES('2026-11-27','alpha','Alpha','website','en',10,8,2,0),('2026-11-28','alpha','Alpha','bot','zh',5,5,0,0),('2026-11-28','bravo','Bravo','website','zh',7,0,7,0)",
    ),
    db.prepare(
      "INSERT INTO search_daily_totals(day,source,locale,searches,results,zero_results,identity_days) VALUES('2026-11-27','all','all',10,8,2,1),('2026-11-28','all','all',12,5,7,1),('2026-11-27','website','all',10,8,2,1),('2026-11-28','bot','all',5,5,0,1),('2026-11-28','website','all',7,0,7,1),('2026-11-27','all','en',10,8,2,1),('2026-11-28','all','zh',12,5,7,1)",
    ),
    ...["2026-11-27", "2026-11-28"].map((day) =>
      db
        .prepare(
          "INSERT INTO search_identity_days(day,identity,source,locale) VALUES(?,?,'all','all')",
        )
        .bind(day, actor),
    ),
    db
      .prepare(
        "INSERT INTO search_daily_identities(day,keyword,identity,source,locale,eligible,last_seen_at) VALUES('2026-11-27','alpha',?,'website','en',0,?),('2026-11-28','alpha',?,'bot','zh',0,?)",
      )
      .bind(actor, now, actor, now),
  ]);
}

test("overview distinguishes retained unique identities from identity-days; windows and distributions", async () => {
  await seed();
  const view = await readSearchAdmin(db, cache, query("overview"), now);
  expect(view.kind).toBe("overview");
  if (view.kind !== "overview") throw new Error("view");
  expect(
    view.cards.map((c) => [c.label, c.searches, c.identities, c.identityDays, c.keywords]),
  ).toEqual([
    ["今日", 12, 1, 1, 2],
    ["昨日", 10, 1, 1, 1],
    ["7天", 22, 1, 2, 2],
    ["30天", 22, null, 2, 2],
    ["90天", 22, null, 2, 2],
  ]);
  expect(view.sources).toEqual([
    { source: "bot", searches: 5 },
    { source: "website", searches: 17 },
  ]);
  expect(view.languages).toEqual([
    { locale: "en", searches: 10 },
    { locale: "zh", searches: 12 },
  ]);
  expect(view.identityStart).toBe("2026-11-21");
  expect(view.usage.rowsWritten).toBe(0);
});

test("keywords support stable pagination, source/language, zero result and safe parameterized search", async () => {
  await seed();
  const first = await readSearchAdmin(db, cache, query("keywords", { size: 1 }), now);
  if (first.kind !== "keywords") throw new Error("view");
  expect(first.total).toBe(2);
  expect(first.rows[0]).toMatchObject({
    keyword: "alpha",
    searches: 15,
    identities: 1,
    zero_results: 2,
  });
  const second = await readSearchAdmin(db, cache, query("keywords", { size: 1, page: 1 }), now);
  if (second.kind !== "keywords") throw new Error("view");
  expect(second.rows[0]?.keyword).toBe("bravo");
  const filtered = await readSearchAdmin(
    db,
    cache,
    query("keywords", { source: "website", locale: "en" }),
    now,
  );
  if (filtered.kind !== "keywords") throw new Error("view");
  expect(filtered.total).toBe(1);
  expect(filtered.rows[0]?.searches).toBe(10);
  const zero = await readSearchAdmin(db, cache, query("zero"), now);
  if (zero.kind !== "keywords") throw new Error("view");
  expect(zero.rows.map((r) => r.keyword)).toEqual(["bravo", "alpha"]);
  const injected = await readSearchAdmin(
    db,
    cache,
    query("keywords", { search: "aa' OR 1=1 --" }),
    now,
  );
  if (injected.kind !== "keywords") throw new Error("view");
  expect(injected.rows).toEqual([]);
  expect(first.usage.rowsWritten).toBe(0);
  const spaces = await readSearchAdmin(db, cache, query("keywords", { search: "   " }), now);
  if (spaces.kind !== "keywords") throw Error("view");
  expect(spaces.total).toBe(2);
});

test("90 day keyword view cannot claim complete unique identities or read expired facts", async () => {
  await seed();
  const view = await readSearchAdmin(db, cache, query("keywords", { from: "2026-09-01" }), now);
  if (view.kind !== "keywords") throw new Error("view");
  expect(view.rows.every((r) => r.identities === null)).toBe(true);
  await changeSearchAdmin(db, settings({ aggregateRetentionDays: 8 }), actor, now);
  await db
    .prepare(
      "INSERT INTO search_daily_stats(day,keyword,display_keyword,source,locale,searches,results,updated_at) VALUES('2026-10-01','expired','expired','bot','en',1,1,0)",
    )
    .run();
  const limited = await readSearchAdmin(db, cache, query("keywords", { from: "2026-09-01" }), now);
  if (limited.kind !== "keywords") throw new Error("view");
  expect(limited.retainedFrom).toBe("2026-11-21");
  expect(limited.total).toBe(2);
});

test("settings concurrent CAS accepts exactly one write and one audit; maxima are paid-tier compatible", async () => {
  const results = await Promise.allSettled([
    changeSearchAdmin(db, settings({ dailyBudget: 100000, cleanupBatch: 1000 }), actor, now),
    changeSearchAdmin(db, settings({ dailyBudget: 20000, cleanupBatch: 200 }), actor, now),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.prepare("SELECT version FROM search_settings").first("version")).toBe(2);
  expect(await db.prepare("SELECT COUNT(*) n FROM search_admin_audit").first("n")).toBe(1);
  expect(AdminSearchCommand.safeParse(settings({ dailyBudget: 100001 })).success).toBe(false);
  expect(AdminSearchCommand.safeParse(settings({ identityRetentionDays: 7 })).success).toBe(false);
  expect(AdminSearchCommand.safeParse(settings({ weights: [0.3, 0.6, 1] })).success).toBe(false);
});

test("rule create/update normalize and fence revisions; conflicts do not create audit or duplicate rule", async () => {
  await changeSearchAdmin(db, rule(), actor, now);
  const row = await db
    .prepare("SELECT id,revision,pattern FROM search_keyword_rules")
    .first<{ id: number; revision: number; pattern: string }>();
  if (!row) throw new Error("missing");
  expect(row.pattern).toBe("台湾");
  const update = rule({ id: row.id, expectedRevision: 1, status: "blacklist" });
  const results = await Promise.allSettled([
    changeSearchAdmin(db, update, actor, now),
    changeSearchAdmin(db, update, actor, now),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  await expect(changeSearchAdmin(db, rule(), actor, now)).rejects.toThrow("冲突");
  expect(await db.prepare("SELECT COUNT(*) n FROM search_admin_audit").first("n")).toBe(2);
  const list = await readSearchAdmin(
    db,
    cache,
    query("rules", { ruleStatus: "blacklist", search: "臺灣" }),
    now,
  );
  if (list.kind !== "rules") throw new Error("view");
  expect(list.total).toBe(1);
  expect(list.rows[0]?.revision).toBe(2);
});

test("audit SQL failure rolls back rule mutation and moderation revision", async () => {
  await db
    .prepare(
      "CREATE TRIGGER test_audit_abort BEFORE INSERT ON search_admin_audit BEGIN SELECT RAISE(ABORT,'test'); END",
    )
    .run();
  try {
    await expect(changeSearchAdmin(db, rule(), actor, now)).rejects.toThrow();
    expect(await db.prepare("SELECT COUNT(*) n FROM search_keyword_rules").first("n")).toBe(0);
    expect(
      await db.prepare("SELECT rules_revision FROM search_control").first("rules_revision"),
    ).toBe(1);
  } finally {
    await db.prepare("DROP TRIGGER test_audit_abort").run();
  }
});

test("enabled and disabled rules share a hard capacity; unsafe/private rule text is not persisted", async () => {
  await expect(
    changeSearchAdmin(db, rule({ pattern: "person@example.com" }), actor, now),
  ).rejects.toThrow("安全");
  await expect(
    changeSearchAdmin(db, rule({ pattern: "<script>alert(1)</script>" }), actor, now),
  ).rejects.toThrow("安全");
  await db.batch(
    Array.from({ length: 500 }, (_, i) =>
      db
        .prepare(
          "INSERT INTO search_keyword_rules(pattern,match_mode,status,enabled,updated_at) VALUES(?,'exact','hidden',0,?)",
        )
        .bind(`word ${i}`, now),
    ),
  );
  await expect(changeSearchAdmin(db, rule(), actor, now)).rejects.toThrow("上限");
  expect(await db.prepare("SELECT COUNT(*) n FROM search_admin_audit").first("n")).toBe(0);
});

test("rule/config changes immediately revoke old public KV; manual refresh safely excludes hidden words", async () => {
  await changeSearchAdmin(db, settings({ publication: true }), actor, now);
  await refresh();
  expect((await readPublishedSearches(db, cache, true))?.items[0]?.keyword).toBe("臺灣");
  await changeSearchAdmin(db, rule(), actor, now);
  expect(await readPublishedSearches(db, cache, true)).toBeNull();
  await refresh();
  expect((await readPublishedSearches(db, cache, true))?.items.map((r) => r.keyword)).toEqual([
    "文档",
  ]);
  await changeSearchAdmin(db, { ...settings(), expectedVersion: 2 }, actor, now);
  expect(await readPublishedSearches(db, cache, true)).toBeNull();
});

test("admin publication shows the exact published private score snapshot without exposing identities", async () => {
  await seed();
  await changeSearchAdmin(db, settings({ publication: true }), actor, now);
  await db.batch(
    Array.from({ length: 5 }, (_, i) =>
      db
        .prepare(
          "INSERT INTO search_daily_identities(day,keyword,identity,source,locale,eligible,last_seen_at) VALUES('2026-11-27','alpha',?,'bot','en',1,?)",
        )
        .bind(String(i).padStart(64, "0"), now),
    ),
  );
  await refresh();
  const view = await readSearchAdmin(db, cache, query("publication"), now);
  if (view.kind !== "publication") throw new Error("view");
  expect(view.scores).toEqual([{ keyword: "alpha", score: 5, identities: 5 }]);
  expect(JSON.stringify(view)).not.toContain(actor);
  const words = await readSearchAdmin(db, cache, query("keywords"), now);
  if (words.kind !== "keywords") throw new Error("view");
  expect(words.rows[0]?.published_score).toBe(5);
  expect(words.rows[0]).toMatchObject({ ranking_score: 5, ranking_identities: 5 });
  await changeSearchAdmin(db, rule({ pattern: "alpha" }), actor, now);
  const stale = await readSearchAdmin(db, cache, query("keywords"), now);
  if (stale.kind !== "keywords") throw new Error("view");
  expect(stale.rows[0]?.published_score).toBeNull();
  expect(stale.rows[0]?.ranking_score).toBe(0);
  expect(stale.rows[0]?.review_status).toBe("hidden");
});

test("full 100-keyword page splits rank proofs below D1's parameter limit", async () => {
  await db.batch(
    Array.from({ length: 100 }, (_, i) =>
      db
        .prepare(
          "INSERT INTO search_daily_stats(day,keyword,display_keyword,source,locale,searches,results,updated_at) VALUES('2026-11-28',?,?,'website','en',1,1,?)",
        )
        .bind(`word ${i}`, `word ${i}`, now),
    ),
  );
  const view = await readSearchAdmin(db, cache, query("keywords", { size: 100 }), now);
  if (view.kind !== "keywords") throw new Error("view");
  expect(view.rows).toHaveLength(100);
  expect(view.total).toBe(100);
  expect(view.rows.every((r) => r.ranking_score === 0)).toBe(true);
});

test("security is explicitly sampled and jobs paginate without private ranking/identity payloads", async () => {
  await db
    .prepare(
      "INSERT INTO search_security_daily(day,reason,count,sampled) VALUES('2026-11-28','limited',3,1)",
    )
    .run();
  const safety = await readSearchAdmin(db, cache, query("security"), now);
  if (safety.kind !== "security") throw new Error("view");
  expect(safety.rows).toEqual([{ reason: "limited", count: 3, sampled: 1 }]);
  expect(safety.sampleDenominator).toBe(100);
  await db.batch(
    [1, 2].map((i) =>
      db
        .prepare(
          "INSERT INTO search_job_runs(run_id,kind,status,fence,started_at,finished_at,duration_ms) VALUES(?,'manual','succeeded',?,?,?,0)",
        )
        .bind(`job-${i}`, i, now + i, now + i),
    ),
  );
  const jobs = await readSearchAdmin(db, cache, query("jobs", { size: 1 }), now);
  if (jobs.kind !== "jobs") throw new Error("view");
  expect(jobs.total).toBe(2);
  expect(jobs.rows[0]?.run_id).toBe("job-2");
  expect(jobs.rows[0]).not.toHaveProperty("ranking_json");
  await changeSearchAdmin(db, rule(), actor, now);
  const audit = await readSearchAdmin(db, cache, query("jobs"), now);
  if (audit.kind !== "jobs") throw new Error("view");
  expect(audit.audits[0]).toMatchObject({ action: "rule", target: "台湾" });
  expect(audit.audits[0]).not.toHaveProperty("actor");
  expect(audit.audits[0]).not.toHaveProperty("payload");
});

test("bounded input rejects invalid dates, future/range, injected sorting and identity fields", async () => {
  for (const bad of [
    { from: "2026-01-01" },
    { to: "2026-11-29" },
    { from: "2026-11-28", to: "2026-11-27" },
    { from: "2026-02-30" },
    { size: 101 },
    { page: 1000 },
    { sort: "searches;DROP TABLE search_settings" },
    { identity: actor },
  ])
    await expect(readSearchAdmin(db, cache, query("keywords", bad), now)).rejects.toThrow();
  await expect(changeSearchAdmin(db, rule(), "tg:123", now)).rejects.toThrow("审计");
});

test("manual refresh audit requires current settings and never writes on stale version", async () => {
  await changeSearchAdmin(db, { version: 1, action: "refresh", expectedVersion: 1 }, actor, now);
  await expect(
    changeSearchAdmin(db, { version: 1, action: "refresh", expectedVersion: 2 }, actor, now),
  ).rejects.toThrow("变化");
  expect(await db.prepare("SELECT COUNT(*) n FROM search_admin_audit").first("n")).toBe(1);
});

test("90 day indexed admin reads remain write-free and record resource baselines", async () => {
  for (let age = 0; age < 90; age++) {
    const day = beijingDay(now - age * DAY_MS);
    await db.batch([
      ...Array.from({ length: 10 }, (_, i) =>
        db
          .prepare(
            "INSERT INTO search_daily_stats(day,keyword,display_keyword,source,locale,searches,results,updated_at) VALUES(?,?,?,'website','en',1,1,?)",
          )
          .bind(day, `word ${i}`, `word ${i}`, now),
      ),
      db
        .prepare(
          "INSERT INTO search_daily_totals(day,source,locale,searches,results,identity_days) VALUES(?,'all','all',10,10,10)",
        )
        .bind(day),
      ...(age < 8
        ? Array.from({ length: 10 }, (_, i) =>
            db
              .prepare(
                "INSERT INTO search_identity_days(day,identity,source,locale) VALUES(?,?,'all','all')",
              )
              .bind(day, String(i).padStart(64, "0")),
          )
        : []),
    ]);
  }
  const overview = await readSearchAdmin(db, cache, query("overview", { from: "2026-08-31" }), now);
  const keywords = await readSearchAdmin(db, cache, query("keywords", { from: "2026-08-31" }), now);
  if (overview.kind !== "overview" || keywords.kind !== "keywords") throw new Error("view");
  expect(overview.cards[4]).toMatchObject({
    searches: 900,
    identityDays: 900,
    identities: null,
    keywords: 10,
  });
  expect(keywords.total).toBe(10);
  expect({ overview: overview.usage, keywords: keywords.usage }).toMatchSnapshot();
  const mutation = await changeSearchAdmin(db, settings(), actor, now);
  expect(mutation.usage).toMatchSnapshot();
});
