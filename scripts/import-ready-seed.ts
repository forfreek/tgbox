// After import-awesome --quality, fetch ready rows' t.me profiles again and emit insert-only SQL
// plus local media files. Does not call wrangler — upload is a separate step.
//
//   node scripts/import-ready-seed.ts --report /tmp/report.json --out-dir /tmp/azec4-seed
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fetchEntrySnapshot } from "../packages/telegram/src/index.ts";
import { seedEntryInsertSql } from "./seed/seed-insert-sql.ts";
import { markDirtySql, type SeedRow } from "./seed/seed-sql.ts";

const { values } = parseArgs({
  options: {
    report: { type: "string" },
    "out-dir": { type: "string" },
    concurrency: { type: "string", default: "1" },
    "request-delay-ms": { type: "string", default: "800" },
  },
});
if (!values.report || !values["out-dir"]) {
  console.error(
    "Usage: import-ready-seed.ts --report report.json --out-dir DIR [--concurrency 1] [--request-delay-ms 800]",
  );
  process.exit(1);
}

const report = JSON.parse(await readFile(values.report, "utf8")) as {
  ready: {
    username: string;
    kind: SeedRow["kind"];
    category: string;
    tags: string[];
    title: string;
    description: string;
  }[];
};
const outDir = path.resolve(values["out-dir"]);
const mediaDir = path.join(outDir, "media");
await mkdir(mediaDir, { recursive: true });

const concurrency = Number(values.concurrency ?? 1);
const requestDelayMs = Number(values["request-delay-ms"] ?? 800);
const now = Date.now();
const rows: SeedRow[] = [];
const media: { key: string; file: string; contentType: string }[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapPool<T>(items: readonly T[], limit: number, run: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        const item = items[index];
        if (item !== undefined) await run(item);
      }
    }),
  );
}

await mapPool(report.ready, concurrency, async (item) => {
  if (requestDelayMs > 0) await sleep(requestDelayMs);
  const username = item.username.toLowerCase();
  const snap = await fetchEntrySnapshot(item.username, {
    fetch,
    now: new Date(now),
    knownKind: item.kind,
    needCreatedAt: true,
    profileOnly: false,
  });
  const profile = snap.profile;
  if (snap.liveness !== "active" || !profile || snap.kind !== item.kind) {
    console.warn(`skip @${username}: liveness=${snap.liveness} kind=${snap.kind}`);
    return;
  }
  let avatarVersion: string | null = null;
  if (profile.avatarUrl) {
    const res = await fetch(profile.avatarUrl).catch(() => null);
    if (res?.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      const file = path.join(mediaDir, `avatars/${username}.jpg`);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
      media.push({
        key: `avatars/${username}.jpg`,
        file,
        contentType: res.headers.get("content-type") ?? "image/jpeg",
      });
      avatarVersion = createHash("sha256")
        .update(new URL(profile.avatarUrl).pathname)
        .digest("hex")
        .slice(0, 16);
    }
  }
  if (snap.posts) {
    const file = path.join(mediaDir, `posts/${username}.json`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(snap.posts));
    media.push({ key: `posts/${username}.json`, file, contentType: "application/json" });
  }
  const members = item.kind === "bot" ? profile.monthlyUsers : profile.members;
  if (members !== null) {
    const history = [{ t: new Date(now).toISOString(), members }];
    const file = path.join(mediaDir, `history/${username}.json`);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(history));
    media.push({ key: `history/${username}.json`, file, contentType: "application/json" });
  }
  const createdAt = snap.createdAt ? Date.parse(snap.createdAt) : Number.NaN;
  rows.push({
    username,
    kind: item.kind,
    category: item.category,
    tags: item.tags,
    title: profile.title ?? item.title,
    description: profile.description ?? item.description,
    lang: snap.lang,
    verified: profile.verified,
    avatarVersion,
    tgCreatedAt: Number.isFinite(createdAt) ? createdAt : null,
    members,
    online: item.kind === "group" ? profile.online : null,
    activityTier: item.kind === "channel" ? snap.activityTier : null,
  });
  console.log(`ready @${username} avatar=${avatarVersion ? "yes" : "no"}`);
});

const sql = [...rows.map((row) => seedEntryInsertSql(row, now)), markDirtySql(now)].join("\n");
await writeFile(path.join(outDir, "seed.sql"), sql);
await writeFile(path.join(outDir, "media-manifest.json"), JSON.stringify(media, null, 2));
await writeFile(
  path.join(outDir, "seed-rows.json"),
  JSON.stringify({ now, count: rows.length, rows }, null, 2),
);
console.error(`wrote ${rows.length} rows, ${media.length} media objects → ${outDir}`);
