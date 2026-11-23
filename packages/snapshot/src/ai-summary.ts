import type { DatabaseSync } from "node:sqlite";
import { summaryEntryQuery } from "@tgbox/db";
import {
  AiSummarySourceInput,
  aiSummaryFingerprint,
  PostView,
  PublicSummary,
  PublicSummaryText,
  prepareAiSummary,
  SiteSettings,
  settingsDefaults,
} from "@tgbox/shared";

/** Reconstruct the worker's normalized source, never the truncated detail preview. */
export async function snapshotSummarySource(
  db: DatabaseSync,
  entryId: number,
  readMedia: (key: string) => Promise<unknown>,
) {
  const row = db
    .prepare(`SELECT * FROM (${summaryEntryQuery}) WHERE id=? AND status='approved'`)
    .get(entryId);
  if (!row) return null;
  const site = SiteSettings.parse({ ...settingsDefaults.site, ...JSON.parse(String(row.site)) });
  let posts: AiSummarySourceInput["posts"] = { status: "unavailable" };
  if (row.kind === "channel" && !row.hide_posts) {
    const raw = await readMedia(`posts/${row.username}.json`);
    if (raw !== undefined) {
      if (Buffer.byteLength(JSON.stringify(raw), "utf8") > 2_000_000)
        throw new Error("Oversized source");
      posts = { status: "ok", posts: PostView.array().max(200).parse(raw) };
    }
  }
  return AiSummarySourceInput.parse({
    kind: row.kind,
    title: row.title,
    username: row.username,
    category: row.category,
    tags: JSON.parse(String(row.tags)),
    profile: { status: "ok", description: row.description },
    posts,
    hidePosts: row.hide_posts === 1,
    hiddenPostIds: JSON.parse(String(row.hidden)),
    postBlocklist: site.postBlocklist,
    reviewIssue: null,
  });
}

export async function readPublicSummaries(
  db: DatabaseSync,
  ids: readonly number[] | undefined,
  readMedia: (key: string) => Promise<unknown>,
  projectionDb: DatabaseSync | null = db,
) {
  const summaries = new Map<number, ReturnType<typeof PublicSummaryText.parse>>();
  if (!ids?.length || !projectionDb) return summaries;
  // Per-ID reads avoid loading unselected texts. Any optional AI failure leaves the old summary.
  for (const id of new Set(ids.slice(0, 20))) {
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    try {
      const row = projectionDb
        .prepare(
          "SELECT zh,hant,en,fingerprint,contract_version AS contractVersion FROM ai_summary_public WHERE entry_id=?",
        )
        .get(id);
      const parsed = PublicSummary.safeParse(row);
      if (!parsed.success) continue;
      const source = await snapshotSummarySource(db, id, readMedia);
      if (!source) continue;
      if (prepareAiSummary(source).decision.status !== "eligible") continue;
      const fingerprint = await aiSummaryFingerprint(source, (b) =>
        crypto.subtle.digest("SHA-256", b),
      );
      if (fingerprint !== parsed.data.fingerprint) continue;
      summaries.set(
        id,
        PublicSummaryText.parse({ zh: parsed.data.zh, hant: parsed.data.hant, en: parsed.data.en }),
      );
    } catch {
      /* Missing table, malformed row, stale/failed source: optional per-entry fallback. */
    }
  }
  return summaries;
}
