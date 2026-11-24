import {
  advanceSummaryRun,
  claimSummaryRun,
  createSummaryRun,
  type Db,
  getSummaryConfig,
  publishSummaryRevision,
} from "@tgbox/db";
import {
  AiSummaryModelInput,
  supportedSummaryConfig,
  validateAiSummaryOutput,
} from "@tgbox/shared";
import { readSummaryEvidence } from "./sources.ts";

type Media = Pick<R2Bucket, "get">;
const candidates = `SELECT r.id,r.entry_id,r.input,r.output FROM ai_summary_revisions r
  JOIN ai_summary_jobs j ON j.id=r.job_id JOIN ai_summary_sources s ON s.entry_id=r.entry_id
  JOIN ai_summary_settings c ON c.id=1
  WHERE j.status='succeeded' AND s.locked=0 AND r.generation=s.generation AND r.edit_version=s.edit_version
  AND j.model=c.model AND j.prompt_version=c.prompt_version AND j.params_version=c.params_version
  AND NOT EXISTS(SELECT 1 FROM ai_summary_reviews h WHERE h.entry_id=r.entry_id)`;

/** Retries publication from an existing revision, never inference or manual approval. */
export async function publishSummaryEntry(db: Db, media: Media, entryId: number, now: number) {
  try {
    const config = await getSummaryConfig(db);
    if (!config.enabled || !supportedSummaryConfig(config)) return;
    const row = await db.$client
      .prepare(`${candidates} AND r.entry_id=? LIMIT 1`)
      .bind(entryId)
      .first<{ id: string; entry_id: number; input: string; output: string }>();
    if (!row) return;
    const result = validateAiSummaryOutput(
      JSON.parse(row.output),
      AiSummaryModelInput.parse(JSON.parse(row.input)),
    );
    if (!result.success || result.data.status !== "ok") return;
    const evidence = await readSummaryEvidence(db, media, entryId);
    if (evidence?.decision.status !== "eligible") return;
    await publishSummaryRevision(
      db,
      {
        entryId,
        revisionId: row.id,
        fingerprint: evidence.fingerprint,
        guard: evidence.guard,
        zh: result.data.sentences.map((s) => s.zh).join(""),
        en: result.data.sentences.map((s) => s.en).join(" "),
      },
      now,
    );
  } catch {
    // The persisted successful inference remains succeeded. Cron retries only publication.
    console.error("ai_summary_publish_error", { entryId });
  }
}

/** Bounded persistent sweep also publishes existing machine drafts when enabling automation. */
export async function sweepSummaryPublication(
  db: Db,
  media: Media,
  now: () => number,
  scope?: readonly number[],
) {
  if (scope && !scope.length) return;
  const config = await getSummaryConfig(db);
  if (!config.enabled) return;
  await createSummaryRun(db, "auto_publish");
  await db.$client
    .prepare(`UPDATE ai_summary_runs SET cursor=0,
    upper_bound=(SELECT coalesce(max(id),0) FROM entries),status='active'
    WHERE id='auto_publish' AND status='completed'`)
    .run();
  const run = await claimSummaryRun(db, "auto_publish", now());
  if (!run) return;
  const rows = await db.$client
    .prepare(`${candidates} AND r.entry_id>? AND r.entry_id<=?
    ORDER BY r.entry_id LIMIT 10`)
    .bind(run.cursor, run.upper_bound)
    .all<{ entry_id: number }>();
  let cursor = run.cursor;
  for (const row of rows.results) {
    if (!scope || scope.includes(row.entry_id))
      await publishSummaryEntry(db, media, row.entry_id, now());
    cursor = row.entry_id;
  }
  await advanceSummaryRun(
    db,
    run,
    cursor,
    rows.results.length < 10 || cursor >= run.upper_bound,
    now(),
  );
}
