import { env } from "cloudflare:workers";
import { currentEntryHealth, fetchResourceSnapshot, verifyEntryFunction } from "@tgbox/core";
import { getEntryByUsername, insertApprovedEntry, readHealthSources } from "@tgbox/db";
import { expect, test } from "vitest";
import { actor, auditRows, db, NOW, setup } from "./fake.ts";

test("interactive acquisition shares profile cooldown without generating false observations", async () => {
  const { ctx } = await setup();
  const healthyFetch = ctx.fetch;
  let calls = 0;
  ctx.fetch = async () => {
    calls++;
    return new Response(null, { status: 429, headers: { "retry-after": "7200" } });
  };
  const options = { knownKind: "bot" as const, needCreatedAt: false };
  const limited = await fetchResourceSnapshot(ctx, "some_bot", options);
  expect(limited.health?.reason).toBe("rate_limited");
  expect((await readHealthSources(db)).tme_profile.state.notBefore).toBe(NOW + 7_200_000);
  const deferred = await fetchResourceSnapshot(ctx, "some_bot", options);
  expect(deferred.health).toBeNull();
  expect(deferred.deferredUntil).toBe(NOW + 7_200_000);
  expect(calls).toBe(1);
  ctx.now = () => NOW + 7_200_001;
  ctx.fetch = healthyFetch;
  const recovered = await fetchResourceSnapshot(ctx, "some_bot", options);
  expect(recovered.health?.outcome).toBe("recognized");
  expect((await readHealthSources(db)).tme_profile.state.notBefore).toBe(0);
});

test("authenticated manual function checks preserve publication and enforce revision", async () => {
  const { ctx } = await setup();
  const { id } = await insertApprovedEntry(db, {
    entry: { username: "some_bot", kind: "bot", title: "Bot", categoryId: 1, listedAt: NOW },
    stats: { statsWrittenAt: NOW },
    tagIds: [],
    now: NOW,
  });
  await env.DB.prepare("UPDATE entries SET status='hidden_by_system' WHERE id=?").bind(id).run();
  const input = {
    id,
    expectedRevision: 0,
    result: "no_response" as const,
    action: "/start",
    scope: "No welcome reply observed",
    note: "",
    actor,
  };
  await expect(verifyEntryFunction(ctx, { ...input, actor: "system" })).rejects.toThrow(
    "authenticated",
  );
  expect(await verifyEntryFunction(ctx, input)).toEqual({ ok: true });
  expect(await verifyEntryFunction(ctx, input)).toEqual({ ok: false, error: "conflict" });
  expect(await currentEntryHealth(ctx, id)).toMatchObject({
    publicState: "unverified",
    functionState: "no_response",
    functionEvidence: { actor, observedAt: NOW },
  });
  expect((await getEntryByUsername(db, "some_bot"))?.status).toBe("hidden_by_system");
  expect(await auditRows()).toHaveLength(1);
});
