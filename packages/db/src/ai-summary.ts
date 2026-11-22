import type { AiSummaryModelInput, AiSummaryPreflight } from "@tgbox/shared";
import { eq } from "drizzle-orm";
import type { Db } from "./access.ts";
import {
  aiSummaryJobs,
  aiSummaryRevisions,
  aiSummarySettings,
  aiSummarySources,
} from "./schema.ts";

export type SummaryJob = typeof aiSummaryJobs.$inferSelect;
export type SummaryConfig = typeof aiSummarySettings.$inferSelect;
export const SUMMARY_LEASE_MS = 20 * 60_000;
const DISPATCH_LEASE_MS = 5 * 60_000;

/** One statement reads all D1 content and visibility inputs, in deterministic order. */
export const summaryEntryQuery = `SELECT e.id, e.status, e.kind, e.title, e.username,
  e.description, c.slug AS category, e.hide_posts,
  coalesce((SELECT json_group_array(slug) FROM
    (SELECT t.slug FROM entry_tags et JOIN tags t ON t.id = et.tag_id
     WHERE et.entry_id = e.id ORDER BY t.slug)), '[]') AS tags,
  coalesce((SELECT json_group_array(post_id) FROM
    (SELECT post_id FROM hidden_posts WHERE entry_id = e.id ORDER BY post_id)), '[]') AS hidden,
  coalesce((SELECT value FROM settings WHERE key = 'site'), '{}') AS site
  FROM entries e JOIN categories c ON c.id = e.category_id`;
export type SummaryEntry = {
  id: number;
  status: string;
  kind: string;
  title: string;
  username: string;
  description: string;
  category: string;
  hide_posts: number;
  tags: string;
  hidden: string;
  site: string;
};

// Excludes stats, avatars and unrelated site settings. Used again inside the commit transaction.
const guardQuery = `SELECT json_array(r.id,r.status,r.kind,r.title,r.username,r.description,
  r.category,r.hide_posts,r.tags,r.hidden,json_extract(r.site,'$.postBlocklist'))
  FROM (${summaryEntryQuery}) r WHERE r.id = ? AND r.status = 'approved'`;

export async function readSummaryEntry(db: Db, entryId: number) {
  return db.$client
    .prepare(`SELECT r.*, (${guardQuery}) AS source_guard
    FROM (${summaryEntryQuery}) r WHERE r.id = ?`)
    .bind(entryId, entryId)
    .first<SummaryEntry & { source_guard: string | null }>();
}

export async function getSummaryConfig(db: Db): Promise<SummaryConfig> {
  const row = await db.select().from(aiSummarySettings).where(eq(aiSummarySettings.id, 1)).get();
  if (!row) throw new Error("Missing AI summary settings");
  return row;
}
export function getSummarySource(db: Db, entryId: number) {
  return db.select().from(aiSummarySources).where(eq(aiSummarySources.entryId, entryId)).get();
}
export function getSummaryJob(db: Db, id: string) {
  return db.select().from(aiSummaryJobs).where(eq(aiSummaryJobs.id, id)).get();
}
export function listSummaryRevisions(db: Db, entryId: number) {
  return db.select().from(aiSummaryRevisions).where(eq(aiSummaryRevisions.entryId, entryId));
}

export async function getSummaryUsage(db: Db, now: number) {
  return db.$client
    .prepare(`SELECT count(*) AS calls,coalesce(sum(neurons),0) AS neurons
    FROM ai_summary_attempts WHERE day=?`)
    .bind(new Date(now).toISOString().slice(0, 10))
    .first<{ calls: number; neurons: number }>();
}

type Observation = {
  entryId: number;
  previousToken: string | null;
  guard: string;
  fingerprint: string;
  input: AiSummaryModelInput;
  decision: AiSummaryPreflight;
  now: number;
  priority: number;
};

/** Compare-and-set prevents an older reader replacing a newer observation. */
export async function observeSummarySource(
  db: Db,
  observation: Observation,
  config: SummaryConfig,
) {
  const o = observation;
  const token = crypto.randomUUID();
  const decision = JSON.stringify(o.decision);
  const initialStatus = {
    eligible: "pending",
    skipped: "skipped",
    needs_review: "blocked",
    retry_wait: "retry_wait",
  }[o.decision.status];
  const results = await db.$client.batch([
    db.$client
      .prepare(`INSERT INTO ai_summary_sources
      (entry_id,generation,fingerprint,input,decision,source_guard,observation_token,updated_at)
      SELECT ?,1,?,?,?,?,?,? WHERE (${guardQuery}) = ?
      AND EXISTS(SELECT 1 FROM ai_summary_settings WHERE id=1 AND model=? AND prompt_version=? AND params_version=?)
      ON CONFLICT(entry_id) DO UPDATE SET
        generation = ai_summary_sources.generation + CASE WHEN
          ai_summary_sources.fingerprint IS NOT excluded.fingerprint OR
          ai_summary_sources.decision IS NOT excluded.decision THEN 1 ELSE 0 END,
        fingerprint=excluded.fingerprint,input=excluded.input,decision=excluded.decision,
        source_guard=excluded.source_guard,observation_token=excluded.observation_token,updated_at=excluded.updated_at
      WHERE ai_summary_sources.observation_token = ? AND ai_summary_sources.locked = 0`)
      .bind(
        o.entryId,
        o.fingerprint,
        JSON.stringify(o.input),
        decision,
        o.guard,
        token,
        o.now,
        o.entryId,
        o.guard,
        config.model,
        config.promptVersion,
        config.paramsVersion,
        o.previousToken,
      ),
    db.$client
      .prepare(`UPDATE ai_summary_jobs SET status='superseded',updated_at=?
      WHERE entry_id=? AND (generation != (SELECT generation FROM ai_summary_sources WHERE entry_id=?)
        OR model!=? OR prompt_version!=? OR params_version!=?)
      AND (SELECT observation_token FROM ai_summary_sources WHERE entry_id=?)=?
      AND status IN ('pending','queued','running','retry_wait')`)
      .bind(
        o.now,
        o.entryId,
        o.entryId,
        config.model,
        config.promptVersion,
        config.paramsVersion,
        o.entryId,
        token,
      ),
    db.$client
      .prepare(`UPDATE ai_summary_jobs SET source_guard=? WHERE entry_id=?
      AND generation=(SELECT generation FROM ai_summary_sources WHERE entry_id=?)
      AND (SELECT observation_token FROM ai_summary_sources WHERE entry_id=?)=?`)
      .bind(o.guard, o.entryId, o.entryId, o.entryId, token),
    db.$client
      .prepare(`INSERT OR IGNORE INTO ai_summary_jobs
      (id,entry_id,generation,fingerprint,input,source_guard,model,prompt_version,params_version,
       edit_version,status,reason,priority,due_at,created_at,updated_at)
      SELECT ?,s.entry_id,s.generation,s.fingerprint,s.input,s.source_guard,?,?,?,s.edit_version,?,?,?, ?,?,?
      FROM ai_summary_sources s WHERE s.entry_id=? AND s.observation_token=? AND s.locked=0`)
      .bind(
        crypto.randomUUID(),
        config.model,
        config.promptVersion,
        config.paramsVersion,
        initialStatus,
        o.decision.reason,
        o.priority,
        o.now,
        o.now,
        o.now,
        o.entryId,
        token,
      ),
  ]);
  return results[0]?.meta.changes === 1;
}

export async function invalidateSummarySource(db: Db, entryId: number, now: number) {
  await db.$client.batch([
    db.$client
      .prepare(`UPDATE ai_summary_sources SET generation=generation+1,
      decision='suspended',observation_token=?,updated_at=? WHERE entry_id=?
      AND decision!='suspended' AND NOT EXISTS(SELECT 1 FROM entries WHERE id=? AND status='approved')`)
      .bind(crypto.randomUUID(), now, entryId, entryId),
    db.$client
      .prepare(`UPDATE ai_summary_jobs SET status='superseded',updated_at=?
      WHERE entry_id=? AND status IN ('pending','queued','running','retry_wait')
      AND NOT EXISTS(SELECT 1 FROM entries WHERE id=? AND status='approved')`)
      .bind(now, entryId, entryId),
  ]);
}

/** Lock/unlock always fences in-flight edits, even when the source fingerprint is unchanged. */
export async function setSummaryLocked(db: Db, entryId: number, locked: boolean, now: number) {
  await db.$client.batch([
    db.$client
      .prepare(`UPDATE ai_summary_sources SET locked=?,edit_version=edit_version+1,
    generation=generation+1,observation_token=?,updated_at=? WHERE entry_id=? AND locked!=?`)
      .bind(locked ? 1 : 0, crypto.randomUUID(), now, entryId, locked ? 1 : 0),
    db.$client
      .prepare(`UPDATE ai_summary_jobs SET status='superseded',updated_at=?
      WHERE entry_id=? AND generation!=(SELECT generation FROM ai_summary_sources WHERE entry_id=?)
      AND status IN ('pending','queued','running','retry_wait')`)
      .bind(now, entryId, entryId),
  ]);
}

/** Queued messages lost or expired at the broker are redispatched from the durable outbox. */
export async function takeSummaryOutbox(db: Db, now: number, limit = 5) {
  const rows = await db.$client
    .prepare(`UPDATE ai_summary_jobs SET status='queued',dispatched_at=?,updated_at=?
    WHERE id IN (SELECT j.id FROM ai_summary_jobs j JOIN ai_summary_sources s ON s.entry_id=j.entry_id
      JOIN ai_summary_settings c ON c.id=1
      WHERE j.status IN ('pending','queued','retry_wait') AND j.due_at<=?
      AND (j.dispatched_at IS NULL OR j.dispatched_at<=?) AND j.generation=s.generation AND s.locked=0
      AND c.enabled=1 AND j.model=c.model AND j.prompt_version=c.prompt_version AND j.params_version=c.params_version
      ORDER BY j.priority DESC,j.due_at,j.id LIMIT ?)
    RETURNING id,entry_id,generation,fingerprint`)
    .bind(now, now, now, now - DISPATCH_LEASE_MS, Math.min(20, Math.max(1, limit)))
    .all<{ id: string; entry_id: number; generation: number; fingerprint: string }>();
  return rows.results;
}

/** INSERT reservation and claim in one D1 transaction, guarded by job ownership and daily totals. */
export async function claimSummaryJob(db: Db, jobId: string, now: number) {
  const token = crypto.randomUUID();
  const day = new Date(now).toISOString().slice(0, 10);
  await db.$client.batch([
    db.$client
      .prepare(`INSERT INTO ai_summary_attempts(token,job_id,attempt,day,neurons,created_at)
      SELECT ?,j.id,j.attempts+1,?,c.reservation,? FROM ai_summary_jobs j
      JOIN ai_summary_sources s ON s.entry_id=j.entry_id JOIN ai_summary_settings c ON c.id=1
      WHERE j.id=? AND j.status IN ('pending','queued','retry_wait') AND j.due_at<=?
      AND j.generation=s.generation AND j.edit_version=s.edit_version AND s.locked=0
      AND c.enabled=1 AND j.model=c.model AND j.prompt_version=c.prompt_version AND j.params_version=c.params_version
      AND j.attempts<c.max_attempts
      AND (SELECT count(*) FROM ai_summary_attempts WHERE day=?)<c.daily_calls
      AND coalesce((SELECT sum(neurons) FROM ai_summary_attempts WHERE day=?),0)+c.reservation<=c.daily_neurons`)
      .bind(token, day, now, jobId, now, day, day),
    db.$client
      .prepare(`UPDATE ai_summary_jobs SET status='running',attempts=attempts+1,
      lease_token=?,lease_until=?,updated_at=? WHERE id=?
      AND EXISTS(SELECT 1 FROM ai_summary_attempts WHERE token=? AND job_id=?)`)
      .bind(token, now + SUMMARY_LEASE_MS, now, jobId, token, jobId),
  ]);
  const job = await getSummaryJob(db, jobId);
  return job?.leaseToken === token ? job : null;
}

/** No refunds for unknown upstream outcomes. Expired attempts remain in daily accounting. */
export async function recoverSummaryLeases(db: Db, now: number) {
  await db.$client
    .prepare(`UPDATE ai_summary_jobs SET
    status=CASE WHEN attempts >= (SELECT max_attempts FROM ai_summary_settings WHERE id=1) THEN 'failed' ELSE 'retry_wait' END,
    reason='lease_expired',due_at=?,dispatched_at=NULL,lease_token=NULL,lease_until=NULL,updated_at=?
    WHERE id IN (SELECT id FROM ai_summary_jobs WHERE status='running' AND lease_until<=? LIMIT 20)`)
    .bind(now, now, now)
    .run();
}

export async function deferSummaryJob(
  db: Db,
  id: string,
  dispatchedAt: number,
  now: number,
  reason: string,
  dueAt: number,
  sourceFailure = false,
) {
  await db.$client
    .prepare(`UPDATE ai_summary_jobs SET
    attempts=attempts+?, status=CASE WHEN attempts+? >= (SELECT max_attempts FROM ai_summary_settings WHERE id=1) THEN 'failed' ELSE 'retry_wait' END,
    reason=?,due_at=?,dispatched_at=NULL,updated_at=?
    WHERE id=? AND status='queued' AND dispatched_at=?`)
    .bind(sourceFailure ? 1 : 0, sourceFailure ? 1 : 0, reason, dueAt, now, id, dispatchedAt)
    .run();
}

export async function failSummaryDlq(db: Db, id: string, dispatchedAt: number, now: number) {
  await db.$client
    .prepare(`UPDATE ai_summary_jobs SET status='failed',reason='delivery_exhausted',updated_at=?
    WHERE id=? AND dispatched_at=? AND status IN ('queued','retry_wait')`)
    .bind(now, id, dispatchedAt)
    .run();
}

export async function failSummaryJob(
  db: Db,
  job: SummaryJob,
  now: number,
  reason: string,
  delay: number,
) {
  await db.$client
    .prepare(`UPDATE ai_summary_jobs SET
    status=CASE WHEN attempts >= (SELECT max_attempts FROM ai_summary_settings WHERE id=1) THEN 'failed' ELSE 'retry_wait' END,
    reason=?,due_at=?,dispatched_at=NULL,lease_token=NULL,lease_until=NULL,updated_at=?
    WHERE id=? AND status='running' AND lease_token=? AND lease_until>?`)
    .bind(reason, now + delay, now, job.id, job.leaseToken, now)
    .run();
}

/** The final transaction rechecks authoritative D1 data in addition to the latest observation. */
export async function finishSummaryJob(
  db: Db,
  job: SummaryJob,
  output: string,
  now: number,
  skipped: boolean,
) {
  const results = await db.$client.batch([
    db.$client
      .prepare(`INSERT OR IGNORE INTO ai_summary_revisions
      (id,job_id,entry_id,generation,edit_version,input,output,created_at)
      SELECT ?,j.id,j.entry_id,j.generation,j.edit_version,j.input,?,?
      FROM ai_summary_jobs j JOIN ai_summary_sources s ON s.entry_id=j.entry_id
      JOIN ai_summary_settings c ON c.id=1 WHERE j.id=? AND j.status='running'
      AND j.lease_token=? AND j.lease_until>? AND s.locked=0 AND s.edit_version=j.edit_version
      AND s.generation=j.generation AND c.enabled=1 AND c.model=j.model
      AND c.prompt_version=j.prompt_version AND c.params_version=j.params_version
      AND j.source_guard=(${guardQuery})`)
      .bind(job.leaseToken, output, now, job.id, job.leaseToken, now, job.entryId),
    db.$client
      .prepare(`UPDATE ai_summary_jobs SET
      status=CASE WHEN EXISTS(SELECT 1 FROM ai_summary_revisions WHERE job_id=?) THEN ?
        WHEN (SELECT enabled FROM ai_summary_settings WHERE id=1)=0
          AND generation=(SELECT generation FROM ai_summary_sources WHERE entry_id=ai_summary_jobs.entry_id)
          AND edit_version=(SELECT edit_version FROM ai_summary_sources WHERE entry_id=ai_summary_jobs.entry_id)
          THEN 'retry_wait' ELSE 'superseded' END,
      reason=?,lease_token=NULL,lease_until=NULL,dispatched_at=NULL,due_at=?,updated_at=?
      WHERE id=? AND status='running' AND lease_token=? AND lease_until>?`)
      .bind(
        job.id,
        skipped ? "skipped" : "succeeded",
        skipped ? "model_insufficient" : null,
        now + 300_000,
        now,
        job.id,
        job.leaseToken,
        now,
      ),
  ]);
  return results[0]?.meta.changes === 1;
}

export async function createSummaryRun(db: Db, id: string, startAtEnd = false) {
  await db.$client
    .prepare(`INSERT OR IGNORE INTO ai_summary_runs(id,cursor,upper_bound)
    SELECT ?,CASE WHEN ? THEN coalesce(max(id),0) ELSE 0 END,coalesce(max(id),0) FROM entries`)
    .bind(id, startAtEnd ? 1 : 0)
    .run();
}
export async function claimSummaryRun(db: Db, id: string, now: number) {
  return db.$client
    .prepare(`UPDATE ai_summary_runs SET lease_token=?,lease_until=?
    WHERE id=? AND status='active' AND (lease_until IS NULL OR lease_until<=?)
    RETURNING id,cursor,upper_bound,lease_token`)
    .bind(crypto.randomUUID(), now + SUMMARY_LEASE_MS, id, now)
    .first<{ id: string; cursor: number; upper_bound: number; lease_token: string }>();
}
export async function advanceSummaryRun(
  db: Db,
  run: { id: string; lease_token: string },
  cursor: number,
  complete: boolean,
  now: number,
) {
  await db.$client
    .prepare(`UPDATE ai_summary_runs SET cursor=?,status=?,lease_token=NULL,lease_until=NULL
    WHERE id=? AND lease_token=? AND lease_until>?`)
    .bind(cursor, complete ? "completed" : "active", run.id, run.lease_token, now)
    .run();
}
