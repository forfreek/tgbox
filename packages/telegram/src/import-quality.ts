import type { EntryKind, PostView } from "@tgbox/shared";
import { hitsGreyLexicon, matchGreyLexicon } from "./import-grey-lexicon.ts";
import type { EntrySnapshot } from "./snapshot.ts";

/** Defaults from `.cursor/rules/import-quality.mdc`. */
export const DEFAULT_MIN_MEMBERS = 500;
export const DEFAULT_AD_RATIO = 0.7;

export type QualityRejectReason =
  | "not_found"
  | "banned"
  | "user"
  | "unreachable"
  | "low_members"
  | "empty_bot"
  | "inactive"
  | "grey_lexicon"
  | "ad_heavy"
  | "clone";

export type QualityVerdict =
  | { action: "reject"; reason: QualityRejectReason; detail?: string }
  | { action: "borderline"; reason: "mixed" | "thin_blurb" }
  | { action: "pass" };

export type QualityOptions = {
  minMembers?: number;
  adRatio?: number;
};

const AD_URL = /https?:\/\/|t\.me\/\+|joinchat\/|t\.me\/addstickers\//i;
const AD_CTA =
  /广告投放|投放广告|广告位|互推|代理招商|优惠码|加我领|点击领取|联系商务|商务合作|广告报价|buy\s*ads?|sponsored/i;

function membersOf(kind: EntryKind, snap: EntrySnapshot): number | null {
  const profile = snap.profile;
  if (!profile) return null;
  if (kind === "bot") return profile.monthlyUsers;
  return profile.members;
}

function previewTexts(posts: PostView[] | null | undefined): string[] {
  if (!posts?.length) return [];
  return posts.map((post) => post.text?.trim() ?? "").filter(Boolean);
}

/** Deterministic ad score for one preview post. */
export function isAdPreviewPost(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const urls = t.match(/https?:\/\/[^\s]+/gi)?.length ?? 0;
  const invite = /t\.me\/\+|joinchat\//i.test(t);
  if (invite || urls >= 2) return true;
  if (AD_CTA.test(t) && t.length < 280) return true;
  if (AD_URL.test(t) && AD_CTA.test(t)) return true;
  return false;
}

export function adHeavyRatio(posts: PostView[] | null | undefined): number | null {
  const texts = previewTexts(posts);
  if (texts.length === 0) return null;
  let ads = 0;
  for (const text of texts) {
    if (isAdPreviewPost(text)) ads += 1;
  }
  return ads / texts.length;
}

/**
 * Hard quality gate after a live snapshot. Lexicon hits and clear ad floods reject without omi.
 * Borderline rows are for the optional clef-omni quality question.
 */
export function judgeImportQuality(
  kind: EntryKind,
  snap: EntrySnapshot,
  blurb: string,
  options: QualityOptions = {},
): QualityVerdict {
  const minMembers = options.minMembers ?? DEFAULT_MIN_MEMBERS;
  const adRatio = options.adRatio ?? DEFAULT_AD_RATIO;

  if (snap.liveness === "not_found") return { action: "reject", reason: "not_found" };
  if (snap.liveness === "banned") return { action: "reject", reason: "banned" };
  if (snap.kind === "user") return { action: "reject", reason: "user" };
  if (snap.liveness !== "active" || snap.kind !== kind) {
    return { action: "reject", reason: "unreachable" };
  }

  const title = snap.profile?.title?.trim() ?? "";
  const description = snap.profile?.description?.trim() ?? "";
  const preview = previewTexts(snap.posts).join("\n");
  const haystack = [title, description, blurb, preview].filter(Boolean).join("\n");

  const grey = matchGreyLexicon(haystack);
  if (grey.length > 0) {
    return {
      action: "reject",
      reason: "grey_lexicon",
      detail: grey
        .slice(0, 5)
        .map((hit) => `${hit.category}:${hit.term}`)
        .join(","),
    };
  }

  const members = membersOf(kind, snap);
  if (kind === "bot") {
    const thin = description.length < 8 && blurb.length < 8;
    if (thin && (members === null || members < 100)) {
      return { action: "reject", reason: "empty_bot" };
    }
  } else if (members !== null && members < minMembers) {
    return { action: "reject", reason: "low_members", detail: String(members) };
  }

  if (kind === "channel") {
    const ratio = adHeavyRatio(snap.posts);
    if (ratio !== null && ratio >= adRatio) {
      return { action: "reject", reason: "ad_heavy", detail: ratio.toFixed(2) };
    }
    if (snap.posts !== null && snap.posts.length === 0 && snap.activityTier === 0) {
      return { action: "reject", reason: "inactive" };
    }
  }

  // Borderline: thin signal but not an obvious reject — omi may decide.
  const thinBlurb = (description || blurb).trim().length < 24;
  const mixedAds = (() => {
    const ratio = adHeavyRatio(snap.posts);
    return ratio !== null && ratio >= adRatio * 0.5 && ratio < adRatio;
  })();
  if (thinBlurb || mixedAds) {
    return { action: "borderline", reason: thinBlurb ? "thin_blurb" : "mixed" };
  }

  // Extra grey-ish CTA without a lexicon phrase → borderline, not hard reject.
  if (hitsGreyLexicon(haystack) === false && AD_CTA.test(haystack) && thinBlurb) {
    return { action: "borderline", reason: "mixed" };
  }

  return { action: "pass" };
}

/** Near-duplicate title+description clones within one batch. */
export function markCloneUsernames(
  rows: readonly { username: string; title: string; description: string }[],
): Set<string> {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.title.trim().toLowerCase()}\n${row.description.trim().toLowerCase()}`.slice(
      0,
      240,
    );
    if (key.trim().length < 12) continue;
    const list = groups.get(key) ?? [];
    list.push(row.username);
    groups.set(key, list);
  }
  const reject = new Set<string>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const username of list.slice(1)) reject.add(username);
  }
  return reject;
}
