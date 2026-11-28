import { type AuthenticatedSearch, trustedAuth } from "./auth.ts";
import { entryEnabled, HARD_LIMITS } from "./config.ts";
import { SearchEvent, type SearchEventWriter, type WriteOutcome } from "./contracts.ts";
import { hmac } from "./identity.ts";
import { normalizeKeyword } from "./normalize.ts";
import { ownsReceipt, type Quota, quotaIncrement, withinQuotas } from "./quota.ts";
import {
  type AnalyticsDb,
  type Observer,
  observeFailure,
  readSettings,
  type Usage,
  usage,
} from "./runtime.ts";
import { beijingDay, DAY_MS, HOUR_MS, MINUTE_MS } from "./time.ts";

export type WriteReport = { outcome: WriteOutcome; usage: Usage; usageComplete: boolean };
type Dependencies = {
  db: AnalyticsDb;
  secret: string;
  enabled: boolean;
  now: () => number;
  verifyResult: (keyword: string, auth: AuthenticatedSearch) => Promise<boolean>;
  observe?: Observer;
};
/** D1 implementation of the single writer boundary; no queue infrastructure in v1. */
export function createD1SearchWriter(deps: Dependencies): SearchEventWriter<AuthenticatedSearch> {
  return {
    async write(event, authenticated) {
      return (await writeSearch(deps, event, authenticated)).outcome;
    },
  };
}
const context = `WITH p AS (SELECT
 'event' kind,json_extract(?1,'$.eventKey') event_key,json_extract(?1,'$.digest') digest,
 json_extract(?1,'$.attempt') attempt,json_extract(?1,'$.expires') expires,json_extract(?1,'$.quotas') quotas,
 json_extract(?1,'$.day') day,json_extract(?1,'$.keyword') keyword,json_extract(?1,'$.display') display,
 json_extract(?1,'$.source') source,json_extract(?1,'$.locale') locale,json_extract(?1,'$.identity') identity,
 json_extract(?1,'$.now') now,json_extract(?1,'$.version') version,json_extract(?1,'$.rulesRevision') rules_revision,
 json_extract(?1,'$.review') review,json_extract(?1,'$.verified') verified,json_extract(?1,'$.result') result,
 json_extract(?1,'$.trigger') trigger,json_extract(?1,'$.growth') growth,
 json_extract(?1,'$.dimensions') dimensions)`;
const matchesRule = `(r.match_mode='exact' AND r.pattern=p.keyword OR r.match_mode='contains' AND instr(p.keyword,r.pattern)>0)`;
const cannotPublish = `EXISTS(SELECT 1 FROM search_keyword_rules r WHERE r.enabled=1 AND r.status IN ('blacklist','hidden','pending') AND ${matchesRule})`;
const eligible = `p.verified=1 AND NOT ${cannotPublish}`;
const contribution = `(${eligible}) AND NOT EXISTS(SELECT 1 FROM search_daily_identities i WHERE i.day=p.day AND i.keyword=p.keyword AND i.identity=p.identity AND i.eligible=1)`;
const shouldReview = `p.review=1 OR (p.verified=1
 AND NOT EXISTS(SELECT 1 FROM search_daily_identities i WHERE i.day=p.day AND i.keyword=p.keyword AND i.identity=p.identity AND i.eligible=1)
 AND (SELECT count(*) FROM (SELECT DISTINCT i.identity FROM search_daily_identities i
   WHERE i.day=p.day AND i.keyword=p.keyword AND i.eligible=1 AND i.last_seen_at>=p.now-${MINUTE_MS} LIMIT ${HARD_LIMITS.maxRecentIdentities}))>=p.growth)`;

/** All SQL effects are guarded by this attempt's receipt; one batch is one D1 transaction. */
export async function writeSearch(
  deps: Dependencies,
  raw: unknown,
  auth: AuthenticatedSearch,
): Promise<WriteReport> {
  const total: Usage = { rowsRead: 0, rowsWritten: 0 };
  let usageComplete = true;
  const result = (outcome: WriteOutcome): WriteReport => ({ outcome, usage: total, usageComplete });
  const observe = deps.observe ?? observeFailure;
  try {
    const now = deps.now();
    if (!deps.enabled) return result({ status: "rejected", reason: "disabled" });
    if (!Number.isSafeInteger(now) || !trustedAuth(auth, now))
      return result({ status: "rejected", reason: "invalid" });
    const parsed = SearchEvent.safeParse(raw);
    if (!parsed.success) return result({ status: "rejected", reason: "invalid" });
    const event = parsed.data;
    const normalized = normalizeKeyword(event.keyword);
    if (!normalized.ok) return result({ status: "rejected", reason: normalized.reason });
    const { keyword, display, review } = normalized.value;
    const loaded = await readSettings(deps.db);
    total.rowsRead += loaded.usage.rowsRead;
    if (!entryEnabled(loaded.value, auth.source, deps.enabled))
      return result({ status: "rejected", reason: "disabled" });
    const rules = await deps.db
      .prepare("SELECT pattern,match_mode,status FROM search_keyword_rules WHERE enabled=1 LIMIT ?")
      .bind(HARD_LIMITS.rules + 1)
      .all<{ pattern: string; match_mode: string; status: string }>();
    total.rowsRead += rules.meta.rows_read;
    if (rules.results.length > HARD_LIMITS.rules) {
      observe("configuration");
      return result({ status: "unavailable" });
    }
    if (
      rules.results.some(
        (r) =>
          r.status === "blacklist" &&
          (r.match_mode === "exact" ? keyword === r.pattern : keyword.includes(r.pattern)),
      )
    )
      return result({ status: "rejected", reason: "blocked" });
    const settings = loaded.value;
    if (
      auth.source === "website" &&
      auth.session &&
      auth.session.trustedUntil * 1000 <= now &&
      settings.challengePolicy !== "off"
    ) {
      const suspicious = await deps.db
        .prepare(
          "SELECT COALESCE(max(CASE WHEN scope='session_hour' THEN count ELSE 0 END),0) n,COALESCE(max(CASE WHEN scope='session_issue' THEN count ELSE 0 END),0) issues FROM search_rate_limits WHERE (scope='session_hour' AND subject=? AND window=?) OR (scope='session_issue' AND subject=? AND window=?)",
        )
        .bind(
          auth.identity,
          String(Math.floor(now / HOUR_MS)),
          auth.ip,
          String(Math.floor(now / MINUTE_MS)),
        )
        .all<{ n: number; issues: number }>();
      total.rowsRead += suspicious.meta.rows_read;
      if (
        settings.challengePolicy === "always" ||
        (suspicious.results[0]?.n ?? 0) >= settings.challengeAfterSearches ||
        (suspicious.results[0]?.issues ?? 0) > settings.challengeAfterSessionIssues
      )
        return result({ status: "rejected", reason: "challenge" });
    }
    const eventKey = await hmac(
      deps.secret,
      "event",
      JSON.stringify([auth.identity, event.eventId]),
    );
    const digest = await hmac(
      deps.secret,
      "payload",
      JSON.stringify([keyword, auth.source, event.locale, event.trigger, event.reportedResult]),
    );
    // Skip FTS and all writes for known retries, including cross-day retries.
    const receipt = await deps.db
      .prepare(
        "SELECT payload_digest FROM search_event_receipts WHERE kind='event' AND event_key=?",
      )
      .bind(eventKey)
      .all<{ payload_digest: string }>();
    total.rowsRead += receipt.meta.rows_read;
    if (receipt.results[0])
      return result(
        receipt.results[0].payload_digest === digest
          ? { status: "duplicate" }
          : { status: "rejected", reason: "conflict" },
      );
    const day = beijingDay(now),
      expires = now + settings.identityRetentionDays * DAY_MS;
    const quotas: Quota[] = [
      {
        scope: "global",
        subject: "all",
        window: day,
        maximum: settings.dailyBudget,
        expires: now + 2 * DAY_MS,
      },
    ];
    if (auth.ip)
      quotas.push({
        scope: "ip",
        subject: auth.ip,
        window: String(Math.floor(now / MINUTE_MS)),
        maximum: settings.ipPerMinute,
        expires: now + 2 * MINUTE_MS,
      });
    if (auth.source === "website")
      quotas.push(
        {
          scope: "session_hour",
          subject: auth.identity,
          window: String(Math.floor(now / HOUR_MS)),
          maximum: settings.sessionPerHour,
          expires: now + 2 * HOUR_MS,
        },
        {
          scope: "session_day",
          subject: auth.identity,
          window: day,
          maximum: settings.sessionPerDay,
          expires: now + 2 * DAY_MS,
        },
      );
    else
      quotas.push({
        scope: "telegram_day",
        subject: auth.identity,
        window: day,
        maximum: settings.telegramPerDay,
        expires: now + 2 * DAY_MS,
      });
    // Advisory fast rejection avoids expensive FTS when a known limit is already exhausted.
    // The transaction rechecks every quota; this read is never the strict enforcement point.
    const preflight = await deps.db
      .prepare(`WITH p AS (SELECT ? quotas) SELECT ${withinQuotas} allowed FROM p`)
      .bind(JSON.stringify(quotas))
      .all<{ allowed: number }>();
    total.rowsRead += preflight.meta.rows_read;
    if (!preflight.results[0]?.allowed) return result({ status: "rejected", reason: "limited" });
    let verified = false;
    if (event.trigger === "manual" && event.reportedResult === "results") {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        verified =
          (await Promise.race([
            deps.verifyResult(keyword, auth),
            new Promise<never>((_, reject) => {
              deadline = setTimeout(
                () => reject(new Error("Result verification timeout")),
                HARD_LIMITS.resultVerificationTimeoutMs,
              );
            }),
          ])) === true;
      } catch {
        observe("verification");
      } finally {
        if (deadline !== undefined) clearTimeout(deadline);
      }
      // Keep reported analysis on failure/timeout; do not grant an unverified contribution.
    }
    const payload = JSON.stringify({
      eventKey,
      digest,
      attempt: crypto.randomUUID(),
      expires,
      quotas,
      day,
      keyword,
      display,
      source: auth.source,
      locale: event.locale,
      identity: auth.identity,
      now,
      version: loaded.version,
      rulesRevision: loaded.rulesRevision,
      review: Number(review),
      verified: Number(verified),
      result: event.reportedResult,
      trigger: event.trigger,
      growth: settings.anomalyIdentitiesPerMinute,
      dimensions: [
        { source: "all", locale: "all" },
        { source: auth.source, locale: "all" },
        { source: "all", locale: event.locale },
        { source: auth.source, locale: event.locale },
      ],
    });
    const statement = (sql: string) => deps.db.prepare(`${context} ${sql}`).bind(payload);
    const batch = await deps.db.batch([
      statement(`INSERT INTO search_event_receipts(kind,event_key,payload_digest,attempt,expires_at)
        SELECT kind,event_key,digest,attempt,expires FROM p
        WHERE EXISTS(SELECT 1 FROM search_settings s,search_control c WHERE s.id=1 AND c.id=1 AND s.version=p.version AND c.rules_revision=p.rules_revision)
        AND NOT EXISTS(SELECT 1 FROM search_keyword_rules r WHERE r.enabled=1 AND r.status='blacklist' AND ${matchesRule})
        AND (NOT (${shouldReview}) OR EXISTS(SELECT 1 FROM search_keyword_rules r WHERE r.pattern=p.keyword AND r.match_mode='exact')
             OR (SELECT count(*) FROM search_keyword_rules)<${HARD_LIMITS.rules})
        AND ${withinQuotas} ON CONFLICT(kind,event_key) DO NOTHING`),
      statement(quotaIncrement),
      statement(`INSERT INTO search_keyword_rules(pattern,match_mode,status,enabled,updated_at)
        SELECT keyword,'exact','pending',1,now FROM p WHERE ${ownsReceipt} AND (${shouldReview})
        ON CONFLICT(pattern,match_mode) DO UPDATE SET status='pending',enabled=1,revision=revision+1,updated_at=excluded.updated_at
        WHERE search_keyword_rules.status NOT IN ('blacklist','hidden','pending')`),
      statement(`INSERT INTO search_daily_stats(day,keyword,display_keyword,source,locale,searches,results,zero_results,trending_clicks,recommended_clicks,prefill_searches,verified_searches,eligible_identities,updated_at)
        SELECT day,keyword,display,source,locale,1,result='results',result='zero',trigger='trending',trigger='recommended',trigger='prefill',verified,
        (${contribution}),now
        FROM p WHERE ${ownsReceipt}
        ON CONFLICT(day,keyword,source,locale) DO UPDATE SET searches=searches+1,results=results+excluded.results,zero_results=zero_results+excluded.zero_results,
        trending_clicks=trending_clicks+excluded.trending_clicks,recommended_clicks=recommended_clicks+excluded.recommended_clicks,prefill_searches=prefill_searches+excluded.prefill_searches,
        verified_searches=verified_searches+excluded.verified_searches,eligible_identities=eligible_identities+excluded.eligible_identities,updated_at=excluded.updated_at`),
      statement(`INSERT INTO search_daily_identities(day,keyword,identity,source,locale,eligible,last_seen_at)
        SELECT day,keyword,identity,source,locale,(${contribution}),now FROM p WHERE ${ownsReceipt}
        ON CONFLICT(day,keyword,identity,source,locale) DO UPDATE SET eligible=max(eligible,excluded.eligible),last_seen_at=CASE WHEN excluded.eligible=1 THEN excluded.last_seen_at ELSE last_seen_at END`),
      statement(`INSERT INTO search_daily_totals(day,source,locale,searches,results,zero_results,identity_days)
        SELECT p.day,json_extract(d.value,'$.source'),json_extract(d.value,'$.locale'),1,p.result='results',p.result='zero',
          NOT EXISTS(SELECT 1 FROM search_identity_days i WHERE i.day=p.day AND i.identity=p.identity AND i.source=json_extract(d.value,'$.source') AND i.locale=json_extract(d.value,'$.locale'))
        FROM p,json_each(p.dimensions) d WHERE ${ownsReceipt}
        ON CONFLICT(day,source,locale) DO UPDATE SET searches=searches+1,results=results+excluded.results,zero_results=zero_results+excluded.zero_results,identity_days=identity_days+excluded.identity_days`),
      statement(`INSERT INTO search_identity_days(day,identity,source,locale)
        SELECT p.day,p.identity,json_extract(d.value,'$.source'),json_extract(d.value,'$.locale') FROM p,json_each(p.dimensions) d WHERE ${ownsReceipt}
        ON CONFLICT(day,identity,source,locale) DO NOTHING`),
      statement(
        `SELECT e.payload_digest,e.attempt=p.attempt AS owned,EXISTS(SELECT 1 FROM search_settings s,search_control c WHERE s.id=1 AND c.id=1 AND s.version=p.version AND c.rules_revision=p.rules_revision) fresh FROM p LEFT JOIN search_event_receipts e ON e.kind=p.kind AND e.event_key=p.event_key`,
      ),
    ]);
    const cost = usage(batch);
    total.rowsRead += cost.rowsRead;
    total.rowsWritten += cost.rowsWritten;
    const last = batch.at(-1)?.results[0] as
      | { payload_digest: string | null; owned: number | null; fresh: number }
      | undefined;
    if (last?.owned) return result({ status: "accepted" });
    if (last?.payload_digest)
      return result(
        last.payload_digest === digest
          ? { status: "duplicate" }
          : { status: "rejected", reason: "conflict" },
      );
    return result({ status: "rejected", reason: last?.fresh ? "limited" : "conflict" });
  } catch {
    usageComplete = false;
    observe("database");
    return result({ status: "unavailable" });
  }
}
