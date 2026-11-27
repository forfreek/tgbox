import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { HealthObservation } from "../packages/shared/src/health.ts";
import {
  assessHistory,
  collectHistory,
  type HistoryRow,
  historyArtifactHash,
  historyFingerprint,
  parseHistoryInput,
} from "./health-history.ts";

const at = Date.UTC(2026, 10, 27);
const row: HistoryRow = {
  id: 1,
  username: "sample",
  kind: "channel",
  title: "Original",
  status: "hidden_by_system",
  liveness: "banned",
  fail_count: 12,
  first_fail_at: at - 2000,
  last_fail_at: at - 1000,
  updated_at: at - 1000,
  listed_at: at - 3000,
};
const observation: HealthObservation = {
  observationId: "00000000-0000-4000-8000-000000000001",
  targetUsername: "sample",
  expectedKind: "channel",
  startedAt: at,
  completedAt: at + 100,
  parserVersion: "test",
  policyVersion: "health-v1",
  outcome: "recognized",
  reason: "profile_recognized",
  httpStatus: 200,
  pageShape: "entity",
  detectedKind: "channel",
  previewUnavailable: false,
};
const fixture = (name: string) =>
  readFileSync(new URL(`../packages/telegram/fixtures/${name}`, import.meta.url), "utf8");

test("export validation refuses protected states, duplicate ids, unsafe usernames and truncation", () => {
  for (const bad of [
    { status: "hidden_by_admin" },
    { status: "removed" },
    { username: "../escape" },
    { first_fail_at: -1 },
    { kind: "user" },
    { liveness: "invented" },
  ])
    assert.throws(() => parseHistoryInput({ rows: [{ ...row, ...bad }] }));
  assert.throws(() => parseHistoryInput({ rows: [row, row] }));
  assert.throws(() =>
    parseHistoryInput({ rows: Array.from({ length: 301 }, (_, i) => ({ ...row, id: i + 1 })) }),
  );
  assert.deepEqual(parseHistoryInput({ rows: [{ ...row, secret: "never forward" }] }), [row]);
});
test("same-name positive identity never authorizes restoration or bot functionality", () => {
  assert.equal(assessHistory(row, observation).productionMutationAllowed, false);
  assert.equal(assessHistory(row, observation).restoration, "requires_human_review");
  const bot = { ...row, kind: "bot" as const };
  assert.equal(
    assessHistory(bot, { ...observation, expectedKind: "bot", detectedKind: "bot" }).functionState,
    "unverified",
  );
  assert.throws(() => assessHistory(row, { ...observation, targetUsername: "another" }));
  for (const reason of [
    "view_placeholder",
    "contact_placeholder",
    "transport_error",
    "rate_limited",
  ] as const)
    assert.equal(
      assessHistory(row, {
        ...observation,
        outcome: "uncertain",
        reason,
        httpStatus: null,
        pageShape: null,
        detectedKind: null,
      }).finding,
      "unable_to_confirm",
    );
});
test("fingerprint changes when protected record changes and ignores object key order", () => {
  assert.equal(historyFingerprint(row), historyFingerprint({ ...row }));
  for (const change of [
    { status: "approved" as const },
    { updated_at: at },
    { kind: "bot" as const },
    { username: "another" },
    { fail_count: 13 },
  ])
    assert.notEqual(historyFingerprint(row), historyFingerprint({ ...row, ...change }));
});

test("evidence JSON hashes survive repository formatting and checkout line endings", () => {
  const source = JSON.stringify({ version: 1, rows: [row] });
  assert.equal(
    historyArtifactHash(source),
    historyArtifactHash(JSON.stringify(JSON.parse(source), null, 2).replaceAll("\n", "\r\n")),
  );
});

test("committed review binds every observation to the unchanged read-only export", () => {
  const base = new URL("../docs/health-check/evidence/2026-11-27/", import.meta.url);
  const inputText = readFileSync(new URL("input.json", base), "utf8");
  const input = JSON.parse(inputText);
  const recheck = JSON.parse(readFileSync(new URL("recheck.json", base), "utf8"));
  const report = JSON.parse(readFileSync(new URL("review-proxy.json", base), "utf8"));
  const rows = parseHistoryInput(input);
  assert.deepEqual(parseHistoryInput(recheck), rows);
  assert.equal(report.inputSha256, historyArtifactHash(inputText));
  assert.equal(
    report.previousReportSha256,
    historyArtifactHash(readFileSync(new URL("review.json", base), "utf8")),
  );
  assert.deepEqual(
    report.results.map((r: { entry: HistoryRow }) => r.entry),
    rows,
  );
  for (const result of report.results)
    assert.deepEqual(result.assessment, assessHistory(result.entry, result.observation));
  for (const meta of [...input.readMeta, recheck.readMeta]) {
    assert.equal(meta.changes, 0);
    assert.equal(meta.rowsWritten, 0);
    assert.equal(meta.changedDb, false);
  }
});
test("source rate limiting stops the batch and a resumed collector retains Retry-After", async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return new Response(null, { status: 429, headers: { "retry-after": "7200" } });
  };
  const first = await collectHistory([row, { ...row, id: 2, username: "second" }], {
    now: () => at,
    fetch,
  });
  assert.equal(calls, 1);
  assert.equal(first.results[1]?.assessment.finding, "deferred");
  const resumed = await collectHistory([row], {
    now: () => at + 300_000,
    fetch,
    previousSources: first.sources,
  });
  assert.equal(calls, 1);
  assert.equal(resumed.results[0]?.deferredUntil, at + 7_200_000);
});
test("live parser recognizes a mismatched type without changing the original record", async () => {
  const before = JSON.stringify(row);
  const output = await collectHistory([row], {
    now: () => at,
    fetch: async () => new Response(fixture("profile-group.html")),
  });
  assert.equal(output.results[0]?.assessment.finding, "identity_review");
  assert.equal(JSON.stringify(row), before);
});
test("preview source failure preserves a valid profile and remains separate from profile cooldown", async () => {
  const output = await collectHistory([row, { ...row, id: 2, username: "second" }], {
    now: () => at,
    fetch: async (url) =>
      url.includes("/s/")
        ? new Response(null, { status: 429 })
        : new Response(fixture("profile-channel.html")),
  });
  assert.equal(output.results[0]?.assessment.finding, "public_identity_recognized");
  assert.equal(output.results[1]?.assessment.finding, "public_identity_recognized");
  assert.equal(output.results[1]?.subrequests, 1);
});
