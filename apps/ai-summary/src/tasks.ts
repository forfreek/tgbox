import {
  advanceSummaryRun,
  claimSummaryJob,
  claimSummaryRun,
  createSummaryRun,
  type Db,
  deferSummaryJob,
  failSummaryDlq,
  failSummaryJob,
  finishSummaryJob,
  getSummaryConfig,
  getSummaryJob,
  recoverSummaryLeases,
  takeSummaryOutbox,
} from "@tgbox/db";
import {
  AiSummaryModelInput,
  type SummaryVersions,
  supportedSummaryConfig,
  validateAiSummaryOutput,
} from "@tgbox/shared";
import { z } from "zod";
import { observeEntry } from "./sources.ts";

export const SummaryMessage = z.strictObject({
  v: z.literal(1),
  jobId: z.uuid(),
  entryId: z.number().int().positive(),
  generation: z.number().int().positive(),
  inputHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  dispatchedAt: z.number().int().nonnegative(),
});
export type SummaryMessage = z.infer<typeof SummaryMessage>;
export type SummaryModel = (
  input: z.infer<typeof AiSummaryModelInput>,
  model: string,
  versions: SummaryVersions,
) => Promise<unknown>;
type Media = Pick<R2Bucket, "get">;
type Sender = { sendBatch(messages: { body: SummaryMessage }[]): Promise<unknown> };

export const SummaryObserveMessage = z.strictObject({
  v: z.literal(1),
  action: z.literal("observe"),
  entryId: z.number().int().positive(),
});

/** Explicit initial backfill; use the same fresh-source/idempotency path as the cron. */
export async function consumeSummaryObservation(
  db: Db,
  media: Media,
  queue: Sender,
  raw: unknown,
  now: () => number,
  scope: readonly number[],
) {
  const message = SummaryObserveMessage.parse(raw);
  if (!scope.includes(message.entryId)) return;
  const config = await getSummaryConfig(db);
  if (!config.enabled) return;
  await observeEntry(db, media, message.entryId, config, now(), 1);
  await dispatchSummaryOutbox(db, queue, now(), scope);
}

export async function dispatchSummaryOutbox(
  db: Db,
  queue: Sender,
  now: number,
  scope?: readonly number[],
) {
  const jobs = await takeSummaryOutbox(db, now, 2, scope);
  if (jobs.length === 0) return 0;
  // Marking before send is intentional. A crash or ambiguous send is recovered after the dispatch lease.
  await queue.sendBatch(
    jobs.map((job) => ({
      body: {
        v: 1,
        jobId: job.id,
        entryId: job.entry_id,
        generation: job.generation,
        inputHash: job.fingerprint,
        dispatchedAt: now,
      },
    })),
  );
  return jobs.length;
}

export async function consumeSummaryMessage(
  db: Db,
  media: Media,
  raw: unknown,
  now: () => number,
  model?: SummaryModel,
  random = Math.random,
  scope?: readonly number[],
) {
  const message = SummaryMessage.parse(raw);
  if (scope && !scope.includes(message.entryId)) return;
  let job = await getSummaryJob(db, message.jobId);
  if (
    job?.status !== "queued" ||
    job.entryId !== message.entryId ||
    job.generation !== message.generation ||
    job.fingerprint !== message.inputHash ||
    job.dispatchedAt !== message.dispatchedAt ||
    job.dueAt > now()
  )
    return;
  const config = await getSummaryConfig(db);
  if (!config.enabled || !model) {
    await deferSummaryJob(
      db,
      job.id,
      message.dispatchedAt,
      now(),
      "generation_paused",
      now() + 300_000,
    );
    return;
  }
  if (!supportedSummaryConfig(config) || !supportedSummaryConfig(job)) {
    await deferSummaryJob(
      db,
      job.id,
      message.dispatchedAt,
      now(),
      "unsupported_config",
      now() + 300_000,
    );
    return;
  }
  const fresh = await observeEntry(db, media, job.entryId, config, now(), job.priority);
  if (!fresh) return;
  if (fresh.decision.status === "retry_wait") {
    await deferSummaryJob(
      db,
      job.id,
      message.dispatchedAt,
      now(),
      fresh.decision.reason,
      now() + 60_000,
      true,
    );
    return;
  }
  if (fresh.decision.status !== "eligible" || fresh.fingerprint !== job.fingerprint) return;
  const claimed = await claimSummaryJob(db, job.id, now());
  if (!claimed) {
    const tomorrow = (Math.floor(now() / 86_400_000) + 1) * 86_400_000;
    await deferSummaryJob(db, job.id, message.dispatchedAt, now(), "quota_or_policy", tomorrow);
    return;
  }
  job = claimed;
  try {
    const input = AiSummaryModelInput.parse(JSON.parse(job.input));
    const result = validateAiSummaryOutput(
      await model(input, job.model, {
        promptVersion: job.promptVersion,
        paramsVersion: job.paramsVersion,
      }),
      input,
    );
    if (!result.success) throw new Error("invalid_output");
    // Re-observe D1 and R2 after inference. The final SQL also checks D1 inside its transaction.
    const latestConfig = await getSummaryConfig(db);
    const latest = await observeEntry(db, media, job.entryId, latestConfig, now(), job.priority);
    if (!latest || latest.fingerprint !== job.fingerprint || latest.decision.status !== "eligible")
      return;
    await finishSummaryJob(
      db,
      job,
      JSON.stringify(result.data),
      now(),
      result.data.status === "insufficient",
    );
  } catch {
    const delay = Math.min(21_600_000, 30_000 * 2 ** job.attempts) + Math.floor(random() * 30_000);
    await failSummaryJob(db, job, now(), "inference_failed", delay);
  }
}

export async function consumeSummaryDlq(db: Db, raw: unknown, now: number) {
  const message = SummaryMessage.parse(raw);
  const job = await getSummaryJob(db, message.jobId);
  if (
    job?.entryId === message.entryId &&
    job.generation === message.generation &&
    job.fingerprint === message.inputHash
  ) {
    await failSummaryDlq(db, job.id, message.dispatchedAt, now);
  }
}

export async function scanSummaryRun(
  db: Db,
  media: Media,
  id: string,
  now: () => number,
  priority = 0,
) {
  const config = await getSummaryConfig(db);
  if (!config.enabled) return;
  const run = await claimSummaryRun(db, id, now());
  if (!run) return;
  const rows = await db.$client
    .prepare("SELECT id FROM entries WHERE id>? AND id<=? ORDER BY id LIMIT 2")
    .bind(run.cursor, run.upper_bound)
    .all<{ id: number }>();
  let cursor = run.cursor;
  for (const row of rows.results) {
    try {
      await observeEntry(db, media, row.id, config, now(), priority);
    } catch {
      // A malformed row must not starve later IDs. A subsequent rolling pass retries it.
      console.error("ai_summary_source_error", { entryId: row.id });
    }
    cursor = row.id;
  }
  await advanceSummaryRun(
    db,
    run,
    cursor,
    rows.results.length < 2 || cursor >= run.upper_bound,
    now(),
  );
}

export async function tickSummaryTasks(
  db: Db,
  media: Media,
  queue: Sender,
  now: () => number,
  scope?: readonly number[],
) {
  const config = await getSummaryConfig(db);
  if (!config.enabled) return;
  if (scope && scope.length === 0) return;
  await recoverSummaryLeases(db, now());
  if (!config.autoScan) {
    await dispatchSummaryOutbox(db, queue, now(), scope);
    return;
  }
  if (scope) {
    // Two fixed IDs per five-minute slot: a 50-entry pass takes 125 minutes.
    const start = (Math.floor(now() / 300_000) * 2) % scope.length;
    for (let offset = 0; offset < Math.min(2, scope.length); offset++) {
      const id = scope[(start + offset) % scope.length];
      if (id === undefined) continue;
      try {
        await observeEntry(db, media, id, config, now());
      } catch {
        console.error("ai_summary_source_error", { entryId: id });
      }
    }
    await dispatchSummaryOutbox(db, queue, now(), scope);
    return;
  }
  // Newest IDs get a separate cursor and priority. Rolling passes cover older rows and edits.
  await createSummaryRun(db, "newest", true);
  await createSummaryRun(db, "rolling");
  await db.$client.batch([
    db.$client.prepare(`UPDATE ai_summary_runs SET cursor=upper_bound,
      upper_bound=(SELECT coalesce(max(id),0) FROM entries),status='active'
      WHERE id='newest' AND status='completed'`),
    db.$client.prepare(`UPDATE ai_summary_runs SET cursor=0,
      upper_bound=(SELECT coalesce(max(id),0) FROM entries),status='active'
      WHERE id='rolling' AND status='completed'`),
  ]);
  await scanSummaryRun(db, media, "newest", now, 1);
  await scanSummaryRun(db, media, "rolling", now);
  await dispatchSummaryOutbox(db, queue, now());
}
