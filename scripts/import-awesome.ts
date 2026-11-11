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
  importAwesomeReadme,
} from "../packages/telegram/src/awesome-import.ts";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    file: { type: "string" },
    out: { type: "string" },
    slow: { type: "boolean", default: false },
  },
});

if ((values.url ? 1 : 0) + (values.file ? 1 : 0) !== 1) {
  console.error(
    "Usage: import-awesome.ts (--url REPO_OR_README | --file PATH) [--slow] [--out FILE]",
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

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
const classify =
  values.slow && accountId && apiToken
    ? clefOmniCategoryClassifier({ accountId, apiToken })
    : undefined;

const report = await importAwesomeReadme(markdown, {
  fetch,
  fetchProfiles: values.slow,
  classify,
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
    `skipped ${report.skipped.noUsername} without a username, ${report.skipped.duplicate} duplicates`,
  ].join(", "),
);
