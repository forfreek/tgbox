import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import { createDb, setSiteState } from "./access.ts";
import { readHealthSources, recordHealthSource } from "./health-source.ts";

const db = createDb(env.DB);
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM site_state WHERE key LIKE 'health_source_v1:%'").run();
});
test("both source states are read together and absent sources are not marked healthy", async () => {
  const s = await readHealthSources(db);
  expect(s.tme_profile.state).toEqual({ failures: 0, lastObservedAt: 0, notBefore: 0 });
  expect(s.tme_preview.raw).toBeUndefined();
});
test("CAS rejects stale writers and leaves resource state untouched", async () => {
  const s = await readHealthSources(db);
  expect(
    (
      await recordHealthSource(db, "tme_profile", s.tme_profile, {
        at: 100,
        outcome: "rate_limited",
        retryAfterMs: 600000,
      })
    ).accepted,
  ).toBe(true);
  expect(
    (await recordHealthSource(db, "tme_profile", s.tme_profile, { at: 101, outcome: "parsed" }))
      .accepted,
  ).toBe(false);
  const next = await readHealthSources(db);
  expect(next.tme_profile.state.notBefore).toBe(600100);
  expect(next.tme_preview.state.notBefore).toBe(0);
  expect(
    (await recordHealthSource(db, "tme_profile", next.tme_profile, { at: 99, outcome: "parsed" }))
      .subrequests,
  ).toBe(0);
  expect(
    (
      await recordHealthSource(db, "tme_profile", next.tme_profile, {
        at: 600101,
        outcome: "parsed",
      })
    ).accepted,
  ).toBe(true);
});
test("invalid stored control fails closed instead of resetting a production cooldown", async () => {
  await setSiteState(db, "health_source_v1:tme_profile", '{"failures":null}');
  await expect(readHealthSources(db)).rejects.toThrow();
});
