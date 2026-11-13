import { env } from "cloudflare:workers";
import * as core from "@tgbox/core";
import {
  backfillPublicProjection,
  beginPublicProjection,
  createDb,
  getHistoryMirror,
  getSiteState,
  insertApprovedEntry,
  listCategories,
  readHistoryBaseline,
  setSiteState,
} from "@tgbox/db";
import { beforeEach, expect, test, vi } from "vitest";
import * as recovery from "../src/history-recovery.ts";
import { runHistoryRecoveryTick } from "../src/history-recovery.ts";
import * as promotions from "../src/promotion-preparation.ts";
import { type Harness, startHarness } from "./bot/harness.ts";

const db = createDb(env.DB);
const now = Date.UTC(2026, 10, 13);
const cursorKey = "public_history_recovery_cursor";
let harness: Harness;
beforeEach(async () => {
  harness = await startHarness();
  await env.MEDIA.delete(["history/recovery_a.json", "history/recovery_b.json"]);
});
async function add(username = "recovery_a") {
  const category = (await listCategories(db)).find((row) => row.kind === "channel");
  if (!category) throw new Error("Missing category");
  return (
    await insertApprovedEntry(db, {
      entry: { username, kind: "channel", categoryId: category.id, title: username, listedAt: now },
      stats: { members: 100, online: null, activityTier: 1, statsWrittenAt: now },
      tagIds: [],
      now,
    })
  ).id;
}
async function enable() {
  await beginPublicProjection(db);
  for (let batch = 0; batch < 5; batch++) if ((await backfillPublicProjection(db)).done) break;
  await setSiteState(db, "public_history_recovery_enabled", "1");
}
const tick = () => runHistoryRecoveryTick(db, env.MEDIA, 33, () => now);

test("budget guard performs zero I/O and validates spent", async () => {
  const prepare = vi.fn(() => {
    throw new Error("Unexpected SQL");
  });
  const blocked = createDb(
    new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare") return prepare;
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
  expect(await runHistoryRecoveryTick(blocked, env.MEDIA, 34, () => now)).toEqual({
    status: "budget",
    reserved: 0,
  });
  expect(prepare).not.toHaveBeenCalled();
  await expect(runHistoryRecoveryTick(blocked, env.MEDIA, -1, () => now)).rejects.toThrow("budget");
});

test("defaults disabled and waits for projection readiness", async () => {
  expect(await tick()).toEqual({ status: "disabled", reserved: 1 });
  await setSiteState(db, "public_history_recovery_enabled", "1");
  expect(await tick()).toEqual({ status: "not_ready", reserved: 1 });
  expect(await getSiteState(db, cursorKey)).toBeUndefined();
});

test("one phase per invocation survives restart and wraps to revisit changed R2 objects", async () => {
  const id = await add();
  await enable();
  await env.MEDIA.put(
    "history/recovery_a.json",
    JSON.stringify([{ t: new Date(now - 86400000).toISOString(), members: 20 }]),
  );
  for (const status of ["clean", "write", "verify", "ready"])
    expect(await runHistoryRecoveryTick(createDb(env.DB), env.MEDIA, 33, () => now)).toMatchObject({
      status,
      entryId: id,
      reserved: 17,
    });
  expect(await getSiteState(db, cursorKey)).toBe(String(id));
  expect((await readHistoryBaseline(db, id, now))?.members).toBe(20);
  expect(await tick()).toMatchObject({ status: "wrapped" });
  await env.MEDIA.put(
    "history/recovery_a.json",
    JSON.stringify([{ t: new Date(now - 86400000).toISOString(), members: 30 }]),
  );
  expect(await tick()).toMatchObject({ status: "clean" });
  expect((await readHistoryBaseline(db, id, now))?.members).toBeNull();
});

test("D1 failure yields its turn and the next sweep retries persisted R2 without weekly append", async () => {
  const id = await add();
  await enable();
  await env.MEDIA.put(
    "history/recovery_a.json",
    JSON.stringify([{ t: new Date(now - 86400000).toISOString(), members: 20 }]),
  );
  await tick();
  await tick();
  await env.DB.exec(
    "CREATE TRIGGER fail_recovery_point BEFORE INSERT ON history_baselines BEGIN SELECT RAISE(ABORT,'injected recovery failure'); END;",
  );
  try {
    expect(await tick()).toMatchObject({ status: "failed", entryId: id });
    expect((await getHistoryMirror(db, id))?.cursor).toBe(0);
  } finally {
    await env.DB.exec("DROP TRIGGER fail_recovery_point");
  }
  expect(await tick()).toMatchObject({ status: "wrapped" });
  expect(await tick()).toMatchObject({ status: "verify" });
  expect(await tick()).toMatchObject({ status: "ready" });
  expect((await readHistoryBaseline(db, id, now))?.members).toBe(20);
});

test("oversized sources yield to other entries and malformed sweep cursor recovers", async () => {
  const id = await add();
  const other = await add("recovery_b");
  await enable();
  await setSiteState(db, cursorKey, "bad");
  await env.MEDIA.put("history/recovery_a.json", "x".repeat(1024 * 1024 + 1));
  expect(await tick()).toMatchObject({ status: "oversized", entryId: id });
  expect(await tick()).toMatchObject({ status: "clean", entryId: other });
  expect((await getHistoryMirror(db, id))?.phase).toBe("oversized");
});

test("concurrent sweeps cannot rewind a completed cursor", async () => {
  const id = await add();
  await enable();
  await tick();
  await tick();
  await tick();
  await Promise.all([tick(), tick()]);
  expect(await getSiteState(db, cursorKey)).toBe(String(id));
  expect((await getHistoryMirror(db, id))?.phase).toBe("ready");
});

test("all phases including late R2 failure stay inside the SQL plus R2 reservation", async () => {
  const id = await add();
  await enable();
  let calls = 0;
  let heads = 0;
  let fail = false;
  const traced = createDb(
    new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare")
          return (sql: string) => {
            calls++;
            return target.prepare(sql);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
  const media = {
    put: env.MEDIA.put.bind(env.MEDIA),
    get: (key: string) => {
      calls++;
      return env.MEDIA.get(key);
    },
    head: (key: string) => {
      calls++;
      if (++heads === 2 && fail) throw new Error("Injected late R2 failure");
      return env.MEDIA.head(key);
    },
  };
  const costs: number[] = [];
  for (let step = 0; step < 4; step++) {
    calls = 0;
    heads = 0;
    fail = step === 3;
    const result = await runHistoryRecoveryTick(traced, media, 33, () => now);
    expect(calls).toBeLessThanOrEqual(result.reserved);
    costs.push(calls);
    if (fail) expect(result.status).toBe("failed");
  }
  expect((await getHistoryMirror(db, id))?.phase).toBe("stale");
  const plan = await env.DB.prepare(
    "EXPLAIN QUERY PLAN SELECT id FROM entries WHERE id>? ORDER BY id LIMIT 1",
  )
    .bind(0)
    .all<{ detail: string }>();
  expect(plan.results.map((row) => row.detail).join(" ")).toContain("INTEGER PRIMARY KEY");
  console.info("history recovery SQL plus R2 cost", costs);
});

test("existing five-minute entry runs recovery and alternates preparation priority", async () => {
  const id = await add();
  await env.DB.prepare("UPDATE entries SET status='hidden_by_admin' WHERE id=?").bind(id).run();
  await enable();
  await setSiteState(db, "public_promotion_preparation_enabled", "1");
  const log = vi.spyOn(console, "log");
  try {
    await harness.scheduled(0, "*/5 * * * *");
    expect((await getHistoryMirror(db, id))?.phase).toBe("clean");
    expect(
      log.mock.calls
        .filter(([name]) => name === "history recovery" || name === "promotion preparation")
        .map(([name]) => name),
    ).toEqual(["history recovery", "promotion preparation"]);
    log.mockClear();
    await harness.scheduled(300000, "*/5 * * * *");
    expect((await getHistoryMirror(db, id))?.phase).toBe("write");
    expect(
      log.mock.calls
        .filter(([name]) => name === "history recovery" || name === "promotion preparation")
        .map(([name]) => name),
    ).toEqual(["promotion preparation", "history recovery"]);
  } finally {
    log.mockRestore();
  }
});

test("scheduled preparation passes each reservation to the next job at the budget boundary", async () => {
  await enable();
  await setSiteState(db, "public_promotion_preparation_enabled", "1");
  const refresh = vi.spyOn(core, "runRefresh").mockResolvedValue({
    from: 0,
    to: -1,
    processed: [],
    deferred: [],
    hidden: [],
    restored: [],
    rowsWritten: 0,
    r2Writes: 0,
    subrequests: 33,
    dirty: false,
  });
  const history = vi.spyOn(recovery, "runHistoryRecoveryTick");
  const promotion = vi.spyOn(promotions, "runPromotionPreparationTick");
  try {
    await harness.scheduled(0, "*/5 * * * *");
    expect(history.mock.calls[0]?.[2]).toBe(33);
    expect(promotion.mock.calls[0]?.[1]).toBe(50);
    await harness.scheduled(300000, "*/5 * * * *");
    expect(promotion.mock.calls[1]?.[1]).toBe(33);
    expect(history.mock.calls[1]?.[2]).toBe(43);
  } finally {
    refresh.mockRestore();
    history.mockRestore();
    promotion.mockRestore();
  }
});
