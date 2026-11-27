import { z } from "zod";
import { EntryKind } from "./domain.ts";

export const HEALTH_POLICY_VERSION = "health-v1";
export const HEALTH_EVIDENCE_SLOTS = 16;
export const PublicHealth = z.enum(["unverified", "accessible", "uncertain", "identity_review"]);
export type PublicHealth = z.infer<typeof PublicHealth>;
export const FunctionHealth = z.enum(["unverified", "responded", "no_response", "reported_issue"]);
export type FunctionHealth = z.infer<typeof FunctionHealth>;
export const HealthReason = z.enum([
  "profile_recognized",
  "view_placeholder",
  "contact_placeholder",
  "profile_redirect",
  "preview_unavailable",
  "rate_limited",
  "transport_error",
  "http_error",
  "parse_error",
  "kind_mismatch",
  "manual_observation",
]);
export type HealthReason = z.infer<typeof HealthReason>;
const time = z.number().int().nonnegative().max(8_640_000_000_000_000);
export const HealthObservation = z
  .object({
    observationId: z.string().uuid(),
    targetUsername: z.string().regex(/^[a-z0-9_]{1,64}$/),
    expectedKind: EntryKind,
    startedAt: time,
    completedAt: time,
    parserVersion: z.string().min(1).max(64),
    policyVersion: z.literal(HEALTH_POLICY_VERSION),
    outcome: z.enum(["recognized", "uncertain", "identity_changed"]),
    reason: HealthReason,
    httpStatus: z.number().int().min(100).max(599).nullable(),
    pageShape: z.enum(["entity", "view", "contact", "malformed"]).nullable(),
    detectedKind: z.enum(["channel", "group", "bot", "user"]).nullable(),
    previewUnavailable: z.boolean(),
    redirectTarget: z
      .string()
      .max(240)
      .regex(/^[a-z0-9.-]+\/[^?#]*$/)
      .optional(),
    retryAfterMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  })
  .strict()
  .superRefine((o, ctx) => {
    if (o.completedAt < o.startedAt)
      ctx.addIssue({ code: "custom", message: "Observation ended before it started" });
    const positive = o.httpStatus === 200 && o.pageShape === "entity" && o.detectedKind !== null;
    if (
      o.outcome === "recognized" &&
      (!positive || o.detectedKind !== o.expectedKind || o.reason !== "profile_recognized")
    )
      ctx.addIssue({
        code: "custom",
        message: "Recognition requires matching positive identity evidence",
      });
    if (
      o.outcome === "identity_changed" &&
      (!positive || o.detectedKind === o.expectedKind || o.reason !== "kind_mismatch")
    )
      ctx.addIssue({
        code: "custom",
        message: "Identity change requires positive evidence of a different kind",
      });
    if (
      o.outcome === "uncertain" &&
      (o.reason === "profile_recognized" ||
        o.reason === "kind_mismatch" ||
        o.reason === "manual_observation")
    )
      ctx.addIssue({ code: "custom", message: "Invalid uncertain reason" });
  });
export type HealthObservation = z.infer<typeof HealthObservation>;
export const FunctionCheck = z
  .object({
    observationId: z.string().uuid(),
    targetUsername: z.string().regex(/^[a-z0-9_]{1,64}$/),
    observedAt: time,
    result: FunctionHealth.exclude(["unverified"]),
    action: z.string().trim().min(1).max(160),
    scope: z.string().trim().min(1).max(400),
    note: z.string().trim().max(500),
    actor: z.string().trim().min(1).max(160),
  })
  .strict();
export type FunctionCheck = z.infer<typeof FunctionCheck>;

/** Web evidence can update diagnostics, never publication or the confirmed entry kind. */
export function publicHealthOf(observation: HealthObservation): PublicHealth {
  const o = HealthObservation.parse(observation);
  return o.outcome === "recognized"
    ? "accessible"
    : o.outcome === "identity_changed"
      ? "identity_review"
      : "uncertain";
}
export const publicHealthLabels: Record<PublicHealth, string> = {
  unverified: "未检查",
  accessible: "公开身份可识别",
  uncertain: "本次未能确认",
  identity_review: "身份或类型待复核",
};
export const functionHealthLabels: Record<FunctionHealth, string> = {
  unverified: "功能未验证",
  responded: "已记录响应",
  no_response: "本次未响应",
  reported_issue: "已记录功能问题",
};

export const IdentityReview = FunctionCheck.omit({ result: true }).extend({
  expectedKind: EntryKind,
  action: z.literal("confirm_identity"),
});
export type IdentityReview = z.infer<typeof IdentityReview>;

/** Strip user info, query and fragment before persisting a diagnostic redirect. */
export function healthRedirectTarget(target: string): string | undefined {
  try {
    const url = new URL(target, "https://t.me");
    if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
    return `${url.hostname}${url.pathname}`.slice(0, 240);
  } catch {
    return undefined;
  }
}

export const healthReasonLabels: Record<HealthReason, string> = {
  profile_recognized: "公开主页身份可识别",
  view_placeholder: "网页仅返回View占位信息",
  contact_placeholder: "网页仅返回Contact占位信息",
  profile_redirect: "主页发生重定向",
  preview_unavailable: "主页可识别，消息预览不可用",
  rate_limited: "来源限流，等待重试",
  transport_error: "本次网络请求未完成",
  http_error: "来源返回异常HTTP状态",
  parse_error: "网页结构未能识别",
  kind_mismatch: "识别类型与收录类型不同",
  manual_observation: "人工记录",
};
