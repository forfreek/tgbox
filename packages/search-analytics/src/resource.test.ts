import { env } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { resetAnalytics } from "../test/reset.ts";
import { AuthenticatedSearch } from "./auth.ts";
import { defaultSettings } from "./config.ts";
import { signSession } from "./identity.ts";
import { issueAnonymousSession } from "./session.ts";
import { writeSearch } from "./writer.ts";

it("records local D1 cost baselines and bounds accepted versus rejected write amplification", async () => {
  await resetAnalytics();
  const db = env.ANALYTICS_DB,
    secret = "local-resource-key".repeat(3),
    now = Date.parse("2026-11-28T02:00:00Z");
  await db
    .prepare("UPDATE search_settings SET version=2,value=?")
    .bind(
      JSON.stringify({
        ...defaultSettings,
        enabled: true,
        website: true,
        bot: true,
        challengePolicy: "off",
        dailyBudget: 3,
      }),
    )
    .run();
  const callback = async () => true;
  const deps = { db, secret, enabled: true, now: () => now, verifyResult: callback };
  const bot = await AuthenticatedSearch.bot(secret, 42, now);
  const event = {
    version: 1,
    eventId: crypto.randomUUID(),
    keyword: "telegram",
    trigger: "manual",
    reportedResult: "results",
    locale: "zh",
  };
  const first = await writeSearch(deps, event, bot);
  const repeat = await writeSearch(deps, { ...event, eventId: crypto.randomUUID() }, bot);
  const duplicate = await writeSearch(deps, event, bot);
  const session = {
    v: 1 as const,
    id: crypto.randomUUID(),
    iat: now / 1000,
    exp: now / 1000 + 3600,
    trustedUntil: 0,
  };
  const website = await AuthenticatedSearch.website(
    secret,
    secret,
    await signSession(secret, session),
    "127.0.0.1",
    now,
  );
  if (!website) throw new Error("No test session");
  const web = await writeSearch(deps, { ...event, eventId: crypto.randomUUID() }, website);
  const limited = await writeSearch(deps, { ...event, eventId: crypto.randomUUID() }, bot);
  const issued = await issueAnonymousSession(
    { db, identitySecret: secret, sessionSecret: secret, enabled: true, now: () => now },
    "127.0.0.2",
  );
  if (issued.status !== "issued") throw new Error("No issuance");
  for (const value of [first, repeat, web]) {
    expect(value.outcome.status).toBe("accepted");
    expect(value.usage.rowsWritten).toBeLessThanOrEqual(40);
    expect(value.usage.rowsRead).toBeLessThanOrEqual(512);
  }
  expect(duplicate.usage.rowsWritten).toBe(0);
  expect(limited.usage.rowsWritten).toBe(0);
  expect({
    botFirst: first.usage,
    botRepeat: repeat.usage,
    webFirst: web.usage,
    retry: duplicate.usage,
    budgetRejected: limited.usage,
    sessionIssue: issued.usage,
  }).toMatchSnapshot();
}, 30000);

it("measures the maximum supported rule set and refuses an over-limit set without writes", async () => {
  await resetAnalytics();
  const db = env.ANALYTICS_DB,
    secret = "local-rule-key".repeat(3),
    now = Date.parse("2026-11-28T02:00:00Z");
  await db
    .prepare("UPDATE search_settings SET version=2,value=?")
    .bind(JSON.stringify({ ...defaultSettings, enabled: true, bot: true }))
    .run();
  await db
    .prepare(
      "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<500) INSERT INTO search_keyword_rules(pattern,match_mode,status,updated_at) SELECT 'blocked-rule-'||n,'contains','blacklist',1 FROM seq",
    )
    .run();
  const auth = await AuthenticatedSearch.bot(secret, 42, now),
    observe = vi.fn();
  const d = { db, secret, enabled: true, now: () => now, verifyResult: async () => true, observe };
  const event = {
    version: 1,
    eventId: crypto.randomUUID(),
    keyword: "telegram",
    trigger: "manual",
    reportedResult: "results",
    locale: "zh",
  };
  const accepted = await writeSearch(d, event, auth);
  expect(accepted.outcome.status).toBe("accepted");
  expect(accepted.usage.rowsRead).toBeLessThan(10000);
  expect(accepted.usage).toMatchSnapshot("500 moderation rules");
  await db
    .prepare(
      "INSERT INTO search_keyword_rules(pattern,match_mode,status,updated_at) VALUES('overflow-rule','exact','blacklist',1)",
    )
    .run();
  const rejected = await writeSearch(d, { ...event, eventId: crypto.randomUUID() }, auth);
  expect(rejected.outcome.status).toBe("unavailable");
  expect(rejected.usage.rowsWritten).toBe(0);
  expect(observe).toHaveBeenCalledWith("configuration");
}, 30000);
