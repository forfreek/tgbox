import {
  type EntryKind,
  FunctionCheck,
  type FunctionHealth,
  HealthObservation,
  IdentityReview,
  type PublicHealth,
  publicHealthOf,
} from "@tgbox/shared";
import type { Db } from "./access.ts";

export type HealthView = {
  publicState: PublicHealth;
  observedAt: number | null;
  confirmedAt: number | null;
  reason: string | null;
  revision: number;
  functionState: FunctionHealth;
  functionObservedAt: number | null;
  functionEvidence: FunctionCheck | null;
};
export const unverifiedHealth = (): HealthView => ({
  publicState: "unverified",
  observedAt: null,
  confirmedAt: null,
  reason: null,
  revision: 0,
  functionState: "unverified",
  functionObservedAt: null,
  functionEvidence: null,
});
type WriteResult = { meta: { rows_read: number; rows_written: number } };
type EvidenceRow = {
  observation_id: string;
  observed_at: number;
  source: string;
  evidence: string;
};
const HOUR = 3_600_000;
// A database conditional UPSERT serializes updates without a separate read/CAS race.
// Identity and time predicates are part of the write, and the evidence write is in the SAME batch.
const rebound =
  "(entry_health.binding_username IS NOT excluded.binding_username OR entry_health.binding_kind IS NOT excluded.binding_kind)";
const incomingState = `CASE WHEN entry_health.public_state='identity_review' AND NOT ${rebound} THEN 'identity_review' ELSE excluded.public_state END`;
const sample = `(${rebound} OR entry_health.public_state IS NOT (${incomingState}) OR entry_health.reason IS NOT excluded.reason OR entry_health.evidence_at IS NULL OR excluded.observed_at-entry_health.evidence_at >= ${HOUR})`;
const evidenceSql = `INSERT INTO entry_health_evidence(entry_id,slot,observation_id,observed_at,source,evidence)
 SELECT entry_id,(evidence_seq-1)%16,?, ?, ?, ? FROM entry_health
 WHERE entry_id=? AND write_token=? AND evidence_token=?
 ON CONFLICT(entry_id,slot) DO UPDATE SET observation_id=excluded.observation_id,
 observed_at=excluded.observed_at,source=excluded.source,evidence=excluded.evidence
 WHERE entry_health_evidence.observation_id IS NOT excluded.observation_id`;

export async function recordHealthObservation(db: Db, entryId: number, input: HealthObservation) {
  const o = HealthObservation.parse(input);
  const state = publicHealthOf(o);
  const upsert = db.$client
    .prepare(`INSERT INTO entry_health
   (entry_id,binding_username,binding_kind,public_state,observed_at,confirmed_at,reason,observation_id,revision,evidence_seq,evidence_at,write_token,evidence_token)
   SELECT id,username,kind,?,?,CASE WHEN ?='accessible' THEN ? ELSE NULL END,?,?,1,1,?,?,?
   FROM entries WHERE id=? AND username=? AND kind=?
   AND NOT EXISTS(SELECT 1 FROM entry_health_evidence WHERE observation_id=?)
   ON CONFLICT(entry_id) DO UPDATE SET
    binding_username=excluded.binding_username,binding_kind=excluded.binding_kind,
    public_state=${incomingState},observed_at=excluded.observed_at,
    confirmed_at=CASE WHEN excluded.public_state='accessible' THEN excluded.observed_at WHEN ${rebound} THEN NULL ELSE entry_health.confirmed_at END,
    reason=excluded.reason,observation_id=excluded.observation_id,
    function_state=CASE WHEN ${rebound} OR excluded.public_state='identity_review' THEN 'unverified' ELSE entry_health.function_state END,
    function_at=CASE WHEN ${rebound} OR excluded.public_state='identity_review' THEN NULL ELSE entry_health.function_at END,
    function_observation_id=CASE WHEN ${rebound} OR excluded.public_state='identity_review' THEN NULL ELSE entry_health.function_observation_id END,
    function_evidence=CASE WHEN ${rebound} OR excluded.public_state='identity_review' THEN NULL ELSE entry_health.function_evidence END,
    evidence_seq=entry_health.evidence_seq+CASE WHEN ${sample} THEN 1 ELSE 0 END,
    evidence_at=CASE WHEN ${sample} THEN max(coalesce(entry_health.evidence_at,0),excluded.observed_at) ELSE entry_health.evidence_at END,
    evidence_token=CASE WHEN ${sample} THEN excluded.write_token ELSE entry_health.evidence_token END,
    revision=entry_health.revision+1,write_token=excluded.write_token
   WHERE (${rebound} OR entry_health.observed_at IS NULL OR excluded.observed_at>entry_health.observed_at)
     AND excluded.observed_at>coalesce(entry_health.identity_reviewed_at,-1)
     AND entry_health.observation_id IS NOT excluded.observation_id`)
    .bind(
      state,
      o.startedAt,
      state,
      o.startedAt,
      o.reason,
      o.observationId,
      o.startedAt,
      o.observationId,
      o.observationId,
      entryId,
      o.targetUsername,
      o.expectedKind,
      o.observationId,
    );
  const result = await db.$client.batch([
    upsert,
    db.$client
      .prepare(evidenceSql)
      .bind(
        o.observationId,
        o.startedAt,
        "tme_profile",
        JSON.stringify(o),
        entryId,
        o.observationId,
        o.observationId,
      ),
  ]);
  return {
    accepted: (result[0]?.meta.changes ?? 0) > 0,
    rowsRead: result.reduce((n: number, r: WriteResult) => n + r.meta.rows_read, 0),
    rowsWritten: result.reduce((n: number, r: WriteResult) => n + r.meta.rows_written, 0),
    subrequests: 2,
  };
}

/** Trusted server API only: actor and observedAt must be supplied by authenticated middleware. */
export async function recordFunctionCheck(db: Db, entryId: number, input: FunctionCheck) {
  const o = FunctionCheck.parse(input);
  const upsert = db.$client
    .prepare(`INSERT INTO entry_health
   (entry_id,binding_username,binding_kind,function_state,function_at,function_observation_id,function_evidence,revision,evidence_seq,evidence_at,write_token,evidence_token)
   SELECT id,username,kind,?,?,?,?,1,1,?,?,? FROM entries
   WHERE id=? AND username=? AND kind='bot'
   AND NOT EXISTS(SELECT 1 FROM entry_health_evidence WHERE observation_id=?)
   ON CONFLICT(entry_id) DO UPDATE SET
    binding_username=excluded.binding_username,binding_kind=excluded.binding_kind,
    public_state=CASE WHEN ${rebound} THEN 'unverified' ELSE entry_health.public_state END,
    observed_at=CASE WHEN ${rebound} THEN NULL ELSE entry_health.observed_at END,
    confirmed_at=CASE WHEN ${rebound} THEN NULL ELSE entry_health.confirmed_at END,
    reason=CASE WHEN ${rebound} THEN NULL ELSE entry_health.reason END,
    observation_id=CASE WHEN ${rebound} THEN NULL ELSE entry_health.observation_id END,
    function_state=excluded.function_state,function_at=excluded.function_at,
    function_observation_id=excluded.function_observation_id,function_evidence=excluded.function_evidence,
    revision=entry_health.revision+1,evidence_seq=entry_health.evidence_seq+1,
    evidence_at=max(coalesce(entry_health.evidence_at,0),excluded.function_at),write_token=excluded.write_token,evidence_token=excluded.write_token
   WHERE (${rebound} OR entry_health.function_at IS NULL OR excluded.function_at>entry_health.function_at)
    AND entry_health.public_state!='identity_review'
    AND excluded.function_at>coalesce(entry_health.identity_reviewed_at,-1)
    AND entry_health.function_observation_id IS NOT excluded.function_observation_id`)
    .bind(
      o.result,
      o.observedAt,
      o.observationId,
      JSON.stringify(o),
      o.observedAt,
      o.observationId,
      o.observationId,
      entryId,
      o.targetUsername,
      o.observationId,
    );
  const result = await db.$client.batch([
    upsert,
    db.$client
      .prepare(evidenceSql)
      .bind(
        o.observationId,
        o.observedAt,
        "manual_function_check",
        JSON.stringify(o),
        entryId,
        o.observationId,
        o.observationId,
      ),
  ]);
  return {
    accepted: (result[0]?.meta.changes ?? 0) > 0,
    rowsRead: result.reduce((n: number, r: WriteResult) => n + r.meta.rows_read, 0),
    rowsWritten: result.reduce((n: number, r: WriteResult) => n + r.meta.rows_written, 0),
    subrequests: 2,
  };
}

type Row = {
  entry_id: number;
  public_state: PublicHealth;
  observed_at: number | null;
  confirmed_at: number | null;
  reason: string | null;
  revision: number;
  function_state: FunctionHealth;
  function_at: number | null;
  function_evidence: string | null;
};
export async function readEntryHealthPage(db: Db, ids: number[]) {
  const unique = [...new Set(ids)];
  if (unique.length > 100 || unique.some((id) => !Number.isSafeInteger(id) || id <= 0))
    throw new Error("Invalid health page");
  if (!unique.length) return { states: new Map<number, HealthView>(), rowsRead: 0, subrequests: 0 };
  const rows = await db.$client
    .prepare(
      `SELECT h.* FROM entry_health h JOIN entries e ON e.id=h.entry_id AND e.username=h.binding_username AND e.kind=h.binding_kind WHERE h.entry_id IN (${unique.map(() => "?").join(",")})`,
    )
    .bind(...unique)
    .all<Row>();
  const states = new Map(
    rows.results.map((r: Row) => [
      r.entry_id,
      {
        publicState: r.public_state,
        observedAt: r.observed_at,
        confirmedAt: r.confirmed_at,
        reason: r.reason,
        revision: r.revision,
        functionState: r.function_state,
        functionObservedAt: r.function_at,
        functionEvidence: r.function_evidence
          ? FunctionCheck.parse(JSON.parse(r.function_evidence))
          : null,
      },
    ]),
  );
  return { states, rowsRead: rows.meta.rows_read, subrequests: 1 };
}
export async function listEntryHealth(db: Db, ids: number[]) {
  return (await readEntryHealthPage(db, ids)).states;
}
export async function getEntryHealthEvidence(db: Db, entryId: number) {
  if (!Number.isSafeInteger(entryId) || entryId <= 0) throw new Error("Invalid health entry");
  const result = await db.$client
    .prepare(`SELECT v.observation_id,v.observed_at,v.source,v.evidence FROM entry_health_evidence v
   JOIN entries e ON e.id=v.entry_id
   WHERE v.entry_id=? AND json_extract(v.evidence,'$.targetUsername')=e.username
   AND (v.source='manual_function_check' AND e.kind='bot' OR json_extract(v.evidence,'$.expectedKind')=e.kind)
   ORDER BY v.observed_at DESC,v.slot DESC LIMIT 16`)
    .bind(entryId)
    .all<EvidenceRow>();
  return result.results.map((r: EvidenceRow) => ({
    id: r.observation_id,
    observedAt: r.observed_at,
    source: r.source,
    evidence:
      r.source === "tme_profile"
        ? HealthObservation.parse(JSON.parse(r.evidence))
        : r.source === "manual_identity_review"
          ? IdentityReview.parse(JSON.parse(r.evidence))
          : FunctionCheck.parse(JSON.parse(r.evidence)),
  }));
}
export type HealthBinding = { id: number; username: string; kind: EntryKind };

/** Records an explicit authenticated identity confirmation, never a synthetic successful crawl. */
export async function recordIdentityReview(
  db: Db,
  entryId: number,
  expectedRevision: number,
  input: IdentityReview,
) {
  const o = IdentityReview.parse(input);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
    throw new Error("Invalid health revision");
  const update = db.$client
    .prepare(`UPDATE entry_health SET
 public_state='unverified',observed_at=NULL,confirmed_at=NULL,reason=NULL,observation_id=NULL,
 function_state='unverified',function_at=NULL,function_observation_id=NULL,function_evidence=NULL,
 revision=revision+1,evidence_seq=evidence_seq+1,evidence_at=max(coalesce(evidence_at,0),?),
 identity_reviewed_at=?,write_token=?,evidence_token=?
 WHERE entry_id=? AND revision=? AND binding_username=? AND binding_kind=? AND ?>=coalesce(observed_at,0)
 AND EXISTS(SELECT 1 FROM entries e WHERE e.id=entry_health.entry_id AND e.username=entry_health.binding_username AND e.kind=entry_health.binding_kind)
 AND NOT EXISTS(SELECT 1 FROM entry_health_evidence WHERE observation_id=?)`)
    .bind(
      o.observedAt,
      o.observedAt,
      o.observationId,
      o.observationId,
      entryId,
      expectedRevision,
      o.targetUsername,
      o.expectedKind,
      o.observedAt,
      o.observationId,
    );
  const result = await db.$client.batch([
    update,
    db.$client
      .prepare(evidenceSql)
      .bind(
        o.observationId,
        o.observedAt,
        "manual_identity_review",
        JSON.stringify(o),
        entryId,
        o.observationId,
        o.observationId,
      ),
  ]);
  return {
    accepted: (result[0]?.meta.changes ?? 0) > 0,
    rowsRead: result.reduce((n: number, r: WriteResult) => n + r.meta.rows_read, 0),
    rowsWritten: result.reduce((n: number, r: WriteResult) => n + r.meta.rows_written, 0),
    subrequests: 2,
  };
}
