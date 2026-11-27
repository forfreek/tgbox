import { env } from "cloudflare:workers";
import { HEALTH_POLICY_VERSION, type HealthObservation } from "@tgbox/shared";
import { beforeEach, expect, test } from "vitest";
import { createDb, getEntryByUsername, insertApprovedEntry, syncTaxonomy } from "./access.ts";
import {
  getEntryHealthEvidence,
  listEntryHealth,
  readEntryHealthPage,
  recordFunctionCheck,
  recordHealthObservation,
  recordIdentityReview,
} from "./health.ts";

const db = createDb(env.DB);
const T = Date.UTC(2026, 10, 27);
let id: number;
beforeEach(async () => {
  await env.DB.batch(
    ["audit_log", "entry_tags", "entry_stats", "entries_fts", "entries"].map((table) =>
      env.DB.prepare(`DELETE FROM ${table}`),
    ),
  );
  await syncTaxonomy(db);
  id = (
    await insertApprovedEntry(db, {
      entry: { username: "sample_bot", kind: "bot", categoryId: 1, title: "Sample", listedAt: T },
      stats: { statsWrittenAt: T },
      tagIds: [],
      now: T,
    })
  ).id;
});
const observation = (at = T, overrides: Partial<HealthObservation> = {}): HealthObservation => ({
  observationId: crypto.randomUUID(),
  targetUsername: "sample_bot",
  expectedKind: "bot",
  startedAt: at,
  completedAt: at + 100,
  parserVersion: "profile-v1",
  policyVersion: HEALTH_POLICY_VERSION,
  outcome: "recognized",
  reason: "profile_recognized",
  httpStatus: 200,
  pageShape: "entity",
  detectedKind: "bot",
  previewUnavailable: false,
  ...overrides,
});
const view = async () => (await listEntryHealth(db, [id])).get(id);
const manual = (at = T) => ({
  observationId: crypto.randomUUID(),
  targetUsername: "sample_bot",
  observedAt: at,
  result: "responded" as const,
  action: "Open /start",
  scope: "Observed welcome reply only",
  note: "",
  actor: "admin@example.com",
});

test("manual revision conflicts and replays do not add audit records", async () => {
  const check = manual();
  expect((await recordFunctionCheck(db, id, check, 0)).accepted).toBe(true);
  expect((await recordFunctionCheck(db, id, check, 0)).accepted).toBe(false);
  expect((await recordFunctionCheck(db, id, manual(T + 1), 0)).accepted).toBe(false);
  const rows = await env.DB.prepare("SELECT actor,action,payload FROM audit_log").all();
  expect(rows.results).toHaveLength(1);
  expect(rows.results[0]).toMatchObject({ actor: check.actor, action: "entry.function_check" });
  expect(JSON.parse(String(rows.results[0]?.payload))).toMatchObject({ scope: check.scope });
});

test("manual audit failure rolls back health and evidence atomically", async () => {
  await env.DB.prepare(
    "CREATE TRIGGER reject_health_audit BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
  ).run();
  try {
    await expect(recordFunctionCheck(db, id, manual(), 0)).rejects.toThrow();
    expect(await view()).toBeUndefined();
    expect(await getEntryHealthEvidence(db, id)).toEqual([]);
  } finally {
    await env.DB.prepare("DROP TRIGGER reject_health_audit").run();
  }
});

test("migration does not reinterpret legacy active/failures as verified health", async () => {
  expect(await view()).toBeUndefined();
  expect(await env.DB.prepare("SELECT count(*) n FROM entry_health_evidence").first("n")).toBe(0);
});
test.each(["approved", "hidden_by_system", "hidden_by_admin", "removed"])(
  "web observations never change publication %s",
  async (status) => {
    await env.DB.prepare("UPDATE entries SET status=?,fail_count=12,liveness='banned' WHERE id=?")
      .bind(status, id)
      .run();
    expect((await recordHealthObservation(db, id, observation())).accepted).toBe(true);
    const before = await getEntryByUsername(db, "sample_bot");
    expect(before).toMatchObject({ status, failCount: 12, liveness: "banned", kind: "bot" });
    expect(await view()).toMatchObject({
      publicState: "accessible",
      confirmedAt: T,
      functionState: "unverified",
    });
    const uncertain = observation(T + 1000, {
      outcome: "uncertain",
      reason: "transport_error",
      httpStatus: null,
      pageShape: null,
      detectedKind: null,
    });
    await recordHealthObservation(db, id, uncertain);
    expect(await view()).toMatchObject({
      publicState: "uncertain",
      confirmedAt: T,
      observedAt: T + 1000,
    });
    expect(await getEntryByUsername(db, "sample_bot")).toEqual(before);
  },
);
test("duplicate, equal-time and late requests cannot overwrite new health", async () => {
  const first = observation();
  await recordHealthObservation(db, id, first);
  expect((await recordHealthObservation(db, id, first)).accepted).toBe(false);
  expect((await recordHealthObservation(db, id, observation(T))).accepted).toBe(false);
  expect((await recordHealthObservation(db, id, observation(T - 1000))).accepted).toBe(false);
  expect((await view())?.revision).toBe(1);
  expect(await getEntryHealthEvidence(db, id)).toHaveLength(1);
});
test("concurrent observations converge on the newest start time", async () => {
  await Promise.all([
    recordHealthObservation(db, id, observation(T + 2000)),
    recordHealthObservation(db, id, observation(T + 1000)),
    recordHealthObservation(db, id, observation(T + 3000)),
  ]);
  expect((await view())?.observedAt).toBe(T + 3000);
});
test("type change requires review and never changes confirmed kind", async () => {
  await recordHealthObservation(
    db,
    id,
    observation(T, { outcome: "identity_changed", reason: "kind_mismatch", detectedKind: "user" }),
  );
  expect((await view())?.publicState).toBe("identity_review");
  expect((await getEntryByUsername(db, "sample_bot"))?.kind).toBe("bot");
});
test("unchanged checks update success time but sample evidence at most hourly", async () => {
  await recordHealthObservation(db, id, observation());
  await recordHealthObservation(db, id, observation(T + 1000));
  expect((await view())?.confirmedAt).toBe(T + 1000);
  expect(await getEntryHealthEvidence(db, id)).toHaveLength(1);
  await recordHealthObservation(db, id, observation(T + 3_600_000));
  expect(await getEntryHealthEvidence(db, id)).toHaveLength(2);
});
test("evidence stays at 16 slots while current function details survive ring eviction", async () => {
  await recordFunctionCheck(db, id, manual());
  for (let i = 1; i <= 24; i++)
    await recordHealthObservation(db, id, observation(T + i * 3_600_000));
  expect(await getEntryHealthEvidence(db, id)).toHaveLength(16);
  expect((await view())?.functionEvidence).toMatchObject({
    action: "Open /start",
    scope: "Observed welcome reply only",
  });
});
test("functional observations are independent of web order and do not imply accessibility", async () => {
  await recordFunctionCheck(db, id, manual(T + 10000));
  expect(await view()).toMatchObject({
    publicState: "unverified",
    functionState: "responded",
    confirmedAt: null,
  });
  await recordHealthObservation(db, id, observation(T));
  expect(await view()).toMatchObject({
    publicState: "accessible",
    functionState: "responded",
    functionObservedAt: T + 10000,
  });
  expect((await recordFunctionCheck(db, id, manual(T + 9999))).accepted).toBe(false);
  expect((await recordFunctionCheck(db, id, manual(T + 10000))).accepted).toBe(false);
});
test("functional checks reject other resource types and missing identities", async () => {
  await env.DB.prepare("UPDATE entries SET kind='channel' WHERE id=?").bind(id).run();
  expect((await recordFunctionCheck(db, id, manual())).accepted).toBe(false);
  expect((await recordHealthObservation(db, id, observation())).accepted).toBe(false);
  expect(await view()).toBeUndefined();
});
test("binding change masks old state, rejects old target and clears functional verification", async () => {
  await recordFunctionCheck(db, id, manual());
  await recordHealthObservation(db, id, observation());
  await env.DB.prepare("UPDATE entries SET username='changed_bot' WHERE id=?").bind(id).run();
  expect(await view()).toBeUndefined();
  expect(await getEntryHealthEvidence(db, id)).toHaveLength(0);
  expect((await recordHealthObservation(db, id, observation(T + 1000))).accepted).toBe(false);
  await recordHealthObservation(db, id, observation(T + 2000, { targetUsername: "changed_bot" }));
  expect(await view()).toMatchObject({
    functionState: "unverified",
    functionEvidence: null,
    confirmedAt: T + 2000,
  });
});
test("failed evidence write rolls back state in the same transaction", async () => {
  await recordHealthObservation(db, id, observation());
  await env.DB.prepare(
    "CREATE TRIGGER fail_health_evidence BEFORE INSERT ON entry_health_evidence BEGIN SELECT RAISE(ABORT,'injected'); END",
  ).run();
  try {
    await expect(recordHealthObservation(db, id, observation(T + 3_600_000))).rejects.toThrow();
  } finally {
    await env.DB.prepare("DROP TRIGGER fail_health_evidence").run();
  }
  expect((await view())?.observedAt).toBe(T);
});
test("batch reader validates and bounds page size", async () => {
  expect((await listEntryHealth(db, [])).size).toBe(0);
  await expect(listEntryHealth(db, [0])).rejects.toThrow("Invalid health page");
  await expect(
    listEntryHealth(
      db,
      Array.from({ length: 101 }, (_, i) => i + 1),
    ),
  ).rejects.toThrow("Invalid health page");
});
test("migration keeps private health tables out of entry mutations and cascades deletion", async () => {
  await recordHealthObservation(db, id, observation());
  await env.DB.prepare("DELETE FROM entries WHERE id=?").bind(id).run();
  expect(await env.DB.prepare("SELECT count(*) n FROM entry_health").first("n")).toBe(0);
  expect(await env.DB.prepare("SELECT count(*) n FROM entry_health_evidence").first("n")).toBe(0);
});

test("health pages and writes remain bounded with 2092 entries", async () => {
  for (let start = 0; start < 2092; start += 100) {
    const statements = [];
    for (let i = start; i < Math.min(start + 100, 2092); i++)
      statements.push(
        env.DB.prepare(
          "INSERT INTO entries(id,username,kind,category_id,title,listed_at,updated_at) VALUES(?,?,'bot',1,'scale',?,?)",
        ).bind(10000 + i, `scale_${i}`, T, T),
      );
    await env.DB.batch(statements);
  }
  // Populate the full health index, then measure the real production-shaped primary-key page.
  for (let start = 0; start < 2092; start += 100) {
    await env.DB.batch(
      Array.from({ length: Math.min(100, 2092 - start) }, (_, i) =>
        env.DB.prepare(
          "INSERT INTO entry_health(entry_id,binding_username,binding_kind) VALUES(?,?,'bot')",
        ).bind(10000 + start + i, `scale_${start + i}`),
      ),
    );
  }
  const page = Array.from({ length: 100 }, (_, i) => 10000 + i);
  const rows = await readEntryHealthPage(db, page);
  expect(rows.states.size).toBe(100);
  expect(rows.subrequests).toBe(1);
  expect(rows.rowsRead).toBeLessThanOrEqual(3 * page.length);
  const o = observation();
  const result = await recordHealthObservation(db, id, o);
  expect(result.subrequests).toBe(2);
  expect(result.rowsWritten).toBeLessThanOrEqual(8);
  expect((await recordHealthObservation(db, id, o)).rowsWritten).toBe(0);
  console.log(
    "health-scale",
    JSON.stringify({
      entries: 2093,
      page: 100,
      rowsRead: rows.rowsRead,
      rowsWritten: result.rowsWritten,
      subrequests: result.subrequests,
    }),
  );
});

test("identity review stays pending until explicit confirmation, which fences older web results", async () => {
  await recordFunctionCheck(db, id, manual(T));
  await recordHealthObservation(
    db,
    id,
    observation(T + 1000, {
      outcome: "identity_changed",
      reason: "kind_mismatch",
      detectedKind: "user",
    }),
  );
  expect(await view()).toMatchObject({
    publicState: "identity_review",
    functionState: "unverified",
    functionEvidence: null,
  });
  await recordHealthObservation(db, id, observation(T + 2000));
  expect((await view())?.publicState).toBe("identity_review");
  expect((await recordFunctionCheck(db, id, manual(T + 3000))).accepted).toBe(false);
  const revision = (await view())?.revision ?? 0;
  const input = {
    ...manual(T + 4000),
    expectedKind: "bot" as const,
    action: "confirm_identity" as const,
  };
  const { result: _result, ...review } = input;
  expect((await recordIdentityReview(db, id, revision - 1, review)).accepted).toBe(false);
  expect((await recordIdentityReview(db, id, revision, review)).accepted).toBe(true);
  expect(await view()).toMatchObject({
    publicState: "unverified",
    functionState: "unverified",
    confirmedAt: null,
  });
  expect((await recordHealthObservation(db, id, observation(T + 3000))).accepted).toBe(false);
  await recordHealthObservation(db, id, observation(T + 5000));
  expect((await view())?.publicState).toBe("accessible");
  expect((await getEntryByUsername(db, "sample_bot"))?.status).toBe("approved");
});

test("concurrent functional and public observations preserve both dimensions", async () => {
  await Promise.all([
    recordHealthObservation(db, id, observation(T + 1000)),
    recordFunctionCheck(db, id, manual(T + 2000)),
  ]);
  expect(await view()).toMatchObject({
    publicState: "accessible",
    confirmedAt: T + 1000,
    functionState: "responded",
    functionObservedAt: T + 2000,
  });
});
