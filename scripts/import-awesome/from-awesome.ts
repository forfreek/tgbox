// Turns the awesome-telegram README into seed-list JSON. Detail links are
// https://tgbox.cc/en/detail/<username>/; the seed command opens t.me itself.
//   node scripts/import-awesome/from-awesome.ts --readme URL_OR_PATH [--out-dir DIR]
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  categoriesOf,
  type EntryKind,
  MAX_TAGS,
  parseTelegramRef,
  tags,
} from "../../packages/shared/src/index.ts";

const BATCH_SIZE = 80;

const SECTION_KIND: Record<string, EntryKind> = {
  Channels: "channel",
  Groups: "group",
  Bots: "bot",
};

export type AwesomeEntry = {
  username: string;
  kind: EntryKind;
  category: string;
  tags: string[];
};

export type AwesomeParse = {
  entries: AwesomeEntry[];
  duplicateUsernames: string[];
  unknownTags: string[];
  truncatedUsernames: string[];
};

const tagByName = new Map(tags.map((tag) => [tag.nameEn, tag.slug]));
const DETAIL = /https:\/\/tgbox\.cc\/(?:en\/)?detail\/([A-Za-z][A-Za-z0-9_]{2,31})\//g;

function sectionTitle(raw: string) {
  return raw.replace(/^\p{Extended_Pictographic}\uFE0F?\s+/u, "").trim();
}

export function parseAwesomeReadme(markdown: string): AwesomeParse {
  let kind: EntryKind | null = null;
  let category: string | null = null;
  const entries: AwesomeEntry[] = [];
  const seen = new Set<string>();
  const duplicateUsernames: string[] = [];
  const unknownTags = new Set<string>();
  const truncatedUsernames: string[] = [];

  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading?.[1] && heading[2]) {
      const title = sectionTitle(heading[2]);
      if (heading[1] === "##") {
        kind = SECTION_KIND[title] ?? null;
        category = null;
      } else if (kind) {
        const match = categoriesOf(kind).find((item) => item.nameEn === title);
        if (!match) throw new Error(`unknown ${kind} heading: ${title}`);
        category = match.slug;
      }
      continue;
    }
    if (!kind || !category) continue;

    const usernames = [...line.matchAll(DETAIL)].map((match) => match[1] ?? "");
    if (usernames.length === 0) continue;
    if (usernames.length > 1) throw new Error(`multiple usernames on one line: ${line}`);
    const username = usernames[0];
    if (!username || parseTelegramRef(username) !== username) {
      throw new Error(`bad username: ${username}`);
    }
    const key = username.toLowerCase();
    if (seen.has(key)) {
      duplicateUsernames.push(username);
      continue;
    }
    seen.add(key);

    const slugs: string[] = [];
    for (const match of line.matchAll(/`([^`]+)`/g)) {
      const label = (match[1] ?? "").replaceAll("\\_", "_").trim();
      const slug = tagByName.get(label);
      if (!slug) {
        if (label) unknownTags.add(label);
        continue;
      }
      if (!slugs.includes(slug)) slugs.push(slug);
    }
    if (slugs.length > MAX_TAGS) {
      truncatedUsernames.push(username);
      slugs.length = MAX_TAGS;
    }
    entries.push({ username, kind, category, tags: slugs });
  }

  return {
    entries,
    duplicateUsernames,
    unknownTags: [...unknownTags].sort(),
    truncatedUsernames,
  };
}

export function batchEntries(entries: AwesomeEntry[], size = BATCH_SIZE) {
  const batches: AwesomeEntry[][] = [];
  for (let index = 0; index < entries.length; index += size) {
    batches.push(entries.slice(index, index + size));
  }
  return batches;
}

async function readReadme(source: string) {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`readme fetch failed: ${response.status}`);
    return response.text();
  }
  return readFile(source, "utf8");
}

async function main() {
  const { values } = parseArgs({
    options: {
      readme: { type: "string" },
      "out-dir": { type: "string", default: path.join(import.meta.dirname, "out") },
    },
  });
  if (!values.readme) {
    console.error("Usage: from-awesome.ts --readme URL_OR_PATH [--out-dir DIR]");
    process.exit(1);
  }
  const parsed = parseAwesomeReadme(await readReadme(values.readme));
  const outDir = path.resolve(values["out-dir"]);
  await mkdir(outDir, { recursive: true });
  const batches = batchEntries(parsed.entries);
  await writeFile(path.join(outDir, "all.json"), `${JSON.stringify(parsed.entries, null, 2)}\n`);
  for (const [index, batch] of batches.entries()) {
    const name = `batch-${String(index + 1).padStart(2, "0")}.json`;
    await writeFile(path.join(outDir, name), `${JSON.stringify(batch, null, 2)}\n`);
  }
  console.log(`parsed ${parsed.entries.length} entries in ${batches.length} batches → ${outDir}`);
  if (parsed.duplicateUsernames.length > 0) {
    console.log(`duplicates skipped: ${parsed.duplicateUsernames.join(", ")}`);
  }
  if (parsed.truncatedUsernames.length > 0) {
    console.log(`tags truncated to ${MAX_TAGS}: ${parsed.truncatedUsernames.join(", ")}`);
  }
  if (parsed.unknownTags.length > 0) {
    console.log(`unknown tags dropped: ${parsed.unknownTags.join(", ")}`);
  }
}

if (import.meta.main) await main();
