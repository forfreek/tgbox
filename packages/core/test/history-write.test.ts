import { env } from "cloudflare:workers";
import {
  backfillPublicProjection,
  beginHistoryWrite,
  beginPublicProjection,
  createDb,
  finishHistoryWrite,
  getEntryByUsername,
  getHistoryMirror,
  getHistoryWrite,
  getPublicRevision,
  getSiteState,
  insertApprovedEntry,
  listCategories,
  readHistoryBaseline,
  setSiteState,
  syncTaxonomy,
} from "@tgbox/db";
import { beforeAll, beforeEach, expect, test } from "vitest";
import { mirrorHistoryStep } from "../src/history-mirror.ts";
import { appendHistorySafely } from "../src/history-write.ts";

const db = createDb(env.DB);
const now = Date.UTC(2026, 10, 13);
const key = "history/write_test.json";
let id: number;
beforeAll(async () => {
  await syncTaxonomy(db);
});
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM entries_fts"),
    env.DB.prepare("DELETE FROM entries"),
    env.DB.prepare("DELETE FROM entry_stats"),
    env.DB.prepare("DELETE FROM entry_tags"),
    env.DB.prepare("DELETE FROM site_state"),
  ]);
  await env.MEDIA.delete(key);
  const category = (await listCategories(db)).find((row) => row.kind === "channel");
  if (!category) throw new Error("Missing category");
  id = (
    await insertApprovedEntry(db, {
      entry: {
        username: "write_test",
        kind: "channel",
        categoryId: category.id,
        title: "Write",
        listedAt: now,
      },
      stats: { members: 99, online: null, activityTier: 1, statsWrittenAt: now },
      tagIds: [],
      now,
    })
  ).id;
  await beginPublicProjection(db);
  await backfillPublicProjection(db);
  await backfillPublicProjection(db);
  await setSiteState(db, "public_history_writes_enabled", "1");
  await env.MEDIA.put(
    key,
    JSON.stringify([{ t: new Date(now - 14 * 86400000).toISOString(), members: 20 }]),
  );
});
async function row() {
  const entry = await getEntryByUsername(db, "write_test");
  if (!entry) throw new Error("Missing entry");
  return entry;
}
async function complete() {
  for (let step = 0; step < 10; step++) {
    const result = await mirrorHistoryStep(db, env.MEDIA, id, now);
    if (result.status === "ready") return;
  }
  throw new Error("Mirror did not complete");
}

test("write intent hides an old ready baseline before R2 put and a pre-put crash is replayable", async () => {
  await complete();
  expect((await readHistoryBaseline(db, id, now))?.members).toBe(20);
  const revision = await getPublicRevision(db);
  const media = {
    get: env.MEDIA.get.bind(env.MEDIA),
    put: async () => {
      expect(await readHistoryBaseline(db, id, now)).toBeNull();
      const readonly = { get: env.MEDIA.get.bind(env.MEDIA), head: env.MEDIA.head.bind(env.MEDIA) };
      expect((await mirrorHistoryStep(db, readonly, id, now)).status).toBe("pending");
      throw new Error("Injected crash before put");
    },
  };
  await expect(appendHistorySafely(db, media, await row(), 99, now, true)).rejects.toThrow(
    "before put",
  );
  expect(await getHistoryWrite(db, id)).not.toBeNull();
  expect(await getPublicRevision(db)).not.toBe(revision);
  expect((await mirrorHistoryStep(db, env.MEDIA, id, now)).status).toBe("recovered");
  expect(await getHistoryWrite(db, id)).toBeNull();
  expect(await getSiteState(db, "dirty_since")).toBeDefined();
  await complete();
  expect((await readHistoryBaseline(db, id, now))?.members).toBe(99);
});

test("R2 success followed by D1 completion failure retries without appending a second point", async () => {
  await env.DB.exec(
    "CREATE TRIGGER fail_write_finish BEFORE DELETE ON history_writes BEGIN SELECT RAISE(ABORT,'injected finish failure'); END;",
  );
  try {
    await expect(appendHistorySafely(db, env.MEDIA, await row(), 99, now, true)).rejects.toThrow();
  } finally {
    await env.DB.exec("DROP TRIGGER fail_write_finish");
  }
  const before = await env.MEDIA.head(key);
  const pending = await getHistoryWrite(db, id);
  expect(before?.customMetadata?.historyWriteToken).toBe(pending?.token);
  expect((await mirrorHistoryStep(db, env.MEDIA, id, now)).status).toBe("recovered");
  expect((await env.MEDIA.head(key))?.version).toBe(before?.version);
  expect(await (await env.MEDIA.get(key))?.json()).toHaveLength(2);
  expect(
    (await appendHistorySafely(db, env.MEDIA, await row(), 100, now + 1000, true)).r2Writes,
  ).toBe(0);
});

test("concurrent refresh writers conditionally append the persisted point at most once", async () => {
  const entry = await row();
  const results = await Promise.allSettled([
    appendHistorySafely(db, env.MEDIA, entry, 99, now, true),
    appendHistorySafely(db, env.MEDIA, entry, 99, now, true),
  ]);
  expect(results.some((result) => result.status === "fulfilled")).toBe(true);
  for (let retry = 0; retry < 3 && (await getHistoryWrite(db, id)); retry++)
    await mirrorHistoryStep(db, env.MEDIA, id, now);
  expect(await (await env.MEDIA.get(key))?.json()).toEqual([
    { t: new Date(now - 14 * 86400000).toISOString(), members: 20 },
    { t: new Date(now).toISOString(), members: 99 },
  ]);
});

test("a mirror cannot seal when a write starts after its revision read", async () => {
  await mirrorHistoryStep(db, env.MEDIA, id, now);
  await mirrorHistoryStep(db, env.MEDIA, id, now);
  await mirrorHistoryStep(db, env.MEDIA, id, now);
  expect((await getHistoryMirror(db, id))?.phase).toBe("verify");
  const entry = await row();
  const revision = await getPublicRevision(db);
  const traced = createDb(
    new Proxy(env.DB, {
      get(target, property) {
        if (property === "batch")
          return async (statements: D1PreparedStatement[]) => {
            await beginHistoryWrite(
              db,
              {
                entryId: id,
                username: entry.username,
                listedAt: entry.listedAt,
                token: "racing-write",
                baseEtag: (await env.MEDIA.head(key))?.etag ?? null,
                sampledAt: now,
                members: 99,
              },
              revision,
            );
            return target.batch(statements);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
  await mirrorHistoryStep(traced, env.MEDIA, id, now);
  expect((await getHistoryMirror(db, id))?.phase).toBe("stale");
  expect(await readHistoryBaseline(db, id, now)).toBeNull();
});

test("external source conflicts retain the intent and refuse overwrite", async () => {
  const entry = await row();
  await beginHistoryWrite(
    db,
    {
      entryId: id,
      username: entry.username,
      listedAt: entry.listedAt,
      token: "conflict",
      baseEtag: (await env.MEDIA.head(key))?.etag ?? null,
      sampledAt: now,
      members: 99,
    },
    await getPublicRevision(db),
  );
  await env.MEDIA.put(key, "[]");
  await expect(mirrorHistoryStep(db, env.MEDIA, id, now)).rejects.toThrow("source conflict");
  expect(await getHistoryWrite(db, id)).not.toBeNull();
  expect(await (await env.MEDIA.get(key))?.json()).toEqual([]);
  expect(await readHistoryBaseline(db, id, now)).toBeNull();
});

test("disabled new writes still drain intents and stale completion tokens cannot clear another intent", async () => {
  const entry = await row();
  const begun = await beginHistoryWrite(
    db,
    {
      entryId: id,
      username: entry.username,
      listedAt: entry.listedAt,
      token: "drain",
      baseEtag: (await env.MEDIA.head(key))?.etag ?? null,
      sampledAt: now,
      members: 99,
    },
    await getPublicRevision(db),
  );
  if (!begun.write) throw new Error("Missing intent");
  await setSiteState(db, "public_history_writes_enabled", "0");
  await finishHistoryWrite(db, { ...begun.write, token: "old-token" });
  expect((await getHistoryWrite(db, id))?.token).toBe("drain");
  expect((await appendHistorySafely(db, env.MEDIA, entry, 111, now + 1000, false)).handled).toBe(
    true,
  );
  expect(await getHistoryWrite(db, id)).toBeNull();
  const points = await (await env.MEDIA.get(key))?.json<{ members: number }[]>();
  expect(points?.at(-1)?.members).toBe(99);
});

test("identity changes clear intents and stale source revisions cannot create them", async () => {
  const entry = await row();
  const revision = await getPublicRevision(db);
  const input = {
    entryId: id,
    username: entry.username,
    listedAt: entry.listedAt,
    token: "old-identity",
    baseEtag: null,
    sampledAt: now,
    members: 99,
  };
  await beginHistoryWrite(db, input, revision);
  await env.DB.prepare("UPDATE entries SET username='renamed' WHERE id=?").bind(id).run();
  expect(await getHistoryWrite(db, id)).toBeNull();
  expect((await beginHistoryWrite(db, input, revision)).write).toBeNull();
  expect(await finishHistoryWrite(db, input)).toBe(0);
});

test("oversized sources fail before creating an intent and feature off selects the legacy path", async () => {
  expect((await appendHistorySafely(db, env.MEDIA, await row(), 99, now, false)).handled).toBe(
    false,
  );
  await env.MEDIA.put(key, "x".repeat(1024 * 1024 + 1));
  await expect(appendHistorySafely(db, env.MEDIA, await row(), 99, now, true)).rejects.toThrow(
    "oversized",
  );
  expect(await getHistoryWrite(db, id)).toBeNull();
});

test("new write reports every SQL/R2 call and its trigger write amplification", async () => {
  const entry = await row();
  let calls = 0;
  const traced = createDb(
    new Proxy(env.DB, {
      get(target, property) {
        if (property === "prepare")
          return (sql: string) => {
            calls++;
            return target.prepare(sql);
          };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
  const media = {
    get: (key: string) => {
      calls++;
      return env.MEDIA.get(key);
    },
    put: env.MEDIA.put.bind(env.MEDIA),
  };
  const result = await appendHistorySafely(traced, media, entry, 99, now, true);
  // put's overloads remain intact, so account for its one call separately.
  expect(result.subrequests).toBe(calls + 1);
  expect(result.subrequests).toBe(7);
  expect(result.rowsWritten).toBeGreaterThanOrEqual(4);
  console.info("history write budget", result);
});

test("conditional put refuses a source replacement between get and put without clearing the fence", async () => {
  const media = {
    get: async (key: string) => {
      const object = await env.MEDIA.get(key);
      await env.MEDIA.put(key, "[]");
      return object;
    },
    put: env.MEDIA.put.bind(env.MEDIA),
  };
  const result = await appendHistorySafely(db, media, await row(), 99, now, true);
  expect("status" in result ? result.status : undefined).toBe("pending");
  expect(result.r2Writes).toBe(0);
  expect(await getHistoryWrite(db, id)).not.toBeNull();
  expect(await (await env.MEDIA.get(key))?.json()).toEqual([]);
  expect(await readHistoryBaseline(db, id, now)).toBeNull();
});

test("a full history with a recent sample keeps the existing weekly no-op behavior", async () => {
  await env.MEDIA.put(
    key,
    JSON.stringify(
      Array.from({ length: 4096 }, () => ({ t: new Date(now).toISOString(), members: 99 })),
    ),
  );
  expect(
    (await appendHistorySafely(db, env.MEDIA, await row(), 100, now + 1000, true)).r2Writes,
  ).toBe(0);
  expect(await getHistoryWrite(db, id)).toBeNull();
});
