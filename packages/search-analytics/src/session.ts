import { type AuthenticatedSearch, trustedAuth } from "./auth.ts";
import { entryEnabled, HARD_LIMITS } from "./config.ts";
import { hmac, type SearchSession, signSession } from "./identity.ts";
import { type Quota, reserve } from "./quota.ts";
import {
  type AnalyticsDb,
  type Observer,
  observeFailure,
  readSettings,
  type Usage,
} from "./runtime.ts";
import { beijingDay, DAY_MS, MINUTE_MS } from "./time.ts";

export type SessionDependencies = {
  db: AnalyticsDb;
  identitySecret: string;
  sessionSecret: string;
  enabled: boolean;
  now: () => number;
  observe?: Observer;
};
export type SessionResult =
  | { status: "issued"; token: string; session: SearchSession; usage: Usage }
  | { status: "disabled" | "invalid" | "limited" | "unavailable" };
export async function issueAnonymousSession(
  deps: SessionDependencies,
  ip: string,
): Promise<SessionResult> {
  if (!deps.enabled) return { status: "disabled" };
  if (!ip || ip.length > 64) return { status: "invalid" };
  try {
    const now = deps.now(),
      loaded = await readSettings(deps.db),
      settings = loaded.value;
    if (!entryEnabled(settings, "website", deps.enabled)) return { status: "disabled" };
    const ipHash = await hmac(deps.identitySecret, "ip", ip);
    const id = crypto.randomUUID(),
      second = Math.floor(now / 1000);
    const session: SearchSession = {
      v: 1,
      id,
      iat: second,
      exp: second + settings.sessionLifetimeSeconds,
      trustedUntil: 0,
    };
    const token = await signSession(deps.sessionSecret, session); // Validate secrets before any write.
    const quotas: Quota[] = [
      {
        scope: "session_issue",
        subject: ipHash,
        window: String(Math.floor(now / MINUTE_MS)),
        maximum: settings.sessionIssuesPerIpMinute,
        expires: now + 2 * MINUTE_MS,
      },
      {
        scope: "session_issue_global",
        subject: "issuance",
        window: beijingDay(now),
        maximum: settings.sessionIssuesPerDay,
        expires: now + 2 * DAY_MS,
      },
    ];
    const key = await hmac(deps.identitySecret, "session-issue", id);
    const reserved = await reserve(deps.db, {
      kind: "session",
      configVersion: loaded.version,
      website: true,
      eventKey: key,
      digest: key,
      expires: session.exp * 1000,
      quotas,
    });
    return reserved.accepted
      ? {
          status: "issued",
          session,
          token,
          usage: {
            rowsRead: loaded.usage.rowsRead + reserved.usage.rowsRead,
            rowsWritten: reserved.usage.rowsWritten,
          },
        }
      : { status: "limited" };
  } catch {
    (deps.observe ?? observeFailure)("database");
    return { status: "unavailable" };
  }
}

export const TURNSTILE_ACTION = "search_analytics";
type VerifyDependencies = SessionDependencies & {
  turnstileEnabled: boolean;
  turnstileSecret: string;
  hostnames: ReadonlySet<string>;
  fetch: typeof fetch;
};
export type VerificationResult =
  | { status: "verified"; token: string; session: SearchSession; usage: Usage }
  | { status: "disabled" | "invalid" | "limited" | "failed" | "unavailable" };
export async function challengeContext(secret: string, session: SearchSession) {
  return hmac(secret, "turnstile-context", session.id);
}
export async function verifyChallenge(
  deps: VerifyDependencies,
  auth: AuthenticatedSearch,
  token: string,
): Promise<VerificationResult> {
  if (!deps.enabled || !deps.turnstileEnabled) return { status: "disabled" };
  const now = deps.now(),
    observe = deps.observe ?? observeFailure;
  if (
    !trustedAuth(auth, now) ||
    auth.source !== "website" ||
    !auth.session ||
    !auth.ip ||
    !token ||
    token.length > HARD_LIMITS.turnstileHeader ||
    !deps.hostnames.size ||
    !deps.turnstileSecret
  )
    return { status: "invalid" };
  try {
    const loaded = await readSettings(deps.db),
      s = loaded.value;
    if (!entryEnabled(s, "website", deps.enabled) || !s.turnstile || s.challengePolicy === "off")
      return { status: "disabled" };
    const context = await challengeContext(deps.identitySecret, auth.session);
    const key = await hmac(deps.identitySecret, "turnstile-token", token);
    const reserved = await reserve(deps.db, {
      kind: "turnstile",
      configVersion: loaded.version,
      website: true,
      turnstile: true,
      eventKey: key,
      digest: context,
      expires: now + HARD_LIMITS.turnstileLifetimeMs,
      quotas: [
        {
          scope: "session_issue",
          subject: `verify:${auth.identity}`,
          window: String(Math.floor(now / MINUTE_MS)),
          maximum: s.verificationsPerIdentityMinute,
          expires: now + 2 * MINUTE_MS,
        },
        {
          scope: "session_issue",
          subject: `verify:${auth.ip}`,
          window: String(Math.floor(now / MINUTE_MS)),
          maximum: s.verificationsPerIpMinute,
          expires: now + 2 * MINUTE_MS,
        },
        {
          scope: "session_issue_global",
          subject: "verification",
          window: beijingDay(now),
          maximum: s.verificationsPerDay,
          expires: now + 2 * DAY_MS,
        },
      ],
    });
    if (!reserved.accepted) return { status: "limited" };
    const response = await deps.fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: deps.turnstileSecret,
        response: token,
        idempotency_key: crypto.randomUUID(),
      }),
      signal: AbortSignal.timeout(HARD_LIMITS.siteverifyTimeoutMs),
    });
    if (!response.ok) {
      observe("turnstile");
      return { status: "failed" };
    }
    const data: unknown = await response.json();
    if (
      typeof data !== "object" ||
      data === null ||
      !("success" in data) ||
      data.success !== true ||
      !("hostname" in data) ||
      typeof data.hostname !== "string" ||
      !deps.hostnames.has(data.hostname) ||
      !("action" in data) ||
      data.action !== TURNSTILE_ACTION ||
      !("cdata" in data) ||
      data.cdata !== context
    ) {
      observe("turnstile");
      return { status: "failed" };
    }
    const current = await readSettings(deps.db);
    if (
      current.version !== loaded.version ||
      !entryEnabled(current.value, "website", deps.enabled) ||
      !current.value.turnstile
    )
      return { status: "disabled" };
    const nowSeconds = Math.floor(now / 1000);
    const session: SearchSession = {
      ...auth.session,
      trustedUntil: Math.min(auth.session.exp, nowSeconds + s.trustedLifetimeSeconds),
    };
    return {
      status: "verified",
      session,
      token: await signSession(deps.sessionSecret, session),
      usage: {
        rowsRead: loaded.usage.rowsRead + reserved.usage.rowsRead + current.usage.rowsRead,
        rowsWritten: reserved.usage.rowsWritten,
      },
    };
  } catch {
    observe("turnstile");
    return { status: "unavailable" };
  }
}
