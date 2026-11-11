import { categories } from "./categories.ts";
import type { EntryKind } from "./domain.ts";
import { entryKinds } from "./domain.ts";
import {
  type CategoryClassifier,
  type SuggestSource,
  type SuggestTaxonomy,
  suggestTaxonomy,
} from "./suggest.ts";
import { tags } from "./tags.ts";
import { parseTelegramRef } from "./username.ts";

/**
 * An awesome-list README (https://github.com/ebertti/awesome-telegram is the shape) has headings
 * and blurbs, not this directory's categories or tags. The heading only ever answers *kind*:
 * "Bots" and every heading under it is a bot, "Groups" a group, "Channels" a channel. "Games"
 * under Bots is not the games category — a section name is how the list is organized, and copying
 * it in as a category is how a games bot and a games channel get filed as the same thing.
 *
 * Category and tags come from `suggestTaxonomy`, the same rules a submission uses. A bullet with
 * no public username (a library, a theme, a website) is not an entry.
 */

export type AwesomeCandidate = {
  /** Lowercased public username. */
  username: string;
  /** Link text, or the username when the link is only an image. */
  title: string;
  /** The bullet with the link and the title removed. */
  description: string;
  /** Nearest heading that names a kind. Null for Tools, Security, directories, and the like. */
  kind: EntryKind | null;
  /** Heading path, outermost first. Diagnostic: it is not a category. */
  sections: string[];
};

export type AwesomeSkipReason = "no_username" | "duplicate";

export type AwesomeSkipped = {
  title: string;
  reason: AwesomeSkipReason;
  sections: string[];
};

export type AwesomeParse = {
  candidates: AwesomeCandidate[];
  skipped: AwesomeSkipped[];
};

const TG_URL = /https?:\/\/(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/[^\s)<>]+/gi;

const CJK_KINDS: readonly [string, EntryKind][] = [
  ["机器人", "bot"],
  ["機器人", "bot"],
  ["群组", "group"],
  ["群組", "group"],
  ["频道", "channel"],
  ["頻道", "channel"],
];

/** The first kind-word in the heading, or null when the heading is a topic rather than a kind. */
export function kindFromHeading(text: string): EntryKind | null {
  const hits: { at: number; kind: EntryKind }[] = [];
  for (const [needle, kind] of CJK_KINDS) {
    const at = text.indexOf(needle);
    if (at !== -1) hits.push({ at, kind });
  }
  const lower = text.toLowerCase();
  for (const match of lower.matchAll(/\b(bots?|groups?|channels?)\b/g)) {
    const word = match[1] ?? "";
    const kind: EntryKind = word.startsWith("bot")
      ? "bot"
      : word.startsWith("group")
        ? "group"
        : "channel";
    hits.push({ at: match.index ?? 0, kind });
  }
  hits.sort((a, b) => a.at - b.at);
  return hits[0]?.kind ?? null;
}

function kindFromSections(sections: readonly string[]): EntryKind | null {
  for (let i = sections.length - 1; i >= 0; i--) {
    const kind = kindFromHeading(sections[i] ?? "");
    if (kind) return kind;
  }
  return null;
}

function plain(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firstUsername(markdown: string): string | null {
  for (const match of markdown.matchAll(TG_URL)) {
    const username = parseTelegramRef(match[0]);
    if (username) return username.toLowerCase();
  }
  return null;
}

function linkTitle(markdown: string, username: string): string {
  const mention = new RegExp(`@${username}\\b`, "i").exec(markdown);
  if (mention) return mention[0].slice(1);
  const linked = new RegExp(
    `\\[([^\\]]+)]\\(https?://(?:www\\.)?(?:t\\.me|telegram\\.me|telegram\\.dog)/${username}\\b[^)]*\\)`,
    "i",
  ).exec(markdown);
  const text = linked?.[1]?.replace(/[*`]/g, "").replace(/^@/, "").trim();
  if (text && !text.startsWith("!")) return text;
  return username;
}

function descriptionOf(markdown: string, username: string): string {
  const title = linkTitle(markdown, username);
  let text = plain(markdown);
  const lower = text.toLowerCase();
  const titled = title.toLowerCase();
  if (lower.startsWith(`@${titled}`)) text = text.slice(title.length + 1);
  else if (lower.startsWith(titled)) text = text.slice(title.length);
  return text.replace(/^[\s–—\-:]+/, "").trim();
}

function bulletTitle(markdown: string): string {
  const text = plain(markdown);
  return text.slice(0, 80) || "(empty)";
}

/**
 * Pulls listable usernames out of an awesome-list README. Headings set the kind and are inherited
 * by nested sections; a heading that does not name a kind leaves `kind` null rather than guessing
 * one from the topic ("Security" is not a channel).
 */
export function parseAwesomeReadme(markdown: string): AwesomeParse {
  const candidates: AwesomeCandidate[] = [];
  const skipped: AwesomeSkipped[] = [];
  const seen = new Set<string>();
  const headings: { level: number; text: string }[] = [];
  let fence = false;
  let buffer: string[] | null = null;

  const flush = () => {
    if (!buffer) return;
    const text = buffer.join(" ");
    buffer = null;
    const sections = headings.map((heading) => heading.text);
    const username = firstUsername(text);
    if (!username) {
      skipped.push({ title: bulletTitle(text), reason: "no_username", sections });
      return;
    }
    if (seen.has(username)) {
      skipped.push({ title: username, reason: "duplicate", sections });
      return;
    }
    seen.add(username);
    candidates.push({
      username,
      title: linkTitle(text, username),
      description: descriptionOf(text, username),
      kind: kindFromSections(sections),
      sections,
    });
  };

  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      flush();
      fence = !fence;
      continue;
    }
    if (fence) continue;
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      flush();
      const level = heading[1]?.length ?? 1;
      const text = (heading[2] ?? "").replace(/\[([^\]]+)]\([^)]*\)/g, "$1").trim();
      while (headings.length > 0 && (headings.at(-1)?.level ?? 0) >= level) headings.pop();
      headings.push({ level, text });
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      flush();
      buffer = [line.replace(/^\s*([-*+]|\d+\.)\s+/, "")];
      continue;
    }
    if (buffer && line.trim()) {
      buffer.push(line.trim());
      continue;
    }
    if (!line.trim()) flush();
  }
  flush();
  return { candidates, skipped };
}

/**
 * Ids for one process. They match a freshly seeded D1 and nothing else — admins add rows — so
 * anything that leaves this process is a slug, never one of these ids.
 */
export function seedSuggestTaxonomy(): SuggestTaxonomy {
  return {
    categories: categories.map((category, index) => ({
      id: index + 1,
      kind: category.kind,
      slug: category.slug,
      nameZh: category.nameZh,
    })),
    tags: tags.map((tag, index) => ({ id: index + 1, slug: tag.slug })),
  };
}

export type AwesomePlacement = {
  username: string;
  kind: EntryKind | null;
  title: string;
  description: string;
  sections: readonly string[];
  category: string | null;
  tags: string[];
  source: SuggestSource;
};

/** Keyword (and optional model) placement. No network of its own; `classify` is the only hook. */
export async function placeAwesomeCandidate(
  candidate: AwesomeCandidate,
  taxonomy: SuggestTaxonomy,
  options: { classify?: CategoryClassifier } = {},
): Promise<AwesomePlacement> {
  const base = {
    username: candidate.username,
    kind: candidate.kind,
    title: candidate.title,
    description: candidate.description,
    sections: candidate.sections,
  };
  if (!candidate.kind || !entryKinds.includes(candidate.kind)) {
    return { ...base, category: null, tags: [], source: "none" };
  }
  const suggestion = await suggestTaxonomy(
    { kind: candidate.kind, title: candidate.title, description: candidate.description },
    taxonomy,
    options,
  );
  const category =
    taxonomy.categories.find(
      (row) => row.kind === candidate.kind && row.id === suggestion.categoryId,
    )?.slug ?? null;
  const tagsById = new Map(taxonomy.tags.map((tag) => [tag.id, tag.slug]));
  return {
    ...base,
    category,
    tags: suggestion.tagIds.flatMap((id) => {
      const slug = tagsById.get(id);
      return slug ? [slug] : [];
    }),
    source: suggestion.source,
  };
}
