import { env } from "cloudflare:workers";
import { readPublicMediaCached, setEntryPostsVisibility, setPostVisibility } from "@tgbox/core";
import {
  backfillPublicProjection,
  beginPublicProjection,
  getEntryByUsername,
  getPublicEntry,
  insertApprovedEntry,
  listHiddenPostIds,
} from "@tgbox/db";
import { expect, test } from "vitest";
import { actor, auditRows, db, NOW, setup } from "./fake.ts";

async function listedEntry(username: string) {
  const { id } = await insertApprovedEntry(db, {
    entry: {
      username,
      kind: "channel",
      categoryId: 1,
      title: username,
      description: "",
      listedAt: NOW,
    },
    stats: { members: null, online: null, activityTier: null, statsWrittenAt: NOW },
    tagIds: [],
    now: NOW,
  });
  return id;
}

test("normal post moderation invalidates R2-backed cached output without changing the object", async () => {
  const { ctx } = await setup();
  await listedEntry("noisy_channel");
  await beginPublicProjection(db);
  await backfillPublicProjection(db);
  await backfillPublicProjection(db);
  const key = "posts/noisy_channel.json";
  await env.MEDIA.put(key, "visible");
  const values = new Map<string, string>();
  const cache = {
    get: async (key: string) => values.get(key) ?? null,
    put: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const read = () =>
    readPublicMediaCached(
      db,
      env.MEDIA,
      cache,
      key,
      ["zh"],
      (value) => {
        if (typeof value !== "string") throw new Error("Invalid text");
        return value;
      },
      async (object) => {
        const entry = await getPublicEntry(db, "noisy_channel");
        return !entry || entry.hidePosts ? "hidden" : ((await object?.text()) ?? "missing");
      },
      { now: () => NOW, maxAgeMs: 1000 },
    );
  expect(await read()).toBe("visible");
  await setEntryPostsVisibility(ctx, { actor, username: "noisy_channel", hide: true });
  expect(await read()).toBe("hidden");
  await setEntryPostsVisibility(ctx, { actor, username: "noisy_channel", hide: false });
  expect(await read()).toBe("visible");
});

test("hiding an entry's posts audits once and rebuilds the site", async () => {
  const { ctx, dispatches } = await setup();
  const id = await listedEntry("noisy_channel");

  expect(
    await setEntryPostsVisibility(ctx, { actor, username: "@noisy_channel", hide: true }),
  ).toEqual({ ok: true, entryId: id, changed: true });
  expect((await getEntryByUsername(db, "noisy_channel"))?.hidePosts).toBe(true);
  expect(dispatches).toHaveLength(1);

  // A no-op change writes no audit row and triggers no build.
  expect(
    await setEntryPostsVisibility(ctx, { actor, username: "noisy_channel", hide: true }),
  ).toEqual({ ok: true, entryId: id, changed: false });
  expect(await auditRows()).toEqual([
    { actor: "email:admin@example.com", action: "entry.posts", target: `entry:${id}` },
  ]);

  expect(await setEntryPostsVisibility(ctx, { actor, username: "ghost", hide: true })).toEqual({
    ok: false,
    error: "not_found",
  });
  expect(await setEntryPostsVisibility(ctx, { actor, username: "  ", hide: true })).toEqual({
    ok: false,
    error: "invalid_username",
  });
});

test("hiding a single post audits it and shows it again on demand", async () => {
  const { ctx } = await setup();
  const id = await listedEntry("noisy_channel");

  expect(
    await setPostVisibility(ctx, { actor, username: "noisy_channel", postId: 12, hidden: true }),
  ).toEqual({ ok: true, entryId: id, changed: true });
  expect(await listHiddenPostIds(db, id)).toEqual([12]);
  expect(
    await setPostVisibility(ctx, { actor, username: "noisy_channel", postId: 12, hidden: true }),
  ).toEqual({ ok: true, entryId: id, changed: false });

  expect(
    await setPostVisibility(ctx, { actor, username: "noisy_channel", postId: 12, hidden: false }),
  ).toEqual({ ok: true, entryId: id, changed: true });
  expect(await listHiddenPostIds(db, id)).toEqual([]);
  expect((await auditRows()).map((row) => row.action)).toEqual(["post.hidden", "post.hidden"]);
});
