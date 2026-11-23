import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { aiSummaryFingerprint } from "@tgbox/shared";
import { expect, test } from "vitest";
import { buildFixtureDb, fixtureNow } from "../test/fixtures/build-fixture.ts";
import { readPublicSummaries, snapshotSummarySource } from "./ai-summary.ts";
import { buildSiteData } from "./build-site-data.ts";
import { summaryEntryIds } from "./summary-options.ts";

async function fixture() {
  const file = buildFixtureDb(
    path.join(mkdtempSync(path.join(tmpdir(), "summary-")), "db.sqlite"),
    [
      {
        username: "channel_one",
        kind: "channel",
        category: "tech",
        tags: ["chinese"],
        title: "频道",
        description: "分享软件使用说明",
        listedDaysAgo: 1,
      },
      {
        username: "channel_two",
        kind: "channel",
        category: "tech",
        tags: [],
        title: "另一个频道",
        description: "分享地图说明",
        listedDaysAgo: 1,
      },
    ],
  );
  const db = new DatabaseSync(file);
  const posts = [{ id: 1, date: "2026-11-23T00:00:00Z", text: "介绍离线导出功能", views: 1 }];
  const read = async (key: string) => (key.startsWith("posts/") ? posts : undefined);
  for (const id of [1, 2]) {
    const source = await snapshotSummarySource(db, id, read);
    const fp = await aiSummaryFingerprint(source, (b) => crypto.subtle.digest("SHA-256", b));
    db.prepare(
      "INSERT INTO ai_summary_public(entry_id,zh,hant,en,fingerprint) VALUES (?,?,?,?,?)",
    ).run(id, "分享软件说明。", "分享軟體說明。", "Shares software instructions.", fp);
  }
  return { file, db, posts, read };
}
test("disabled/empty/invalid whitelist stays off; explicit IDs cannot expand to all entries", () => {
  expect(summaryEntryIds(undefined)).toEqual([]);
  expect(summaryEntryIds("")).toEqual([]);
  expect(summaryEntryIds("*")).toEqual([]);
  expect(summaryEntryIds("1,x")).toEqual([]);
  expect(summaryEntryIds("0")).toEqual([]);
  expect(summaryEntryIds("1, 2,1")).toEqual([1, 2]);
  const fifty = Array.from({ length: 50 }, (_, i) => i + 1);
  expect(summaryEntryIds(fifty.join(","))).toEqual(fifty);
  expect(summaryEntryIds([...fifty, 51].join(","))).toEqual([]);
});
test("snapshot emits only whitelisted verified text and no private projection metadata", async () => {
  const f = await fixture();
  f.db.close();
  const off = await buildSiteData({ dbPath: f.file, readMedia: f.read, now: fixtureNow });
  expect(off.entries.every((e) => e.aiSummary === null)).toBe(true);
  const on = await buildSiteData({
    dbPath: f.file,
    readMedia: f.read,
    now: fixtureNow,
    summaryEntryIds: [1],
  });
  expect(on.entries.find((e) => e.username === "channel_one")?.aiSummary).toEqual({
    zh: "分享软件说明。",
    hant: "分享軟體說明。",
    en: "Shares software instructions.",
  });
  expect(on.entries.find((e) => e.username === "channel_two")?.aiSummary).toBeNull();
  expect(JSON.stringify(on)).not.toMatch(/fingerprint|contractVersion|actor|revision_id/);
});
test("stats and views do not invalidate but changed visible posts do", async () => {
  const f = await fixture();
  try {
    const post = f.posts[0];
    if (!post) throw new Error("Missing fixture post");
    post.views = 999;
    f.db.exec("UPDATE entry_stats SET members=500");
    expect((await readPublicSummaries(f.db, [1], f.read)).size).toBe(1);
    post.text = "其他内容";
    expect((await readPublicSummaries(f.db, [1], f.read)).size).toBe(0);
  } finally {
    f.db.close();
  }
});
test.each(["title", "description", "category_id", "hide_posts", "status"])(
  "changed %s invalidates an approved projection",
  async (column) => {
    const f = await fixture();
    try {
      const sql = {
        title: "title='新名称'",
        description: "description='新用途'",
        category_id: "category_id=2",
        hide_posts: "hide_posts=1",
        status: "status='removed'",
      }[column];
      f.db.exec(`UPDATE entries SET ${sql} WHERE id=1`);
      expect((await readPublicSummaries(f.db, [1], f.read)).size).toBe(0);
    } finally {
      f.db.close();
    }
  },
);
test("hidden evidence and blocklist changes cannot keep old summaries", async () => {
  const f = await fixture();
  try {
    f.db.exec("INSERT INTO hidden_posts(entry_id,post_id,created_at) VALUES(1,1,0)");
    expect((await readPublicSummaries(f.db, [1], f.read)).size).toBe(0);
    f.db.exec("DELETE FROM hidden_posts");
    f.db
      .prepare("INSERT INTO settings(key,value,updated_at) VALUES('site',?,0)")
      .run(JSON.stringify({ postBlocklist: ["离线导出"] }));
    expect((await readPublicSummaries(f.db, [1], f.read)).size).toBe(0);
  } finally {
    f.db.close();
  }
});
test("missing table and malformed rows fail per entry, including unsupported contract and bad language", async () => {
  const f = await fixture();
  try {
    f.db.exec("UPDATE ai_summary_public SET zh='' WHERE entry_id=1");
    expect([...(await readPublicSummaries(f.db, [1, 2], f.read)).keys()]).toEqual([2]);
    f.db.exec("UPDATE ai_summary_public SET contract_version=99 WHERE entry_id=2");
    expect((await readPublicSummaries(f.db, [2], f.read)).size).toBe(0);
    f.db.exec("DROP TABLE ai_summary_public");
    expect((await readPublicSummaries(f.db, [1], f.read)).size).toBe(0);
  } finally {
    f.db.close();
  }
});
test("source read/parse errors fall back instead of treating failure as missing posts", async () => {
  const f = await fixture();
  try {
    expect(
      (
        await readPublicSummaries(f.db, [1], async () => {
          throw new Error("R2 unavailable");
        })
      ).size,
    ).toBe(0);
    expect((await readPublicSummaries(f.db, [1], async () => ({ bad: "data" }))).size).toBe(0);
    expect((await readPublicSummaries(f.db, [1], async () => undefined)).size).toBe(0);
  } finally {
    f.db.close();
  }
});
test("invalid independent projection SQL cannot break normal snapshot; orphan projection does not require private tables", async () => {
  const f = await fixture();
  f.db.close();
  const aux = path.join(path.dirname(f.file), "public.sql");
  writeFileSync(aux, "not valid SQL");
  const fallback = await buildSiteData({
    dbPath: f.file,
    summaryDbPath: aux,
    summaryEntryIds: [1],
    readMedia: f.read,
    now: fixtureNow,
  });
  expect(fallback.entries.every((e) => e.aiSummary === null)).toBe(true);
  writeFileSync(
    aux,
    "CREATE TABLE ai_summary_public(entry_id INTEGER, zh TEXT,hant TEXT,en TEXT,fingerprint TEXT,contract_version INTEGER); INSERT INTO ai_summary_public VALUES(999,'短句','短句','Text.','sha256:" +
      "0".repeat(64) +
      "',1);",
  );
  const orphan = await buildSiteData({
    dbPath: f.file,
    summaryDbPath: aux,
    summaryEntryIds: [999],
    readMedia: f.read,
    now: fixtureNow,
  });
  expect(orphan.entries.every((e) => e.aiSummary === null)).toBe(true);
});
test("independent public export works without any private AI tables in the main export", async () => {
  const f = await fixture();
  const row = f.db.prepare("SELECT fingerprint FROM ai_summary_public WHERE entry_id=1").get();
  if (!row) throw new Error("Missing fingerprint");
  for (const name of [
    "ai_summary_reviews",
    "ai_summary_revisions",
    "ai_summary_attempts",
    "ai_summary_jobs",
    "ai_summary_sources",
    "ai_summary_settings",
    "ai_summary_runs",
    "ai_summary_public",
  ])
    f.db.exec(`DROP TABLE ${name}`);
  f.db.close();
  const aux = path.join(path.dirname(f.file), "public.sql");
  writeFileSync(
    aux,
    `CREATE TABLE ai_summary_public(entry_id INTEGER,zh TEXT,hant TEXT,en TEXT,fingerprint TEXT,contract_version INTEGER); INSERT INTO ai_summary_public VALUES(1,'简中','繁中','Text.','${row.fingerprint}',1);`,
  );
  const data = await buildSiteData({
    dbPath: f.file,
    summaryDbPath: aux,
    summaryEntryIds: [1],
    readMedia: f.read,
    now: fixtureNow,
  });
  expect(data.entries.find((e) => e.username === "channel_one")?.aiSummary).toEqual({
    zh: "简中",
    hant: "繁中",
    en: "Text.",
  });
});

test("source validation shares the canonical worker input and reuses R2 reads", async () => {
  const f = await fixture();
  try {
    const raw = await snapshotSummarySource(f.db, 1, f.read);
    expect(raw).toMatchObject({
      kind: "channel",
      category: "tech",
      tags: ["chinese"],
      profile: { status: "ok", description: "分享软件使用说明" },
      posts: { status: "ok", posts: [{ id: 1, text: "介绍离线导出功能" }] },
    });
    let count = 0;
    await buildSiteData({
      dbPath: f.file,
      summaryEntryIds: [1],
      readMedia: async (key) => {
        if (key === "posts/channel_one.json") count++;
        return f.read(key);
      },
      now: fixtureNow,
    });
    expect(count).toBe(1);
  } finally {
    f.db.close();
  }
});
