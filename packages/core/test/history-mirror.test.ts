import { env } from "cloudflare:workers";
import {
  advanceHistoryMirror,
  backfillPublicProjection,
  beginPublicProjection,
  createDb,
  getHistoryMirror,
  getPublicRevision,
  insertApprovedEntry,
  invalidateHistoryMirror,
  listCategories,
  readHistoryBaseline,
  syncTaxonomy,
} from "@tgbox/db";
import { beforeAll, beforeEach, expect, test } from "vitest";
import { backfillHistoryMirrorStep, mirrorHistoryStep } from "../src/history-mirror.ts";
import {
  HISTORY_BYTE_LIMIT,
  HISTORY_POINT_LIMIT,
  normalizeHistory,
} from "../src/history-normalization.ts";

const db = createDb(env.DB);
const now = Date.UTC(2026, 10, 13);
const day = 86_400_000;
let categoryId: number;
let id: number;
const key = "history/history_test.json";
beforeAll(async () => {
  await syncTaxonomy(db);
  const category = (await listCategories(db)).find((row) => row.kind === "channel");
  if (!category) throw new Error("Missing category");
  categoryId = category.id;
});
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM entries_fts"),
    env.DB.prepare("DELETE FROM entries"),
    env.DB.prepare("DELETE FROM entry_stats"),
    env.DB.prepare("DELETE FROM entry_tags"),
    env.DB.prepare("DELETE FROM site_state WHERE key LIKE 'public_%'"),
  ]);
  await env.MEDIA.delete(key);
  id = (
    await insertApprovedEntry(db, {
      entry: {
        username: "history_test",
        kind: "channel",
        categoryId,
        title: "History",
        listedAt: now,
      },
      stats: { members: 100, online: null, activityTier: 1, statsWrittenAt: now },
      tagIds: [],
      now,
    })
  ).id;
  await beginPublicProjection(db);
  await backfillPublicProjection(db);
  await backfillPublicProjection(db);
});
async function complete() {
  for (let step = 0; step < 100; step++) {
    const result = await mirrorHistoryStep(db, env.MEDIA, id, now);
    if (["ready", "invalid", "oversized"].includes(result.status)) return result;
  }
  throw new Error("History mirror did not converge");
}

test("normalized baselines preserve existing findLast growth for unordered, duplicate and invalid dates", () => {
  let random = 123;
  for (let sample = 0; sample < 50; sample++) {
    const history = Array.from({ length: 20 }, (_, index) => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return {
        t: index % 7 === 0 ? "bad date" : new Date(now - (random % 35) * day).toISOString(),
        members: index * 3,
      };
    });
    const normalized = normalizeHistory(history);
    expect(normalized.status).toBe("valid");
    for (let days = 0; days < 36; days++)
      for (const edge of [-1, 0, 1]) {
        const cutoff = now - days * day + edge;
        const base = [...normalized.points].reverse().find((point) => point.sampledAt <= cutoff);
        expect(base?.members).toBe(
          [...history].reverse().find((point) => Date.parse(point.t) <= cutoff)?.members,
        );
      }
  }
});

test("R2 success and D1 write failure resume even when the last sample is less than a week old", async () => {
  await env.MEDIA.put(key, JSON.stringify([{ t: new Date(now - day).toISOString(), members: 20 }]));
  await mirrorHistoryStep(db, env.MEDIA, id, now);
  await mirrorHistoryStep(db, env.MEDIA, id, now);
  await env.DB.exec(
    "CREATE TRIGGER fail_history_point BEFORE INSERT ON history_baselines BEGIN SELECT RAISE(ABORT,'injected mirror failure'); END;",
  );
  await expect(mirrorHistoryStep(db, env.MEDIA, id, now)).rejects.toThrow();
  expect((await getHistoryMirror(db, id))?.cursor).toBe(0);
  expect((await readHistoryBaseline(db, id, now))?.members).toBeNull();
  await env.DB.exec("DROP TRIGGER fail_history_point");
  expect((await complete()).status).toBe("ready");
  expect((await readHistoryBaseline(db, id, now))?.members).toBe(20);
  const revision = await getPublicRevision(db);
  await complete();
  expect(await getPublicRevision(db)).toBe(revision);
});

test("missing, invalid and oversized sources retain explicit state without rewriting R2", async () => {
  expect((await complete()).status).toBe("ready");
  expect((await readHistoryBaseline(db, id, now))?.members).toBeNull();
  await env.MEDIA.put(key, JSON.stringify([{ t: "bad", members: "wrong" }]));
  expect((await complete()).status).toBe("invalid");
  await env.MEDIA.put(key, "x".repeat(HISTORY_BYTE_LIMIT + 1));
  expect((await complete()).status).toBe("oversized");
  const points = Array.from({ length: HISTORY_POINT_LIMIT + 1 }, () => ({
    t: new Date(now).toISOString(),
    members: 1,
  }));
  await env.MEDIA.put(key, JSON.stringify(points));
  expect((await complete()).status).toBe("oversized");
  expect(await (await env.MEDIA.get(key))?.json()).toEqual(points);
});

test("identity changes clean the mirror and old source revision cannot claim a reused entry ID", async () => {
  await env.MEDIA.put(key, JSON.stringify([{ t: new Date(now - day).toISOString(), members: 20 }]));
  await complete();
  const revision = await getPublicRevision(db);
  await env.DB.prepare(
    "INSERT INTO site_state(key,value) VALUES('public_history_backfill_cursor',?)",
  )
    .bind(String(id))
    .run();
  await env.DB.prepare("DELETE FROM entries WHERE id=?").bind(id).run();
  await env.DB.prepare(`INSERT INTO entries(id,username,kind,category_id,title,listed_at,updated_at)
    VALUES(?,'history_test','channel',?,'Reused',?,?)`)
    .bind(id, categoryId, now, now)
    .run();
  expect(await getHistoryMirror(db, id)).toBeUndefined();
  expect(
    await env.DB.prepare(
      "SELECT value FROM site_state WHERE key='public_history_backfill_cursor'",
    ).first<string>("value"),
  ).toBe(String(id - 1));
  await expect(
    advanceHistoryMirror(db, {
      entryId: id,
      username: "history_test",
      listedAt: now,
      sourceRevision: revision,
      objectVersion: "old",
      objectEtag: "old",
      status: "valid",
      rawPoints: 0,
      invalidTimes: 0,
      now,
      points: [],
    }),
  ).rejects.toThrow("changed");
  await complete();
  await env.DB.prepare("UPDATE entries SET username='history_renamed' WHERE id=?").bind(id).run();
  expect(await getHistoryMirror(db, id)).toBeUndefined();
  expect(await readHistoryBaseline(db, id, now)).toBeNull();
});

test("concurrent chunk retries are idempotent and a late R2 replacement invalidates a sealed generation", async () => {
  await env.MEDIA.put(key, JSON.stringify([{ t: new Date(now - day).toISOString(), members: 20 }]));
  await mirrorHistoryStep(db, env.MEDIA, id, now);
  await mirrorHistoryStep(db, env.MEDIA, id, now);
  const results = await Promise.all([
    mirrorHistoryStep(db, env.MEDIA, id, now),
    mirrorHistoryStep(db, env.MEDIA, id, now),
  ]);
  expect(results.every((result) => result.status === "verify")).toBe(true);
  expect(
    await env.DB.prepare("SELECT count(*) AS n FROM history_baselines WHERE entry_id=?")
      .bind(id)
      .first<number>("n"),
  ).toBe(1);
  let heads = 0;
  const media = {
    get: (key: string) => env.MEDIA.get(key),
    head: async (key: string) => {
      if (++heads === 2)
        await env.MEDIA.put(
          key,
          JSON.stringify([{ t: new Date(now - day).toISOString(), members: 30 }]),
        );
      return env.MEDIA.head(key);
    },
  };
  await expect(mirrorHistoryStep(db, media, id, now)).rejects.toThrow("changed");
  expect((await getHistoryMirror(db, id))?.phase).toBe("stale");
  expect((await readHistoryBaseline(db, id, now))?.members).toBeNull();
  await complete();
  expect((await readHistoryBaseline(db, id, now))?.members).toBe(30);
});

test("entry-seek backfill resumes partial objects and records invalid-file fallback", async () => {
  await env.MEDIA.put(key, JSON.stringify([{ t: new Date(now - day).toISOString(), members: 20 }]));
  expect((await backfillHistoryMirrorStep(db, env.MEDIA, now)).cursor).toBe(0);
  let result: Awaited<ReturnType<typeof backfillHistoryMirrorStep>> | undefined;
  for (let step = 0; step < 10; step++) {
    result = await backfillHistoryMirrorStep(createDb(env.DB), env.MEDIA, now);
    if (result.status === "done") break;
  }
  expect(result?.status).toBe("done");
  expect(result?.cursor).toBe(id);
  await env.MEDIA.put(key, "invalid json");
  await env.DB.prepare(
    "UPDATE site_state SET value='0' WHERE key='public_history_backfill_cursor'",
  ).run();
  expect((await backfillHistoryMirrorStep(db, env.MEDIA, now)).status).toBe("invalid");
  expect((await backfillHistoryMirrorStep(db, env.MEDIA, now)).status).toBe("done");
  await env.MEDIA.put(key, "x".repeat(HISTORY_BYTE_LIMIT + 1));
  await env.DB.prepare(
    "UPDATE site_state SET value='0' WHERE key='public_history_backfill_cursor'",
  ).run();
  const blocked = await backfillHistoryMirrorStep(db, env.MEDIA, now);
  expect(blocked.status).toBe("oversized");
  expect(blocked.cursor).toBe(0);
});

test("backfill cannot skip a lower ID inserted between entry selection and mirror reading", async () => {
  await env.DB.prepare("DELETE FROM entries WHERE id=?").bind(id).run();
  await env.DB.prepare(`INSERT INTO entries(id,username,kind,category_id,title,listed_at,updated_at)
    VALUES(100,'history_test','channel',?,'High',?,?)`)
    .bind(categoryId, now, now)
    .run();
  id = 100;
  await complete();
  const intercepted = createDb(
    new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare")
          return (text: string) => {
            if (!text.startsWith("SELECT id FROM entries WHERE id>")) return target.prepare(text);
            return new Proxy(target.prepare(text), {
              get(statement, property) {
                if (property === "bind")
                  return (...values: unknown[]) => ({
                    first: async () => {
                      const selected = await statement.bind(...values).first();
                      await target
                        .prepare(`INSERT INTO entries(id,username,kind,category_id,title,listed_at,updated_at)
                  VALUES(50,'history_lower','channel',?,'Lower',?,?)`)
                        .bind(categoryId, now, now)
                        .run();
                      return selected;
                    },
                  });
                return Reflect.get(statement, property);
              },
            });
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
  expect((await backfillHistoryMirrorStep(intercepted, env.MEDIA, now)).cursor).toBe(0);
  expect((await backfillHistoryMirrorStep(db, env.MEDIA, now)).entryId).toBe(50);
});

test("invalidation bumps the latest revision atomically and repeated invalidation is a no-op", async () => {
  const result = await complete();
  const generation = result.state?.generation;
  if (!generation) throw new Error("Missing generation");
  const intercepted = createDb(
    new Proxy(env.DB, {
      get(target, key) {
        if (key === "batch")
          return async (statements: D1PreparedStatement[]) => {
            await target
              .prepare("UPDATE site_state SET value='9000' WHERE key='public_content_revision'")
              .run();
            return target.batch(statements);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
  await invalidateHistoryMirror(intercepted, id, generation);
  expect(await getPublicRevision(db)).toBe("9001");
  await invalidateHistoryMirror(db, id, generation);
  expect(await getPublicRevision(db)).toBe("9001");
});

test("4096-point source uses bounded chunks and one indexed baseline seek", async () => {
  const points = Array.from({ length: HISTORY_POINT_LIMIT }, (_, index) => ({
    t: new Date(now - HISTORY_POINT_LIMIT + index).toISOString(),
    members: index,
  }));
  const started = performance.now();
  expect(normalizeHistory(points).points).toHaveLength(HISTORY_POINT_LIMIT);
  console.info("history normalization local CPU ms", performance.now() - started);
  await env.MEDIA.put(key, JSON.stringify(points));
  await complete();
  const sql = `SELECT members FROM history_baselines WHERE entry_id=? AND sampled_at<=? ORDER BY sampled_at DESC LIMIT 1`;
  const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(id, now)
    .all<{ detail: string }>();
  expect(plan.results.map((row) => row.detail).join("\n")).toContain(
    "sqlite_autoindex_history_baselines_1",
  );
  const result = await env.DB.prepare(sql).bind(id, now).all();
  expect(result.meta.rows_read).toBeLessThanOrEqual(4);
  expect((await readHistoryBaseline(db, id, now))?.members).toBe(HISTORY_POINT_LIMIT - 1);
  await env.DB.prepare("UPDATE entries SET status='hidden_by_admin' WHERE id=?").bind(id).run();
  expect(await readHistoryBaseline(db, id, now)).toBeNull();
  console.info("history baseline lookup budget", result.meta);
}, 30000);
