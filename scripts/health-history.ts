import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  EntryKind,
  EntryStatus,
  HealthObservation,
  HealthSourceState,
  initialHealthSource,
  Liveness,
  nextHealthSource,
} from "../packages/shared/src/index.ts";
import { fetchEntrySnapshot, type SnapshotOptions } from "../packages/telegram/src/snapshot.ts";

// Offline input only. This tool has no D1 client, credentials, restore command or Bot API.
export type HistoryRow = {
  id: number;
  username: string;
  kind: "channel" | "group" | "bot";
  title: string;
  status: "approved" | "hidden_by_system";
  liveness: string;
  fail_count: number;
  first_fail_at: number | null;
  last_fail_at: number | null;
  updated_at: number;
  listed_at: number;
};
export function parseHistoryInput(value: unknown): HistoryRow[] {
  if (!value || typeof value !== "object" || !("rows" in value) || !Array.isArray(value.rows))
    throw new Error("Expected exported rows");
  if (value.rows.length > 300) throw new Error("Export truncated or too large; page explicitly");
  const ids = new Set<number>();
  for (const row of value.rows) {
    if (
      !row ||
      typeof row !== "object" ||
      !Number.isSafeInteger(row.id) ||
      row.id <= 0 ||
      ids.has(row.id) ||
      typeof row.username !== "string" ||
      !/^[a-z0-9_]{1,64}$/.test(row.username) ||
      !EntryKind.safeParse(row.kind).success ||
      !["approved", "hidden_by_system"].includes(row.status) ||
      !EntryStatus.safeParse(row.status).success ||
      typeof row.title !== "string" ||
      row.title.length > 1024 ||
      !Liveness.safeParse(row.liveness).success ||
      !Number.isSafeInteger(row.listed_at) ||
      row.listed_at < 0 ||
      ![row.first_fail_at, row.last_fail_at].every(
        (n) => n === null || (Number.isSafeInteger(n) && n >= 0),
      ) ||
      !Number.isSafeInteger(row.updated_at) ||
      row.updated_at < 0 ||
      !Number.isSafeInteger(row.fail_count) ||
      row.fail_count < 0
    )
      throw new Error("Invalid or protected historical row");
    ids.add(row.id);
  }
  return value.rows.map((row) => ({
    id: row.id,
    username: row.username,
    kind: row.kind,
    title: row.title,
    status: row.status,
    liveness: row.liveness,
    fail_count: row.fail_count,
    first_fail_at: row.first_fail_at,
    last_fail_at: row.last_fail_at,
    updated_at: row.updated_at,
    listed_at: row.listed_at,
  }));
}
export const historyFingerprint = (row: HistoryRow) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        row.id,
        row.username,
        row.kind,
        row.status,
        row.updated_at,
        row.liveness,
        row.fail_count,
        row.first_fail_at,
        row.last_fail_at,
        row.listed_at,
        row.title,
      ]),
    )
    .digest("hex");

/** JSON value digest survives checkout EOL and indentation changes. */
export const historyArtifactHash = (text: string) =>
  createHash("sha256")
    .update(JSON.stringify(JSON.parse(text)))
    .digest("hex");

export function assessHistory(row: HistoryRow, input: HealthObservation | null) {
  const o = input === null ? null : HealthObservation.parse(input);
  if (o && (o.targetUsername !== row.username || o.expectedKind !== row.kind))
    throw new Error("Historical evidence binding mismatch");
  const finding = !o
    ? "deferred"
    : o.outcome === "recognized"
      ? "public_identity_recognized"
      : o.outcome === "identity_changed"
        ? "identity_review"
        : "unable_to_confirm";
  return {
    finding,
    // Same-name web pages cannot establish continuity, and no current web source proves a ban.
    identityContinuity: "not_verified" as const,
    functionState: row.kind === "bot" ? ("unverified" as const) : null,
    restoration:
      row.status === "approved" ? ("not_applicable" as const) : ("requires_human_review" as const),
    productionMutationAllowed: false as const,
    fingerprint: historyFingerprint(row),
  };
}

/** Serial, bounded public GETs. Source failures back off the remaining batch, never retry storms. */
export async function collectHistory(
  rows: HistoryRow[],
  options: {
    now: () => number;
    fetch: SnapshotOptions["fetch"];
    previousSources?: Record<"tme_profile" | "tme_preview", HealthSourceState>;
  },
) {
  const sources = {
    tme_profile: options.previousSources
      ? HealthSourceState.parse(options.previousSources.tme_profile)
      : initialHealthSource(),
    tme_preview: options.previousSources
      ? HealthSourceState.parse(options.previousSources.tme_preview)
      : initialHealthSource(),
  };
  const results = [];
  for (const row of parseHistoryInput({ rows })) {
    const snapshot = await fetchEntrySnapshot(row.username, {
      fetch: options.fetch,
      now: new Date(options.now()),
      knownKind: row.kind,
      needCreatedAt: false,
      cooldowns: {
        tme_profile: sources.tme_profile.notBefore,
        tme_preview: sources.tme_preview.notBefore,
      },
    });
    for (const source of ["tme_profile", "tme_preview"] as const) {
      const result = snapshot.sourceResults[source];
      if (result) sources[source] = nextHealthSource(sources[source], result);
    }
    results.push({
      entry: row,
      assessment: assessHistory(row, snapshot.health),
      observation: snapshot.health,
      currentProfile: snapshot.profile
        ? {
            title: snapshot.profile.title,
            kind: snapshot.profile.kind,
            pageShape: snapshot.profile.pageShape,
          }
        : null,
      sourceResults: snapshot.sourceResults,
      deferredUntil: snapshot.deferredUntil,
      subrequests: snapshot.subrequests,
    });
  }
  return {
    version: "health-history-review-v1",
    collectedAt: new Date(options.now()).toISOString(),
    sources,
    results,
  };
}

async function main() {
  const [command, input, output, previous, ...extra] = process.argv.slice(2);
  if (command !== "collect" || !input || !output || extra.length)
    throw new Error(
      "Usage: node scripts/health-history.ts collect <export.json> <new-report.json> [previous-report.json] (public GET only)",
    );
  const text = readFileSync(input, "utf8");
  if (existsSync(output)) throw new Error("Output already exists; refusing another acquisition");
  const rows = parseHistoryInput(JSON.parse(text));
  const previousText = previous ? readFileSync(previous, "utf8") : null;
  const previousReport = previousText ? JSON.parse(previousText) : null;
  if (
    previousReport &&
    (previousReport.version !== "health-history-review-v1" || !previousReport.sources)
  )
    throw new Error("Invalid previous source state; refusing to reset cooldown");
  const report = await collectHistory(rows, {
    now: Date.now,
    fetch: (input, init) => fetch(input, init),
    previousSources: previousReport?.sources,
  });
  writeFileSync(
    output,
    `${JSON.stringify({ ...report, hashFormat: "parsed-json-v1", inputSha256: historyArtifactHash(text), previousReportSha256: previousText ? historyArtifactHash(previousText) : null, transport: process.execArgv.includes("--use-env-proxy") ? "environment_proxy" : "node_default" }, null, 2)}\n`,
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      output: path.resolve(output),
      entries: report.results.length,
      subrequests: report.results.reduce((n, r) => n + r.subrequests, 0),
    }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  await main();
