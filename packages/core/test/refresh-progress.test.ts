import { env } from "cloudflare:workers";
import { getSiteState, setSiteState } from "@tgbox/db";
import { beforeEach, expect, test } from "vitest";
import {
  claimRefreshProgress,
  finishRefreshProgress,
  REFRESH_PROGRESS_KEY,
} from "../src/refresh-progress.ts";
import { db, NOW, setup } from "./fake.ts";

beforeEach(async () => {
  await setup();
});

const input = { maxId: 1980, batchSize: 6, scheduledTime: NOW, now: NOW };
async function claim(overrides: Partial<typeof input> = {}) {
  const value = await claimRefreshProgress(db, { ...input, ...overrides });
  if (!value) throw new Error("expected ownership");
  return value;
}

test("first rollout starts at the newest slice, then wraps without using the clock modulo", async () => {
  const first = await claim();
  expect(first.state.nextId).toBe(1975);
  await finishRefreshProgress(db, first, { nextId: 1981, scheduledTime: NOW });
  const next = await claim({ scheduledTime: NOW + 300_000, now: NOW + 300_000 });
  expect(next.state).toMatchObject({ nextId: 1, cycle: 1 });
});

test("growing the max ID keeps the next unfinished slice instead of jumping backwards", async () => {
  const first = await claim();
  await finishRefreshProgress(db, first, { nextId: 1981, scheduledTime: NOW });
  const next = await claim({ maxId: 1983, scheduledTime: NOW + 300_000, now: NOW + 300_000 });
  expect(next.state).toMatchObject({ nextId: 1981, cycle: 0 });
});

test("partial batches and batch size changes resume at the saved ID", async () => {
  const first = await claim();
  await finishRefreshProgress(db, first, { nextId: 1977, scheduledTime: NOW });
  expect(
    (await claim({ batchSize: 3, maxId: 1990, scheduledTime: NOW + 300_000 })).state.nextId,
  ).toBe(1977);
});

test("overlapping invocations have one owner and stale checkpoints cannot advance it", async () => {
  const claims = await Promise.all([
    claimRefreshProgress(db, input),
    claimRefreshProgress(db, input),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const owner = claims.find((value) => value !== null);
  if (!owner) throw new Error("missing owner");
  expect(await claimRefreshProgress(db, { ...input, scheduledTime: NOW + 300_000 })).toBeNull();
  const replacement = await claim({ scheduledTime: NOW + 21 * 60_000, now: NOW + 21 * 60_000 });
  await expect(
    finishRefreshProgress(db, owner, { nextId: 1981, scheduledTime: NOW }),
  ).rejects.toThrow("ownership lost");
  expect(await getSiteState(db, REFRESH_PROGRESS_KEY)).toBe(replacement.claimed);
});

test("failed runs release ownership without advancing and can retry the same tick", async () => {
  const first = await claim();
  await finishRefreshProgress(db, first);
  expect((await claim()).state.nextId).toBe(first.state.nextId);
});

test("completed ticks and delayed old events do not process another slice", async () => {
  const first = await claim();
  await finishRefreshProgress(db, first, { nextId: 1981, scheduledTime: NOW });
  expect(await claimRefreshProgress(db, input)).toBeNull();
  expect(await claimRefreshProgress(db, { ...input, scheduledTime: NOW - 300_000 })).toBeNull();
});

test("invalid persisted progress fails closed without erasing it", async () => {
  await setSiteState(db, REFRESH_PROGRESS_KEY, '{"nextId":null}');
  await expect(claimRefreshProgress(db, input)).rejects.toThrow("Invalid refresh progress");
  expect(await getSiteState(db, REFRESH_PROGRESS_KEY)).toBe('{"nextId":null}');
});

test("compare and swap never recreates a removed checkpoint for an old owner", async () => {
  const first = await claim();
  await env.DB.prepare("DELETE FROM site_state WHERE key = ?").bind(REFRESH_PROGRESS_KEY).run();
  await expect(finishRefreshProgress(db, first)).rejects.toThrow("ownership lost");
  expect(await getSiteState(db, REFRESH_PROGRESS_KEY)).toBeUndefined();
});
