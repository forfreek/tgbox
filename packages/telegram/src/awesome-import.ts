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
  skipped: { noUsername: number; duplicate: number };
};

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type AwesomeImportOptions = {
  fetch: Fetch;
  now?: Date;
  /**
   * Fetch t.me for every candidate the keyword pass cannot place. False leaves those rows in
   * `review` with a reason, which is the right default for a quick look at a README.
   */
  fetchProfiles?: boolean;
  classify?: CategoryClassifier;
  /** Profiles in flight at once. t.me answers 429 to a burst, and one 429 ends the round. */
  concurrency?: number;
};

const DEFAULT_CONCURRENCY = 4;
/** One list should not spend the account's daily Neuron allowance. Past this, rows stay in review. */
const MAX_MODEL_CALLS = 150;

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

function skippedCounts(skipped: readonly AwesomeSkipped[]): AwesomeReport["skipped"] {
  return {
    noUsername: skipped.filter((item) => item.reason === "no_username").length,
    duplicate: skipped.filter((item) => item.reason === "duplicate").length,
  };
}

function partition(rows: readonly AwesomeImportRow[], parsed: AwesomeParse): AwesomeReport {
  return {
    ready: rows.filter((row) => row.status === "ready"),
    review: rows.filter((row) => row.status === "review"),
    rejected: rows.filter((row) => row.status === "rejected"),
    unknown: rows.filter((row) => row.status === "unknown"),
    skipped: skippedCounts(parsed.skipped),
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
    try {
      const res = await call(
        `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/run/${CLEF_OMNI_MODEL}`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${input.apiToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "clef-omni",
            state: [
              `Telegram ${request.kind}`,
              `Title: ${request.title}`,
              `Description: ${request.description.slice(0, 500)}`,
            ].join("\n"),
            questions: {
              category: {
                type: "choice",
                instructions: `Pick the single best directory category for this Telegram ${request.kind}. Choose none when nothing fits.`,
                criteria,
              },
            },
          }),
          signal: AbortSignal.timeout(20_000),
        },
      );
      if (!res.ok) return null;
      return acceptedClefChoice(await res.json());
    } catch {
      return null;
    }
  };
}

function acceptedClefChoice(payload: unknown): string | null {
  const answer = clefAnswer(payload);
  if (!answer || answer.choice === "none") return null;
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
): { choice: string; probabilities: Record<string, number> } | null {
  const root = clefResult(payload);
  if (typeof root !== "object" || root === null || !("answers" in root)) return null;
  const { answers } = root;
  if (typeof answers !== "object" || answers === null || !("category" in answers)) return null;
  const category = answers.category;
  if (typeof category !== "object" || category === null) return null;
  if (!("choice" in category) || typeof category.choice !== "string") return null;
  if (
    !("probabilities" in category) ||
    typeof category.probabilities !== "object" ||
    category.probabilities === null
  ) {
    return null;
  }
  const probabilities: Record<string, number> = {};
  for (const [slug, probability] of Object.entries(category.probabilities)) {
    if (typeof probability === "number") probabilities[slug] = probability;
  }
  return { choice: category.choice, probabilities };
}

function clefResult(payload: unknown): unknown {
  if (typeof payload !== "object" || payload === null || !("result" in payload)) return payload;
  const { result } = payload;
  return typeof result === "object" && result !== null ? result : payload;
}

function capped(classify: CategoryClassifier | undefined): CategoryClassifier | undefined {
  if (!classify) return undefined;
  let used = 0;
  return async (request) => {
    if (used >= MAX_MODEL_CALLS) return null;
    used += 1;
    return classify(request);
  };
}

export async function importAwesomeReadme(
  markdown: string,
  options: AwesomeImportOptions,
): Promise<AwesomeReport> {
  const parsed = parseAwesomeReadme(markdown);
  const taxonomy = seedSuggestTaxonomy();
  const classify = capped(options.classify);
  const fetchProfiles = options.fetchProfiles === true;
  const rows: AwesomeImportRow[] = new Array(parsed.candidates.length);
  const slow: { candidate: AwesomeCandidate; index: number }[] = [];

  for (const [index, candidate] of parsed.candidates.entries()) {
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

  let halted = false;
  await mapPool(slow, options.concurrency ?? DEFAULT_CONCURRENCY, async ({ candidate, index }) => {
    if (halted) {
      rows[index] = {
        ...rowFromPlacement(
          {
            username: candidate.username,
            kind: candidate.kind,
            title: candidate.title,
            description: candidate.description,
            sections: candidate.sections,
            category: null,
            tags: [],
            source: "none",
          },
          "slow",
          "unreachable",
        ),
        status: "unknown",
      };
      return;
    }
    const snap = await fetchEntrySnapshot(candidate.username, {
      fetch: options.fetch,
      now: options.now ?? new Date(),
      knownKind: null,
      needCreatedAt: false,
      profileOnly: true,
    });
    if (snap.rateLimited) halted = true;
    rows[index] = await rowFromSnapshot(candidate, snap, taxonomy, classify);
  });

  return partition(rows, parsed);
}

async function rowFromSnapshot(
  candidate: AwesomeCandidate,
  snap: Awaited<ReturnType<typeof fetchEntrySnapshot>>,
  taxonomy: ReturnType<typeof seedSuggestTaxonomy>,
  classify: CategoryClassifier | undefined,
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

  const placement = await placeAwesomeCandidate(
    {
      ...candidate,
      kind,
      title: snap.profile?.title?.trim() || candidate.title,
      description: mergeDescription(snap.profile?.description ?? null, candidate.description),
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
