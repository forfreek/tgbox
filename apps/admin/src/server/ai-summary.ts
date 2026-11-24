import { observeEntry, readSummaryEvidence } from "@tgbox/ai-summary/sources";
import type { Actor, CoreContext } from "@tgbox/core";
import {
  changeSummaryReview,
  getSummaryConfig,
  getSummaryUsage,
  insertAuditLog,
  listSummaryAdmin,
  retrySummaryJob,
  saveSummaryConfig,
  summaryAdminDetail,
} from "@tgbox/db";
import {
  SUMMARY_MODEL,
  SUMMARY_PARAMS_VERSION,
  SUMMARY_PROMPT_VERSION,
  supportedSummaryConfig,
} from "@tgbox/shared";
import { z } from "zod";

const id = z.number().int().positive();
const text = z
  .string()
  .trim()
  .min(1)
  .refine((s) => Array.from(s).length <= 120, "中文最多120字");
export const SummaryConfigInput = z.strictObject({
  enabled: z.boolean(),
  autoScan: z.boolean(),
  model: z.literal(SUMMARY_MODEL),
  promptVersion: z.literal(SUMMARY_PROMPT_VERSION),
  paramsVersion: z.literal(SUMMARY_PARAMS_VERSION),
  dailyCalls: z.number().int().min(0).max(1000),
  dailyNeurons: z.number().int().min(0).max(1_000_000),
  reservation: z.number().int().min(100).max(10000),
  maxAttempts: z.number().int().min(1).max(10),
});
const configSnapshot = z.strictObject({
  id: z.literal(1),
  enabled: z.boolean(),
  autoScan: z.boolean(),
  model: z.string(),
  promptVersion: z.string(),
  paramsVersion: z.string(),
  dailyCalls: z.number().int(),
  dailyNeurons: z.number().int(),
  reservation: z.number().int(),
  maxAttempts: z.number().int(),
});
const base = {
  entryId: id,
  expectedVersion: z.number().int().nonnegative(),
  observationToken: z.string().min(1).max(100),
};
export const SummaryCommand = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("config"),
    config: SummaryConfigInput,
    expected: configSnapshot,
  }),
  z.strictObject({
    action: z.literal("edit"),
    ...base,
    revisionId: z.uuid(),
    zh: text,
    hant: text,
    en: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .refine((s) => s.split(/\s+/u).length <= 90, "英文最多90词"),
  }),
  z.strictObject({ action: z.literal("approve"), ...base, revisionId: z.uuid() }),
  z.strictObject({ action: z.enum(["withdraw", "lock", "unlock", "sample"]), ...base }),
  z.strictObject({ action: z.literal("retry"), entryId: id }),
]);
export const SummaryBatch = z.strictObject({
  ids: z
    .array(id)
    .min(1)
    .max(20)
    .refine((xs) => new Set(xs).size === xs.length),
  generate: z.boolean(),
});
export const SummaryList = z.strictObject({
  filter: z.enum(["all", "pending", "failed", "approved", "locked", "sample"]),
  before: id.default(Number.MAX_SAFE_INTEGER),
});
type Media = Pick<R2Bucket, "get">;

export async function summaryOverview(core: CoreContext, query: z.infer<typeof SummaryList>) {
  const [config, usage, list] = await Promise.all([
    getSummaryConfig(core.db),
    getSummaryUsage(core.db, core.now()),
    listSummaryAdmin(core.db, query.filter, query.before),
  ]);
  return {
    config,
    usage,
    list,
    supported: {
      model: SUMMARY_MODEL,
      promptVersion: SUMMARY_PROMPT_VERSION,
      paramsVersion: SUMMARY_PARAMS_VERSION,
    } as const,
  };
}
export async function summaryBatch(core: CoreContext, media: Media, raw: unknown, actor: Actor) {
  const data = SummaryBatch.parse(raw);
  const config = await getSummaryConfig(core.db);
  if (data.generate && !supportedSummaryConfig(config)) throw new Error("请先保存已验证的模型配置");
  if (data.generate)
    await insertAuditLog(core.db, {
      actor,
      action: "ai_summary.generate_requested",
      target: data.ids.join(","),
      payload: { count: data.ids.length },
      createdAt: core.now(),
    });
  const rows = [];
  for (const entryId of data.ids) {
    try {
      if (data.generate) {
        const result = await observeEntry(core.db, media, entryId, config, core.now(), 2);
        rows.push({
          entryId,
          status: result?.decision.status ?? "unavailable_or_locked",
          reason: result?.decision.reason ?? "not_observed",
        });
      } else {
        const result = await readSummaryEvidence(core.db, media, entryId);
        rows.push({
          entryId,
          status: result?.previous?.locked ? "locked" : (result?.decision.status ?? "unavailable"),
          reason: result?.decision.reason ?? "not_approved_or_missing",
        });
      }
    } catch {
      rows.push({ entryId, status: "error", reason: "source_read_error" });
    }
  }
  return { rows };
}
export async function summaryCommand(core: CoreContext, media: Media, raw: unknown, actor: Actor) {
  const data = SummaryCommand.parse(raw);
  if (data.action === "config") {
    const ok = await saveSummaryConfig(
      core.db,
      { ...data.config, id: 1 },
      data.expected,
      actor,
      core.now(),
    );
    if (!ok) throw new Error("配置已被其他管理员修改，请刷新后重试");
    return { ok: true };
  }
  if (data.action === "retry") {
    const config = await getSummaryConfig(core.db);
    if (!supportedSummaryConfig(config)) throw new Error("请先保存已验证的模型配置");
    if (!(await retrySummaryJob(core.db, data.entryId, actor, core.now())))
      throw new Error("仅可重试未锁定条目的技术失败，资料不足不重跑");
    await observeEntry(core.db, media, data.entryId, config, core.now(), 2);
    return { ok: true };
  }
  const detail = await summaryAdminDetail(core.db, data.entryId);
  if (!detail.source) throw new Error("请先预检并生成该条目");
  if (data.action === "sample" && !detail.review && detail.publicContract === 2) {
    const { sampleAutomaticSummary } = await import("@tgbox/db");
    if (
      !(await sampleAutomaticSummary(
        core.db,
        data.entryId,
        data.expectedVersion,
        data.observationToken,
        actor,
        core.now(),
      ))
    )
      throw new Error("摘要版本已变化，请刷新后重试");
    return { ok: true };
  }
  if (
    ["approve", "withdraw", "sample"].includes(data.action) &&
    !detail.review &&
    !(data.action === "withdraw" && detail.publicContract === 2)
  )
    throw new Error("请先保存三语草稿");
  if (data.action === "sample" && detail.review?.status !== "approved")
    throw new Error("仅可对已批准内容标记抽检");
  let fingerprint: string | undefined, guard: string | undefined;
  if (data.action === "edit" || data.action === "approve") {
    if (data.action === "approve" && detail.review?.revision_id !== data.revisionId)
      throw new Error("审核版本已变化，请刷新");
    const fresh = await readSummaryEvidence(core.db, media, data.entryId);
    if (fresh?.decision.status !== "eligible") throw new Error("当前来源不可用，不能保存或批准");
    fingerprint = fresh.fingerprint;
    guard = fresh.guard;
  }
  const ok = await changeSummaryReview(core.db, { ...data, fingerprint, guard }, actor, core.now());
  if (!ok) throw new Error("资料或编辑版本已变化，请刷新并重新核对证据");
  return { ok: true };
}
