import { validateAiSummaryOutput } from "@tgbox/shared";
import { z } from "zod";
import { SUMMARY_PARAMS_VERSION, SUMMARY_PROMPT_VERSION, summaryMessages } from "./prompts.ts";

export const SummaryCandidate = z.enum([
  "@cf/google/gemma-4-26b-a4b-it",
  "@cf/zai-org/glm-4.7-flash",
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
]);
export type SummaryCandidate = z.infer<typeof SummaryCandidate>;
// Only this candidate has passed the scoped live source review. Others remain experimental.
export const DEFAULT_SUMMARY_MODEL = "@cf/google/gemma-4-26b-a4b-it";
export const SUPPORTED_SUMMARY_MODELS = [DEFAULT_SUMMARY_MODEL] as const;
export const MAX_COMPLETION_TOKENS = 1024;
const MAX_RESPONSE_CHARS = 16_384;

// Provider-side constraint is deliberately simple. The shared validator enforces the union,
// sentence bounds, exact keys, cited evidence, scripts and supported numbers afterwards.
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "sentences"],
  properties: {
    status: { type: "string", enum: ["ok", "insufficient"] },
    sentences: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["zh", "en", "refs"],
        properties: {
          zh: { type: "string" },
          en: { type: "string" },
          refs: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};

export function summaryRequest(raw: unknown, modelName: string) {
  const model = SummaryCandidate.parse(modelName);
  const common = { messages: summaryMessages(raw), temperature: 0, stream: false as const };
  if (model === "@cf/meta/llama-3.3-70b-instruct-fp8-fast") {
    return {
      ...common,
      max_tokens: MAX_COMPLETION_TOKENS,
      response_format: { type: "json_schema" as const, json_schema: OUTPUT_SCHEMA },
    };
  }
  const request = {
    ...common,
    max_completion_tokens: MAX_COMPLETION_TOKENS,
    chat_template_kwargs: { enable_thinking: false },
  };
  // Gemma's schema mode is confirmed by the small live pilot. GLM remains experimental.
  return model === "@cf/google/gemma-4-26b-a4b-it"
    ? { ...request, response_format: { type: "json_schema" as const, json_schema: OUTPUT_SCHEMA } }
    : request;
}

const Count = z.number().int().nonnegative();
const Usage = z.object({ prompt_tokens: Count, completion_tokens: Count, total_tokens: Count });
const ChatEnvelope = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({
          content: z.string().max(MAX_RESPONSE_CHARS),
          tool_calls: z.array(z.unknown()).max(0).optional(),
        }),
      }),
    )
    .length(1),
  usage: Usage.optional(),
});
const LegacyEnvelope = z.object({
  response: z.union([z.string().max(MAX_RESPONSE_CHARS), z.record(z.string(), z.unknown())]),
  tool_calls: z.array(z.unknown()).max(0).optional(),
  usage: Usage.optional(),
});

export function decodeSummaryResponse(raw: unknown, input: unknown, modelName: string) {
  const model = SummaryCandidate.parse(modelName);
  const envelope =
    model === "@cf/meta/llama-3.3-70b-instruct-fp8-fast"
      ? LegacyEnvelope.parse(raw)
      : ChatEnvelope.parse(raw);
  const payload = "choices" in envelope ? envelope.choices[0]?.message.content : envelope.response;
  if (payload === undefined) throw new Error("missing_content");
  // No fence stripping, greedy JSON extraction, repair prompt, hidden retry or model fallback.
  const parsed: unknown = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (JSON.stringify(parsed).length > MAX_RESPONSE_CHARS) throw new Error("oversized_output");
  const result = validateAiSummaryOutput(parsed, input);
  if (!result.success) throw new Error("invalid_output");
  return { output: result.data, usage: envelope.usage ?? null };
}

/** Experimental adapter. Not wired to the queue handler before live quality acceptance. */
export function createSummaryModel(
  ai: Pick<Ai, "run">,
  versions: { promptVersion: string; paramsVersion: string },
) {
  if (
    versions.promptVersion !== SUMMARY_PROMPT_VERSION ||
    versions.paramsVersion !== SUMMARY_PARAMS_VERSION
  )
    throw new Error("unsupported_summary_version");
  return async (input: unknown, modelName: string) => {
    const model = SummaryCandidate.parse(modelName);
    const request = summaryRequest(input, model);
    // Abort propagates to the binding. One invocation only; queue retry owns the budget.
    const raw = await ai.run(model, request, { signal: AbortSignal.timeout(60_000) });
    return decodeSummaryResponse(raw, input, model).output;
  };
}
