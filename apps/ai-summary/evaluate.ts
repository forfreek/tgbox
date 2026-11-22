import { readFile, writeFile } from "node:fs/promises";
import { evaluationPlan, replayEvaluation } from "./src/evaluation.ts";
import { SummaryCandidate } from "./src/models.ts";

// Offline only: no credential reads, network access, database writes or model inference.
const [mode, corpusPath, outputPath, resultsPath] = process.argv.slice(2);
if (
  (mode !== "plan" && mode !== "replay") ||
  !corpusPath ||
  !outputPath ||
  (mode === "replay" && !resultsPath)
) {
  throw new Error(
    "Usage: node evaluate.ts <plan|replay> <corpus.json> <output.json> [results.json]",
  );
}
const corpus: unknown = JSON.parse(await readFile(corpusPath, "utf8"));
const plan = await evaluationPlan(corpus, SummaryCandidate.options);
const output =
  mode === "replay"
    ? replayEvaluation(plan, JSON.parse(await readFile(resultsPath ?? "", "utf8")))
    : plan;
// Fail rather than overwrite an evidence artifact.
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
console.log(
  JSON.stringify({ mode, planHash: plan.planHash, requests: plan.requests.length, outputPath }),
);
