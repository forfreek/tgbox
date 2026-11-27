import {
  type ActivityTier,
  type EntryKind,
  entryKinds,
  HEALTH_POLICY_VERSION,
  type HealthObservation,
  type HealthSourceResult,
  healthRedirectTarget,
  type Liveness,
  type PostView,
} from "@tgbox/shared";
import { activityTier } from "./activity.ts";
import { parseChannelPage, parseCreatedAt } from "./channel.ts";
import { detectLanguage } from "./language.ts";
import { classifyLiveness } from "./liveness.ts";
import { type Profile, type ProfileKind, parseProfile } from "./profile.ts";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const TIMEOUT_MS = 8_000;
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
type Source = "tme_profile" | "tme_preview";
export type SnapshotOptions = {
  fetch: Fetch;
  now: Date;
  knownKind: EntryKind | null;
  needCreatedAt: boolean;
  purpose?: "full" | "avatar";
  cooldowns?: Partial<Record<Source, number>>;
};
export type EntrySnapshot = {
  liveness: Liveness;
  kind: ProfileKind | null;
  profile: Profile | null;
  posts: PostView[] | null;
  createdAt: string | null;
  lang: string | null;
  activityTier: ActivityTier | null;
  subrequests: number;
  rateLimited: boolean;
  health: HealthObservation | null;
  sourceResults: Partial<Record<Source, HealthSourceResult>>;
  deferredUntil: number | null;
};
type Page = {
  status: number;
  html: string;
  redirected: boolean;
  redirectTarget?: string;
  retryAfterMs?: number;
} | null;
export async function fetchEntrySnapshot(
  username: string,
  options: SnapshotOptions,
): Promise<EntrySnapshot> {
  const at = options.now.getTime();
  let subrequests = 0;
  let rateLimited = false;
  async function get(path: string): Promise<Page> {
    subrequests++;
    try {
      const res = await options.fetch(`https://t.me${path}`, {
        headers: { "user-agent": USER_AGENT, "accept-language": "en" },
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 429) rateLimited = true;
      const redirected = res.status >= 300 && res.status < 400;
      const header = res.headers.get("retry-after");
      const delay =
        header === null
          ? undefined
          : /^\d+$/.test(header)
            ? Number(header) * 1000
            : Math.max(0, Date.parse(header) - at);
      const retryAfterMs =
        delay !== undefined && Number.isSafeInteger(delay) && delay >= 0 ? delay : undefined;
      return {
        status: res.status,
        html: redirected ? "" : await res.text(),
        redirected,
        redirectTarget:
          redirected && res.headers.has("location")
            ? healthRedirectTarget(res.headers.get("location") ?? "")
            : undefined,
        retryAfterMs,
      };
    } catch {
      return null;
    }
  }
  const snapshot: EntrySnapshot = {
    liveness: "unknown",
    kind: null,
    profile: null,
    posts: null,
    createdAt: null,
    lang: null,
    activityTier: null,
    subrequests: 0,
    rateLimited: false,
    health: null,
    sourceResults: {},
    deferredUntil: null,
  };
  if ((options.cooldowns?.tme_profile ?? 0) > at) {
    snapshot.deferredUntil = options.cooldowns?.tme_profile ?? null;
    return snapshot;
  }
  const profilePage = await get(`/${username}`);
  if (profilePage?.status === 200 && !profilePage.redirected)
    snapshot.profile = parseProfile(profilePage.html, username);
  const verdict = classifyLiveness({
    profileResponse: profilePage && !profilePage.redirected ? profilePage : null,
    previousKind: options.knownKind,
  });
  const shape = snapshot.profile?.pageShape ?? null;
  const sourceResult = (page: Page, malformed = false): HealthSourceResult => ({
    at,
    outcome: !page
      ? "transport_error"
      : page.status === 429
        ? "rate_limited"
        : page.status >= 500 || page.status === 403 || page.status === 401
          ? "server_error"
          : malformed
            ? "parse_error"
            : "parsed",
    retryAfterMs: page?.retryAfterMs,
  });
  snapshot.sourceResults.tme_profile = sourceResult(
    profilePage,
    profilePage?.status === 200 && shape === "malformed",
  );
  let previewUnavailable = false;
  if (options.purpose !== "avatar" && verdict.liveness === "active" && verdict.kind === "channel") {
    if ((options.cooldowns?.tme_preview ?? 0) > at) previewUnavailable = true;
    else {
      const preview = await get(`/s/${username}`);
      const page = preview?.status === 200 ? parseChannelPage(preview.html) : null;
      const structured =
        page?.hasPreview ||
        (preview?.status === 200 && parseProfile(preview.html, username).pageShape !== "malformed");
      snapshot.sourceResults.tme_preview = sourceResult(
        preview,
        preview?.status === 200 && !structured,
      );
      previewUnavailable = !page?.hasPreview;
      if (page?.hasPreview) {
        snapshot.posts = page.posts;
        snapshot.activityTier = activityTier(page.posts, options.now);
        if (options.needCreatedAt) {
          const first = await get(`/s/${username}/1`);
          const firstResult = sourceResult(first);
          if (firstResult.outcome !== "parsed") snapshot.sourceResults.tme_preview = firstResult;
          if (first?.status === 200) snapshot.createdAt = parseCreatedAt(first.html);
        }
      }
    }
  }
  if (
    options.purpose !== "avatar" &&
    verdict.liveness === "active" &&
    verdict.kind === "group" &&
    options.needCreatedAt &&
    (options.cooldowns?.tme_preview ?? 0) <= at
  ) {
    const first = await get(`/${username}/1?embed=1&mode=tme`);
    snapshot.sourceResults.tme_preview = sourceResult(first);
    if (first?.status === 200) snapshot.createdAt = parseCreatedAt(first.html);
  }
  snapshot.liveness = verdict.liveness;
  snapshot.kind = verdict.kind;
  if (verdict.liveness !== "not_found" && verdict.liveness !== "banned" && snapshot.profile) {
    const lang = detectLanguage(
      [
        snapshot.profile.title,
        snapshot.profile.description,
        ...(snapshot.posts ?? []).map((p) => p.text),
      ].join("\n"),
    );
    snapshot.lang = lang === "und" ? null : lang;
  }
  const expectedKind = options.knownKind ?? entryKinds.find((k) => k === verdict.kind);
  if (expectedKind && options.purpose !== "avatar") {
    const recognized = verdict.liveness === "active" && verdict.kind === expectedKind;
    const changed = verdict.liveness === "type_changed";
    const reason = recognized
      ? "profile_recognized"
      : changed
        ? "kind_mismatch"
        : !profilePage
          ? "transport_error"
          : profilePage.status === 429
            ? "rate_limited"
            : profilePage.redirected
              ? "profile_redirect"
              : profilePage.status !== 200
                ? "http_error"
                : shape === "view"
                  ? "view_placeholder"
                  : shape === "contact"
                    ? "contact_placeholder"
                    : "parse_error";
    snapshot.health = {
      observationId: crypto.randomUUID(),
      targetUsername: username.toLowerCase(),
      expectedKind,
      startedAt: at,
      completedAt: Math.max(at, Date.now()),
      parserVersion: "tme-profile-v2",
      policyVersion: HEALTH_POLICY_VERSION,
      outcome: recognized ? "recognized" : changed ? "identity_changed" : "uncertain",
      reason,
      httpStatus: profilePage?.status ?? null,
      pageShape: shape,
      detectedKind: snapshot.profile?.kind ?? null,
      previewUnavailable,
      ...(profilePage?.redirectTarget ? { redirectTarget: profilePage.redirectTarget } : {}),
      ...(profilePage?.retryAfterMs !== undefined
        ? { retryAfterMs: profilePage.retryAfterMs }
        : {}),
    };
  }
  snapshot.subrequests = subrequests;
  snapshot.rateLimited = rateLimited;
  return snapshot;
}
