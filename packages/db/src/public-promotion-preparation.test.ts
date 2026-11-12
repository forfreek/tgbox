import { env } from "cloudflare:workers";
import { beforeEach, expect, test } from "vitest";
import {
  backfillPublicProjection,
  beginPublicProjection,
  createDb,
  preparePublicPromotions,
  readPreparedPublicPromotions,
} from "./index.ts";

const db = createDb(env.DB);
const query = { kind: "banner" as const, limit: 2 };
let time = 1000;
const options = { now: () => time, maxAgeMs: 60_000 };

async function fixture(sql: string) {
  await env.DB.batch(
    sql
      .split(";")
      .filter((part) => part.trim())
      .map((part) => env.DB.prepare(part)),
  );
}

beforeEach(async () => {
  time = 1000;
  await fixture(`DELETE FROM promotions; DELETE FROM entries; DELETE FROM categories;
    DELETE FROM public_listing; DELETE FROM public_counts;
    DELETE FROM site_state WHERE key LIKE 'public_%';
    INSERT INTO categories(id,slug,kind,name_zh,name_en,sort) VALUES(1,'prepare','channel','测试','Test',0);
    INSERT INTO entries(username,kind,category_id,title,listed_at,updated_at)
    VALUES('prepare_public','channel',1,'Public',0,0);`);
  await beginPublicProjection(db);
  await backfillPublicProjection(db);
  await backfillPublicProjection(db);
});

function memoryCache() {
  const values = new Map<string, string>();
  return {
    values,
    get: async (key: string) => values.get(key) ?? null,
    put: async (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

function interceptWrites(beforeWrite: () => Promise<void>) {
  const wrap = (statement: D1PreparedStatement, sql: string): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, key) {
        if (key === "bind") return (...params: unknown[]) => wrap(target.bind(...params), sql);
        if (key === "run" && sql.includes("INSERT INTO site_state"))
          return async () => {
            await beforeWrite();
            const result = await target.run();
            expect(result.meta.rows_written).toBeLessThanOrEqual(2);
            return result;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  return createDb(
    new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare") return (sql: string) => wrap(target.prepare(sql), sql);
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
}

test("preparation resumes from D1, keeps first N, and publishes only after all candidates", async () => {
  await fixture(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<101)
    INSERT INTO promotions(kind,starts_at,ends_at,created_at) SELECT 'banner',2000,3000,0 FROM n;
    WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<5)
    INSERT INTO promotions(kind,starts_at,ends_at,created_at) SELECT 'banner',0,4000,0 FROM n;
    UPDATE promotions SET banner='{"title":"Banner","subtitle":"Test","href":"https://example.com"}' WHERE starts_at=0;`);
  expect(await preparePublicPromotions(db, query, options)).toEqual({
    status: "pending",
    scanned: 100,
  });
  await expect(readPreparedPublicPromotions(db, null, query, options)).rejects.toThrow(
    "preparation",
  );
  expect(await preparePublicPromotions(createDb(env.DB), query, options)).toEqual({
    status: "ready",
    scanned: 6,
  });
  const cache = memoryCache();
  const ready = await readPreparedPublicPromotions(db, cache, query, options);
  expect(ready.items).toHaveLength(2);
  expect(ready.hasMore).toBe(true);
  expect(ready.validUntil).toBe(2000);
  expect(ready.items.map((item) => item.id)).toEqual([102, 103]);
  expect(ready.next).toBeNull();
  expect(ready.items[0]?.banner?.title).toBe("Banner");
  expect(await readPreparedPublicPromotions(db, cache, query, options)).toEqual(ready);
  expect(cache.values.size).toBe(1);
  expect(await preparePublicPromotions(db, query, options)).toEqual({
    status: "ready",
    scanned: 0,
  });
  const stored = await env.DB.prepare(
    "SELECT value FROM site_state WHERE key LIKE 'public_promotion_preparation:%'",
  ).all<{ value: string }>();
  expect(stored.results).toHaveLength(1);
  expect(JSON.parse(stored.results[0]?.value ?? "null").items).toHaveLength(2);
});

test("empty complete output, malformed progress and cache failures recover through D1", async () => {
  const cache = memoryCache();
  await fixture(
    `INSERT INTO site_state(key,value) VALUES('public_promotion_preparation:banner:2','bad json');`,
  );
  expect((await preparePublicPromotions(db, query, options)).status).toBe("ready");
  expect((await readPreparedPublicPromotions(db, cache, query, options)).items).toEqual([]);
  for (const key of cache.values.keys())
    cache.values.set(key, '{"value":false,"expiresAt":99999,"validFrom":0}');
  expect((await readPreparedPublicPromotions(db, cache, query, options)).items).toEqual([]);
  const broken = {
    get: async () => {
      throw new Error("down");
    },
    put: async () => {
      throw new Error("down");
    },
  };
  expect((await readPreparedPublicPromotions(db, broken, query, options)).items).toEqual([]);
});

test("delete, hide and restore invalidate cached complete output and preparations", async () => {
  await fixture(`INSERT INTO promotions(kind,entry_username,starts_at,ends_at,created_at)
    VALUES('banner','prepare_public',0,4000,0);`);
  const cache = memoryCache();
  await preparePublicPromotions(db, query, options);
  expect((await readPreparedPublicPromotions(db, cache, query, options)).items).toHaveLength(1);
  for (const status of ["hidden_by_admin", "approved"]) {
    await fixture(`UPDATE entries SET status='${status}' WHERE username='prepare_public';`);
    await expect(readPreparedPublicPromotions(db, cache, query, options)).rejects.toThrow(
      "preparation",
    );
    await preparePublicPromotions(db, query, options);
    expect((await readPreparedPublicPromotions(db, cache, query, options)).items).toHaveLength(
      status === "approved" ? 1 : 0,
    );
  }
  await fixture("DELETE FROM entries WHERE username='prepare_public';");
  await expect(readPreparedPublicPromotions(db, cache, query, options)).rejects.toThrow(
    "preparation",
  );
  await preparePublicPromotions(db, query, options);
  expect((await readPreparedPublicPromotions(db, cache, query, options)).items).toEqual([]);
});

test("natural starts, expiry, clock rollback and progress timeout require renewed evaluation", async () => {
  await fixture(
    `INSERT INTO promotions(kind,starts_at,ends_at,created_at) VALUES('banner',2000,3000,0);`,
  );
  const cache = memoryCache();
  await preparePublicPromotions(db, query, options);
  expect((await readPreparedPublicPromotions(db, cache, query, options)).items).toEqual([]);
  time = 2000;
  await expect(readPreparedPublicPromotions(db, cache, query, options)).rejects.toThrow(
    "preparation",
  );
  await preparePublicPromotions(db, query, options);
  expect((await readPreparedPublicPromotions(db, cache, query, options)).items).toHaveLength(1);
  time = 1500;
  await preparePublicPromotions(db, query, options);
  expect((await readPreparedPublicPromotions(db, cache, query, options)).items).toEqual([]);
  time = 3000;
  await preparePublicPromotions(db, query, options);
  expect((await readPreparedPublicPromotions(db, cache, query, options)).items).toEqual([]);
  time = 1000;
  let calls = 0;
  await expect(
    preparePublicPromotions(db, query, { now: () => (++calls === 1 ? 1000 : 3000) }),
  ).rejects.toThrow("expired");
});

test("concurrent advancement uses CAS and scope keys isolate outputs", async () => {
  await fixture(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<150)
    INSERT INTO promotions(kind,starts_at,ends_at,created_at) SELECT 'banner',0,4000,0 FROM n;`);
  let arrivals = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const concurrent = interceptWrites(async () => {
    if (++arrivals === 2) release?.();
    await gate;
  });
  const results = await Promise.all([
    preparePublicPromotions(concurrent, query, options),
    preparePublicPromotions(concurrent, query, options),
  ]);
  expect(results.filter((result) => result.status === "pending")).toHaveLength(1);
  expect(results.filter((result) => result.status === "contended")).toHaveLength(1);
  await preparePublicPromotions(db, query, options);
  const ready = await readPreparedPublicPromotions(db, null, query, options);
  expect(ready.items.map((item) => item.id)).toEqual([1, 2]);
  expect(ready.hasMore).toBe(true);
  await preparePublicPromotions(db, { kind: "pin", limit: 1 }, options);
  await preparePublicPromotions(db, { kind: "pin", limit: 1 }, options);
  expect(
    (await readPreparedPublicPromotions(db, null, { kind: "pin", limit: 1 }, options)).items,
  ).toEqual([]);
});

test("read path uses completed state and cache, never scans promotions", async () => {
  const statements: string[] = [];
  const traced = createDb(
    new Proxy(env.DB, {
      get(target, key) {
        if (key === "prepare")
          return (sql: string) => {
            statements.push(sql);
            return target.prepare(sql);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
  const cache = memoryCache();
  await preparePublicPromotions(traced, query, options);
  expect(statements.length).toBeLessThanOrEqual(8);
  const prepareStatements = statements.length;
  statements.length = 0;
  await readPreparedPublicPromotions(traced, cache, query, options);
  expect(statements).toHaveLength(4);
  statements.length = 0;
  await readPreparedPublicPromotions(traced, cache, query, options);
  expect(statements).toHaveLength(2);
  expect(statements.every((sql) => !sql.includes('from "promotions"'))).toBe(true);
  console.info("prepared promotions read budget", {
    prepareStatements,
    missStatements: 4,
    hitStatements: 2,
  });
});

test("authority change during conditional progress write cannot publish the previous generation", async () => {
  await fixture(`INSERT INTO promotions(kind,entry_username,starts_at,ends_at,created_at)
    VALUES('banner','prepare_public',0,4000,0);`);
  const intercepted = interceptWrites(async () => {
    await fixture("UPDATE entries SET status='hidden_by_admin' WHERE username='prepare_public';");
  });
  await expect(preparePublicPromotions(intercepted, query, options)).rejects.toThrow("changed");
  const stored = await env.DB.prepare(
    "SELECT value FROM site_state WHERE key LIKE 'public_promotion_preparation:%'",
  ).all();
  expect(stored.results).toEqual([]);
  await preparePublicPromotions(db, query, options);
  expect((await readPreparedPublicPromotions(db, null, query, options)).items).toEqual([]);
});
