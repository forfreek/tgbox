import {
  type Db,
  getSummarySource,
  invalidateSummarySource,
  observeSummarySource,
  readSummaryEntry,
  type SummaryConfig,
} from "@tgbox/db";
import {
  AiSummarySourceInput,
  aiSummaryFingerprint,
  PostView,
  prepareAiSummary,
  SiteSettings,
  settingsDefaults,
} from "@tgbox/shared";

type Media = Pick<R2Bucket, "get">;

async function postsFor(media: Media, username: string): Promise<AiSummarySourceInput["posts"]> {
  try {
    const object = await media.get(`posts/${username}.json`);
    if (!object) return { status: "unavailable" };
    if (object.size > 2_000_000) return { status: "error", reason: "source_read_error" };
    const posts = PostView.array()
      .max(200)
      .safeParse(await object.json());
    return posts.success
      ? { status: "ok", posts: posts.data }
      : { status: "error", reason: "source_parse_error" };
  } catch {
    return { status: "error", reason: "source_read_error" };
  }
}

/** The source token is read before external I/O, so a slow reader cannot overwrite a newer one. */
export async function readSummaryEvidence(db: Db, media: Media, entryId: number) {
  const previous = await getSummarySource(db, entryId);
  const row = await readSummaryEntry(db, entryId);
  if (row?.status !== "approved" || !row.source_guard) {
    return null;
  }
  const site = SiteSettings.parse({ ...settingsDefaults.site, ...JSON.parse(row.site) });
  const posts =
    row.kind === "channel" && !row.hide_posts
      ? await postsFor(media, row.username)
      : { status: "unavailable" as const };
  const raw = AiSummarySourceInput.parse({
    kind: row.kind,
    title: row.title,
    username: row.username,
    category: row.category,
    tags: JSON.parse(row.tags),
    profile:
      row.description.length <= 20_000
        ? { status: "ok", description: row.description }
        : { status: "error", reason: "source_parse_error" },
    posts,
    hidePosts: row.hide_posts === 1,
    hiddenPostIds: JSON.parse(row.hidden),
    postBlocklist: site.postBlocklist,
    reviewIssue: null,
  });
  const prepared = prepareAiSummary(raw);
  const fingerprint = await aiSummaryFingerprint(raw, (bytes) =>
    crypto.subtle.digest("SHA-256", bytes),
  );
  return { ...prepared, fingerprint, guard: row.source_guard, previous };
}

export async function observeEntry(
  db: Db,
  media: Media,
  entryId: number,
  config: SummaryConfig,
  now: number,
  priority = 0,
) {
  const evidence = await readSummaryEvidence(db, media, entryId);
  if (!evidence) {
    await invalidateSummarySource(db, entryId, now);
    return null;
  }
  const { previous, guard, fingerprint, input, decision } = evidence;
  if (previous?.locked) return null;
  const prepared = { input, decision };
  const accepted = await observeSummarySource(
    db,
    {
      entryId,
      previousToken: previous?.observationToken ?? null,
      guard,
      fingerprint,
      ...prepared,
      now,
      priority,
    },
    config,
  );
  return accepted ? { ...prepared, fingerprint } : null;
}
