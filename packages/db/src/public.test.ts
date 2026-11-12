import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import { beforeAll, beforeEach, expect, test } from "vitest";
import {
  createDb,
  getPublicEntry,
  insertApprovedEntry,
  listCategories,
  listPublicLatest,
  listTags,
  setEntryStatus,
  setEntryTags,
  syncTaxonomy,
} from "./index.ts";
import * as schema from "./schema.ts";

const db = createDb(env.DB);
let categoryId: number;
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM entries_fts"),
    env.DB.prepare("DELETE FROM entry_tags"),
    env.DB.prepare("DELETE FROM entry_stats"),
    env.DB.prepare("DELETE FROM entries"),
  ]);
});
beforeAll(async () => {
  await syncTaxonomy(db);
  const category = (await listCategories(db)).find((row) => row.kind === "channel");
  if (!category) throw new Error("Missing channel category");
  categoryId = category.id;
});

async function add(username: string, listedAt = 1000) {
  return insertApprovedEntry(db, {
    entry: {
      username,
      kind: "channel",
      categoryId,
      title: username,
      description: "public description",
      listedAt,
    },
    stats: { members: 10, online: null, activityTier: 2, statsWrittenAt: 1000 },
    tagIds: [],
    now: 1000,
  });
}

test("public detail reflects hide, restore and deletion without a build", async () => {
  const row = await add("public_detail");
  expect(await getPublicEntry(db, "PUBLIC_DETAIL")).toMatchObject({
    username: "public_detail",
    members: 10,
    tags: [],
  });
  expect(await getPublicEntry(db, "missing")).toBeUndefined();
  await setEntryStatus(db, row.id, "hidden_by_admin", 2000);
  expect(await getPublicEntry(db, "public_detail")).toBeUndefined();
  expect((await listPublicLatest(db)).items).toEqual([]);
  await setEntryStatus(db, row.id, "approved", 3000);
  const detail = await getPublicEntry(db, "public_detail");
  expect(detail).toBeDefined();
  expect(detail).not.toHaveProperty("failCount");
  await env.DB.prepare("DELETE FROM entries WHERE id = ?").bind(row.id).run();
  expect(await getPublicEntry(db, "public_detail")).toBeUndefined();
});

test("detail and latest expose only the public data-layer contract", async () => {
  const row = await add("public_contract");
  const tag = (await listTags(db))[0];
  if (!tag) throw new Error("Missing taxonomy tag");
  await setEntryTags(db, row.id, [tag.id], 1000);
  const fields = [
    "id",
    "username",
    "startPayload",
    "kind",
    "categoryId",
    "category",
    "title",
    "description",
    "descriptionZh",
    "descriptionEn",
    "lang",
    "verified",
    "avatarVersion",
    "tgCreatedAt",
    "listedAt",
    "updatedAt",
    "isPromoted",
    "hidePosts",
    "members",
    "activityTier",
  ];
  const detail = await getPublicEntry(db, "public_contract");
  expect(detail).toBeDefined();
  expect(Object.keys(detail ?? {}).sort()).toEqual([...fields, "tags"].sort());
  expect(detail?.tags).toHaveLength(1);
  expect(Object.keys(detail?.tags[0] ?? {}).sort()).toEqual(
    ["id", "slug", "nameZh", "nameEn"].sort(),
  );
  const latest = (await listPublicLatest(db)).items[0];
  expect(Object.keys(latest ?? {}).sort()).toEqual(fields.sort());
});

test("61 equal-date entries paginate stably without duplicates", async () => {
  for (let i = 0; i < 61; i++) await add(`public_${String(i).padStart(3, "0")}`);
  const first = await listPublicLatest(db, { kind: "channel", categoryId });
  expect(first.items).toHaveLength(60);
  expect(first.items[0]?.username).toBe("public_000");
  expect(first.next).not.toBeNull();
  if (!first.next) throw new Error("Missing second page cursor");
  const second = await listPublicLatest(db, { after: first.next, categoryId });
  expect(second.items.map((row) => row.username)).toEqual(["public_060"]);
  expect(second.next).toBeNull();
  expect((await listPublicLatest(db, { kind: "bot" })).items).toEqual([]);
});

test("page bounds reject invalid and unbounded reads", async () => {
  for (const limit of [0, -1, 61, Infinity, NaN, 1.5]) {
    await expect(listPublicLatest(db, { limit })).rejects.toThrow(RangeError);
  }
  await expect(listPublicLatest(db, { after: { listedAt: NaN, username: "a" } })).rejects.toThrow(
    RangeError,
  );
});

test("latest queries use the corresponding partial index without a sort", async () => {
  let statement = "";
  let bindings: unknown[] = [];
  const tracedDb = drizzle(env.DB, {
    schema,
    logger: {
      logQuery(query, params) {
        statement = query;
        bindings = params;
      },
    },
  });
  const cases = [
    { query: {}, index: "entries_public_latest" },
    { query: { kind: "channel" as const }, index: "entries_public_kind_latest" },
    { query: { categoryId }, index: "entries_public_category_latest" },
  ];
  for (const { query, index } of cases) {
    await listPublicLatest(tracedDb, query);
    const result = await env.DB.prepare(`EXPLAIN QUERY PLAN ${statement}`)
      .bind(...bindings)
      .all<{ detail: string }>();
    const plan = result.results.map((row) => row.detail).join("\n");
    expect(plan).toContain(index);
    expect(plan).not.toContain("TEMP B-TREE");
  }
});
