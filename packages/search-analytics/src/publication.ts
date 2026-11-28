import { z } from "zod";
import { HARD_LIMITS, SearchSettings } from "./config.ts";
import { normalizeKeyword } from "./normalize.ts";
import { type AnalyticsDb, readSettings } from "./runtime.ts";
import { DAY_MS, previousCompleteWindow } from "./time.ts";

const item = z.strictObject({
  keyword: z.string().min(2).max(128),
  rank: z.number().int().min(1).max(6),
});
export const PublishedSearches = z
  .strictObject({
    version: z.literal(1),
    type: z.enum(["trending", "recommended"]),
    generatedAt: z.number().int().nonnegative(),
    window: z.strictObject({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
    generation: z.number().int().positive(),
    configVersion: z.number().int().positive(),
    rulesRevision: z.number().int().positive(),
    items: z.array(item).max(6),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [i, entry] of value.items.entries()) {
      const n = normalizeKeyword(entry.keyword);
      if (!n.ok || n.value.review || entry.rank !== i + 1 || (n.ok && seen.has(n.value.keyword)))
        ctx.addIssue({ code: "custom", message: "Invalid public keyword" });
      if (n.ok) seen.add(n.value.keyword);
    }
  });
type Payload = z.infer<typeof PublishedSearches>;
export type PublicationCache = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: KVNamespacePutOptions): Promise<void>;
};
export type PublicationDatabase = Pick<D1Database, "prepare" | "batch" | "withSession">;
type Authority = {
  publication_key: string | null;
  publication_generation: number;
  publication_rules_revision: number | null;
  publication_config_version: number | null;
  rules_revision: number;
  version: number;
  value: string;
};
async function authority(db: PublicationDatabase) {
  // A fresh primary-first session for EVERY check; a reused bookmark session may read a replica.
  return db
    .withSession("first-primary")
    .prepare(
      `SELECT c.publication_key,c.publication_generation,c.publication_rules_revision,c.publication_config_version,c.rules_revision,s.version,s.value FROM search_control c JOIN search_settings s ON c.id=s.id WHERE c.id=1`,
    )
    .first<Authority>();
}
/** No arbitrary aggregation and no fallback to a stale/previous or unreviewed recommendation. */
export async function readPublishedSearches(
  db: PublicationDatabase,
  cache: PublicationCache,
  enabled: boolean,
): Promise<Payload | null> {
  if (!enabled) return null;
  try {
    const initial = await authority(db);
    if (!initial?.publication_key || !SearchSettings.parse(JSON.parse(initial.value)).publication)
      return null;
    const text = await cache.get(initial.publication_key);
    if (!text || text.length > HARD_LIMITS.publicationBytes) return null;
    const payload = PublishedSearches.parse(JSON.parse(text));
    const current = await authority(db);
    if (
      !current ||
      !SearchSettings.parse(JSON.parse(current.value)).publication ||
      current.publication_key !== initial.publication_key ||
      current.publication_generation !== payload.generation ||
      current.rules_revision !== payload.rulesRevision ||
      current.version !== payload.configVersion ||
      current.publication_rules_revision !== payload.rulesRevision ||
      current.publication_config_version !== payload.configVersion
    )
      return null;
    return payload;
  } catch {
    console.warn("search-analytics", "publication-read");
    return null;
  }
}

type JobDependencies = {
  db: AnalyticsDb;
  cache: PublicationCache;
  enabled: boolean;
  now: () => number;
  recommended: () => Promise<string[]>;
};
type Rule = { pattern: string; match_mode: string; status: string };
export async function refreshSearchPublication(deps: JobDependencies, kind: "cron" | "manual") {
  if (!deps.enabled) return { status: "disabled" as const };
  const started = deps.now(),
    token = crypto.randomUUID();
  let fence: number | undefined;
  let published = false;
  let completed = false;
  let processed = 0;
  let reads = 0,
    writes = 0;
  let phase: "database" | "cache" | "lease" | "revision" | "invalid_payload" | "cleanup" =
    "database";
  const db = deps.db;
  const record = <T>(r: D1Result<T>) => {
    reads += r.meta.rows_read;
    writes += r.meta.rows_written;
    return r;
  };
  try {
    const settings = await readSettings(db);
    reads += settings.usage.rowsRead;
    if (kind === "cron" && !settings.value.jobs) return { status: "disabled" as const };
    const lock = record(
      await db
        .prepare(
          `UPDATE search_control SET lease_token=?,lease_until=?,fence=fence+1 WHERE id=1 AND lease_until<=? RETURNING fence`,
        )
        .bind(token, started + HARD_LIMITS.leaseSeconds * 1000, started)
        .all<{ fence: number }>(),
    );
    fence = lock.results[0]?.fence;
    if (!fence) return { status: "busy" as const };
    record(
      await db
        .prepare(
          `UPDATE search_job_runs SET status='superseded',finished_at=MAX(started_at,?),duration_ms=MAX(0,?-started_at),reason='lease' WHERE status='running' AND fence<?`,
        )
        .bind(started, started, fence)
        .run(),
    );
    record(
      await db
        .prepare(
          `INSERT INTO search_job_runs(run_id,kind,status,fence,started_at) VALUES(?,?,'running',?,?)`,
        )
        .bind(token, kind, fence, started)
        .run(),
    );
    const checkpoint = async () => {
      phase = "lease";
      const t = deps.now();
      if (t - started > HARD_LIMITS.publicationRuntimeMs)
        throw new Error("Publication time budget exceeded");
      const r = record(
        await db
          .prepare(
            `UPDATE search_control SET lease_until=? WHERE id=1 AND lease_token=? AND fence=? AND lease_until>? AND rules_revision=? AND EXISTS(SELECT 1 FROM search_settings WHERE id=1 AND version=?) RETURNING fence`,
          )
          .bind(
            t + HARD_LIMITS.leaseSeconds * 1000,
            token,
            fence,
            t,
            settings.rulesRevision,
            settings.version,
          )
          .all(),
      );
      if (!r.results.length) throw new Error("Publication superseded");
    };
    const window = previousCompleteWindow(started, settings.value.windowDays);
    if (settings.value.publication) {
      const rules = record(
        await db
          .prepare(
            `SELECT pattern,match_mode,status FROM search_keyword_rules WHERE enabled=1 LIMIT ?`,
          )
          .bind(HARD_LIMITS.rules + 1)
          .all<Rule>(),
      ).results;
      if (rules.length > HARD_LIMITS.rules) throw new Error("Rule capacity exceeded");
      const allowed = (word: string) =>
        !rules.some(
          (r) =>
            r.status !== "approved" &&
            (r.match_mode === "exact" ? word === r.pattern : word.includes(r.pattern)),
        );
      const ranked = record(
        await db
          .prepare(`WITH latest AS (SELECT keyword,identity,MAX(day) day FROM search_daily_identities WHERE eligible=1 AND day>=? AND day<=? GROUP BY keyword,identity)
      SELECT keyword,COUNT(*) identities,ROUND(SUM(CASE WHEN day=? THEN ? WHEN day>=date(?,'-2 days') THEN ? ELSE ? END),6) score FROM latest WHERE NOT EXISTS(SELECT 1 FROM search_keyword_rules r WHERE r.enabled=1 AND r.status<>'approved' AND (r.match_mode='exact' AND r.pattern=latest.keyword OR r.match_mode='contains' AND instr(latest.keyword,r.pattern)>0)) GROUP BY keyword HAVING COUNT(*)>=? ORDER BY score DESC,identities DESC,keyword COLLATE BINARY ASC LIMIT ?`)
          .bind(
            window.from,
            window.to,
            window.to,
            settings.value.weights[0],
            window.to,
            settings.value.weights[1],
            settings.value.weights[2],
            settings.value.minimumIdentities,
            HARD_LIMITS.rules + settings.value.rankingSize,
          )
          .all<{ keyword: string; identities: number; score: number }>(),
      ).results;
      processed = ranked.length;
      // Canonical safe display is deterministic across locale/source dimensions.
      let words = ranked
        .map((r) => r.keyword)
        .filter((w) => {
          const n = normalizeKeyword(w);
          return n.ok && !n.value.review && allowed(n.value.keyword);
        })
        .slice(0, settings.value.rankingSize);
      if (
        ranked.length === HARD_LIMITS.rules + settings.value.rankingSize &&
        words.length < settings.value.rankingSize
      ) {
        phase = "invalid_payload";
        throw new Error("Unsafe candidate prefix exceeds capacity");
      }
      let type: Payload["type"] = "trending";
      if (!words.length) {
        type = "recommended";
        const seen = new Set<string>();
        words = [];
        for (const raw of (await deps.recommended()).slice(
          0,
          HARD_LIMITS.recommendationCandidates,
        )) {
          const n = normalizeKeyword(raw);
          if (!n.ok || n.value.review || !allowed(n.value.keyword) || seen.has(n.value.keyword))
            continue;
          seen.add(n.value.keyword);
          words.push(n.value.display);
          if (words.length === settings.value.rankingSize) break;
        }
      }
      await checkpoint();
      phase = "invalid_payload";
      const payload = PublishedSearches.parse({
        version: 1,
        type,
        generatedAt: deps.now(),
        window: { from: window.from, to: window.to },
        generation: fence,
        configVersion: settings.version,
        rulesRevision: settings.rulesRevision,
        items: words.map((keyword, i) => ({ keyword, rank: i + 1 })),
      });
      const key = `search:${type}:v1:global:${fence}:${token}`;
      phase = "cache";
      const text = JSON.stringify(payload);
      await deps.cache.put(key, text, { expirationTtl: (8 * DAY_MS) / 1000 });
      // Read-back is best effort across an eventually consistent store: a miss fails this run safely.
      if ((await deps.cache.get(key)) !== text) throw new Error("Cache validation failed");
      await checkpoint();
      phase = "revision";
      const changes = await db.batch([
        db
          .prepare(
            "UPDATE search_control SET publication_key=?,publication_generation=?,publication_rules_revision=?,publication_config_version=? WHERE id=1 AND lease_token=? AND fence=? AND lease_until>? AND rules_revision=? AND EXISTS(SELECT 1 FROM search_settings WHERE id=1 AND version=?) RETURNING fence",
          )
          .bind(
            key,
            fence,
            settings.rulesRevision,
            settings.version,
            token,
            fence,
            deps.now(),
            settings.rulesRevision,
            settings.version,
          ),
        db
          .prepare(
            "UPDATE search_job_runs SET published=1,ranking_json=? WHERE run_id=? AND EXISTS(SELECT 1 FROM search_control WHERE id=1 AND publication_key=? AND publication_generation=?)",
          )
          .bind(
            JSON.stringify(
              type === "trending" ? ranked.filter((row) => words.includes(row.keyword)) : [],
            ),
            token,
            key,
            fence,
          ),
      ]);
      for (const change of changes) record(change);
      if (!changes[0]?.results.length) throw new Error("Publication superseded");
      published = true;
    }
    phase = "cleanup";
    // Bounded batches; a large backlog is drained over repeated runs, never one unbounded DELETE.
    const dayCutoff = (days: number) =>
      new Date(
        Date.parse(`${window.endExclusive}T00:00:00+08:00`) - (days - 1) * DAY_MS + 8 * 3600000,
      )
        .toISOString()
        .slice(0, 10);
    const cleanup: [string, string, unknown][] = [
      ["search_daily_stats", "day", dayCutoff(settings.value.aggregateRetentionDays)],
      ["search_daily_totals", "day", dayCutoff(settings.value.aggregateRetentionDays)],
      ["search_daily_identities", "day", dayCutoff(settings.value.identityRetentionDays)],
      ["search_identity_days", "day", dayCutoff(settings.value.identityRetentionDays)],
      ["search_event_receipts", "expires_at", deps.now()],
      ["search_rate_limits", "expires_at", deps.now()],
      ["search_security_daily", "day", dayCutoff(settings.value.aggregateRetentionDays)],
      ["search_job_runs", "started_at", started - settings.value.aggregateRetentionDays * DAY_MS],
      [
        "search_admin_audit",
        "created_at",
        started - settings.value.aggregateRetentionDays * DAY_MS,
      ],
    ];
    const cleanupQueries = cleanup.map(([table, column, cutoff]) => {
      const keys =
        table === "search_daily_stats"
          ? "day,keyword,source,locale"
          : table === "search_daily_totals"
            ? "day,source,locale"
            : table === "search_daily_identities"
              ? "day,keyword,identity,source,locale"
              : table === "search_identity_days"
                ? "day,identity,source,locale"
                : table === "search_event_receipts"
                  ? "kind,event_key"
                  : table === "search_rate_limits"
                    ? "scope,subject,window"
                    : table === "search_job_runs"
                      ? "run_id"
                      : table === "search_admin_audit"
                        ? "id"
                        : "day,reason";
      return { table, column, cutoff, keys };
    });
    for (let batch = 0; batch < HARD_LIMITS.cleanupBatches; batch++) {
      phase = "cleanup";
      const t = deps.now();
      if (t - started > HARD_LIMITS.publicationRuntimeMs)
        throw new Error("Cleanup time budget exceeded");
      const guard =
        "EXISTS(SELECT 1 FROM search_control c JOIN search_settings s ON c.id=s.id WHERE c.id=1 AND c.lease_token=? AND c.fence=? AND c.lease_until>? AND c.rules_revision=? AND s.version=?)";
      const results = await db.batch([
        db
          .prepare(
            "UPDATE search_control SET lease_until=? WHERE id=1 AND lease_token=? AND fence=? AND lease_until>? AND rules_revision=? AND EXISTS(SELECT 1 FROM search_settings WHERE id=1 AND version=?) RETURNING fence",
          )
          .bind(
            t + HARD_LIMITS.leaseSeconds * 1000,
            token,
            fence,
            t,
            settings.rulesRevision,
            settings.version,
          ),
        ...cleanupQueries.map(({ table, column, cutoff, keys }) =>
          db
            .prepare(
              `DELETE FROM ${table} WHERE (${keys}) IN (SELECT ${keys} FROM ${table} WHERE ${column}<? LIMIT ?) AND ${guard}`,
            )
            .bind(
              cutoff,
              settings.value.cleanupBatch,
              token,
              fence,
              t,
              settings.rulesRevision,
              settings.version,
            ),
        ),
      ]);
      for (const result of results) record(result);
      if (!results[0]?.results.length) throw new Error("Cleanup superseded");
      if (results.slice(1).every((result) => result.meta.changes < settings.value.cleanupBatch))
        break;
      if (batch === HARD_LIMITS.cleanupBatches - 1)
        throw new Error("Cleanup backlog exceeds run capacity");
    }
    completed = true;
    return { status: "succeeded" as const, processed, published };
  } catch {
    console.warn("search-analytics", `publication-${phase}`);
    return { status: "failed" as const, published, reason: phase };
  } finally {
    if (fence) {
      try {
        const finished = Math.max(started, deps.now());
        await db.batch([
          db
            .prepare(
              `UPDATE search_job_runs SET status=?,finished_at=?,duration_ms=?,processed=?,rows_read=?,rows_written=?,reason=? WHERE run_id=? AND status='running'`,
            )
            .bind(
              completed ? "succeeded" : "failed",
              finished,
              finished - started,
              processed,
              reads,
              writes,
              completed ? null : phase,
              token,
            ),
          db
            .prepare(
              `UPDATE search_control SET lease_token=NULL,lease_until=0 WHERE id=1 AND lease_token=? AND fence=?`,
            )
            .bind(token, fence),
        ]);
      } catch {
        console.warn("search-analytics", "publication-log");
      }
    }
  }
}
