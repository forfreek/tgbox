import { createDb, searchEntries } from "@tgbox/db";
import {
  type AnalyticsBindings,
  AuthenticatedSearch,
  BoundaryError,
  challengeContext,
  collectionEnabled,
  HARD_LIMITS,
  hmac,
  issueAnonymousSession,
  readAnalyticsJson,
  SearchEvent,
  type SecurityReason,
  sampleSecurity,
  TURNSTILE_ACTION,
  verifyChallenge,
  writeSearch,
} from "@tgbox/search-analytics";

type Runtime = AnalyticsBindings & { BOT_TOKEN?: string; DB: D1Database };
type Operation = "session" | "event" | "verify";
const COOKIE = "__Host-tgsearch_search";
type SessionCookie = { token: string; exp: number };
function json(body: unknown, status = 200, cookie?: SessionCookie) {
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  if (status === 405) headers.set("Allow", "POST");
  if (cookie)
    headers.set(
      "Set-Cookie",
      `${COOKIE}=${cookie.token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, cookie.exp - Math.floor(Date.now() / 1000))}`,
    );
  return Response.json(body, { status, headers });
}
/** Fixed route selects source. Neither source nor identity is accepted from the body. */
export async function searchAnalyticsApi(
  request: Request,
  env: Runtime,
  source: "website" | "miniapp",
  operation: Operation,
) {
  if (request.method !== "POST") return json({ status: "invalid" }, 405);
  if (!collectionEnabled(env, source)) return json({ status: "disabled" }, 503);
  const db = env.ANALYTICS_DB;
  const secret = env.SEARCH_IDENTITY_SECRET;
  const sessionSecret = env.SEARCH_SESSION_SECRET;
  if (
    !db ||
    !secret ||
    !env.SEARCH_RATE_LIMITER ||
    (source === "website" && (sessionSecret?.length ?? 0) < HARD_LIMITS.secretMinCharacters)
  )
    return json({ status: "unavailable" }, 503);
  try {
    const origins = new Set(
      (env.SEARCH_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    // Require same-origin as well as the deployment allowlist. No cross-origin credential API.
    if (request.headers.get("Origin") !== new URL(request.url).origin)
      return json({ status: "invalid" }, 403);
    const raw: unknown = await readAnalyticsJson(request, origins);
    const ip = request.headers.get("CF-Connecting-IP");
    if (!ip || ip.length > 64) return json({ status: "invalid" }, 401);
    if (!(await env.SEARCH_RATE_LIMITER.limit({ key: await hmac(secret, "edge-ip", ip) })).success)
      return json({ status: "limited" }, 429);
    const now = Date.now();
    const security = (reason: SecurityReason) => sampleSecurity(db, secret, reason, now);
    const deps = {
      db,
      identitySecret: secret,
      sessionSecret: sessionSecret ?? "",
      enabled: true,
      now: () => now,
    };
    const cookies = request.headers.get("Cookie") ?? "";
    const matches = cookies
      .split(";")
      .map((x) => x.trim())
      .filter((x) => x.startsWith(`${COOKIE}=`));
    if (matches.length > 1) return json({ status: "invalid" }, 401);
    let token = matches[0]?.slice(COOKIE.length + 1);
    let newCookie: SessionCookie | undefined;
    if (
      operation === "session" &&
      (typeof raw !== "object" ||
        raw === null ||
        Array.isArray(raw) ||
        Object.keys(raw).length !== 0)
    )
      return json({ status: "invalid" }, 400);
    // Validate event before spending the issuance budget. Missing cookies can be issued in the
    // same keepalive request, so quick navigation does not require a preceding network round trip.
    if (operation === "event" && !SearchEvent.safeParse(raw).success)
      return json({ status: "invalid" }, 400);
    if (source === "website" && !token && operation !== "verify") {
      const issued = await issueAnonymousSession(deps, ip);
      if (issued.status !== "issued")
        return json({ status: issued.status }, issued.status === "limited" ? 429 : 503);
      token = issued.token;
      newCookie = { token, exp: issued.session.exp };
    }
    const auth =
      source === "website"
        ? await AuthenticatedSearch.website(secret, sessionSecret ?? "", token ?? "", ip, now)
        : await AuthenticatedSearch.miniapp(
            secret,
            env.BOT_TOKEN,
            request.headers.get("X-Telegram-Init-Data") ?? "",
            ip,
            now,
          );
    if (!auth) {
      await security("invalid_identity");
      return json({ status: "invalid" }, 401);
    }
    if (operation === "session") return json({ status: "ready" }, 200, newCookie);
    if (operation === "verify") {
      if (source !== "website" || !sessionSecret) return json({ status: "invalid" }, 401);
      const proof = request.headers.get("X-Turnstile-Token") ?? "";
      if (
        typeof raw !== "object" ||
        raw === null ||
        Array.isArray(raw) ||
        Object.keys(raw).length !== 0
      )
        return json({ status: "invalid" }, 400);
      const verified = await verifyChallenge(
        {
          ...deps,
          turnstileEnabled: env.SEARCH_TURNSTILE_ENABLED === "1",
          turnstileSecret: env.SEARCH_TURNSTILE_SECRET ?? "",
          hostnames: new Set([...origins].map((o) => new URL(o).hostname)),
          fetch: (input, init) => fetch(input, init),
        },
        auth,
        proof,
      );
      await security(
        verified.status === "verified"
          ? "turnstile_success"
          : verified.status === "limited"
            ? "limited"
            : "turnstile_failure",
      );
      return verified.status === "verified"
        ? json({ status: "verified" }, 200, { token: verified.token, exp: verified.session.exp })
        : json({ status: verified.status }, verified.status === "limited" ? 429 : 403);
    }
    const report = await writeSearch(
      {
        db,
        secret,
        enabled: true,
        now: () => Date.now(),
        verifyResult: async (keyword) =>
          (await searchEntries(createDb(env.DB), keyword, 1)).length > 0,
      },
      raw,
      auth,
    );
    const outcome = report.outcome;
    if (outcome.status === "duplicate") await security("duplicate");
    else if (
      outcome.status === "rejected" &&
      (outcome.reason === "limited" || outcome.reason === "private")
    )
      await security(outcome.reason);
    if (
      outcome.status === "rejected" &&
      outcome.reason === "challenge" &&
      auth.session &&
      env.SEARCH_TURNSTILE_ENABLED === "1" &&
      env.SEARCH_TURNSTILE_SITE_KEY
    ) {
      return json(
        {
          status: "challenge",
          siteKey: env.SEARCH_TURNSTILE_SITE_KEY,
          action: TURNSTILE_ACTION,
          context: await challengeContext(secret, auth.session),
        },
        403,
        newCookie,
      );
    }
    const status =
      outcome.status === "rejected"
        ? {
            disabled: 503,
            invalid: 400,
            private: 403,
            blocked: 403,
            limited: 429,
            conflict: 409,
            challenge: 403,
          }[outcome.reason]
        : outcome.status === "unavailable"
          ? 503
          : 200;
    return json({ ...outcome, debounceMs: report.debounceMs }, status, newCookie);
  } catch (error) {
    if (error instanceof BoundaryError)
      return json({ status: "invalid" }, request.method !== "POST" ? 405 : 400);
    console.warn("search-analytics", "boundary");
    return json({ status: "unavailable" }, 503);
  }
}
