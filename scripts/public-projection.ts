import { statSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import {
  auditProjection,
  operateProjection,
  projectionStatus,
} from "./lib/public-projection-local.ts";

// Explicit file input only. This tool has no Cloudflare credentials or network execution path.
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { database: { type: "string" }, batch: { type: "string", default: "100" } },
});
const command = positionals[0] ?? "status";
if (
  !values.database ||
  positionals.length > 1 ||
  !["status", "audit", "start", "restart", "step", "finish"].includes(command)
)
  throw new Error(
    "Usage: node scripts/public-projection.ts <status|audit|start|restart|step|finish> --database <local.sqlite> [--batch 100]",
  );
const filename = path.resolve(values.database);
if (!statSync(filename).isFile()) throw new Error("Database must be an existing local SQLite file");
const readOnly = command === "status" || command === "audit";
const db = new DatabaseSync(filename, { readOnly });
try {
  db.exec("BEGIN");
  db.prepare("SELECT promotion_order,username_key FROM public_listing LIMIT 0").all();
  db.exec("COMMIT");
  if (command === "status") console.log(JSON.stringify(projectionStatus(db)));
  else if (command === "audit") {
    db.exec("BEGIN");
    const result = auditProjection(db);
    db.exec("COMMIT");
    console.log(JSON.stringify(result));
    if (Object.values(result).some((value) => value !== 0)) process.exitCode = 1;
  } else
    console.log(
      JSON.stringify(
        operateProjection(
          db,
          command as "start" | "restart" | "step" | "finish",
          Number(values.batch),
        ),
      ),
    );
} finally {
  db.close();
}
