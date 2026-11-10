import type { EntryKind } from "@tgbox/shared";
import {
  type AwesomeCandidate,
  type AwesomeParse,
  type AwesomePlacement,
  type AwesomeSkipped,
  type CategoryClassifier,
  categories,
  entryKinds,
  parseAwesomeReadme,
  placeAwesomeCandidate,
  type SuggestSource,
  seedSuggestTaxonomy,
} from "@tgbox/shared";
import {
  DEFAULT_AD_RATIO,
  DEFAULT_MIN_MEMBERS,
  judgeImportQuality,
  markCloneUsernames,
  type QualityOptions,
} from "./import-quality.ts";
import { fetchEntrySnapshot } from "./snapshot.ts";

/**
 * Turns an awesome-list README into a review report.
 *
 * The keyword pass is instant and stays in-process. Everything it cannot finish — no kind in the
 * heading, or a blurb with nothing the rules will stand behind — is the slow part: one t.me
 * profile per username, then `@cf/cloudflare/clef-omni`, which scores the allowed categories
 * instead of writing a slug. A Worker dies on that (subrequest
 * cap, CPU). `apps/import` runs this function inside a Cloudflare Container; `scripts/import-awesome.ts`
 * runs it locally with `--slow`. Either way the report is a suggestion. Nothing is written to D1,
 * and a category the rules and the model both refuse stays blank for a person.
 */

export type AwesomeImportStatus = "ready" | "review" | "rejected" | "unknown";

export type AwesomeImportReason =
  | "no_kind"
  | "no_category"
  | "not_found"
  | "banned"
  | "user"
  | "unreachable"
  | "low_members"
  | "empty_bot"
  | "inactive"
  | "grey_lexicon"
  | "ad_heavy"
  | "clone"
  | "quality_ads"
  | "quality_spam"
  | "quality_inactive"
  | "already_listed"
  | null;

export type AwesomeImportRow = {
  status: AwesomeImportStatus;
  /** `fast` never left the keyword pass. `slow` needed a profile, a model, or both. */
  pace: "fast" | "slow";
  username: string;
  kind: EntryKind | null;
  category: string | null;
  tags: string[];
  source: SuggestSource;
  title: string;
  description: string;
  sections: string[];
  reason: AwesomeImportReason;
};

export type AwesomeReport = {
  ready: AwesomeImportRow[];
  review: AwesomeImportRow[];
  rejected: AwesomeImportRow[];
  unknown: AwesomeImportRow[];
  skipped: { noUsername: number; duplicate: number; alreadyListed: number };
};

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Optional clef-omni quality choice for borderline rows only. */
export type QualityClassifier = (request: {
  kind: EntryKind;
  title: string;
  description: string;
}) => Promise<"keep" | "ads" | "spam_grey" | "inactive" | "unsure" | null>;

export type AwesomeImportOptions = {
  fetch: Fetch;
  now?: Date;
  /**
   * Fetch t.me for every candidate the keyword pass cannot place. False leaves those rows in
   * `review` with a reason, which is the right default for a quick look at a README.
   */
  fetchProfiles?: boolean;
  /**
   * Run hard quality gates (lexicon, members, ad-heavy previews) on every fetched profile.
   * Forces a profile fetch for all candidates, including ones the keyword pass could place.
   */
  quality?: boolean;
  qualityOptions?: QualityOptions;
  /** Borderline-only quality model. Clear hard rejects never call it. */
  judgeQuality?: QualityClassifier;
  classify?: CategoryClassifier;
  /** Usernames already in D1 — skipped, never updated. */
  skipUsernames?: ReadonlySet<string>;
  /**
   * Profiles in flight at once. Quality imports default to 1 — t.me 429s under burst traffic.
   * Non-quality slow fetch defaults to 2.
   */
  concurrency?: number;
  /** Pause before each t.me fetch (ms). Quality defaults to 800. */
  requestDelayMs?: number;
  /** Backoff waits after a 429, then retry the same username. Exhausted → that row is unknown. */
  rateLimitBackoffMs?: readonly number[];
  /** Cap on clef-omni category (+ quality) calls for one run. Past this, rows stay in review. */
  maxModelCalls?: number;
  /** Pause between model calls (ms). Defaults to 250 when a classifier is present. */
  modelDelayMs?: number;
};

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_QUALITY_CONCURRENCY = 1;
const DEFAULT_QUALITY_REQUEST_DELAY_MS = 800;
const DEFAULT_RATE_LIMIT_BACKOFF_MS = [5_000, 15_000, 45_000] as const;
/** One list should not spend the account's daily Neuron allowance. Past this, rows stay in review. */
const DEFAULT_MAX_MODEL_CALLS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function rowFromPlacement(
  placement: AwesomePlacement,
  pace: "fast" | "slow",
  reason: AwesomeImportReason,
): AwesomeImportRow {
  const ready = placement.category !== null && placement.kind !== null;
  return {
    status: ready ? "ready" : "review",
    pace,
    username: placement.username,
    kind: placement.kind,
    category: placement.category,
    tags: placement.tags,
    source: placement.source,
    title: placement.title,
    description: placement.description,
    sections: [...placement.sections],
    reason: ready ? null : reason,
  };
}

function mergeDescription(bio: string | null, blurb: string): string {
  const profile = bio?.trim() ?? "";
  if (!profile) return blurb;
  if (!blurb) return profile;
  const longer = profile.length >= blurb.length ? profile : blurb;
  const shorter = longer === profile ? blurb : profile;
  if (longer.toLowerCase().includes(shorter.toLowerCase())) return longer;
  return `${profile}\n${blurb}`;
}

async function mapPool<T>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      const item = items[index];
      if (item !== undefined) await run(item);
    }
  });
  await Promise.all(workers);
}

function skippedCounts(
  skipped: readonly AwesomeSkipped[],
  alreadyListed: number,
): AwesomeReport["skipped"] {
  return {
    noUsername: skipped.filter((item) => item.reason === "no_username").length,
    duplicate: skipped.filter((item) => item.reason === "duplicate").length,
    alreadyListed,
  };
}

function partition(
  rows: readonly AwesomeImportRow[],
  parsed: AwesomeParse,
  alreadyListed: number,
): AwesomeReport {
  return {
    ready: rows.filter((row) => row.status === "ready"),
    review: rows.filter((row) => row.status === "review"),
    rejected: rows.filter((row) => row.status === "rejected"),
    unknown: rows.filter((row) => row.status === "unknown"),
    skipped: skippedCounts(parsed.skipped, alreadyListed),
  };
}

/**
 * `@cf/cloudflare/clef-omni` scores every allowed category instead of writing a slug. A forced
 * guess is worse than a blank, so a choice sticks only when it leads the runner-up, including
 * "none", by a clear margin. Catch-all buckets (资源分享, 交流社群, 其他) are not offered.
 */
const CLEF_OMNI_MODEL = "@cf/cloudflare/clef-omni";
const MIN_CLEF_PROBABILITY = 0.5;
const MIN_CLEF_MARGIN = 0.15;
const CATCH_ALL: Partial<Record<EntryKind, readonly string[]>> = {
  channel: ["resources"],
  group: ["chat", "other"],
};

async function runClefOmni(
  call: Fetch,
  accountId: string,
  apiToken: string,
  state: string,
  questions: Record<string, unknown>,
): Promise<unknown | null> {
  try {
    const res = await call(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLEF_OMNI_MODEL}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: "clef-omni", state, questions }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function clefOmniCategoryClassifier(input: {
  accountId: string;
  apiToken: string;
  fetch?: Fetch;
}): CategoryClassifier {
  const call = input.fetch ?? fetch;
  return async (request) => {
    const skip = new Set(CATCH_ALL[request.kind] ?? []);
    const criteria: Record<string, string> = {};
    for (const candidate of request.candidates) {
      if (skip.has(candidate.slug)) continue;
      const seed = categories.find(
        (category) => category.kind === request.kind && category.slug === candidate.slug,
      );
      criteria[candidate.slug] = seed ? `${seed.nameEn} (${seed.nameZh})` : candidate.nameZh;
    }
    criteria.none = "None of these fit, or the text is too vague to choose.";
    const payload = await runClefOmni(
      call,
      input.accountId,
      input.apiToken,
      [
        `Telegram ${request.kind}`,
        `Title: ${request.title}`,
        `Description: ${request.description.slice(0, 500)}`,
      ].join("\n"),
      {
        category: {
          type: "choice",
          instructions: `Pick the single best directory category for this Telegram ${request.kind}. Choose none when nothing fits.`,
          criteria,
        },
      },
    );
    if (!payload) return null;
    return acceptedClefChoice(payload, "category");
  };
}

/** Borderline quality judge — keep / ads / spam_grey / inactive / unsure. */
export function clefOmniQualityClassifier(input: {
  accountId: string;
  apiToken: string;
  fetch?: Fetch;
  maxModelCalls?: number;
  modelDelayMs?: number;
}): QualityClassifier {
  const call = input.fetch ?? fetch;
  const max = input.maxModelCalls ?? DEFAULT_MAX_MODEL_CALLS;
  const delayMs = input.modelDelayMs ?? 250;
  let used = 0;
  return async (request) => {
    if (used >= max) return null;
    used += 1;
    if (delayMs > 0) await sleep(delayMs);
    const payload = await runClefOmni(
      call,
      input.accountId,
      input.apiToken,
      [
        `Telegram ${request.kind}`,
        `Title: ${request.title}`,
        `Description: ${request.description.slice(0, 500)}`,
      ].join("\n"),
      {
        quality: {
          type: "choice",
          instructions:
            "Decide if this Telegram listing belongs in a public directory. Prefer unsure when evidence is weak.",
          criteria: {
            keep: "Legitimate channel, group, or bot worth listing.",
            ads: "Primarily advertising, referral spam, or ad placement.",
            spam_grey: "Grey content, fake engagement, scam, or casting funnel.",
            inactive: "Abandoned or hollow shell with no real activity.",
            unsure: "Cannot tell from the provided text.",
          },
        },
      },
    );
    if (!payload) return null;
    const raw = clefAnswer(payload, "quality");
    if (!raw) return null;
    if (raw.choice === "unsure") return "unsure";
    const choice = acceptedClefChoice(payload, "quality");
    if (choice === "keep" || choice === "ads" || choice === "spam_grey" || choice === "inactive") {
      return choice;
    }
    return "unsure";
  };
}

function acceptedClefChoice(payload: unknown, question: string): string | null {
  const answer = clefAnswer(payload, question);
  if (!answer || answer.choice === "none" || answer.choice === "unsure") return null;
  const top = answer.probabilities[answer.choice];
  if (top === undefined || top < MIN_CLEF_PROBABILITY) return null;
  let runnerUp = 0;
  for (const [slug, probability] of Object.entries(answer.probabilities)) {
    if (slug !== answer.choice && probability > runnerUp) runnerUp = probability;
  }
  if (top - runnerUp < MIN_CLEF_MARGIN) return null;
  return answer.choice;
}

function clefAnswer(
  payload: unknown,
  question: string,
): { choice: string; probabilities: Record<string, number> } | null {
  const root = clefResult(payload);
  if (typeof root !== "object" || root === null || !("answers" in root)) return null;
  const { answers } = root;
  if (typeof answers !== "object" || answers === null || !(question in answers)) return null;
  const block = (answers as Record<string, unknown>)[question];
  if (typeof block !== "object" || block === null) return null;
  if (!("choice" in block) || typeof block.choice !== "string") return null;
  if (
    !("probabilities" in block) ||
    typeof block.probabilities !== "object" ||
    block.probabilities === null
  ) {
    return null;
  }
  const probabilities: Record<string, number> = {};
  for (const [slug, probability] of Object.entries(block.probabilities)) {
    if (typeof probability === "number") probabilities[slug] = probability;
  }
  return { choice: block.choice, probabilities };
}

function clefResult(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null || !("result" in payload)) return payload;
  const { result } = payload;
  return typeof result === "object" && result !== null ? result : payload;
}

function capped(
  classify: CategoryClassifier | undefined,
  maxModelCalls: number,
  modelDelayMs: number,
): CategoryClassifier | undefined {
  if (!classify) return undefined;
  let used = 0;
  return async (request) => {
    if (used >= maxModelCalls) return null;
    used += 1;
    if (modelDelayMs > 0) await sleep(modelDelayMs);
    return classify(request);
  };
}

async function fetchSnapshotPaced(
  username: string,
  options: AwesomeImportOptions,
  quality: boolean,
): Promise<Awaited<ReturnType<typeof fetchEntrySnapshot>>> {
  const delayMs = options.requestDelayMs ?? (quality ? DEFAULT_QUALITY_REQUEST_DELAY_MS : 0);
  const backoff = options.rateLimitBackoffMs ?? DEFAULT_RATE_LIMIT_BACKOFF_MS;
  for (let attempt = 0; ; attempt += 1) {
    if (delayMs > 0) await sleep(delayMs);
    const snap = await fetchEntrySnapshot(username, {
      fetch: options.fetch,
      now: options.now ?? new Date(),
      knownKind: null,
      needCreatedAt: false,
      // Quality needs channel /s/ previews for ad-heavy checks.
      profileOnly: !quality,
    });
    if (!snap.rateLimited) return snap;
    const wait = backoff[attempt];
    if (wait === undefined) return snap;
    await sleep(wait);
  }
}

/**
 * Re-run taxonomy (rules + optional clef-omni) on already-fetched `review` rows.
 * Does not hit t.me — use after a quality pass left rows at `no_category`.
 */
export async function classifyAwesomeReviewRows(
  rows: readonly AwesomeImportRow[],
  options: {
    classify?: CategoryClassifier;
    maxModelCalls?: number;
    modelDelayMs?: number;
  } = {},
): Promise<{ ready: AwesomeImportRow[]; review: AwesomeImportRow[] }> {
  const taxonomy = seedSuggestTaxonomy();
  const maxModelCalls = options.maxModelCalls ?? DEFAULT_MAX_MODEL_CALLS;
  const modelDelayMs = options.modelDelayMs ?? 250;
  const classify = capped(options.classify, maxModelCalls, modelDelayMs);
  const ready: AwesomeImportRow[] = [];
  const review: AwesomeImportRow[] = [];
  for (const row of rows) {
    if (row.status !== "review" || !row.kind) {
      review.push(row);
      continue;
    }
    const placement = await placeAwesomeCandidate(
      {
        username: row.username,
        kind: row.kind,
        title: row.title,
        description: row.description,
        sections: row.sections,
      },
      taxonomy,
      { classify },
    );
    const next = rowFromPlacement(placement, "slow", "no_category");
    if (next.status === "ready") ready.push(next);
    else review.push(next);
  }
  return { ready, review };
}

export async function importAwesomeReadme(
  markdown: string,
  options: AwesomeImportOptions,
): Promise<AwesomeReport> {
  const parsed = parseAwesomeReadme(markdown);
  const taxonomy = seedSuggestTaxonomy();
  const quality = options.quality === true;
  const maxModelCalls = options.maxModelCalls ?? DEFAULT_MAX_MODEL_CALLS;
  const modelDelayMs = options.modelDelayMs ?? (options.classify ? 250 : 0);
  const classify = capped(options.classify, maxModelCalls, modelDelayMs);
  const fetchProfiles = options.fetchProfiles === true || quality;
  const skip = options.skipUsernames ?? new Set<string>();
  const rows: AwesomeImportRow[] = new Array(parsed.candidates.length);
  const slow: { candidate: AwesomeCandidate; index: number }[] = [];
  let alreadyListed = 0;
  const concurrency =
    options.concurrency ?? (quality ? DEFAULT_QUALITY_CONCURRENCY : DEFAULT_CONCURRENCY);

  for (const [index, candidate] of parsed.candidates.entries()) {
    if (skip.has(candidate.username)) {
      alreadyListed += 1;
      continue;
    }
    if (quality) {
      slow.push({ candidate, index });
      continue;
    }
    const placement = await placeAwesomeCandidate(candidate, taxonomy);
    if (placement.category) {
      rows[index] = rowFromPlacement(placement, "fast", null);
      continue;
    }
    if (!fetchProfiles) {
      rows[index] = rowFromPlacement(placement, "slow", candidate.kind ? "no_category" : "no_kind");
      continue;
    }
    slow.push({ candidate, index });
  }

  await mapPool(slow, concurrency, async ({ candidate, index }) => {
    const snap = await fetchSnapshotPaced(candidate.username, options, quality);
    rows[index] = await rowFromSnapshot(candidate, snap, taxonomy, classify, {
      quality,
      qualityOptions: options.qualityOptions,
      judgeQuality: options.judgeQuality,
    });
  });

  const filled = rows.filter((row): row is AwesomeImportRow => row !== undefined);

  if (quality) {
    const clones = markCloneUsernames(
      filled.filter((row) => row.status === "ready" || row.status === "review"),
    );
    for (const row of filled) {
      if (!clones.has(row.username)) continue;
      row.status = "rejected";
      row.category = null;
      row.tags = [];
      row.reason = "clone";
    }
  }

  return partition(filled, parsed, alreadyListed);
}

async function rowFromSnapshot(
  candidate: AwesomeCandidate,
  snap: Awaited<ReturnType<typeof fetchEntrySnapshot>>,
  taxonomy: ReturnType<typeof seedSuggestTaxonomy>,
  classify: CategoryClassifier | undefined,
  gates: {
    quality: boolean;
    qualityOptions?: QualityOptions;
    judgeQuality?: QualityClassifier;
  },
): Promise<AwesomeImportRow> {
  const blank = (
    status: AwesomeImportStatus,
    reason: AwesomeImportReason,
    kind: EntryKind | null = candidate.kind,
  ): AwesomeImportRow => ({
    status,
    pace: "slow",
    username: candidate.username,
    kind,
    category: null,
    tags: [],
    source: "none",
    title: snap.profile?.title?.trim() || candidate.title,
    description: mergeDescription(snap.profile?.description ?? null, candidate.description),
    sections: [...candidate.sections],
    reason,
  });

  if (snap.liveness === "not_found") return blank("rejected", "not_found", null);
  if (snap.liveness === "banned") return blank("rejected", "banned", null);
  if (snap.kind === "user") return blank("rejected", "user", null);
  const kind = entryKinds.find((entryKind) => entryKind === snap.kind);
  if (!kind || snap.liveness !== "active") return blank("unknown", "unreachable", kind ?? null);

  const title = snap.profile?.title?.trim() || candidate.title;
  const description = mergeDescription(snap.profile?.description ?? null, candidate.description);

  if (gates.quality) {
    const verdict = judgeImportQuality(kind, snap, candidate.description, {
      minMembers: gates.qualityOptions?.minMembers ?? DEFAULT_MIN_MEMBERS,
      adRatio: gates.qualityOptions?.adRatio ?? DEFAULT_AD_RATIO,
    });
    if (verdict.action === "reject") {
      return blank("rejected", verdict.reason, kind);
    }
    if (verdict.action === "borderline" && gates.judgeQuality) {
      const decision = await gates.judgeQuality({ kind, title, description });
      if (decision === "ads") return blank("rejected", "quality_ads", kind);
      if (decision === "spam_grey") return blank("rejected", "quality_spam", kind);
      if (decision === "inactive") return blank("rejected", "quality_inactive", kind);
      if (decision !== "keep") return blank("review", "no_category", kind);
    } else if (verdict.action === "borderline") {
      return blank("review", "no_category", kind);
    }
  }

  const placement = await placeAwesomeCandidate(
    {
      ...candidate,
      kind,
      title,
      description,
    },
    taxonomy,
    { classify },
  );
  return rowFromPlacement(placement, "slow", "no_category");
}

export type AwesomeAiCredentials = { accountId: string; apiToken: string };

/** Body of `POST /import`, shared by the container and the local script's `--slow` path. */
export type AwesomeImportRequest = {
  markdown: string;
  fetchProfiles?: boolean;
  ai?: AwesomeAiCredentials | null;
};

export function parseAwesomeImportRequest(body: unknown): AwesomeImportRequest | null {
  if (typeof body !== "object" || body === null) return null;
  if (!("markdown" in body) || typeof body.markdown !== "string" || !body.markdown.trim()) {
    return null;
  }
  const fetchProfiles = "fetchProfiles" in body ? body.fetchProfiles === true : true;
  let ai: AwesomeAiCredentials | null = null;
  if ("ai" in body && body.ai !== null && body.ai !== undefined) {
    if (typeof body.ai !== "object") return null;
    const { accountId, apiToken } = body.ai as { accountId?: unknown; apiToken?: unknown };
    if (typeof accountId !== "string" || typeof apiToken !== "string") return null;
    if (!accountId || !apiToken) return null;
    ai = { accountId, apiToken };
  }
  return { markdown: body.markdown, fetchProfiles, ai };
}
