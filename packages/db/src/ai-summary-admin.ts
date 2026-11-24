import type { Db } from "./access.ts";
import type { SummaryConfig } from "./ai-summary.ts";
import {
  getSummarySource,
  listSummaryRevisions,
  readSummaryEntry,
  summarySourceGuardQuery,
} from "./ai-summary.ts";

export type SummaryReview = {
  entry_id: number;
  revision_id: string;
  zh: string;
  hant: string;
  en: string;
  status: string;
  version: number;
  actor: string;
  updated_at: number;
  sampled_at: number | null;
};
export async function summaryAdminDetail(db: Db, entryId: number) {
  const [entry, source, revisions, review, publication] = await Promise.all([
    readSummaryEntry(db, entryId),
    getSummarySource(db, entryId),
    listSummaryRevisions(db, entryId),
    db.$client
      .prepare("SELECT * FROM ai_summary_reviews WHERE entry_id=?")
      .bind(entryId)
      .first<SummaryReview>(),
    db.$client
      .prepare("SELECT contract_version FROM ai_summary_public WHERE entry_id=?")
      .bind(entryId)
      .first<{ contract_version: number }>(),
  ]);
  return {
    entry,
    source: source ?? null,
    revisions,
    review,
    publicContract: publication?.contract_version ?? null,
  };
}
export type SummaryListRow = {
  id: number;
  username: string;
  title: string;
  kind: string;
  locked: number;
  job_status: string | null;
  reason: string | null;
  review_status: string | null;
  sampled_at: number | null;
};
export async function listSummaryAdmin(db: Db, filter: string, before: number) {
  const condition = {
    all: "1=1",
    pending: "j.status='succeeded' AND coalesce(r.status,'draft')='draft' AND p.entry_id IS NULL",
    failed:
      "(j.status IN ('failed','blocked') OR (j.status='retry_wait' AND coalesce(j.reason,'')!='quota_or_policy'))",
    approved: "p.entry_id IS NOT NULL",
    locked: "s.locked=1",
    sample: "p.entry_id IS NOT NULL",
  }[filter];
  if (!condition) throw new Error("Invalid filter");
  const rows = await db.$client
    .prepare(`SELECT e.id,e.username,e.title,e.kind,coalesce(s.locked,0) AS locked,
    j.status AS job_status,j.reason,coalesce(r.status,CASE WHEN p.contract_version=2 THEN 'auto_published' END) AS review_status,
    coalesce(r.sampled_at,(SELECT max(created_at) FROM audit_log WHERE action='ai_summary.auto_sample' AND target=cast(e.id AS TEXT))) AS sampled_at
    FROM entries e LEFT JOIN ai_summary_sources s ON s.entry_id=e.id
    LEFT JOIN ai_summary_jobs j ON j.id=(SELECT id FROM ai_summary_jobs WHERE entry_id=e.id ORDER BY created_at DESC,id DESC LIMIT 1)
    LEFT JOIN ai_summary_reviews r ON r.entry_id=e.id
    LEFT JOIN ai_summary_public p ON p.entry_id=e.id
    WHERE e.status='approved' AND e.id<? AND ${condition}
    ORDER BY ${filter === "sample" ? "sampled_at ASC," : ""} e.id DESC LIMIT 21`)
    .bind(before)
    .all<SummaryListRow>();
  return {
    rows: rows.results.slice(0, 20),
    next: filter !== "sample" && rows.results.length > 20 ? (rows.results[19]?.id ?? null) : null,
  };
}
function audit(db: Db, actor: string, action: string, target: string, token: string, now: number) {
  return db.$client
    .prepare(`INSERT INTO audit_log(actor,action,target,payload,created_at)
    SELECT ?,?,?,json_object('token',?,'review',json((SELECT json_object(
      'revisionId',revision_id,'status',status,'zh',zh,'hant',hant,'en',en,'version',version)
      FROM ai_summary_reviews WHERE entry_id=s.entry_id))),?
    FROM ai_summary_sources s WHERE observation_token=?`)
    .bind(actor, action, target, token, now, token);
}
export async function saveSummaryConfig(
  db: Db,
  config: SummaryConfig,
  expected: SummaryConfig,
  actor: string,
  now: number,
) {
  const token = crypto.randomUUID();
  // Audit and update share one transaction; exact old configuration is the CAS token.
  const result = await db.$client.batch([
    db.$client
      .prepare(`INSERT INTO audit_log(actor,action,target,payload,created_at)
      SELECT ?,'ai_summary.config','settings',json_object('token',?),? FROM ai_summary_settings
      WHERE id=1 AND enabled=? AND auto_scan=? AND model=? AND prompt_version=? AND params_version=?
      AND daily_calls=? AND daily_neurons=? AND reservation=? AND max_attempts=?`)
      .bind(
        actor,
        token,
        now,
        Number(expected.enabled),
        Number(expected.autoScan),
        expected.model,
        expected.promptVersion,
        expected.paramsVersion,
        expected.dailyCalls,
        expected.dailyNeurons,
        expected.reservation,
        expected.maxAttempts,
      ),
    db.$client
      .prepare(`UPDATE ai_summary_settings SET enabled=?,auto_scan=?,model=?,prompt_version=?,params_version=?,daily_calls=?,daily_neurons=?,reservation=?,max_attempts=?
      WHERE id=1 AND EXISTS(SELECT 1 FROM audit_log WHERE action='ai_summary.config' AND json_extract(payload,'$.token')=?)`)
      .bind(
        Number(config.enabled),
        Number(config.autoScan),
        config.model,
        config.promptVersion,
        config.paramsVersion,
        config.dailyCalls,
        config.dailyNeurons,
        config.reservation,
        config.maxAttempts,
        token,
      ),
  ]);
  return result[0]?.meta.changes === 1;
}
export async function changeSummaryReview(
  db: Db,
  data: {
    entryId: number;
    expectedVersion: number;
    observationToken: string;
    action: "edit" | "approve" | "withdraw" | "lock" | "unlock" | "sample";
    revisionId?: string;
    zh?: string;
    hant?: string;
    en?: string;
    fingerprint?: string;
    guard?: string;
  },
  actor: string,
  now: number,
) {
  const token = crypto.randomUUID();
  const guarded = data.action === "edit" || data.action === "approve";
  const statements = [
    db.$client
      .prepare(`UPDATE ai_summary_sources SET
    edit_version=edit_version+1,generation=generation+1,observation_token=?,updated_at=?,
    locked=CASE WHEN ? IN ('edit','lock') THEN 1 WHEN ?='unlock' THEN 0 ELSE locked END
    WHERE entry_id=? AND edit_version=? AND observation_token=?
    ${
      guarded
        ? `AND fingerprint=? AND source_guard=? AND source_guard=(${summarySourceGuardQuery})
      AND EXISTS(SELECT 1 FROM ai_summary_revisions r JOIN ai_summary_jobs j ON j.id=r.job_id
        WHERE r.id=? AND r.entry_id=ai_summary_sources.entry_id AND j.fingerprint=ai_summary_sources.fingerprint
        AND j.source_guard=ai_summary_sources.source_guard AND json_extract(r.output,'$.status')='ok')`
        : ""
    }`)
      .bind(
        token,
        now,
        data.action,
        data.action,
        data.entryId,
        data.expectedVersion,
        data.observationToken,
        ...(guarded
          ? [data.fingerprint ?? "", data.guard ?? "", data.entryId, data.revisionId ?? ""]
          : []),
      ),
  ];
  if (data.action === "edit") {
    statements.push(
      db.$client
        .prepare(`INSERT INTO ai_summary_reviews(entry_id,revision_id,zh,hant,en,status,version,actor,updated_at)
      SELECT entry_id,?,?,?,?,'draft',edit_version,?,? FROM ai_summary_sources WHERE observation_token=?
      ON CONFLICT(entry_id) DO UPDATE SET revision_id=excluded.revision_id,zh=excluded.zh,hant=excluded.hant,en=excluded.en,
        status='draft',version=excluded.version,actor=excluded.actor,updated_at=excluded.updated_at,sampled_at=NULL`)
        .bind(
          data.revisionId ?? "",
          data.zh ?? "",
          data.hant ?? "",
          data.en ?? "",
          actor,
          now,
          token,
        ),
    );
  } else if (["approve", "withdraw", "sample"].includes(data.action)) {
    if (data.action === "withdraw")
      statements.push(
        db.$client
          .prepare(`INSERT OR IGNORE INTO ai_summary_reviews
      (entry_id,revision_id,zh,hant,en,status,version,actor,updated_at)
      SELECT p.entry_id,(SELECT r.id FROM ai_summary_revisions r JOIN ai_summary_jobs j ON j.id=r.job_id
        WHERE r.entry_id=p.entry_id AND j.fingerprint=p.fingerprint AND j.status='succeeded' ORDER BY r.created_at DESC LIMIT 1),
      p.zh,p.hant,p.en,'withdrawn',s.edit_version,?,? FROM ai_summary_public p
      JOIN ai_summary_sources s ON s.entry_id=p.entry_id WHERE s.observation_token=? AND p.contract_version=2`)
          .bind(actor, now, token),
      );
    statements.push(
      db.$client
        .prepare(`UPDATE ai_summary_reviews SET status=CASE WHEN ?='approve' THEN 'approved' WHEN ?='withdraw' THEN 'withdrawn' ELSE status END,
      version=(SELECT edit_version FROM ai_summary_sources WHERE entry_id=?),actor=?,updated_at=?,
      sampled_at=CASE WHEN ?='sample' THEN ? ELSE sampled_at END
      WHERE entry_id=? AND EXISTS(SELECT 1 FROM ai_summary_sources WHERE observation_token=?)
      ${data.action === "approve" ? "AND revision_id=?" : ""}`)
        .bind(
          data.action,
          data.action,
          data.entryId,
          actor,
          now,
          data.action,
          now,
          data.entryId,
          token,
          ...(data.action === "approve" ? [data.revisionId ?? ""] : []),
        ),
    );
  }
  statements.push(
    db.$client
      .prepare(`UPDATE ai_summary_jobs SET status='superseded',updated_at=? WHERE entry_id=?
    AND status IN ('pending','queued','running','retry_wait') AND EXISTS(SELECT 1 FROM ai_summary_sources WHERE observation_token=?)`)
      .bind(now, data.entryId, token),
  );
  statements.push(audit(db, actor, `ai_summary.${data.action}`, String(data.entryId), token, now));
  if (data.action === "approve") {
    const candidate = `SELECT r.entry_id,r.zh,r.hant,r.en,s.fingerprint FROM ai_summary_reviews r
      JOIN ai_summary_sources s ON s.entry_id=r.entry_id WHERE s.observation_token=? AND r.status='approved'`;
    statements.push(
      db.$client
        .prepare(`INSERT INTO site_state(key,value)
      SELECT 'dirty_since',? WHERE EXISTS(SELECT 1 FROM (${candidate}) n LEFT JOIN ai_summary_public p ON p.entry_id=n.entry_id
        WHERE p.entry_id IS NULL OR p.zh IS NOT n.zh OR p.hant IS NOT n.hant OR p.en IS NOT n.en
        OR p.fingerprint IS NOT n.fingerprint OR p.contract_version!=1) ON CONFLICT(key) DO NOTHING`)
        .bind(String(now), token),
    );
    statements.push(
      db.$client
        .prepare(`INSERT INTO ai_summary_public(entry_id,zh,hant,en,fingerprint,contract_version)
      SELECT entry_id,zh,hant,en,fingerprint,1 FROM (${candidate}) WHERE true
      ON CONFLICT(entry_id) DO UPDATE SET zh=excluded.zh,hant=excluded.hant,en=excluded.en,
      fingerprint=excluded.fingerprint,contract_version=1
      WHERE ai_summary_public.zh IS NOT excluded.zh OR ai_summary_public.hant IS NOT excluded.hant
      OR ai_summary_public.en IS NOT excluded.en OR ai_summary_public.fingerprint IS NOT excluded.fingerprint
      OR ai_summary_public.contract_version!=1`)
        .bind(token),
    );
  } else if (data.action === "edit" || data.action === "withdraw") {
    statements.push(
      db.$client
        .prepare(`INSERT INTO site_state(key,value) SELECT 'dirty_since',?
      WHERE EXISTS(SELECT 1 FROM ai_summary_public p JOIN ai_summary_sources s ON s.entry_id=p.entry_id
      WHERE s.observation_token=?) ON CONFLICT(key) DO NOTHING`)
        .bind(String(now), token),
    );
    statements.push(
      db.$client
        .prepare(`DELETE FROM ai_summary_public WHERE entry_id=?
      AND EXISTS(SELECT 1 FROM ai_summary_sources WHERE observation_token=?)`)
        .bind(data.entryId, token),
    );
  }
  const result = await db.$client.batch(statements);
  return result[0]?.meta.changes === 1;
}

/** Sampling a machine publication must not freeze it or increment the inference generation. */
export async function sampleAutomaticSummary(
  db: Db,
  entryId: number,
  version: number,
  observationToken: string,
  actor: string,
  now: number,
) {
  const result = await db.$client
    .prepare(`INSERT INTO audit_log(actor,action,target,payload,created_at)
    SELECT ?,'ai_summary.auto_sample',cast(s.entry_id AS TEXT),json_object('fingerprint',p.fingerprint),?
    FROM ai_summary_sources s JOIN ai_summary_public p ON p.entry_id=s.entry_id
    WHERE s.entry_id=? AND s.edit_version=? AND s.observation_token=? AND p.contract_version=2
    AND NOT EXISTS(SELECT 1 FROM ai_summary_reviews r WHERE r.entry_id=s.entry_id)`)
    .bind(actor, now, entryId, version, observationToken)
    .run();
  return result.meta.changes === 1;
}
export async function retrySummaryJob(db: Db, entryId: number, actor: string, now: number) {
  const token = crypto.randomUUID();
  // Immutable attempts remain charged. A new generation can retry exhausted technical failures.
  const result = await db.$client.batch([
    db.$client
      .prepare(`UPDATE ai_summary_sources SET generation=generation+1,observation_token=?,updated_at=?
      WHERE entry_id=? AND locked=0 AND EXISTS(SELECT 1 FROM ai_summary_jobs j WHERE j.entry_id=?
        AND j.generation=ai_summary_sources.generation AND j.status IN ('failed','retry_wait')
        AND j.reason IN ('inference_failed','source_read_error','source_parse_error','source_timeout','source_rate_limited','delivery_exhausted','lease_expired'))`)
      .bind(token, now, entryId, entryId),
    db.$client
      .prepare(`UPDATE ai_summary_jobs SET status='superseded',updated_at=? WHERE entry_id=?
      AND status IN ('pending','queued','running','retry_wait') AND EXISTS(SELECT 1 FROM ai_summary_sources WHERE observation_token=?)`)
      .bind(now, entryId, token),
    audit(db, actor, "ai_summary.retry", String(entryId), token, now),
  ]);
  return result[0]?.meta.changes === 1;
}
