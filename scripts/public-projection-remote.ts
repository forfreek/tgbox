import { setTimeout } from "node:timers/promises";
import { parseArgs } from "node:util";
import { remoteD1 } from "./lib/d1-remote.ts";
import {
  auditRemoteProjection,
  cleanupRemoteProjection,
  finishRemoteProjection,
  remoteProjectionStatus,
  startRemoteProjection,
  stepRemoteProjection,
} from "./lib/public-projection-remote.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    account: { type: "string" },
    database: { type: "string" },
    apply: { type: "boolean", default: false },
    batch: { type: "string", default: "100" },
    after: { type: "string", default: "0" },
    "delay-ms": { type: "string", default: "500" },
  },
});
const command = positionals[0] ?? "status";
if (
  !values.account ||
  !values.database ||
  positionals.length > 1 ||
  !["status", "audit", "start", "restart", "step", "cleanup", "repair-counts", "finish"].includes(
    command,
  )
)
  throw new Error("Specify operation, --account and --database");
const batch = Number(values.batch);
const after = Number(values.after);
const delay = Number(values["delay-ms"]);
if (
  !Number.isSafeInteger(batch) ||
  batch < 1 ||
  batch > 100 ||
  !Number.isSafeInteger(after) ||
  after < 0
)
  throw new Error("Invalid batch or cleanup cursor");
if (!Number.isSafeInteger(delay) || delay < 0 || delay > 60_000)
  throw new Error("Invalid request delay");
if (!["status", "audit"].includes(command) && !values.apply) {
  console.log(
    JSON.stringify({
      dryRun: true,
      operation: command,
      account: values.account,
      database: values.database,
      batch,
      after,
    }),
  );
} else {
  const execute = remoteD1(values.account, values.database, process.env.CLOUDFLARE_API_TOKEN ?? "");
  let first = true;
  const query: typeof execute = async (statements) => {
    if (!first && delay) await setTimeout(delay);
    first = false;
    return execute(statements);
  };
  let result: unknown;
  if (command === "status") result = await remoteProjectionStatus(query);
  else if (command === "audit") {
    const audit = await auditRemoteProjection(query);
    result = { state: audit.state, totals: audit.totals };
    if (Object.values(audit.totals).some((value) => value !== 0)) process.exitCode = 1;
  } else if (command === "start" || command === "restart")
    result = await startRemoteProjection(query, command === "restart");
  else if (command === "step") result = await stepRemoteProjection(query, batch);
  else if (command === "cleanup") result = await cleanupRemoteProjection(query, after, batch);
  else result = await finishRemoteProjection(query, command === "repair-counts");
  console.log(JSON.stringify(result));
}
