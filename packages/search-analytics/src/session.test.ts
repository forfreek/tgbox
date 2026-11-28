import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetAnalytics } from "../test/reset.ts";
import { AuthenticatedSearch } from "./auth.ts";
import { defaultSettings } from "./config.ts";
import { signSession, verifySession } from "./identity.ts";
import {
  challengeContext,
  issueAnonymousSession,
  TURNSTILE_ACTION,
  verifyChallenge,
} from "./session.ts";
import { writeSearch } from "./writer.ts";

const db = env.ANALYTICS_DB,
  secret = "test-key".repeat(6),
  now = Date.parse("2026-11-28T03:00:00Z");
const deps = () => ({
  db,
  identitySecret: secret,
  sessionSecret: secret,
  enabled: true,
  now: () => now,
  observe: vi.fn(),
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
        turnstile: true,
        challengePolicy: "always",
        ...extra,
      }),
    )
    .run();
}
async function authentication(ip = "127.0.0.1") {
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
  if (!auth) throw new Error("Test session failed");
  return { session, auth };
}
const verifyDeps = (f: typeof fetch) => ({
  ...deps(),
  turnstileEnabled: true,
  turnstileSecret: "local-test-turnstile",
  hostnames: new Set(["tgsearch.app"]),
  fetch: f,
});
const event = () => ({
  version: 1,
  eventId: crypto.randomUUID(),
  keyword: "Telegram",
  trigger: "manual",
  reportedResult: "results",
  locale: "zh",
});
beforeEach(async () => {
  await resetAnalytics();
  await enable();
});

describe("bounded anonymous session issuance", () => {
  it("limits concurrent new sessions by IP independently of accepted-event budget", async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, () => issueAnonymousSession(deps(), "127.0.0.1")),
    );
    expect(results.filter((r) => r.status === "issued")).toHaveLength(5);
    expect(await db.prepare("SELECT count(*) n FROM search_daily_stats").first("n")).toBe(0);
    expect(
      await db.prepare("SELECT count(*) n FROM search_rate_limits WHERE scope='global'").first("n"),
    ).toBe(0);
  }, 30000);
  it("challenges rapid new-session creation even if the new identity has no searches", async () => {
    await enable({ challengePolicy: "suspicious" });
    let issued = await issueAnonymousSession(deps(), "127.0.0.1");
    for (let i = 0; i < 2; i++) issued = await issueAnonymousSession(deps(), "127.0.0.1");
    if (issued.status !== "issued") throw new Error("Expected test session");
    const auth = await AuthenticatedSearch.website(secret, secret, issued.token, "127.0.0.1", now);
    if (!auth) throw new Error("Expected auth");
    expect(
      (
        await writeSearch(
          { db, secret, enabled: true, now: () => now, verifyResult: async () => true },
          event(),
          auth,
        )
      ).outcome,
    ).toEqual({ status: "rejected", reason: "challenge" });
  });
  it("does not issue while deployment is disabled or the database fails", async () => {
    expect(await issueAnonymousSession({ ...deps(), enabled: false }, "127.0.0.1")).toEqual({
      status: "disabled",
    });
    const failing = {
      ...deps(),
      db: {
        prepare: () => {
          throw new Error("private-error");
        },
        batch: db.batch.bind(db),
      },
    };
    const result = await issueAnonymousSession(failing, "127.0.0.1");
    expect(result).toEqual({ status: "unavailable" });
    expect(failing.observe).toHaveBeenCalledWith("database");
  });
});
describe("Turnstile validation and capability upgrade", () => {
  it("does not upgrade a session if configuration changed during Siteverify", async () => {
    const { session, auth } = await authentication(),
      context = await challengeContext(secret, session);
    const result = await verifyChallenge(
      verifyDeps(async () => {
        await enable({ turnstile: false });
        return Response.json({
          success: true,
          hostname: "tgsearch.app",
          action: TURNSTILE_ACTION,
          cdata: context,
        });
      }),
      auth,
      "config-race-token",
    );
    expect(result).toEqual({ status: "disabled" });
  });
  it("binds success to hostname, action and session, atomically excludes concurrent token replay", async () => {
    const { session, auth } = await authentication(),
      context = await challengeContext(secret, session);
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        success: true,
        hostname: "tgsearch.app",
        action: TURNSTILE_ACTION,
        cdata: context,
      }),
    );
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        verifyChallenge(verifyDeps(fetcher), auth, "same-provider-token"),
      ),
    );
    expect(results.filter((r) => r.status === "verified")).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const good = results.find((r) => r.status === "verified");
    if (good?.status !== "verified") throw new Error("No trusted session");
    expect((await verifySession(secret, good.token, now))?.trustedUntil).toBeGreaterThan(
      now / 1000,
    );
    // No raw provider token is persisted.
    const rows = await db
      .prepare("SELECT event_key,payload_digest,attempt FROM search_event_receipts")
      .all();
    expect(JSON.stringify(rows.results)).not.toContain("same-provider-token");
  }, 30000);
  it.each([
    { success: false, hostname: "tgsearch.app", action: TURNSTILE_ACTION },
    { success: true, hostname: "evil.test", action: TURNSTILE_ACTION },
    { success: true, hostname: "tgsearch.app", action: "wrong" },
    { success: true, hostname: "tgsearch.app", action: TURNSTILE_ACTION, cdata: "other-session" },
  ])("does not issue trusted state on invalid Siteverify response %#", async (response) => {
    const { auth } = await authentication();
    expect(
      (
        await verifyChallenge(
          verifyDeps(async () => Response.json(response)),
          auth,
          "token",
        )
      ).status,
    ).toBe("failed");
  });
  it("fails isolated on provider errors and never upgrades Bot credentials", async () => {
    const { auth } = await authentication(),
      failure = vi.fn();
    const d = {
      ...verifyDeps(async () => {
        throw new Error("private-token");
      }),
      observe: failure,
    };
    expect((await verifyChallenge(d, auth, "token")).status).toBe("unavailable");
    expect(failure).toHaveBeenCalledWith("turnstile");
    const bot = await AuthenticatedSearch.bot(secret, 123, now);
    expect((await verifyChallenge(d, bot, "other-token")).status).toBe("invalid");
  });
  it("does not bypass strict event limits after a successful challenge", async () => {
    await enable({ sessionPerHour: 1, sessionPerDay: 1 });
    const { session, auth } = await authentication(),
      context = await challengeContext(secret, session);
    const good = await verifyChallenge(
      verifyDeps(async () =>
        Response.json({
          success: true,
          hostname: "tgsearch.app",
          action: TURNSTILE_ACTION,
          cdata: context,
        }),
      ),
      auth,
      "token",
    );
    if (good.status !== "verified") throw new Error("Expected upgrade");
    const trusted = await AuthenticatedSearch.website(secret, secret, good.token, "127.0.0.1", now);
    if (!trusted) throw new Error("Expected auth");
    const writer = { db, secret, enabled: true, now: () => now, verifyResult: async () => true };
    expect((await writeSearch(writer, event(), trusted)).outcome.status).toBe("accepted");
    expect((await writeSearch(writer, event(), trusted)).outcome).toEqual({
      status: "rejected",
      reason: "limited",
    });
  });
  it("limits verification attempts even when every provider token is different", async () => {
    const { auth } = await authentication(),
      fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: false }));
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        verifyChallenge(verifyDeps(fetcher), auth, `bad-token-${i}`),
      ),
    );
    expect(fetcher).toHaveBeenCalledTimes(3);
  }, 30000);
});
