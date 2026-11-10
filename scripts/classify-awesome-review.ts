// Classify `review` rows that already have kind + title/description (no t.me refetch).
// Uses clef-omni via CLOUDFLARE_* env or wrangler OAuth. Pace model calls to avoid bursts.
//
//   node scripts/classify-awesome-review.ts --report /tmp/report.json --out /tmp/report-out.json
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import {
  type AwesomeImportRow,
  type AwesomeReport,
  classifyAwesomeReviewRows,
  clefOmniCategoryClassifier,
} from "../packages/telegram/src/awesome-import.ts";
import { resolveCfAiCredentials } from "./cf-ai-credentials.ts";

const { values } = parseArgs({
  options: {
    report: { type: "string" },
    out: { type: "string" },
    "delay-ms": { type: "string", default: "300" },
    "max-model-calls": { type: "string" },
  },
});

if (!values.report || !values.out) {
  console.error(
    "Usage: classify-awesome-review.ts --report report.json --out out.json [--delay-ms 300] [--max-model-calls N]",
  );
  process.exit(1);
}

const creds = resolveCfAiCredentials();
if (!creds) {
  console.error("Need CLOUDFLARE_API_TOKEN (or wrangler login) and CLOUDFLARE_ACCOUNT_ID");
  process.exit(1);
}

const report = JSON.parse(await readFile(values.report, "utf8")) as AwesomeReport;
const delayMs = Number(values["delay-ms"] ?? 300);
const maxModelCalls = values["max-model-calls"]
  ? Number(values["max-model-calls"])
  : Math.max(500, report.review.length + 50);

const classify = clefOmniCategoryClassifier(creds);
const { ready: newlyReady, review: stillReview } = await classifyAwesomeReviewRows(report.review, {
  classify,
  maxModelCalls,
  modelDelayMs: delayMs,
});

const next: AwesomeReport = {
  ready: [...report.ready, ...newlyReady],
  review: stillReview,
  rejected: report.rejected,
  unknown: report.unknown,
  skipped: report.skipped,
};

await writeFile(values.out, `${JSON.stringify(next, null, 2)}\n`);

const bySource = (rows: AwesomeImportRow[]) => {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.source] = (counts[row.source] ?? 0) + 1;
  }
  return counts;
};

console.error(
  [
    `classified ${report.review.length} review → +${newlyReady.length} ready, ${stillReview.length} still review`,
    `ready total ${next.ready.length}`,
    `new ready sources ${JSON.stringify(bySource(newlyReady))}`,
  ].join("\n"),
);
