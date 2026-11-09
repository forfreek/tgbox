// Posts and member history live in R2 under `posts/<username>.json` and `history/<username>.json`.
// The site build used to download them from the public media hostname. That hostname is on the
// same zone as the site, and the zone's managed challenge answers GitHub-hosted runners with
// HTTP 403 (`cf-mitigated: challenge`) before R2 does. A missing object and a challenged one
// are indistinguishable from a bare status code, so the snapshot aborted.
//
// The Cloudflare API token already used for `wrangler d1 export` (the Edit Cloudflare Workers
// template includes Workers R2 Storage) can read the bucket directly. Avatar URLs still use the
// public hostname; only these build inputs move off it.
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Same shape as packages/shared/src/username.ts. A username that fails it must not become a key.
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,31}$/;
const API = "https://api.cloudflare.com/client/v4";

export type MediaEntry = { username: string; kind: "channel" | "group" | "bot" };

/** Object keys the snapshot will read for these entries, in username order. */
export function mediaObjectKeys(entries: readonly MediaEntry[]): string[] {
  const keys: string[] = [];
  for (const entry of entries) {
    if (entry.kind === "channel") keys.push(`posts/${entry.username}.json`);
    keys.push(`history/${entry.username}.json`);
  }
  return keys;
}

/** Approved entries in a D1 export (`.sql` dump or sqlite file), ordered by username. */
export function approvedMediaEntries(dbPath: string): MediaEntry[] {
  const dump = dbPath.endsWith(".sql");
  const db = dump ? new DatabaseSync(":memory:") : new DatabaseSync(dbPath, { readOnly: true });
  try {
    if (dump) db.exec(readFileSync(dbPath, "utf8"));
    const table = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'entries'")
      .get();
    if (table === undefined) throw new Error(`${dbPath} has no entries table`);
    return db
      .prepare("SELECT username, kind FROM entries WHERE status = 'approved' ORDER BY username")
      .all()
      .map((row) => {
        const username = row.username;
        const kind = row.kind;
        if (typeof username !== "string" || !USERNAME_RE.test(username)) {
          throw new Error(`refusing to read media for unexpected username: ${String(username)}`);
        }
        if (kind !== "channel" && kind !== "group" && kind !== "bot") {
          throw new Error(`refusing to read media for unexpected kind: ${String(kind)}`);
        }
        return { username, kind };
      });
  } finally {
    db.close();
  }
}

export function approvedMediaKeys(dbPath: string): string[] {
  return mediaObjectKeys(approvedMediaEntries(dbPath));
}

export async function downloadR2Objects(options: {
  accountId: string;
  apiToken: string;
  bucket: string;
  keys: readonly string[];
  destDir: string;
  fetch?: typeof fetch;
  concurrency?: number;
}): Promise<{ written: number; missing: number }> {
  const fetchImpl = options.fetch ?? fetch;
  const concurrency = Math.min(Math.max(1, options.concurrency ?? 8), options.keys.length || 1);
  const root = path.resolve(options.destDir);
  let next = 0;
  let written = 0;
  let missing = 0;

  const worker = async () => {
    while (next < options.keys.length) {
      const key = options.keys[next++];
      if (key === undefined) return;
      const body = await getR2Object(fetchImpl, options, key);
      if (body === undefined) {
        missing++;
        continue;
      }
      const file = path.resolve(root, key);
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
        throw new Error(`refusing to write ${key} outside ${root}`);
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, body);
      written++;
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return { written, missing };
}

/** Download the posts/history objects the snapshot needs. Missing keys are left absent. */
export async function syncRemoteMedia(options: {
  dbPath: string;
  destDir: string;
  accountId: string;
  apiToken: string;
  bucket: string;
  fetch?: typeof fetch;
}): Promise<{ written: number; missing: number }> {
  const keys = approvedMediaKeys(options.dbPath);
  const result = await downloadR2Objects({ ...options, keys });
  console.log(
    `r2 media: ${result.written} objects, ${result.missing} missing (${keys.length} keys)`,
  );
  return result;
}

async function getR2Object(
  fetchImpl: typeof fetch,
  options: { accountId: string; apiToken: string; bucket: string },
  key: string,
): Promise<Uint8Array | undefined> {
  // Slashes in the key must be sent literally. The API rejects a percent-encoded %2F.
  const url =
    `${API}/accounts/${encodeURIComponent(options.accountId)}` +
    `/r2/buckets/${encodeURIComponent(options.bucket)}/objects/${key}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetchImpl(url, {
      headers: { Authorization: `Bearer ${options.apiToken}` },
      redirect: "manual",
    });
    if (response.status === 404) return undefined;
    if (response.status === 429 && attempt < 4) {
      const retryAfter = Number(response.headers.get("retry-after"));
      const waitMs =
        Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 1000 * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(`GET R2 object ${key} failed: HTTP ${response.status} ${detail}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new Error(`GET R2 object ${key} failed: HTTP 429`);
}
