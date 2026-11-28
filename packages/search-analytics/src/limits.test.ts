import { env } from "cloudflare:workers";
import { beforeEach, expect, it, vi } from "vitest";
import { resetAnalytics } from "../test/reset.ts";
import { AuthenticatedSearch } from "./auth.ts";
import { readAnalyticsJson } from "./boundary.ts";
import { defaultSettings } from "./config.ts";
import type { SearchEvent } from "./contracts.ts";
import { signSession } from "./identity.ts";
import { sampleSecurity } from "./security.ts";
import { createD1SearchWriter, writeSearch } from "./writer.ts";

const db = env.ANALYTICS_DB,
  secret = "local-limit-key".repeat(3),
  now = Date.parse("2026-11-28T03:00:00Z");
const input = (): SearchEvent => ({
  version: 1,
  eventId: crypto.randomUUID(),
  keyword: "telegram",
  trigger: "manual",
  reportedResult: "results",
  locale: "zh",
});
async function enable(extra = {}) {
  await db
    .prepare("UPDATE search_settings SET version=version+1,value=?")
    .bind(
      JSON.stringify({
        ...defaultSettings,
        enabled: true,
        website: true,
        bot: true,
        challengePolicy: "off",
        ...extra,
      }),
    )
    .run();
}
const deps = () => ({
  db,
  secret,
  enabled: true,
  now: () => now,
  verifyResult: async () => true,
  observe: vi.fn(),
});
async function website(ip = "127.0.0.1") {
  const session = {
    v: 1 as const,
    id: crypto.randomUUID(),
    iat: now / 1000,
    exp: now / 1000 + 3600,
    trustedUntil: 0,
  };
  const auth = await AuthenticatedSearch.website(
    secret,
    secret,
    await signSession(secret, session),
    ip,
    now,
  );
  if (!auth) throw new Error("Expected auth");
  return auth;
}
beforeEach(async () => {
  await resetAnalytics();
  await enable();
  vi.restoreAllMocks();
});
it("enforces one global daily contribution in the schema even across source/locale rows", async () => {
  const auth = await AuthenticatedSearch.bot(secret, 1, now);
  await writeSearch(deps(), input(), auth);
  await expect(
    db
      .prepare(
        "INSERT INTO search_daily_identities(day,keyword,identity,source,locale,eligible,last_seen_at) VALUES('2026-11-28','telegram',?,'miniapp','en',1,1)",
      )
      .bind(auth.identity)
      .run(),
  ).rejects.toThrow();
  expect(await db.prepare("SELECT sum(eligible) n FROM search_daily_identities").first("n")).toBe(
    1,
  );
});
it("bounds a stalled result verifier without granting a ranking contribution", async () => {
  const observer = vi.fn(),
    auth = await AuthenticatedSearch.bot(secret, 1, now);
  const report = await writeSearch(
    { ...deps(), observe: observer, verifyResult: () => new Promise<boolean>(() => {}) },
    input(),
    auth,
  );
  expect(report.outcome.status).toBe("accepted");
  expect(
    await db
      .prepare("SELECT eligible_identities FROM search_daily_stats")
      .first("eligible_identities"),
  ).toBe(0);
  expect(observer).toHaveBeenCalledWith("verification");
}, 10000);
it("stops exhausted budgets before calling FTS and keeps rejected writes at zero", async () => {
  await enable({ dailyBudget: 1 });
  const auth = await AuthenticatedSearch.bot(secret, 1, now),
    f = vi.fn(async () => true),
    d = { ...deps(), verifyResult: f };
  await writeSearch(d, input(), auth);
  const second = await writeSearch(d, input(), auth);
  expect(second.outcome).toEqual({ status: "rejected", reason: "limited" });
  expect(second.usage.rowsWritten).toBe(0);
  expect(f).toHaveBeenCalledTimes(1);
});
it("enforces IP and anonymous hour/day limits across newly signed sessions", async () => {
  await enable({ ipPerMinute: 10 });
  const auths = await Promise.all(Array.from({ length: 12 }, () => website()));
  const results = await Promise.all(auths.map((auth) => writeSearch(deps(), input(), auth)));
  expect(results.filter((r) => r.outcome.status === "accepted")).toHaveLength(10);
  await enable({ sessionPerHour: 1, sessionPerDay: 1 });
  const auth = await website("127.0.0.2");
  const writer = createD1SearchWriter(deps());
  expect((await writer.write(input(), auth)).status).toBe("accepted");
  expect(await writer.write(input(), auth)).toEqual({ status: "rejected", reason: "limited" });
}, 30000);
it("counts new-day contributions but cannot replay an old event across midnight", async () => {
  const auth = await AuthenticatedSearch.bot(secret, 1, now),
    event = input();
  await writeSearch(deps(), event, auth);
  const tomorrow = now + 86400000,
    newAuth = await AuthenticatedSearch.bot(secret, 1, tomorrow);
  const d = { ...deps(), now: () => tomorrow };
  expect((await writeSearch(d, event, newAuth)).outcome.status).toBe("duplicate");
  expect((await writeSearch(d, input(), newAuth)).outcome.status).toBe("accepted");
  expect(
    await db
      .prepare("SELECT count(DISTINCT day) n FROM search_daily_identities WHERE eligible=1")
      .first("n"),
  ).toBe(2);
});
it("filters private data before the database, and exposes database failures only as safe reason codes", async () => {
  const auth = await AuthenticatedSearch.bot(secret, 1, now),
    f = vi.fn();
  const d = {
    ...deps(),
    db: {
      prepare: () => {
        throw new Error("private-input");
      },
      batch: db.batch.bind(db),
    },
    observe: f,
  };
  expect((await writeSearch(d, { ...input(), keyword: "name@example.com" }, auth)).outcome).toEqual(
    { status: "rejected", reason: "private" },
  );
  expect(f).not.toHaveBeenCalled();
  const report = await writeSearch(d, input(), auth);
  expect(report.outcome.status).toBe("unavailable");
  expect(report.usageComplete).toBe(false);
  expect(f).toHaveBeenCalledWith("database");
});
it("keeps security sampling reason-only, bounded and explicitly approximate", async () => {
  await enable({ securitySamplesPerDay: 2 });
  const draw = vi.spyOn(crypto, "getRandomValues").mockReturnValue(new Uint32Array([0]));
  try {
    await Promise.all(Array.from({ length: 12 }, () => sampleSecurity(db, secret, "limited", now)));
    expect(await db.prepare("SELECT count FROM search_security_daily").first("count")).toBe(2);
    expect(await db.prepare("SELECT sampled FROM search_security_daily").first("sampled")).toBe(1);
    expect(await db.prepare("SELECT count(*) n FROM search_event_receipts").first("n")).toBe(2);
  } finally {
    draw.mockRestore();
  }
}, 30000);
it("rejects a lying Content-Length and malformed streaming UTF-8", async () => {
  const origins = new Set(["https://tgsearch.app"]);
  const headers = {
    Origin: "https://tgsearch.app",
    "Content-Type": "application/json",
    "Content-Length": "2",
  };
  await expect(
    readAnalyticsJson(
      new Request("https://tgsearch.app", { method: "POST", headers, body: " ".repeat(1025) }),
      origins,
    ),
  ).rejects.toThrow();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array([0xff, 0xfe]));
      c.close();
    },
  });
  await expect(
    readAnalyticsJson(
      new Request("https://tgsearch.app", { method: "POST", headers, body }),
      origins,
    ),
  ).rejects.toThrow();
});
it("does not let moderation change during FTS grant a contribution", async () => {
  const auth = await AuthenticatedSearch.bot(secret, 1, now);
  const d = {
    ...deps(),
    verifyResult: async () => {
      await db
        .prepare(
          "INSERT INTO search_keyword_rules(pattern,match_mode,status,updated_at) VALUES('telegram','exact','hidden',1)",
        )
        .run();
      return true;
    },
  };
  expect((await writeSearch(d, input(), auth)).outcome).toEqual({
    status: "rejected",
    reason: "conflict",
  });
  expect(await db.prepare("SELECT count(*) n FROM search_daily_stats").first("n")).toBe(0);
});
