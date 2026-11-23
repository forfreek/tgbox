import { AiSummarySourceInput, prepareAiSummary } from "@tgbox/shared";
import { z } from "zod";
import { decodeSummaryResponse, SummaryCandidate, summaryRequest } from "./models.ts";
import { SUMMARY_PARAMS_VERSION, SUMMARY_PROMPT_VERSION } from "./prompts.ts";

export const EvaluationCase = z.strictObject({
  id: z.string().min(1).max(80),
  origin: z.enum(["historical", "synthetic"]),
  split: z.enum(["development", "holdout"]),
  source: AiSummarySourceInput,
  expected: z.enum(["ok", "insufficient", "needs_review", "retry_wait"]),
  notes: z.string().min(1).max(2000),
});
export const EvaluationCorpus = z.strictObject({
  version: z.string().min(1),
  cases: z
    .array(EvaluationCase)
    .min(1)
    .max(500)
    .refine(
      (rows) => new Set(rows.map((row) => row.id)).size === rows.length,
      "Duplicate case IDs",
    ),
});

export const EvaluationSelection = z.strictObject({
  version: z.string().min(1),
  corpusVersion: z.string().min(1),
  caseIds: z
    .array(z.string().min(1))
    .min(1)
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate selected cases"),
  models: z
    .array(SummaryCandidate)
    .min(1)
    .max(3)
    .refine((names) => new Set(names).size === names.length, "Duplicate models"),
});

export function selectEvaluationCorpus(raw: unknown, selectionRaw: unknown) {
  const corpus = EvaluationCorpus.parse(raw);
  const selection = EvaluationSelection.parse(selectionRaw);
  if (selection.corpusVersion !== corpus.version) throw new Error("corpus_version_mismatch");
  const cases = selection.caseIds.map((id) => {
    const row = corpus.cases.find((item) => item.id === id);
    if (!row) throw new Error("unknown_selected_case");
    return row;
  });
  return { corpus: { version: selection.version, cases }, models: selection.models };
}

export async function evaluationPlan(raw: unknown, names: unknown) {
  const corpus = EvaluationCorpus.parse(raw);
  const models = z
    .array(SummaryCandidate)
    .min(1)
    .max(3)
    .refine((values) => new Set(values).size === values.length)
    .parse(names);
  const cases = corpus.cases.map((row) => {
    const prepared = prepareAiSummary(row.source);
    return { ...row, ...prepared };
  });
  const requests = cases.flatMap((row) =>
    row.decision.status === "eligible"
      ? models.map((model) => ({
          caseId: row.id,
          model,
          request: summaryRequest(row.input, model),
        }))
      : [],
  );
  const body = {
    corpusVersion: corpus.version,
    promptVersion: SUMMARY_PROMPT_VERSION,
    paramsVersion: SUMMARY_PARAMS_VERSION,
    models,
    cases,
    requests,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const planHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return { planHash, ...body };
}

export const EvaluationResults = z.strictObject({
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  provenance: z.enum(["mock", "live"]),
  rows: z
    .array(
      z.strictObject({
        caseId: z.string(),
        model: SummaryCandidate,
        elapsedMs: z.number().finite().nonnegative(),
        response: z.unknown(),
      }),
    )
    .max(1500),
});

const PRICES = {
  "@cf/google/gemma-4-26b-a4b-it": { input: 0.1, output: 0.3 },
  "@cf/zai-org/glm-4.7-flash": { input: 0.0605, output: 0.4 },
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": { input: 0.293, output: 2.253 },
} as const;

export function replayEvaluation(plan: Awaited<ReturnType<typeof evaluationPlan>>, raw: unknown) {
  const results = EvaluationResults.parse(raw);
  if (results.planHash !== plan.planHash) throw new Error("plan_hash_mismatch");
  const keys = new Set<string>();
  for (const row of results.rows) {
    const key = `${row.caseId}/${row.model}`;
    if (keys.has(key)) throw new Error("duplicate_result");
    keys.add(key);
    if (
      !plan.requests.some((request) => request.caseId === row.caseId && request.model === row.model)
    )
      throw new Error("unexpected_result");
  }
  const rows = plan.requests.map((request) => {
    const sample = plan.cases.find((row) => row.id === request.caseId);
    if (!sample) throw new Error("missing_case");
    const response = results.rows.find(
      (row) => row.caseId === request.caseId && row.model === request.model,
    );
    const identity = {
      caseId: request.caseId,
      model: request.model,
      split: sample.split,
      expected: sample.expected,
    };
    if (!response) return { ...identity, status: "missing" as const };
    try {
      const result = decodeSummaryResponse(response.response, sample.input, request.model);
      const price = PRICES[request.model];
      return {
        ...identity,
        status: "valid" as const,
        output: result.output,
        expectedStatusMatches: result.output.status === sample.expected,
        elapsedMs: response.elapsedMs,
        usage: result.usage,
        estimatedUsd: result.usage
          ? (result.usage.prompt_tokens * price.input +
              result.usage.completion_tokens * price.output) /
            1_000_000
          : null,
      };
    } catch {
      return { ...identity, status: "invalid" as const, elapsedMs: response.elapsedMs };
    }
  });
  return {
    planHash: plan.planHash,
    provenance: results.provenance,
    // Matching an expected status is not a factuality score. No automatic quality approval.
    qualityAccepted: false,
    manualReviewRequired: true,
    skippedPreflight: plan.cases
      .filter((row) => row.decision.status !== "eligible")
      .map((row) => ({ id: row.id, decision: row.decision, expected: row.expected })),
    models: plan.models.map((model) => {
      const items = rows.filter((row) => row.model === model);
      const completed = items.filter((row) => row.status !== "missing");
      const valid = items.filter((row) => row.status === "valid");
      const timings = completed.map((row) => row.elapsedMs).sort((a, b) => a - b);
      const percentile = (fraction: number) =>
        timings.length ? timings[Math.max(0, Math.ceil(timings.length * fraction) - 1)] : null;
      return {
        model,
        planned: items.length,
        completed: completed.length,
        valid: valid.length,
        // Denominator includes missing records to prevent partial runs overstating success.
        firstPassValidRate: items.length ? valid.length / items.length : null,
        bySplit: (["development", "holdout"] as const).map((split) => {
          const subset = items.filter((row) => row.split === split);
          const accepted = subset.filter((row) => row.status === "valid");
          return {
            split,
            planned: subset.length,
            valid: accepted.length,
            firstPassValidRate: subset.length ? accepted.length / subset.length : null,
            expectedStatusMatchCount: accepted.filter((row) => row.expectedStatusMatches).length,
          };
        }),
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        knownUsageCount: valid.filter((row) => row.usage !== null).length,
        knownUsageEstimatedUsd: valid.reduce((total, row) => total + (row.estimatedUsd ?? 0), 0),
        costComplete:
          items.length > 0 &&
          valid.length === items.length &&
          valid.every((row) => row.usage !== null),
      };
    }),
    rows,
  };
}
