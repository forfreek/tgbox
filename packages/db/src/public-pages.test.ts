import { env } from "cloudflare:workers";
import type { EntryKind, EntryProductKind } from "@tgbox/shared";
import { beforeAll, beforeEach, expect, test } from "vitest";
import {
  backfillPublicProjection,
  beginPublicProjection,
  createDb,
  getPublicRevision,
  insertApprovedEntry,
  insertPromotion,
  listCategories,
  listTags,
  type PublicPageQuery,
  type PublicScope,
  preparePublicPage,
  prunePublicPageAnchors,
  readPublicPage,
  refreshPublicPromotions,
  setEntryPromoted,
  setEntryStatus,
  syncTaxonomy,
  upsertEntryStats,
} from "./index.ts";

const db = createDb(env.DB);
const now = Date.UTC(2026, 10, 12);
let categoryId: number;
let otherCategoryId: number;
let groupCategoryId: number;
let tagId: number;
beforeAll(async () => {
  await syncTaxonomy(db);
  const cats = await listCategories(db);
  const channel = cats.filter((row) => row.kind === "channel");
  const group = cats.find((row) => row.kind === "group");
  const tag = (await listTags(db))[0];
  if (!channel[0] || !channel[1] || !group || !tag) throw new Error("Missing taxonomy");
  categoryId = channel[0].id;
  otherCategoryId = channel[1].id;
  groupCategoryId = group.id;
  tagId = tag.id;
});
beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM site_state WHERE key LIKE 'public_%'"),
    env.DB.prepare("DELETE FROM public_page_anchors"),
    env.DB.prepare("DELETE FROM public_listing"),
    env.DB.prepare("DELETE FROM public_promotion_state"),
    env.DB.prepare("DELETE FROM promotions"),
    env.DB.prepare("DELETE FROM entries_fts"),
    env.DB.prepare("DELETE FROM entry_tags"),
    env.DB.prepare("DELETE FROM entry_stats"),
    env.DB.prepare("DELETE FROM entries"),
  ]);
});

async function add(
  username: string,
  members: number | null,
  options: {
    listedAt?: number;
    categoryId?: number;
    kind?: EntryKind;
    manual?: boolean;
  } = {},
) {
  return insertApprovedEntry(db, {
    entry: {
      username,
      title: username,
      kind: options.kind ?? "channel",
      categoryId: options.categoryId ?? categoryId,
      listedAt: options.listedAt ?? now,
      isPromoted: options.manual ?? false,
    },
    stats: { members, online: null, activityTier: null, statsWrittenAt: now },
    tagIds: [tagId],
    now,
  });
}
async function activate() {
  await beginPublicProjection(db);
  for (let i = 0; i < 100; i++) if ((await backfillPublicProjection(db, 100)).done) return;
  throw new Error("Backfill did not finish");
}
async function promo(
  username: string,
  kind: EntryProductKind,
  startsAt = now,
  endsAt = now + 10_000,
) {
  return insertPromotion(db, {
    kind,
    entryUsername: username,
    orderId: null,
    banner: null,
    startsAt,
    endsAt,
    createdAt: now,
  });
}
function query(
  scope: PublicScope = { kind: "category", id: categoryId },
  page = 1,
): PublicPageQuery {
  return { scope, sort: "members", page, now };
}
async function names(q = query()) {
  const page = await readPublicPage(db, q);
  if (page.status !== "ready") throw new Error(`Page unavailable: ${page.status}`);
  return page.items.map((row) => row.username);
}

test("category priorities preserve manual pins, paid tiers and latest order; tags keep member order", async () => {
  await add("ordinary", 1000, { listedAt: now - 1 });
  await add("highlighted", 900, { listedAt: now - 2 });
  await add("category_pin", 10, { listedAt: now - 3 });
  await add("site_pin", 1, { listedAt: now - 4 });
  const manual = await add("manual_pin", 5, { listedAt: now - 5, manual: true });
  await promo("site_pin", "pin");
  await promo("site_pin", "highlight");
  await promo("category_pin", "category_pin");
  await promo("highlighted", "highlight");
  await promo("manual_pin", "category_pin");
  await activate();
  expect((await readPublicPage(db, query())).status).toBe("needs_preparation");
  expect((await preparePublicPage(db, query())).ready).toBe(true);
  expect(await names()).toEqual([
    "manual_pin",
    "site_pin",
    "category_pin",
    "ordinary",
    "highlighted",
  ]);
  expect(await names({ ...query(), sort: "latest" })).toEqual([
    "site_pin",
    "manual_pin",
    "category_pin",
    "ordinary",
    "highlighted",
  ]);
  expect(await names(query({ kind: "tag", id: tagId }))).toEqual([
    "ordinary",
    "highlighted",
    "category_pin",
    "manual_pin",
    "site_pin",
  ]);
  expect(await names(query({ kind: "type", type: "channel" }))).toEqual([
    "manual_pin",
    "site_pin",
    "ordinary",
    "highlighted",
    "category_pin",
  ]);
  await setEntryPromoted(db, manual.id, false, now + 1);
  expect(await names()).toEqual([
    "site_pin",
    "category_pin",
    "manual_pin",
    "ordinary",
    "highlighted",
  ]);
});

test("start/end boundaries and clock rollback refresh ranks without hourly deletion", async () => {
  await add("ordinary", 1000);
  await add("timed", 1);
  await promo("timed", "pin", now, now + 1000);
  await promo("timed", "category_pin", now + 1000, now + 2000);
  await promo("timed", "highlight", now, now + 3000);
  await activate();
  for (const [elapsed, expected] of [
    [0, "pin"],
    [1000, "category_pin"],
    [2000, "highlight"],
    [3000, null],
    [500, "pin"],
  ] as const) {
    const q = { ...query(), now: now + elapsed };
    expect((await readPublicPage(db, q)).status).toBe("needs_preparation");
    expect((await refreshPublicPromotions(db, q.now)).ready).toBe(true);
    const page = await readPublicPage(db, q);
    if (page.status !== "ready") throw new Error("Timed page not ready");
    expect(page.items.find((row) => row.username === "timed")?.promo).toBe(expected);
    expect(page.items[0]?.username).toBe(
      expected === "pin" || expected === "category_pin" ? "timed" : "ordinary",
    );
    expect(page.validUntil).toBeGreaterThan(q.now);
  }
});

test("60-row boundaries, null counts, tie order and invalid page numbers are deterministic", async () => {
  const usernames = [
    "a_1",
    "a1",
    "_aaa",
    "0aaa",
    "a__1",
    ...Array.from({ length: 56 }, (_, i) => `row_${String(i).padStart(3, "0")}`),
  ];
  for (const username of usernames) await add(username, 10);
  await add("null_count", null);
  await activate();
  const expected = [...usernames].sort((a, b) => a.localeCompare(b));
  const first = await names(query(undefined, 1));
  const second = await names(query(undefined, 2));
  expect(first).toEqual(expected.slice(0, 60));
  expect(second).toEqual([...expected.slice(60), "null_count"]);
  expect(new Set([...first, ...second]).size).toBe(62);
  const initial = await readPublicPage(db, query());
  await add("new_pin", 1, { manual: true });
  expect(
    (
      await readPublicPage(db, {
        ...query(undefined, 2),
        expectedOrderRevision: initial.orderRevision,
      })
    ).status,
  ).toBe("changed");
  expect((await readPublicPage(db, query(undefined, 3))).status).toBe("not_found");
  for (const page of [0, -1, 1.5, NaN, Infinity])
    await expect(readPublicPage(db, query(undefined, page))).rejects.toThrow(RangeError);
  await expect(preparePublicPage(db, { ...query(), now: -1 })).rejects.toThrow(RangeError);
  expect((await readPublicPage(db, query({ kind: "tag", id: 999999 }))).status).toBe("not_found");
});

test("cold deep anchors progress within budget, survive text edits, invalidate on sort and state changes", async () => {
  for (let i = 0; i < 2000; i++) await add(`entry_${String(i).padStart(4, "0")}`, i);
  await activate();
  const q = query(undefined, 33);
  expect((await readPublicPage(db, q)).status).toBe("needs_preparation");
  const first = await preparePublicPage(db, q);
  expect(first).toMatchObject({ ready: false, preparedThrough: 21 });
  expect((await preparePublicPage(db, q)).ready).toBe(true);
  const page = await readPublicPage(db, q);
  if (page.status !== "ready") throw new Error("Deep page not ready");
  expect(page.items).toHaveLength(60);
  expect(page.items[0]?.username).toBe("entry_0079");
  const row = page.items[0];
  if (!row) throw new Error("Missing deep row");
  await env.DB.prepare("UPDATE entries SET title='updated' WHERE id=?").bind(row.id).run();
  const edited = await readPublicPage(db, q);
  if (edited.status !== "ready") throw new Error("Text edit invalidated ordering");
  expect(edited.orderRevision).toBe(page.orderRevision);
  expect(edited.revision).not.toBe(page.revision);
  expect(edited.items[0]?.title).toBe("updated");
  await upsertEntryStats(db, {
    entryId: row.id,
    members: 99999,
    online: null,
    activityTier: null,
    statsWrittenAt: now + 1,
  });
  expect((await readPublicPage(db, q)).status).toBe("needs_preparation");
  expect((await names())[0]).toBe(row.username);
  await setEntryStatus(db, row.id, "hidden_by_admin", now + 2);
  expect(await names()).not.toContain(row.username);
  await setEntryStatus(db, row.id, "approved", now + 3);
  expect((await names())[0]).toBe(row.username);
  await env.DB.prepare("DELETE FROM entries WHERE id=?").bind(row.id).run();
  expect(await names()).not.toContain(row.username);
  const cleaned = await prunePublicPageAnchors(db, now + 1, 1);
  expect(cleaned.meta.changes).toBe(1);
}, 30_000);

test("scope-specific ordering revisions isolate unrelated changes and concurrent preparations", async () => {
  const other = await add("other", 100, { categoryId: otherCategoryId });
  await add("group_entry", 100, { categoryId: groupCategoryId, kind: "group" });
  for (let i = 0; i < 700; i++) await add(`scope_${String(i).padStart(4, "0")}`, i);
  await activate();
  const q = query(undefined, 12);
  await Promise.all([preparePublicPage(db, q), preparePublicPage(db, q)]);
  const initial = await readPublicPage(db, q);
  if (initial.status !== "ready") throw new Error("Page not prepared");
  await upsertEntryStats(db, {
    entryId: other.id,
    members: 1000,
    online: null,
    activityTier: null,
    statsWrittenAt: now + 1,
  });
  const after = await readPublicPage(db, q);
  expect(after.status).toBe("ready");
  expect(after.orderRevision).toBe(initial.orderRevision);
  expect(after.revision).not.toBe(initial.revision);
  expect(await names(query({ kind: "type", type: "group" }))).toEqual(["group_entry"]);
}, 30_000);

test("promotion preparation enforces its limit and source changes invalidate paid tiers", async () => {
  for (let i = 0; i < 21; i++) {
    const name = `paid_${String(i).padStart(3, "0")}`;
    await add(name, i);
    await promo(name, "pin");
  }
  await activate();
  const first = await refreshPublicPromotions(db, now);
  expect(first).toMatchObject({ attempted: 20, processed: 20, ready: false, statements: 165 });
  expect((await readPublicPage(db, query())).status).toBe("needs_preparation");
  expect((await refreshPublicPromotions(db, now)).processed).toBe(1);
  expect((await readPublicPage(db, query())).status).toBe("ready");
  await env.DB.prepare("UPDATE promotions SET ends_at=? WHERE entry_username='paid_020'")
    .bind(now)
    .run();
  expect((await readPublicPage(db, query())).status).toBe("needs_preparation");
  await refreshPublicPromotions(db, now);
  const page = await readPublicPage(db, query());
  if (page.status !== "ready") throw new Error("Promotion page not ready");
  expect(page.items.at(-1)?.username).toBe("paid_020");
  expect(page.items.at(-1)?.promo).toBeNull();
});

test("concurrent promotion preparation commits one tier evaluation", async () => {
  await add("concurrent_pin", 10);
  await promo("concurrent_pin", "pin");
  await activate();
  const before = await getPublicRevision(db);
  const results = await Promise.all([
    refreshPublicPromotions(db, now),
    refreshPublicPromotions(db, now),
  ]);
  expect(results.reduce((sum, result) => sum + result.processed, 0)).toBe(1);
  expect(results.every((result) => result.ready)).toBe(true);
  expect(BigInt(await getPublicRevision(db))).toBe(BigInt(before) + 1n);
  expect(await names()).toEqual(["concurrent_pin"]);
});

test("a hide between key selection and hydration fails the request instead of returning a partial page", async () => {
  const row = await add("race", 10);
  await activate();
  let changed = false;
  const wrap = (statement: D1PreparedStatement, text: string): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, key) {
        if (key === "bind") return (...params: unknown[]) => wrap(target.bind(...params), text);
        if (key === "raw" || key === "all")
          return async (...args: unknown[]) => {
            if (!changed && text.includes('from "entries"')) {
              changed = true;
              await setEntryStatus(db, row.id, "hidden_by_admin", now + 1);
            }
            return Reflect.apply(Reflect.get(target, key), target, args);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  const intercepted = new Proxy(env.DB, {
    get(target, key) {
      if (key === "prepare") return (text: string) => wrap(target.prepare(text), text);
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  await expect(readPublicPage(createDb(intercepted), query())).rejects.toThrow("changed");
  expect(changed).toBe(true);
  expect((await readPublicPage(db, query())).status).toBe("not_found");
});

test("actual warm-page keys use the promoted sort index and bounded indexed reads", async () => {
  for (let i = 0; i < 1000; i++) await add(`budget_${String(i).padStart(4, "0")}`, i);
  await activate();
  const statements: { query: string; params: unknown[] }[] = [];
  const observed = new Proxy(env.DB, {
    get(target, key) {
      if (key === "prepare")
        return (text: string) =>
          new Proxy(target.prepare(text), {
            get(statement, field) {
              if (field === "bind")
                return (...params: unknown[]) => {
                  statements.push({ query: text, params });
                  return statement.bind(...params);
                };
              const value = Reflect.get(statement, field);
              return typeof value === "function" ? value.bind(statement) : value;
            },
          });
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const traced = createDb(observed);
  for (const sort of ["members", "latest"] as const) {
    const q = { ...query(undefined, 17), sort };
    await preparePublicPage(db, q);
    statements.length = 0;
    const page = await readPublicPage(traced, q);
    expect(page.status).toBe("ready");
    const statement = [...statements]
      .reverse()
      .find((row) => row.query.includes('from "public_listing"'));
    if (!statement) throw new Error("No key query");
    const result = await env.DB.prepare(statement.query)
      .bind(...statement.params)
      .all();
    expect(result.meta.rows_read).toBeLessThanOrEqual(61);
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN ${statement.query}`)
      .bind(...statement.params)
      .all<{ detail: string }>();
    const details = plan.results.map((row) => row.detail).join("\n");
    expect(details).toContain(`public_listing_page_${sort}`);
    expect(details).not.toContain("TEMP B-TREE");
    let totalRowsRead = 0;
    for (const sql of statements) {
      const replay = await env.DB.prepare(sql.query)
        .bind(...sql.params)
        .all();
      totalRowsRead += replay.meta.rows_read;
    }
    expect(totalRowsRead).toBeLessThan(300);
    expect(statements.length).toBe(9);
    console.info("numbered page read budget", {
      sort,
      page: 17,
      keyRowsRead: result.meta.rows_read,
      totalRowsRead,
      statements: statements.length,
    });
  }
}, 30_000);
