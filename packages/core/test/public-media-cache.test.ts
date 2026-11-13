import { env } from "cloudflare:workers";
import { beginPublicProjection, createDb, getPublicRevision, setSiteState } from "@tgbox/db";
import { beforeEach, expect, test } from "vitest";
import { readPublicMediaCached } from "../src/public-media-cache.ts";

const db = createDb(env.DB);
const key = "posts/media_cache_test.json";
const values = new Map<string, string>();
const cache = {
  get: async (key: string) => values.get(key) ?? null,
  put: async (key: string, value: string) => {
    values.set(key, value);
  },
};
const options = { now: () => 1000, maxAgeMs: 1000 };
let loads = 0;
const parse = (value: unknown) => {
  if (typeof value !== "string") throw new Error("Invalid text");
  return value;
};
const load = async (object: R2ObjectBody | null) => {
  loads++;
  return object ? object.text() : "missing";
};
const read = (media: Pick<R2Bucket, "head" | "get"> = env.MEDIA, readDb = db) =>
  readPublicMediaCached(readDb, media, cache, key, ["zh", "filtered-posts"], parse, load, options);
beforeEach(async () => {
  await env.DB.prepare("DELETE FROM site_state WHERE key LIKE 'public_%'").run();
  await beginPublicProjection(db);
  await setSiteState(db, "public_projection_ready", "1");
  await env.MEDIA.delete(key);
  values.clear();
  loads = 0;
});

test("R2 success followed by D1 rollback cannot reuse the previous object cache", async () => {
  await env.MEDIA.put(key, "old");
  expect(await read()).toBe("old");
  expect(await read()).toBe("old");
  expect(loads).toBe(1);
  const revision = await getPublicRevision(db);
  await env.MEDIA.put(key, "new");
  await expect(
    env.DB.batch([
      env.DB.prepare("UPDATE site_state SET value='999' WHERE key='public_content_revision'"),
      env.DB.prepare("INSERT INTO missing_media_test_table VALUES (1)"),
    ]),
  ).rejects.toThrow();
  expect(await getPublicRevision(db)).toBe(revision);
  expect(await read()).toBe("new");
  expect(loads).toBe(2);
  // Retrying sees an unchanged stored object and still validates its identity on a cache hit.
  expect(await read()).toBe("new");
  expect(loads).toBe(2);
  await env.MEDIA.put(key, "new", { customMetadata: { generation: "rewritten" } });
  expect(await read()).toBe("new");
  expect(loads).toBe(3);
});

test("missing, created and deleted objects have distinct cache identities", async () => {
  expect(await read()).toBe("missing");
  await env.MEDIA.put(key, "created");
  expect(await read()).toBe("created");
  await env.MEDIA.delete(key);
  expect(await read()).toBe("missing");
});

test("concurrent object replacement during cache read refuses the old response", async () => {
  await env.MEDIA.put(key, "old");
  await read();
  let heads = 0;
  const media = {
    get: (key: string) => env.MEDIA.get(key),
    head: async (key: string) => {
      if (++heads === 2) await env.MEDIA.put(key, "replacement");
      return env.MEDIA.head(key);
    },
  };
  await expect(read(media)).rejects.toThrow("media changed");
  expect(await read()).toBe("replacement");
});

test("object changes between head and get and head failures cannot publish cached data", async () => {
  await env.MEDIA.put(key, "old");
  const media = {
    head: (key: string) => env.MEDIA.head(key),
    get: async (key: string) => {
      await env.MEDIA.put(key, "replacement");
      return env.MEDIA.get(key);
    },
  };
  await expect(read(media)).rejects.toThrow("media changed");
  expect(values.size).toBe(0);
  await read();
  await expect(
    read({
      get: (key: string) => env.MEDIA.get(key),
      head: async () => {
        throw new Error("R2 unavailable");
      },
    }),
  ).rejects.toThrow("R2 unavailable");
});

test("authority disabled during final R2 validation refuses a cache hit", async () => {
  await env.MEDIA.put(key, "old");
  await read();
  let heads = 0;
  const media = {
    get: (key: string) => env.MEDIA.get(key),
    head: async (key: string) => {
      if (++heads === 2) await setSiteState(db, "public_projection_enabled", "0");
      return env.MEDIA.head(key);
    },
  };
  await expect(read(media)).rejects.toThrow("not ready");
});

test("media cache hit keeps two authority queries and two object heads without a body read", async () => {
  await env.MEDIA.put(key, "old");
  await read();
  let sql = 0;
  let heads = 0;
  let gets = 0;
  const traced = createDb(
    new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare")
          return (text: string) => {
            sql++;
            return target.prepare(text);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
  const media = {
    head: (key: string) => {
      heads++;
      return env.MEDIA.head(key);
    },
    get: (key: string) => {
      gets++;
      return env.MEDIA.get(key);
    },
  };
  expect(await read(media, traced)).toBe("old");
  expect({ sql, heads, gets }).toEqual({ sql: 2, heads: 2, gets: 0 });
  console.info("public R2 cache hit budget", { sql, heads, gets });
});
