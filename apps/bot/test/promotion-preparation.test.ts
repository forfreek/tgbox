import { env } from "cloudflare:workers";
import {
  backfillPublicProjection,
  beginPublicProjection,
  createDb,
  getSiteState,
  setSiteState,
} from "@tgbox/db";
import { ProductKind } from "@tgbox/shared";
import { beforeEach, expect, test, vi } from "vitest";
import { runPromotionPreparationTick } from "../src/promotion-preparation.ts";
import { startHarness } from "./bot/harness.ts";

const db = createDb(env.DB);
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM site_state WHERE key LIKE 'public_%'").run();
});
async function enable() {
  await beginPublicProjection(db);
  for (let batch = 0; batch < 10; batch++) if ((await backfillPublicProjection(db)).done) break;
  await setSiteState(db, "public_promotion_preparation_enabled", "1");
}
test("budget exhaustion performs no database calls", async () => {
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
  expect(await runPromotionPreparationTick(blocked, 41, () => 1000)).toEqual({
    status: "budget",
    reserved: 0,
  });
  expect(prepare).not.toHaveBeenCalled();
});
test("defaults disabled and requires ready projection before work", async () => {
  expect(await runPromotionPreparationTick(db, 0, () => 1000)).toEqual({
    status: "disabled",
    reserved: 1,
  });
  await setSiteState(db, "public_promotion_preparation_enabled", "1");
  expect(await runPromotionPreparationTick(db, 0, () => 1000)).toEqual({
    status: "not_ready",
    reserved: 1,
  });
  expect(await getSiteState(db, "public_promotion_preparation_cursor")).toBeUndefined();
});
test("one bounded step rotates scopes and restart retains its place", async () => {
  await enable();
  for (let index = 0; index < ProductKind.options.length; index++) {
    const result = await runPromotionPreparationTick(createDb(env.DB), 40, () => 1000);
    expect(result).toMatchObject({
      status: "ready",
      kind: ProductKind.options[index],
      reserved: 10,
    });
  }
  expect(await getSiteState(db, "public_promotion_preparation_cursor")).toBe("0");
});
test("failed scope yields its next turn and malformed cursor recovers", async () => {
  await enable();
  await setSiteState(db, "public_promotion_preparation_cursor", "bad");
  const result = await runPromotionPreparationTick(db, 0, () => NaN);
  expect(result).toMatchObject({ status: "failed", kind: ProductKind.options[0], reserved: 10 });
  expect(await getSiteState(db, "public_promotion_preparation_cursor")).toBe("1");
  expect(await runPromotionPreparationTick(db, 0, () => 1000)).toMatchObject({
    kind: ProductKind.options[1],
  });
});
test("enabled empty preparation stays within the reserved SQL allowance", async () => {
  await enable();
  const calls: string[] = [];
  const traced = createDb(
    new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare")
          return (sql: string) => {
            calls.push(sql);
            return target.prepare(sql);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
  expect(await runPromotionPreparationTick(traced, 40, () => 1000)).toMatchObject({
    status: "ready",
    reserved: 10,
  });
  expect(calls.length).toBeLessThanOrEqual(10);
  console.info("promotion preparation tick SQL", calls.length);
});

test("existing five-minute scheduled entry advances enabled preparation", async () => {
  const harness = await startHarness();
  await enable();
  await harness.scheduled(Date.now(), "*/5 * * * *");
  expect(await getSiteState(db, "public_promotion_preparation_cursor")).toBe("1");
});
