import { applyD1Migrations, type D1Migration } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { createDb, insertApprovedEntry } from "@tgbox/db";
import { collectBotSearch, defaultSettings } from "@tgbox/search-analytics";
import { beforeAll, beforeEach, expect, test, vi } from "vitest";
import { searchAnalyticsApi } from "../src/lib/search-analytics-api.ts";
import { BOT_TOKEN, initData } from "./init-data.ts";

declare global {
  namespace Cloudflare {
    interface Env {
      ANALYTICS_DB: D1Database;
      DB: D1Database;
      CORE_MIGRATIONS: D1Migration[];
      ANALYTICS_MIGRATIONS: D1Migration[];
    }
  }
}
const limiter = { limit: vi.fn(async () => ({ success: true })) };
const runtime = {
  ...env,
  BOT_TOKEN,
  SEARCH_ANALYTICS_ENABLED: "1",
  SEARCH_WEBSITE_ENABLED: "1",
  SEARCH_MINIAPP_ENABLED: "1",
  SEARCH_IDENTITY_SECRET: "identity-secret".repeat(4),
  SEARCH_SESSION_SECRET: "session-secret".repeat(4),
  SEARCH_ALLOWED_ORIGINS: "https://tgbox.test",
  SEARCH_RATE_LIMITER: limiter,
};
const body = () => ({
  version: 1,
  eventId: crypto.randomUUID(),
  keyword: "科技",
  trigger: "manual",
  reportedResult: "results",
  locale: "zh",
});
const request = (value: unknown, headers: Record<string, string> = {}) =>
  new Request("https://tgbox.test/api/search-event", {
    method: "POST",
    headers: {
      Origin: "https://tgbox.test",
      "Content-Type": "application/json",
      "CF-Connecting-IP": "192.0.2.5",
      ...headers,
    },
    body: JSON.stringify(value),
  });
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.CORE_MIGRATIONS);
  await applyD1Migrations(env.ANALYTICS_DB, env.ANALYTICS_MIGRATIONS);
  await env.DB.prepare(
    "INSERT OR IGNORE INTO categories(id,slug,kind,name_zh,name_en,sort) VALUES(1,'tech','channel','科技','Tech',0)",
  ).run();
  await insertApprovedEntry(createDb(env.DB), {
    entry: {
      username: "technology_news",
      title: "科技新闻",
      kind: "channel",
      categoryId: 1,
      listedAt: Date.now(),
    },
    stats: { members: 100, online: null, activityTier: null, statsWrittenAt: Date.now() },
    tagIds: [],
    now: Date.now(),
  });
});
beforeEach(async () => {
  limiter.limit.mockResolvedValue({ success: true });
  await env.ANALYTICS_DB.batch([
    ...[
      "search_daily_stats",
      "search_daily_identities",
      "search_identity_days",
      "search_daily_totals",
      "search_event_receipts",
      "search_rate_limits",
    ].map((t) => env.ANALYTICS_DB.prepare(`DELETE FROM ${t}`)),
    env.ANALYTICS_DB.prepare("UPDATE search_settings SET value=? WHERE id=1").bind(
      JSON.stringify({
        ...defaultSettings,
        enabled: true,
        website: true,
        miniapp: true,
        bot: true,
        challengePolicy: "off",
      }),
    ),
  ]);
});
test("website issues secure cookie and atomically counts a verified search; retries are idempotent", async () => {
  const event = body();
  const result = await searchAnalyticsApi(request(event), runtime, "website", "event");
  expect(result.status).toBe(200);
  expect(await result.json()).toMatchObject({ status: "accepted", debounceMs: 1500 });
  const cookie = result.headers.get("Set-Cookie");
  expect(cookie).toContain("Secure; HttpOnly; SameSite=Lax");
  const retry = await searchAnalyticsApi(
    request(event, { Cookie: cookie?.split(";")[0] ?? "" }),
    runtime,
    "website",
    "event",
  );
  expect(await retry.json()).toMatchObject({ status: "duplicate" });
  expect(
    await env.ANALYTICS_DB.prepare(
      "SELECT searches,eligible_identities FROM search_daily_stats",
    ).first(),
  ).toEqual({ searches: 1, eligible_identities: 1 });
});
test("Mini App requires verified Telegram launch data; rejects a forged source", async () => {
  expect((await searchAnalyticsApi(request(body()), runtime, "miniapp", "event")).status).toBe(401);
  expect(
    (await searchAnalyticsApi(request({ ...body(), source: "bot" }), runtime, "website", "event"))
      .status,
  ).toBe(400);
  expect(
    (
      await searchAnalyticsApi(
        request(body(), { "X-Telegram-Init-Data": initData({ id: 42 }) }),
        runtime,
        "miniapp",
        "event",
      )
    ).status,
  ).toBe(200);
  await collectBotSearch(
    { ...runtime, SEARCH_BOT_ENABLED: "1" },
    {
      telegramUserId: 42,
      inlineQueryId: "query-cross-entry",
      keyword: "科技",
      locale: "en",
      hasResults: true,
      now: Date.now(),
    },
  );
  expect(
    await env.ANALYTICS_DB.prepare(
      "SELECT SUM(searches) searches,SUM(eligible_identities) contributions FROM search_daily_stats",
    ).first(),
  ).toEqual({ searches: 2, contributions: 1 });
});
test("disabled, missing edge protection and edge rejection do not touch D1", async () => {
  const fail = {
    prepare: () => {
      throw new Error("must not read");
    },
    batch: async () => {
      throw new Error("must not write");
    },
  };
  const disabled = { ...runtime, ANALYTICS_DB: fail, SEARCH_ANALYTICS_ENABLED: "0" };
  expect((await searchAnalyticsApi(request(body()), disabled, "website", "event")).status).toBe(
    503,
  );
  expect(
    (
      await searchAnalyticsApi(
        request(body()),
        { ...disabled, SEARCH_ANALYTICS_ENABLED: "1", SEARCH_RATE_LIMITER: undefined },
        "website",
        "event",
      )
    ).status,
  ).toBe(503);
  limiter.limit.mockResolvedValue({ success: false });
  expect(
    (
      await searchAnalyticsApi(
        request(body()),
        { ...disabled, SEARCH_ANALYTICS_ENABLED: "1" },
        "website",
        "event",
      )
    ).status,
  ).toBe(429);
});
test("forged cookie, hostile origin and oversized streamed JSON fail closed", async () => {
  const get = await searchAnalyticsApi(
    new Request("https://tgbox.test/api/search-event"),
    runtime,
    "website",
    "event",
  );
  expect(get.status).toBe(405);
  expect(get.headers.get("Allow")).toBe("POST");
  expect(
    (
      await searchAnalyticsApi(
        request(body(), { Cookie: "__Host-tgsearch_search=forged" }),
        runtime,
        "website",
        "event",
      )
    ).status,
  ).toBe(401);
  expect(
    (
      await searchAnalyticsApi(
        request(body(), { Origin: "https://evil.test" }),
        runtime,
        "website",
        "event",
      )
    ).status,
  ).toBe(403);
  expect(
    (await searchAnalyticsApi(request({ keyword: "x".repeat(2000) }), runtime, "website", "event"))
      .status,
  ).toBe(400);
});

test("client result claims and recommendation clicks cannot forge a ranking contribution", async () => {
  for (const change of [
    { keyword: "并无这个词" },
    { trigger: "recommended" },
    { trigger: "trending" },
    { reportedResult: "zero" },
  ]) {
    const result = await searchAnalyticsApi(
      request({ ...body(), ...change }, { "X-Telegram-Init-Data": initData({ id: 42 }) }),
      runtime,
      "miniapp",
      "event",
    );
    expect(result.status).toBe(200);
  }
  expect(
    await env.ANALYTICS_DB.prepare(
      "SELECT SUM(searches) n,SUM(eligible_identities) eligible FROM search_daily_stats",
    ).first(),
  ).toEqual({ n: 4, eligible: 0 });
});

test("FTS failure accepts analysis without ranking credit; analytics failure returns unavailable", async () => {
  const fault = new Proxy(env.DB, {
    get(target, key) {
      if (key === "prepare")
        return () => {
          throw new Error("offline");
        };
      return Reflect.get(target, key, target);
    },
  });
  const requestHeaders = { "X-Telegram-Init-Data": initData({ id: 42 }) };
  expect(
    (
      await searchAnalyticsApi(
        request(body(), requestHeaders),
        { ...runtime, DB: fault },
        "miniapp",
        "event",
      )
    ).status,
  ).toBe(200);
  expect(
    await env.ANALYTICS_DB.prepare("SELECT eligible_identities FROM search_daily_stats").first(),
  ).toEqual({ eligible_identities: 0 });
  expect(
    (
      await searchAnalyticsApi(
        request(body(), requestHeaders),
        { ...runtime, ANALYTICS_DB: fault },
        "miniapp",
        "event",
      )
    ).status,
  ).toBe(503);
});
