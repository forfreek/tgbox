import { z } from "zod";
import { CLIENT_POLICY } from "./client-policy.ts";

export const HARD_LIMITS = Object.freeze({
  publicationBytes: 8192,
  publicationRuntimeMs: 90000,
  // Paid D1 permits 1000 binding API calls/invocation; reserve headroom for publication/logs.
  cleanupBatches: 900,
  recommendationCandidates: 30,
  bodyBytes: CLIENT_POLICY.bodyBytes,
  keywordMin: CLIENT_POLICY.keywordMin,
  keywordMax: CLIENT_POLICY.keywordMax,
  initDataHeader: 8192,
  turnstileHeader: 2048,
  sessionCookie: 1024,
  queryPage: 100,
  rankingMaximum: CLIENT_POLICY.rankingMaximum,
  // Ranking uses 9 fixed parameters; reserve space below D1's 100-parameter SQL limit.
  rankingPage: 80,
  rules: 500,
  siteverifyTimeoutMs: 5000,
  resultVerificationTimeoutMs: 3000,
  sessionClockSkewSeconds: 60,
  leaseSeconds: 120,
  sessionMaxAgeSeconds: 86400,
  telegramMaxAgeSeconds: 86400,
  turnstileLifetimeMs: 300000,
  secretMinCharacters: 32,
  securitySampleDenominator: 100,
  maxRecentIdentities: 1000,
  dailyBudgetMaximum: 100000,
});
const integer = (value: number, min: number, max: number) =>
  z.number().int().min(min).max(max).default(value);
/** Steady daily drain bound; rolling expiries can straddle two input budget dates. Not a time guarantee. */
export function minimumCleanupBatch(s: {
  dailyBudget: number;
  sessionIssuesPerDay: number;
  verificationsPerDay: number;
  securitySamplesPerDay: number;
}) {
  // Strictly more than the bound leaves the last batch room to observe an empty tail.
  return (
    1 +
    Math.floor(
      Math.max(
        4 * s.dailyBudget,
        2 *
          (s.dailyBudget + s.sessionIssuesPerDay + s.verificationsPerDay + s.securitySamplesPerDay),
        6 * s.dailyBudget + 2 * s.sessionIssuesPerDay + 4 * s.verificationsPerDay + 16,
      ) / HARD_LIMITS.cleanupBatches,
    )
  );
}
export const SearchSettings = z
  .strictObject({
    enabled: z.boolean().default(false),
    website: z.boolean().default(false),
    miniapp: z.boolean().default(false),
    bot: z.boolean().default(false),
    publication: z.boolean().default(false),
    turnstile: z.boolean().default(false),
    jobs: z.boolean().default(false),
    debounceMs: integer(
      CLIENT_POLICY.debounceMs,
      CLIENT_POLICY.minimumDelay,
      CLIENT_POLICY.maximumDelay,
    ),
    ipPerMinute: integer(60, 10, 300),
    sessionPerHour: integer(30, 1, 100),
    sessionPerDay: integer(100, 1, 300),
    telegramPerDay: integer(100, 1, 300),
    dailyBudget: integer(10000, 1, HARD_LIMITS.dailyBudgetMaximum),
    minimumIdentities: integer(5, 5, 1000),
    rankingSize: integer(HARD_LIMITS.rankingMaximum, 1, HARD_LIMITS.rankingMaximum),
    windowDays: integer(7, 1, 7),
    aggregateRetentionDays: integer(90, 7, 90),
    identityRetentionDays: integer(8, 2, 8),
    sessionLifetimeSeconds: integer(
      HARD_LIMITS.sessionMaxAgeSeconds,
      3600,
      HARD_LIMITS.sessionMaxAgeSeconds,
    ),
    trustedLifetimeSeconds: integer(1800, 60, 3600),
    sessionIssuesPerIpMinute: integer(5, 1, 10),
    sessionIssuesPerDay: integer(10000, 1, HARD_LIMITS.dailyBudgetMaximum),
    securitySamplesPerDay: integer(100, 0, 100),
    challengeAfterSearches: integer(15, 1, 30),
    anomalyIdentitiesPerMinute: integer(20, 10, HARD_LIMITS.maxRecentIdentities),
    challengeAfterSessionIssues: integer(2, 1, 5),
    verificationsPerDay: integer(500, 1, HARD_LIMITS.dailyBudgetMaximum),
    verificationsPerIdentityMinute: integer(3, 1, 5),
    verificationsPerIpMinute: integer(5, 1, 10),
    cleanupBatch: integer(100, 10, 2000),
    challengePolicy: z.enum(["suspicious", "always", "off"]).default("suspicious"),
    weights: z
      .tuple([z.number().min(0.1).max(1), z.number().min(0).max(1), z.number().min(0).max(1)])
      .default([1, 0.6, 0.3]),
  })
  .refine(
    (s) =>
      s.sessionPerDay >= s.sessionPerHour &&
      s.identityRetentionDays >= s.windowDays + 1 &&
      s.aggregateRetentionDays >= s.windowDays + 1 &&
      s.weights[0] >= s.weights[1] &&
      s.weights[1] >= s.weights[2],
    "Inconsistent rate, retention or weight settings",
  )
  .refine((s) => s.cleanupBatch >= minimumCleanupBatch(s), {
    path: ["cleanupBatch"],
    message: "清理批大小不足以覆盖配置预算，请提高每批行数；系统不会自动改变预算",
  });

export type SearchSettings = z.infer<typeof SearchSettings>;
export const defaultSettings = Object.freeze(SearchSettings.parse({}));
Object.freeze(defaultSettings.weights);
/** Deployment gates only disable; they cannot silently raise database-configured budgets. */
export function entryEnabled(
  settings: SearchSettings,
  source: "website" | "miniapp" | "bot",
  deploymentEnabled: boolean,
) {
  return deploymentEnabled && settings.enabled && settings[source];
}
