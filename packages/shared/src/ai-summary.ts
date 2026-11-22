import { z } from "zod";
import { EntryKind } from "./domain.ts";
import { shouldHidePost } from "./settings.ts";

export const AI_SUMMARY_POLICY_VERSION = "source-policy-v1";
export const AI_SUMMARY_SCHEMA_VERSION = 1;
const MAX_PROFILE_CHARS = 1600;
const MAX_POST_CHARS = 500;
const MAX_POSTS = 4;

export const AiSummarySourceError = z.enum([
  "source_rate_limited",
  "source_timeout",
  "source_parse_error",
  "source_read_error",
]);

const ProfileSource = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ok"), description: z.string().max(20_000) }),
  z.strictObject({ status: z.literal("unavailable") }),
  z.strictObject({ status: z.literal("error"), reason: AiSummarySourceError }),
]);
const SourcePost = z.object({
  id: z.number().int().positive(),
  date: z.iso.datetime({ offset: true }),
  text: z.string().max(20_000),
});
const PostsSource = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ok"),
    posts: z
      .array(SourcePost)
      .max(200)
      .refine(
        (posts) => new Set(posts.map((post) => post.id)).size === posts.length,
        "Duplicate post IDs",
      ),
  }),
  z.strictObject({ status: z.literal("unavailable") }),
  z.strictObject({ status: z.literal("error"), reason: AiSummarySourceError }),
]);

/** Internal input assembled from stored sources, never an AI response or a public request. */
export const AiSummarySourceInput = z.strictObject({
  kind: EntryKind,
  title: z.string().max(500),
  username: z.string().regex(/^[A-Za-z0-9_]{3,32}$/),
  category: z.string().max(80),
  tags: z.array(z.string().max(80)).max(100),
  profile: ProfileSource,
  posts: PostsSource,
  hidePosts: z.boolean(),
  hiddenPostIds: z.array(z.number().int().positive()).max(10_000),
  postBlocklist: z.array(z.string().max(500)).max(100),
  reviewIssue: z.enum(["source_conflict", "ambiguous_scope"]).nullable(),
});
export type AiSummarySourceInput = z.input<typeof AiSummarySourceInput>;

const EvidenceRef = z.string().regex(/^(profile|post:[1-9]\d*)$/);
const Evidence = z.strictObject({
  ref: EvidenceRef,
  text: z
    .string()
    .min(1)
    .refine((text) => Array.from(text).length <= MAX_PROFILE_CHARS),
  date: z.iso.datetime().nullable(),
});
export const AiSummaryModelInput = z.strictObject({
  schemaVersion: z.literal(AI_SUMMARY_SCHEMA_VERSION),
  policyVersion: z.literal(AI_SUMMARY_POLICY_VERSION),
  kind: EntryKind,
  title: z.string().max(500),
  username: z.string(),
  category: z.string().max(80),
  tags: z.array(z.string().max(80)).max(100),
  evidence: z
    .array(Evidence)
    .max(MAX_POSTS + 1)
    .refine(
      (items) => new Set(items.map((item) => item.ref)).size === items.length,
      "Duplicate evidence references",
    ),
});
export type AiSummaryModelInput = z.infer<typeof AiSummaryModelInput>;

export type AiSummaryPreflight =
  | { status: "eligible"; reason: "profile_supported" | "posts_supported" }
  | { status: "skipped"; reason: "no_substantive_evidence" }
  | { status: "needs_review"; reason: "source_conflict" | "ambiguous_scope" }
  | { status: "retry_wait"; reason: z.infer<typeof AiSummarySourceError> };

function normalize(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Conservative noise removal. This cannot determine truth or neutralize every injection. */
function evidenceText(text: string, max: number): string {
  const cleaned = text
    .normalize("NFC")
    .replace(/https?:\/\/[^\s]+|(?:t\.me|telegra\.ph)\/[^\s]+/giu, " ")
    .replace(/@[A-Za-z0-9_]+/gu, " ");
  const words = cleaned.replace(/[^\p{L}\p{N}]/gu, "");
  if (/^(?:商务联系|商务|联系|合作|入群|全网最好|contact|advertising)*$/iu.test(words)) return "";
  const normalized = normalize(cleaned);
  const bounded = Array.from(normalized).slice(0, max).join("");
  return /[\p{L}\p{N}]/u.test(bounded) ? bounded : "";
}

export function prepareAiSummary(raw: unknown): {
  input: AiSummaryModelInput;
  decision: AiSummaryPreflight;
} {
  const source = AiSummarySourceInput.parse(raw);
  const evidence: AiSummaryModelInput["evidence"] = [];
  if (source.profile.status === "ok") {
    const text = evidenceText(source.profile.description, MAX_PROFILE_CHARS);
    if (text) evidence.push({ ref: "profile", text, date: null });
  }
  if (source.kind === "channel" && !source.hidePosts && source.posts.status === "ok") {
    const hidden = new Set(source.hiddenPostIds);
    const seen = new Set<string>();
    const posts = source.posts.posts
      .filter((post) => !hidden.has(post.id) && !shouldHidePost(post.text, source.postBlocklist))
      .map((post) => ({ ...post, date: new Date(post.date).toISOString() }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    for (const post of posts) {
      const text = evidenceText(post.text, MAX_POST_CHARS);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      evidence.push({ ref: `post:${post.id}`, text, date: post.date });
      if (seen.size === MAX_POSTS) break;
    }
  }
  const input = AiSummaryModelInput.parse({
    schemaVersion: AI_SUMMARY_SCHEMA_VERSION,
    policyVersion: AI_SUMMARY_POLICY_VERSION,
    kind: source.kind,
    title: normalize(source.title),
    username: source.username.toLowerCase(),
    category: source.category,
    tags: [...new Set(source.tags)].sort(),
    evidence,
  });
  if (source.reviewIssue) {
    return { input, decision: { status: "needs_review", reason: source.reviewIssue } };
  }
  if (evidence.length > 0) {
    const reason = evidence[0]?.ref === "profile" ? "profile_supported" : "posts_supported";
    return { input, decision: { status: "eligible", reason } };
  }
  if (source.profile.status === "error") {
    return { input, decision: { status: "retry_wait", reason: source.profile.reason } };
  }
  if (source.kind === "channel" && !source.hidePosts && source.posts.status === "error") {
    return { input, decision: { status: "retry_wait", reason: source.posts.reason } };
  }
  return { input, decision: { status: "skipped", reason: "no_substantive_evidence" } };
}

/** Hash the canonical model input, not source health, volatile stats, or manual review state. */
export async function aiSummaryFingerprint(
  raw: unknown,
  digest: (bytes: Uint8Array<ArrayBuffer>) => Promise<ArrayBuffer>,
): Promise<string> {
  const input = prepareAiSummary(raw).input;
  const bytes = new Uint8Array(new TextEncoder().encode(JSON.stringify(input)));
  const result = await digest(bytes);
  if (result.byteLength !== 32) throw new Error("Expected a SHA-256 digest");
  const hex = Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `sha256:${hex}`;
}

const Sentence = z.strictObject({
  zh: z.string().trim().min(1).max(240),
  en: z.string().trim().min(1).max(600),
  refs: z
    .array(EvidenceRef)
    .min(1)
    .max(5)
    .refine((refs) => new Set(refs).size === refs.length),
});
export const AiSummaryOutput = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ok"), sentences: z.array(Sentence).min(1).max(2) }),
  z.strictObject({ status: z.literal("insufficient"), sentences: z.tuple([]) }),
]);

/** Structural and reference checks only. Publication still requires semantic review. */
export function validateAiSummaryOutput(raw: unknown, modelInput: unknown) {
  const input = AiSummaryModelInput.parse(modelInput);
  const refs = new Set(input.evidence.map((item) => item.ref));
  return AiSummaryOutput.superRefine((result, ctx) => {
    if (result.status !== "ok") return;
    for (const [index, sentence] of result.sentences.entries()) {
      if (sentence.refs.some((ref) => !refs.has(ref))) {
        ctx.addIssue({
          code: "custom",
          path: ["sentences", index, "refs"],
          message: "Unknown evidence",
        });
      }
      if (!/\p{Script=Han}/u.test(sentence.zh) || !/[A-Za-z]/u.test(sentence.en)) {
        ctx.addIssue({
          code: "custom",
          path: ["sentences", index],
          message: "Missing target script",
        });
      }
      if (/[<>@]|https?:\/\/|\bt\.me\//iu.test(`${sentence.zh} ${sentence.en}`)) {
        ctx.addIssue({
          code: "custom",
          path: ["sentences", index],
          message: "Markup or contact output",
        });
      }
      const supportedText = input.evidence
        .filter((item) => sentence.refs.includes(item.ref))
        .map((item) => item.text)
        .join(" ");
      const numbers = new Set(supportedText.match(/\d+(?:[.,]\d+)*/g) ?? []);
      const outputNumbers = `${sentence.zh} ${sentence.en}`.match(/\d+(?:[.,]\d+)*/g) ?? [];
      if (outputNumbers.some((number) => !numbers.has(number))) {
        ctx.addIssue({ code: "custom", path: ["sentences", index], message: "Unsupported number" });
      }
    }
  }).safeParse(raw);
}
