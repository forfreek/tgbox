import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { access, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { optionalSummaryExport } from "./summary-export.ts";

test("an unusable optional output path also falls back when cleanup fails", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "summary-export-directory-"));
  let called = false;
  assert.equal(
    await optionalSummaryExport(directory, () => {
      called = true;
    }),
    "",
  );
  assert.equal(called, false);
  await access(directory);
});

test("optional export discards partial output on failure and removes stale files", async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), "summary-export-")), "optional.sql");
  await writeFile(file, "stale");
  assert.equal(
    await optionalSummaryExport(file, (p) => {
      writeFileSync(p, "partial");
      throw new Error("missing table");
    }),
    "",
  );
  await assert.rejects(access(file));
  assert.equal(
    await optionalSummaryExport(file, (p) =>
      writeFileSync(p, "CREATE TABLE ai_summary_public(entry_id INTEGER);"),
    ),
    "CREATE TABLE ai_summary_public(entry_id INTEGER);",
  );
  await assert.rejects(access(file));
});
