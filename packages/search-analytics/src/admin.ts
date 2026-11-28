import { z } from "zod";
import { AdminSearchCommand, AdminSearchQuery } from "./admin-contracts.ts";
import { HARD_LIMITS } from "./config.ts";
import { normalizeKeyword } from "./normalize.ts";
import {
  type PublicationCache,
  type PublicationDatabase,
  readPublishedSearches,
} from "./publication.ts";
import { readSearchRanks } from "./ranking.ts";
import { type AnalyticsDb, readSettings, usage } from "./runtime.ts";
import { beijingDay, DAY_MS, previousCompleteWindow } from "./time.ts";

export class SearchAdminError extends Error {}

type RuleRow = {
  id: number;
  pattern: string;
  match_mode: "exact" | "contains";
  status: "blacklist" | "hidden" | "pending" | "approved";
  enabled: number;
  revision: number;
  updated_at: number;
};
type KeywordRow = {
  keyword: string;
  searches: number;
  zero_results: number;
  trending_clicks: number;
  recommended_clicks: number;
  prefill_searches: number;
  verified_searches: number;
  eligible_identities: number;
  identities: number | null;
  review_status: string;
  published_score: number | null;
};
type Totals = { day: string; searches: number; zero_results: number; identity_days: number };
const privateRanking = z
  .array(
    z.strictObject({
      keyword: z.string().max(128),
      identities: z.number().int().nonnegative(),
      score: z.number().nonnegative(),
    }),
  )
  .max(6);
function queryRange(raw: unknown, now: number) {
  const q = AdminSearchQuery.parse(raw);
  const today = beijingDay(now),
    oldest = beijingDay(now - 89 * DAY_MS);
  if (q.from < oldest || q.from > q.to || q.to > today)
    throw new SearchAdminError("日期须位于最近90天，且起止顺序有效");
  const search = q.search.trim();
  if (search) {
    const n = normalizeKeyword(search);
    if (!n.ok) throw new SearchAdminError("筛选词不符合安全规则（2至64字符）");
    q.search = n.value.keyword;
  }
  return q;
}
function rowsAt<T>(results: D1Result[], index: number): T[] {
  const result = results[index];
  if (!result) throw new SearchAdminError("Incomplete analytics query batch");
  return result.results as T[];
}
const count = (row: { total: number } | null) => row?.total ?? 0;

/** Authenticated adapters only. No identity hashes or raw audit payloads leave this layer. */
export async function readSearchAdmin(
  db: PublicationDatabase,
  cache: PublicationCache | undefined,
  raw: unknown,
  now: number,
) {
  const q = queryRange(raw, now);
  // One primary-first session gives read-your-writes within this admin request.
  const session = db.withSession("first-primary");
  const settings = await readSettings(session);
  const today = beijingDay(now),
    identityStart = beijingDay(now - (settings.value.identityRetentionDays - 1) * DAY_MS);
  const aggregatesStart = beijingDay(now - (settings.value.aggregateRetentionDays - 1) * DAY_MS);
  if (q.view === "settings")
    return {
      kind: "settings" as const,
      settings: { version: settings.version, value: settings.value },
    };
  if (q.view === "overview") {
    const periods = [
      { label: "今日", from: today, to: today },
      { label: "昨日", from: beijingDay(now - DAY_MS), to: beijingDay(now - DAY_MS) },
      ...[7, 30, 90].map((days) => ({
        label: `${days}天`,
        from: beijingDay(now - (days - 1) * DAY_MS),
        to: today,
      })),
    ];
    const results = await session.batch([
      session
        .prepare(
          "SELECT day,searches,zero_results,identity_days FROM search_daily_totals WHERE source='all' AND locale='all' AND day>=? AND day<=? ORDER BY day",
        )
        .bind(aggregatesStart, today),
      ...periods.map((p) =>
        session
          .prepare(
            `SELECT COUNT(DISTINCT keyword) keywords, (SELECT COUNT(DISTINCT identity) FROM search_identity_days WHERE source='all' AND locale='all' AND day>=? AND day<=?) identities FROM search_daily_stats WHERE day>=? AND day<=?`,
          )
          .bind(
            p.from < identityStart ? identityStart : p.from,
            p.to,
            p.from < aggregatesStart ? aggregatesStart : p.from,
            p.to,
          ),
      ),
      session
        .prepare(
          "SELECT source,SUM(searches) searches FROM search_daily_totals WHERE source<>'all' AND locale='all' AND day>=? AND day<=? GROUP BY source",
        )
        .bind(q.from < aggregatesStart ? aggregatesStart : q.from, q.to),
      session
        .prepare(
          "SELECT locale,SUM(searches) searches FROM search_daily_totals WHERE source='all' AND locale<>'all' AND day>=? AND day<=? GROUP BY locale",
        )
        .bind(q.from < aggregatesStart ? aggregatesStart : q.from, q.to),
    ]);
    const daily = rowsAt<Totals>(results, 0);
    const cards = periods.map((p, i) => {
      const rows = daily.filter((r) => r.day >= p.from && r.day <= p.to);
      const extra = rowsAt<{ keywords: number; identities: number }>(results, i + 1)[0] ?? {
        keywords: 0,
        identities: 0,
      };
      return {
        ...p,
        searches: rows.reduce((n, r) => n + r.searches, 0),
        zeroResults: rows.reduce((n, r) => n + r.zero_results, 0),
        identityDays: rows.reduce((n, r) => n + r.identity_days, 0),
        identities: p.from < identityStart ? null : extra.identities,
        keywords: extra.keywords,
        retainedFrom: p.from < aggregatesStart ? aggregatesStart : p.from,
      };
    });
    return {
      kind: "overview" as const,
      cards,
      daily: daily.filter((r) => r.day >= q.from && r.day <= q.to),
      sources: rowsAt<{ source: string; searches: number }>(results, 6),
      languages: rowsAt<{ locale: string; searches: number }>(results, 7),
      identityStart,
      aggregatesStart,
      usage: usage(results),
    };
  }
  if (q.view === "keywords" || q.view === "zero") {
    const start = q.from < aggregatesStart ? aggregatesStart : q.from;
    const params = [start, q.to, q.source, q.source, q.locale, q.locale, q.search, q.search];
    const filter =
      "day>=? AND day<=? AND (?='all' OR source=?) AND (?='all' OR locale=?) AND (?='' OR instr(keyword,?)>0)";
    const having = q.view === "zero" ? "HAVING SUM(zero_results)>0" : "";
    const order =
      q.view === "zero"
        ? "zero_results DESC,keyword ASC"
        : q.sort === "keyword"
          ? "keyword ASC"
          : q.sort === "zero_results"
            ? "zero_results DESC,keyword ASC"
            : "searches DESC,keyword ASC";
    const results = await session.batch([
      session
        .prepare(
          `SELECT COUNT(*) total FROM (SELECT keyword FROM search_daily_stats WHERE ${filter} GROUP BY keyword ${having})`,
        )
        .bind(...params),
      session
        .prepare(`WITH words AS (SELECT keyword,SUM(searches) searches,SUM(zero_results) zero_results,SUM(trending_clicks) trending_clicks,SUM(recommended_clicks) recommended_clicks,SUM(prefill_searches) prefill_searches,SUM(verified_searches) verified_searches,SUM(eligible_identities) eligible_identities FROM search_daily_stats WHERE ${filter} GROUP BY keyword ${having} ORDER BY ${order} LIMIT ? OFFSET ?)
        SELECT w.*,CASE WHEN ?=1 THEN (SELECT COUNT(DISTINCT identity) FROM search_daily_identities i WHERE i.keyword=w.keyword AND i.day>=? AND i.day<=? AND (?='all' OR i.source=?) AND (?='all' OR i.locale=?)) ELSE NULL END identities,
        COALESCE((SELECT status FROM search_keyword_rules r WHERE r.enabled=1 AND (r.match_mode='exact' AND r.pattern=w.keyword OR r.match_mode='contains' AND instr(w.keyword,r.pattern)>0) ORDER BY CASE r.status WHEN 'blacklist' THEN 0 WHEN 'hidden' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,r.id LIMIT 1),'unreviewed') review_status,
        (SELECT json_extract(j.value,'$.score') FROM search_job_runs runs JOIN search_control c ON c.fence>=runs.fence,json_each(runs.ranking_json) j WHERE runs.published=1 AND c.publication_rules_revision=c.rules_revision AND c.publication_config_version=(SELECT version FROM search_settings WHERE id=1) AND runs.fence=c.publication_generation AND json_extract(j.value,'$.keyword')=w.keyword LIMIT 1) published_score
        FROM words w ORDER BY ${order}`)
        .bind(
          ...params,
          q.size,
          q.page * q.size,
          q.from >= identityStart ? 1 : 0,
          q.from,
          q.to,
          q.source,
          q.source,
          q.locale,
          q.locale,
        ),
    ]);
    const rows = rowsAt<KeywordRow>(results, 1);
    const ranks = await Promise.all(
      Array.from({ length: Math.ceil(rows.length / HARD_LIMITS.rankingPage) }, (_, i) =>
        readSearchRanks(
          session,
          settings.value,
          now,
          rows
            .slice(i * HARD_LIMITS.rankingPage, (i + 1) * HARD_LIMITS.rankingPage)
            .map((r) => r.keyword),
        ),
      ),
    );
    const ranked = ranks.flatMap((result) => result.results);
    return {
      kind: "keywords" as const,
      rankingWindow: previousCompleteWindow(now, settings.value.windowDays),
      total: count(rowsAt<{ total: number }>(results, 0)[0] ?? null),
      rows: rows.map((r) => {
        const normalized = normalizeKeyword(r.keyword);
        const rank =
          normalized.ok && !normalized.value.review
            ? ranked.find((x) => x.keyword === r.keyword)
            : undefined;
        return { ...r, ranking_score: rank?.score ?? 0, ranking_identities: rank?.identities ?? 0 };
      }),
      identityStart,
      retainedFrom: start,
      usage: usage([...results, ...ranks]),
    };
  }
  if (q.view === "rules") {
    const params = [q.ruleStatus, q.ruleStatus, q.search, q.search];
    const filter = "(?='all' OR status=?) AND (?='' OR instr(pattern,?)>0)";
    const results = await session.batch([
      session
        .prepare(`SELECT COUNT(*) total FROM search_keyword_rules WHERE ${filter}`)
        .bind(...params),
      session
        .prepare(
          `SELECT id,pattern,match_mode,status,enabled,revision,updated_at FROM search_keyword_rules WHERE ${filter} ORDER BY id DESC LIMIT ? OFFSET ?`,
        )
        .bind(...params, q.size, q.page * q.size),
    ]);
    return {
      kind: "rules" as const,
      total: count(rowsAt<{ total: number }>(results, 0)[0] ?? null),
      rows: rowsAt<RuleRow>(results, 1),
    };
  }
  if (q.view === "security") {
    const rows = await session
      .prepare(
        "SELECT reason,SUM(count) count,MAX(sampled) sampled FROM search_security_daily WHERE day>=? AND day<=? GROUP BY reason ORDER BY reason",
      )
      .bind(q.from < aggregatesStart ? aggregatesStart : q.from, q.to)
      .all<{ reason: string; count: number; sampled: number }>();
    const anomalies = await session
      .prepare(
        "SELECT COUNT(*) total FROM search_keyword_rules WHERE status='pending' AND enabled=1",
      )
      .first<{ total: number }>();
    return {
      kind: "security" as const,
      rows: rows.results,
      pendingRules: count(anomalies),
      sampleDenominator: HARD_LIMITS.securitySampleDenominator,
      sampleDailyCap: settings.value.securitySamplesPerDay,
    };
  }
  if (q.view === "publication") {
    const payload = cache ? await readPublishedSearches(db, cache, true) : null;
    const row = payload
      ? await session
          .prepare("SELECT ranking_json FROM search_job_runs WHERE fence=? AND published=1")
          .bind(payload.generation)
          .first<{ ranking_json: string }>()
      : null;
    const scores = row ? privateRanking.parse(JSON.parse(row.ranking_json)) : [];
    return {
      kind: "publication" as const,
      payload,
      scores,
      settingsVersion: settings.version,
      publicationEnabled: settings.value.publication,
    };
  }
  const from = Date.parse(`${q.from < aggregatesStart ? aggregatesStart : q.from}T00:00:00+08:00`),
    to = Date.parse(`${q.to}T00:00:00+08:00`) + DAY_MS;
  const results = await session.batch([
    session
      .prepare("SELECT COUNT(*) total FROM search_job_runs WHERE started_at>=? AND started_at<?")
      .bind(from, to),
    session
      .prepare(
        "SELECT run_id,kind,status,started_at,finished_at,duration_ms,processed,rows_read,rows_written,reason,published FROM search_job_runs WHERE started_at>=? AND started_at<? ORDER BY started_at DESC,run_id DESC LIMIT ? OFFSET ?",
      )
      .bind(from, to, q.size, q.page * q.size),
    session
      .prepare("SELECT COUNT(*) total FROM search_admin_audit WHERE created_at>=? AND created_at<?")
      .bind(from, to),
    session
      .prepare(
        "SELECT id,action,target,created_at FROM search_admin_audit WHERE created_at>=? AND created_at<? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
      )
      .bind(from, to, q.size, q.page * q.size),
  ]);
  return {
    kind: "jobs" as const,
    total: Math.max(
      count(rowsAt<{ total: number }>(results, 0)[0] ?? null),
      count(rowsAt<{ total: number }>(results, 2)[0] ?? null),
    ),
    jobTotal: count(rowsAt<{ total: number }>(results, 0)[0] ?? null),
    auditTotal: count(rowsAt<{ total: number }>(results, 2)[0] ?? null),
    audits: rowsAt<{ id: number; action: string; target: string; created_at: number }>(results, 3),
    rows: rowsAt<{
      run_id: string;
      kind: string;
      status: string;
      started_at: number;
      finished_at: number | null;
      duration_ms: number | null;
      processed: number;
      rows_read: number;
      rows_written: number;
      reason: string | null;
      published: number;
    }>(results, 1),
  };
}

/** All mutations + their audit share a D1 transaction; audit failure rolls back the mutation. */
export async function changeSearchAdmin(db: AnalyticsDb, raw: unknown, actor: string, now: number) {
  if (!/^[0-9a-f]{64}$/u.test(actor)) throw new SearchAdminError("无效审计身份");
  const data = AdminSearchCommand.parse(raw);
  let statement: D1PreparedStatement;
  let payload: string, target: string;
  if (data.action === "settings") {
    payload = JSON.stringify({
      version: 1,
      expectedVersion: data.expectedVersion,
      value: data.value,
    });
    target = "settings";
    statement = db
      .prepare(
        "UPDATE search_settings SET value=?,version=version+1,updated_at=? WHERE id=1 AND version=? RETURNING version",
      )
      .bind(JSON.stringify(data.value), now, data.expectedVersion);
  } else if (data.action === "rule") {
    const n = normalizeKeyword(data.pattern);
    if (!n.ok) throw new SearchAdminError("规则词不符合安全规范");
    if ((data.id === 0) !== (data.expectedRevision === 0))
      throw new SearchAdminError("规则版本无效");
    const pattern = n.value.keyword;
    target = pattern;
    payload = JSON.stringify({
      version: 1,
      id: data.id,
      expectedRevision: data.expectedRevision,
      pattern,
      match: data.match,
      status: data.status,
      enabled: data.enabled,
    });
    statement =
      data.id === 0
        ? db
            .prepare(
              "INSERT INTO search_keyword_rules(pattern,match_mode,status,enabled,updated_at) SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM search_keyword_rules)<? AND NOT EXISTS(SELECT 1 FROM search_keyword_rules WHERE pattern=? AND match_mode=?) RETURNING id",
            )
            .bind(
              pattern,
              data.match,
              data.status,
              Number(data.enabled),
              now,
              HARD_LIMITS.rules,
              pattern,
              data.match,
            )
        : db
            .prepare(
              "UPDATE search_keyword_rules SET pattern=?,match_mode=?,status=?,enabled=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND NOT EXISTS(SELECT 1 FROM search_keyword_rules WHERE pattern=? AND match_mode=? AND id<>?) RETURNING id",
            )
            .bind(
              pattern,
              data.match,
              data.status,
              Number(data.enabled),
              now,
              data.id,
              data.expectedRevision,
              pattern,
              data.match,
              data.id,
            );
  } else {
    // Refresh is audited only against the exact configuration the operator saw.
    const result = await db
      .prepare(
        "INSERT INTO search_admin_audit(actor,action,target,payload,created_at) SELECT ?,'refresh','global',?,? WHERE EXISTS(SELECT 1 FROM search_settings WHERE id=1 AND version=?) RETURNING id",
      )
      .bind(
        actor,
        JSON.stringify({ version: 1, expectedVersion: data.expectedVersion }),
        now,
        data.expectedVersion,
      )
      .all();
    if (!result.results.length) throw new SearchAdminError("配置已变化，请刷新后重试");
    return { refresh: true, usage: usage([result]) };
  }
  const results = await db.batch([
    statement,
    db
      .prepare(
        "INSERT INTO search_admin_audit(actor,action,target,payload,created_at) SELECT ?,?,?,?,? WHERE changes()=1",
      )
      .bind(actor, data.action, target, payload, now),
  ]);
  if (!results[0]?.results.length)
    throw new SearchAdminError("版本冲突、重复规则或规则数量已达上限，请刷新后重试");
  return { refresh: true, usage: usage(results) };
}
