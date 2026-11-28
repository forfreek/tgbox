import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { SearchEvent } from "./contracts.ts";

const db = env.ANALYTICS_DB;
const identity = "a".repeat(64);
const input = {
  version: 1,
  eventId: "eeea35c4-b139-4e0d-b082-dbe3f1a21111",
  keyword: "telegram",
  trigger: "manual",
  reportedResult: "results",
  locale: "zh",
};

describe("analytics migration isolation and constraints", () => {
  it("has an independent namespace, singleton version and no core tables", async () => {
    const rows = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all<{ name: string }>();
    expect(rows.results.some((row) => row.name === "entries")).toBe(false);
    expect(rows.results.filter((row) => row.name.startsWith("search_"))).toHaveLength(12);
    expect(
      await db.prepare("SELECT version,value FROM search_settings WHERE id=1").first(),
    ).toEqual({ version: 1, value: "{}" });
    await expect(
      db.prepare("INSERT INTO search_settings VALUES(2,1,'{}',0)").run(),
    ).rejects.toThrow();
  });
  it("rejects invalid metric totals and preserves the previous aggregate", async () => {
    await db
      .prepare(
        "INSERT INTO search_daily_stats(day,keyword,display_keyword,source,locale,updated_at) VALUES('2026-11-28','test','test','website','zh',1)",
      )
      .run();
    await expect(
      db.prepare("UPDATE search_daily_stats SET searches=1,zero_results=2").run(),
    ).rejects.toThrow();
    expect(await db.prepare("SELECT searches FROM search_daily_stats").first("searches")).toBe(0);
  });
  it("rejects plaintext identities and conflicting dimension keys", async () => {
    await expect(
      db
        .prepare(
          "INSERT INTO search_daily_identities VALUES('2026-11-28','test','123','bot','zh',1,1)",
        )
        .run(),
    ).rejects.toThrow();
    const stmt = db
      .prepare("INSERT INTO search_daily_identities VALUES('2026-11-28','test',?,'bot','zh',1,1)")
      .bind(identity);
    await stmt.run();
    await expect(stmt.run()).rejects.toThrow();
  });
  it("rolls back the whole D1 batch when a later identity write fails", async () => {
    await expect(
      db.batch([
        db
          .prepare("INSERT INTO search_event_receipts VALUES('event',?,?, 'attempt',1)")
          .bind(identity, identity),
        db.prepare(
          "INSERT INTO search_daily_identities VALUES('2026-11-28','test','raw-user','bot','zh',1,1)",
        ),
      ]),
    ).rejects.toThrow();
    expect(await db.prepare("SELECT count(*) AS n FROM search_event_receipts").first("n")).toBe(0);
  });
  it("cannot publish an incomplete authority pointer", async () => {
    await expect(
      db.prepare("UPDATE search_control SET publication_key='key' WHERE id=1").run(),
    ).rejects.toThrow();
    expect(
      await db.prepare("SELECT publication_key FROM search_control").first("publication_key"),
    ).toBeNull();
  });
  it("uses expiry indexes and never requires a core database foreign key", async () => {
    for (const table of ["search_event_receipts", "search_rate_limits"]) {
      const rows = await db
        .prepare(`EXPLAIN QUERY PLAN SELECT * FROM ${table} WHERE expires_at < 1 LIMIT 100`)
        .all<{ detail: string }>();
      expect(rows.results.some((row) => row.detail.includes("INDEX"))).toBe(true);
    }
    const rows = await db.prepare("PRAGMA foreign_key_check").all();
    expect(rows.results).toEqual([]);
  });
});
describe("versioned untrusted event boundary", () => {
  it("separates zero result status from trigger and accepts Unicode codepoints", () => {
    expect(SearchEvent.parse({ ...input, reportedResult: "zero" }).trigger).toBe("manual");
    expect(SearchEvent.safeParse({ ...input, keyword: "𠀀".repeat(64) }).success).toBe(true);
  });
  it("rejects source spoofing, old versions and invalid trigger/result combinations", () => {
    for (const extra of [
      { source: "bot" },
      { identity: "123" },
      { version: 2 },
      { trigger: "zero-result" },
      { keyword: "𠀀".repeat(65) },
    ]) {
      expect(SearchEvent.safeParse({ ...input, ...extra }).success).toBe(false);
    }
  });
});
