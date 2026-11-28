import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAnalytics } from "../test/reset.ts";
import { AuthenticatedSearch } from "./auth.ts";
import { readAnalyticsJson } from "./boundary.ts";
import { defaultSettings } from "./config.ts";
import { normalizeKeyword } from "./normalize.ts";
import type { AnalyticsDb } from "./runtime.ts";
import { writeSearch } from "./writer.ts";

const db = env.ANALYTICS_DB,
  secret = "local-test-secret".repeat(3),
  now = Date.parse("2026-11-28T02:00:00Z");
const event = () => ({
  version: 1,
  eventId: crypto.randomUUID(),
  keyword: "Telegram 中文",
  trigger: "manual",
  reportedResult: "results",
  locale: "zh",
});
const deps = (extra = {}) => ({
  db,
  secret,
  enabled: true,
  now: () => now,
  verifyResult: async () => true,
  observe: vi.fn(),
  ...extra,
});
async function settings(extra = {}) {
  await db
    .prepare("UPDATE search_settings SET version=version+1,value=? WHERE id=1")
    .bind(
      JSON.stringify({
        ...defaultSettings,
        enabled: true,
        website: true,
        miniapp: true,
        bot: true,
        challengePolicy: "off",
        ...extra,
      }),
    )
    .run();
}
async function scalar(sql: string) {
  return db.prepare(sql).first<number>("n");
}
async function miniUser(id: number) {
  const params = new URLSearchParams({
    auth_date: String(now / 1000),
    user: JSON.stringify({ id, first_name: "tester" }),
  });
  const raw = async (key: Uint8Array, data: string) =>
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await crypto.subtle.importKey(
          "raw",
          new Uint8Array(key),
          { name: "HMAC", hash: "SHA-256" },
          false,
          ["sign"],
        ),
        new TextEncoder().encode(data),
      ),
    );
  const data = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const seed = await raw(new TextEncoder().encode("WebAppData"), "bot-token");
  params.set(
    "hash",
    [...(await raw(seed, data))].map((b) => b.toString(16).padStart(2, "0")).join(""),
  );
  return {
    params,
    auth: await AuthenticatedSearch.miniapp(
      secret,
      "bot-token",
      params.toString(),
      "127.0.0.1",
      now,
    ),
  };
}
beforeEach(async () => {
  await resetAnalytics();
  await settings();
});

describe("normalization and private data", () => {
  it("folds Unicode, case, whitespace and traditional characters without translating English", () => {
    expect(normalizeKeyword(" ＴＧ  頻道\t資源 ")).toEqual({
      ok: true,
      value: { keyword: "tg 频道 资源", display: "TG 頻道 資源", review: false },
    });
    expect(normalizeKeyword("频道资源").ok).toBe(true);
    expect(normalizeKeyword("@Channel20261128").ok).toBe(true);
    expect(normalizeKeyword("https://t.me/Channel123").ok).toBe(true);
  });
  it("blocks private contacts, credentials, private invites, XSS and hidden controls", () => {
    for (const word of [
      "name@example.com",
      "+86 138 1234 5678",
      "token=secret",
      "sk-abcdefghijklmnop",
      "t.me/+PrivateInvite",
      "<script>alert(1)</script>",
      "hello\u0000world",
      "sk-\u200bhidden",
      "192.168.1.1",
    ])
      expect(normalizeKeyword(word).ok, word).toBe(false);
  });
});
describe("Mini App identity boundary", () => {
  it("verifies Telegram signature and expiry, shares Bot identity and rejects duplicate auth fields", async () => {
    const { params, auth } = await miniUser(123);
    expect(auth?.identity).toBe((await AuthenticatedSearch.bot(secret, 123, now)).identity);
    expect(
      await AuthenticatedSearch.miniapp(secret, "wrong", params.toString(), "127.0.0.1", now),
    ).toBeNull();
    expect(
      await AuthenticatedSearch.miniapp(
        secret,
        "bot-token",
        params.toString(),
        "127.0.0.1",
        now + 86401000,
      ),
    ).toBeNull();
    params.append("auth_date", "0");
    expect(
      await AuthenticatedSearch.miniapp(secret, "bot-token", params.toString(), "127.0.0.1", now),
    ).toBeNull();
  });
});
describe("atomic event ingestion", () => {
  it("serializes concurrent retries into one receipt, budget charge and contribution", async () => {
    const auth = await AuthenticatedSearch.bot(secret, 1, now),
      input = event();
    const reports = await Promise.all(
      Array.from({ length: 12 }, () => writeSearch(deps(), input, auth)),
    );
    expect(reports.filter((r) => r.outcome.status === "accepted")).toHaveLength(1);
    expect(reports.filter((r) => r.outcome.status === "duplicate")).toHaveLength(11);
    expect(await scalar("SELECT sum(searches) n FROM search_daily_stats")).toBe(1);
    expect(await scalar("SELECT count(*) n FROM search_event_receipts")).toBe(1);
    expect(await scalar("SELECT count n FROM search_rate_limits WHERE scope='global'")).toBe(1);
    console.log(
      "analytics first accepted meta",
      reports.find((r) => r.outcome.status === "accepted")?.usage,
    );
  }, 30000);
  it("rejects event ID reuse with a different payload without writes", async () => {
    const auth = await AuthenticatedSearch.bot(secret, 1, now),
      input = event();
    await writeSearch(deps(), input, auth);
    const next = await writeSearch(deps(), { ...input, keyword: "other keyword" }, auth);
    expect(next.outcome).toEqual({ status: "rejected", reason: "conflict" });
    expect(next.usage.rowsWritten).toBe(0);
  });
  it("enforces the strict global budget across different identities under concurrency", async () => {
    await settings({ dailyBudget: 3 });
    const reports = await Promise.all(
      Array.from({ length: 12 }, async (_, i) =>
        writeSearch(deps(), event(), await AuthenticatedSearch.bot(secret, i + 1, now)),
      ),
    );
    expect(reports.filter((r) => r.outcome.status === "accepted")).toHaveLength(3);
    expect(await scalar("SELECT sum(searches) n FROM search_daily_stats")).toBe(3);
    expect(
      reports
        .filter((r) => r.outcome.status === "rejected")
        .every((r) => r.usage.rowsWritten === 0),
    ).toBe(true);
    console.log(
      "analytics full-budget rejection meta",
      reports.find((r) => r.outcome.status === "rejected")?.usage,
    );
  }, 30000);
  it("deduplicates Telegram ranking contributions and rate limits across Mini App/Bot and locale", async () => {
    await settings({ telegramPerDay: 2 });
    const bot = await AuthenticatedSearch.bot(secret, 123, now),
      mini = (await miniUser(123)).auth;
    if (!mini) throw new Error("Test authentication failed");
    expect((await writeSearch(deps(), event(), bot)).outcome.status).toBe("accepted");
    expect((await writeSearch(deps(), { ...event(), locale: "en" }, mini)).outcome.status).toBe(
      "accepted",
    );
    expect(await scalar("SELECT sum(eligible_identities) n FROM search_daily_stats")).toBe(1);
    expect(await scalar("SELECT sum(eligible) n FROM search_daily_identities")).toBe(1);
    expect(
      await scalar(
        "SELECT identity_days n FROM search_daily_totals WHERE source='all' AND locale='all'",
      ),
    ).toBe(1);
    expect((await writeSearch(deps(), event(), bot)).outcome).toEqual({
      status: "rejected",
      reason: "limited",
    });
  });
  it("records reported zero, trending, recommended and prefill without granting ranking weight", async () => {
    const auth = await AuthenticatedSearch.bot(secret, 1, now);
    for (const patch of [
      { reportedResult: "zero" },
      { trigger: "trending" },
      { trigger: "recommended" },
      { trigger: "prefill" },
    ])
      expect((await writeSearch(deps(), { ...event(), ...patch }, auth)).outcome.status).toBe(
        "accepted",
      );
    const row = await db
      .prepare(
        "SELECT searches,zero_results,trending_clicks,recommended_clicks,prefill_searches,eligible_identities FROM search_daily_stats",
      )
      .first();
    expect(row).toEqual({
      searches: 4,
      zero_results: 1,
      trending_clicks: 1,
      recommended_clicks: 1,
      prefill_searches: 1,
      eligible_identities: 0,
    });
  });
  it("withholds unverified client results and fails isolated when FTS verification throws", async () => {
    const observer = vi.fn(),
      auth = await AuthenticatedSearch.bot(secret, 1, now);
    expect(
      (
        await writeSearch(
          deps({
            verifyResult: async () => {
              throw new Error("secret should never be logged");
            },
            observe: observer,
          }),
          event(),
          auth,
        )
      ).outcome.status,
    ).toBe("accepted");
    expect(await scalar("SELECT eligible_identities n FROM search_daily_stats")).toBe(0);
    expect(observer).toHaveBeenCalledWith("verification");
  });
  it("rejects forged identity objects and source fields before touching D1", async () => {
    const auth = await AuthenticatedSearch.bot(secret, 1, now);
    expect((await writeSearch(deps(), { ...event(), source: "bot" }, auth)).usage.rowsRead).toBe(0);
    // Prototype copy still cannot recreate the server-only WeakSet capability.
    const forged: AuthenticatedSearch = Object.assign(
      Object.create(Object.getPrototypeOf(auth)),
      auth,
    );
    expect((await writeSearch(deps(), event(), forged)).outcome).toEqual({
      status: "rejected",
      reason: "invalid",
    });
  });
  it("blacklist prevents stats, hidden rules preserve stats but remove eligibility, approved cannot override privacy", async () => {
    const auth = await AuthenticatedSearch.bot(secret, 1, now);
    await db
      .prepare(
        "INSERT INTO search_keyword_rules(pattern,match_mode,status,updated_at) VALUES('telegram','contains','hidden',1)",
      )
      .run();
    await writeSearch(deps(), event(), auth);
    expect(await scalar("SELECT eligible_identities n FROM search_daily_stats")).toBe(0);
    await db.prepare("UPDATE search_keyword_rules SET status='blacklist'").run();
    expect((await writeSearch(deps(), event(), auth)).outcome).toEqual({
      status: "rejected",
      reason: "blocked",
    });
    expect(
      (await writeSearch(deps(), { ...event(), keyword: "secret=abc" }, auth)).outcome,
    ).toEqual({ status: "rejected", reason: "private" });
  });
  it("detects burst growth, marks pending and invalidates the publication revision", async () => {
    await settings({ anomalyIdentitiesPerMinute: 10 });
    for (let i = 1; i <= 11; i++)
      expect(
        (await writeSearch(deps(), event(), await AuthenticatedSearch.bot(secret, i, now))).outcome
          .status,
      ).toBe("accepted");
    expect(await db.prepare("SELECT status FROM search_keyword_rules").first("status")).toBe(
      "pending",
    );
    expect(await scalar("SELECT sum(eligible_identities) n FROM search_daily_stats")).toBe(10);
    expect(
      await db.prepare("SELECT rules_revision FROM search_control").first("rules_revision"),
    ).toBe(2);
  }, 30000);
  it("rolls back receipt, budgets and all aggregates on a later batch error", async () => {
    const failing: AnalyticsDb = {
      prepare: (s) => db.prepare(s),
      batch<T>(statements: D1PreparedStatement[]) {
        return db.batch<T>([...statements, db.prepare("UPDATE search_settings SET version=0")]);
      },
    };
    const report = await writeSearch(
      deps({ db: failing }),
      event(),
      await AuthenticatedSearch.bot(secret, 1, now),
    );
    expect(report.outcome.status).toBe("unavailable");
    expect(await scalar("SELECT count(*) n FROM search_event_receipts")).toBe(0);
    expect(await scalar("SELECT count(*) n FROM search_rate_limits")).toBe(0);
    expect(await scalar("SELECT count(*) n FROM search_daily_stats")).toBe(0);
  });
  it("does not commit a candidate verified under a stale config or moderation version", async () => {
    const auth = await AuthenticatedSearch.bot(secret, 1, now);
    const report = await writeSearch(
      deps({
        verifyResult: async () => {
          await settings({ enabled: false });
          return true;
        },
      }),
      event(),
      auth,
    );
    expect(report.outcome).toEqual({ status: "rejected", reason: "conflict" });
    expect(await scalar("SELECT count(*) n FROM search_daily_stats")).toBe(0);
  });
  it("binds SQL-looking keywords as data instead of executing SQL", async () => {
    expect(
      (
        await writeSearch(
          deps(),
          { ...event(), keyword: "x' OR 1=1 --" },
          await AuthenticatedSearch.bot(secret, 1, now),
        )
      ).outcome.status,
    ).toBe("accepted");
    expect(await scalar("SELECT count(*) n FROM search_settings")).toBe(1);
  });
});
describe("HTTP parsing limits", () => {
  const origins = new Set(["https://tgsearch.app"]);
  const request = (body: string, extra: Record<string, string> = {}) =>
    new Request("https://tgsearch.app/api/search-event", {
      method: "POST",
      headers: { Origin: "https://tgsearch.app", "Content-Type": "application/json", ...extra },
      body,
    });
  it("enforces method, exact origin, media type and actual stream length", async () => {
    await expect(readAnalyticsJson(request('{"ok":true}'), origins)).resolves.toEqual({ ok: true });
    for (const r of [
      request("{}", { Origin: "https://evil.test" }),
      request("{}", { "Content-Type": "text/plain" }),
      request("x".repeat(1025)),
      request("{}", { "Content-Length": "1025" }),
      new Request("https://tgsearch.app"),
    ])
      await expect(readAnalyticsJson(r, origins)).rejects.toThrow();
  });
});
