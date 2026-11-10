// Turns an awesome-list README into a category report. Headings are kinds, not categories.
// Nothing is written to D1.
//
//   node scripts/import-awesome.ts --url https://github.com/ebertti/awesome-telegram
//   node scripts/import-awesome.ts --file ./README.md --slow --out report.json
//
// Without --slow, only the keyword pass runs and unsure rows are left in `review`.
// --slow fetches each of those t.me profiles (and, when CLOUDFLARE_ACCOUNT_ID and
// CLOUDFLARE_API_TOKEN are set, asks @cf/cloudflare/clef-omni). That is the job apps/import runs
// in a container, because a Worker cannot spend a subrequest per list entry.
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  clefOmniCategoryClassifier,
  clefOmniQualityClassifier,
  importAwesomeReadme,
} from "../packages/telegram/src/awesome-import.ts";
import { DEFAULT_AD_RATIO, DEFAULT_MIN_MEMBERS } from "../packages/telegram/src/import-quality.ts";
import { resolveCfAiCredentials } from "./cf-ai-credentials.ts";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    file: { type: "string" },
    out: { type: "string" },
    slow: { type: "boolean", default: false },
    quality: { type: "boolean", default: false },
    "skip-file": { type: "string" },
    "min-members": { type: "string" },
    "ad-ratio": { type: "string" },
    concurrency: { type: "string" },
    "request-delay-ms": { type: "string" },
    "model-delay-ms": { type: "string" },
    "max-model-calls": { type: "string" },
  },
});

if ((values.url ? 1 : 0) + (values.file ? 1 : 0) !== 1) {
  console.error(
    "Usage: import-awesome.ts (--url REPO_OR_README | --file PATH) [--slow] [--quality] [--skip-file FILE] [--min-members N] [--ad-ratio R] [--concurrency N] [--request-delay-ms N] [--model-delay-ms N] [--max-model-calls N] [--out FILE]",
  );
  process.exit(1);
}

async function readmeFromUrl(url: string): Promise<string> {
  if (/\.md($|\?)/i.test(url)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return res.text();
  }
  const match = /github\.com\/([^/]+)\/([^/#?]+)/.exec(url);
  if (!match) throw new Error("expected a GitHub repository URL or a raw README URL");
  const repo = `${match[1]}/${(match[2] ?? "").replace(/\.git$/, "")}`;
  for (const branch of ["main", "master"]) {
    const raw = `https://raw.githubusercontent.com/${repo}/${branch}/README.md`;
    const res = await fetch(raw);
    if (res.ok) return res.text();
  }
  throw new Error(`README.md not found on main or master of ${repo}`);
}

const markdown = values.file
  ? await readFile(values.file, "utf8")
  : await readmeFromUrl(values.url ?? "");

const creds = resolveCfAiCredentials();
const slow = values.slow || values.quality;
const maxModelCalls = values["max-model-calls"] ? Number(values["max-model-calls"]) : undefined;
const modelDelayMs = values["model-delay-ms"] ? Number(values["model-delay-ms"]) : undefined;
const classify =
  slow && creds
    ? clefOmniCategoryClassifier({
        accountId: creds.accountId,
        apiToken: creds.apiToken,
      })
    : undefined;
const judgeQuality =
  values.quality && creds
    ? clefOmniQualityClassifier({
        accountId: creds.accountId,
        apiToken: creds.apiToken,
        maxModelCalls,
        modelDelayMs,
      })
    : undefined;
if (slow && !creds) {
  console.error(
    "warn: no CLOUDFLARE_API_TOKEN / wrangler OAuth — category/quality model calls skipped",
  );
}

let skipUsernames: Set<string> | undefined;
if (values["skip-file"]) {
  const raw: unknown = JSON.parse(await readFile(values["skip-file"], "utf8"));
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && "usernames" in raw && Array.isArray(raw.usernames)
      ? raw.usernames
      : null;
  if (!list || !list.every((item) => typeof item === "string")) {
    throw new Error("--skip-file must be a JSON string array or { usernames: string[] }");
  }
  skipUsernames = new Set(list.map((item) => item.toLowerCase()));
}

const minMembers = values["min-members"] ? Number(values["min-members"]) : DEFAULT_MIN_MEMBERS;
const adRatio = values["ad-ratio"] ? Number(values["ad-ratio"]) : DEFAULT_AD_RATIO;

const report = await importAwesomeReadme(markdown, {
  fetch,
  fetchProfiles: slow,
  quality: values.quality,
  qualityOptions: { minMembers, adRatio },
  classify,
  judgeQuality,
  skipUsernames,
  concurrency: values.concurrency ? Number(values.concurrency) : undefined,
  requestDelayMs: values["request-delay-ms"] ? Number(values["request-delay-ms"]) : undefined,
  modelDelayMs,
  maxModelCalls,
});

const json = `${JSON.stringify(report, null, 2)}\n`;
if (values.out) await writeFile(values.out, json);
else process.stdout.write(json);

console.error(
  [
    `ready ${report.ready.length}`,
    `review ${report.review.length}`,
    `rejected ${report.rejected.length}`,
    `unknown ${report.unknown.length}`,
    `skipped ${report.skipped.noUsername} without a username, ${report.skipped.duplicate} duplicates, ${report.skipped.alreadyListed} already listed`,
  ].join(", "),
);
