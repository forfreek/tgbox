import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { evaluationPlan, replayEvaluation, selectEvaluationCorpus } from "./src/evaluation.ts";
import { SummaryCandidate } from "./src/models.ts";

// Offline only: no credential reads, network access, database writes or model inference.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { selection: { type: "string" } },
});
const [mode, corpusPath, outputPath, resultsPath] = positionals;
if (
  (mode !== "plan" && mode !== "replay") ||
  !corpusPath ||
  !outputPath ||
  (mode === "replay" && !resultsPath)
) {
  throw new Error(
    "Usage: node evaluate.ts <plan|replay> <corpus.json> <output.json> [results.json] [--selection selection.json]",
  );
}
const corpus: unknown = JSON.parse(await readFile(corpusPath, "utf8"));
const selected = values.selection
  ? selectEvaluationCorpus(corpus, JSON.parse(await readFile(values.selection, "utf8")))
  : { corpus, models: SummaryCandidate.options };
const plan = await evaluationPlan(selected.corpus, selected.models);
const output =
  mode === "replay"
    ? replayEvaluation(plan, JSON.parse(await readFile(resultsPath ?? "", "utf8")))
    : plan;
// Fail rather than overwrite an evidence artifact.
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, { flag: "wx" });
console.log(
  JSON.stringify({ mode, planHash: plan.planHash, requests: plan.requests.length, outputPath }),
);
