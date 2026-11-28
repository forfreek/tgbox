import { env } from "cloudflare:workers";
import { insertApprovedEntry, setEntryStatus } from "@tgbox/db";
import { defaultSettings } from "@tgbox/search-analytics";
import { beforeEach, expect, test } from "vitest";
import { buttons, db, type Harness, startHarness } from "./harness.ts";

let h: Harness;
const user = { id: 5, is_bot: false, first_name: "Searcher", language_code: "zh" };

beforeEach(async () => {
  h = await startHarness();
  const now = Date.now();
  for (const [username, title] of [
    ["daily_news_cn", "每日新闻速递"],
    ["tech_digest", "Tech Digest Weekly"],
    ["hidden_one", "每日隐藏频道"],
  ]) {
    const { id } = await insertApprovedEntry(db, {
      entry: {
        username: username ?? "",
        kind: "channel",
        categoryId: 1,
        title: title ?? "",
        listedAt: now,
      },
      stats: { members: 5000, online: null, activityTier: null, statsWrittenAt: now },
      tagIds: [],
      now,
    });
    if (username === "hidden_one") await setEntryStatus(db, id, "hidden_by_admin", now);
  }
});

const results = () => {
  const call = h.calls("answerInlineQuery")[0];
  const list = call?.payload.results;
  return { call, list: Array.isArray(list) ? list : [] };
};

test("verified webhook collects in isolated analytics DB without changing inline cache", async () => {
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
      JSON.stringify({ ...defaultSettings, enabled: true, bot: true }),
    ),
  ]);
  h = await startHarness({
    SEARCH_ANALYTICS_ENABLED: "1",
    SEARCH_BOT_ENABLED: "1",
    SEARCH_IDENTITY_SECRET: "test-secret".repeat(4),
  });
  // startHarness resets core entries; this test only needs the successful zero-result path.
  const update = {
    inline_query: { id: "trusted-query-id", from: user, query: "无结果", offset: "" },
  };
  await h.update(update);
  await h.update(update);
  expect(h.calls("answerInlineQuery")[0]?.payload.cache_time).toBe(300);
  expect(
    await env.ANALYTICS_DB.prepare(
      "SELECT source,searches,zero_results,eligible_identities FROM search_daily_stats",
    ).first(),
  ).toEqual({ source: "bot", searches: 1, zero_results: 1, eligible_identities: 0 });
  expect(h.dispatches).toHaveLength(0);
});

test("analytics outage cannot prevent inline answers", async () => {
  h = await startHarness({
    SEARCH_ANALYTICS_ENABLED: "1",
    SEARCH_BOT_ENABLED: "1",
    SEARCH_IDENTITY_SECRET: "test-secret".repeat(4),
    ANALYTICS_DB: new Proxy(env.ANALYTICS_DB, {
      get(target, key) {
        if (key === "prepare")
          return () => {
            throw new Error("offline");
          };
        return Reflect.get(target, key, target);
      },
    }),
  });
  await h.inline(user, "新闻");
  expect(h.calls("answerInlineQuery")[0]?.payload.cache_time).toBe(300);
});

test("long query matches by phrase and links to the site and Telegram", async () => {
  await h.inline(user, "Digest");
  const { call, list } = results();
  expect(call?.payload.cache_time).toBe(300);
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ type: "article", title: "Tech Digest Weekly" });
  const urls = buttons({ method: "", payload: list[0] }).map((b) => b.url);
  expect(urls).toEqual(["https://t.me/tech_digest", "https://tgbox.test/detail/tech_digest/"]);
});

test("short Chinese query falls back to substring match and skips hidden entries", async () => {
  await h.inline(user, "每日");
  const { list } = results();
  expect(list.map((r) => r.title)).toEqual(["每日新闻速递"]);
});

test("empty query answers nothing", async () => {
  await h.inline(user, "  ");
  expect(h.telegram).toEqual([]);
});

test("inline results retain the approved bot start payload", async () => {
  const now = Date.now();
  await insertApprovedEntry(db, {
    entry: {
      username: "tagged_bot",
      kind: "bot",
      categoryId: 1,
      title: "Unique Payload Bot",
      listedAt: now,
      startPayload: "botlist",
    },
    stats: { members: null, online: null, activityTier: null, statsWrittenAt: now },
    tagIds: [],
    now,
  });
  await h.inline(user, "Payload");
  const { list } = results();
  expect(buttons({ method: "", payload: list[0] }).map((button) => button.url)).toContain(
    "https://t.me/tagged_bot?start=botlist",
  );
  expect(JSON.stringify(list[0])).toContain("https://t.me/tagged_bot?start=botlist");
});
