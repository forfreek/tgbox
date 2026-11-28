import { defaultSettings } from "@tgbox/search-analytics/config";
import { beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ change: vi.fn(), read: vi.fn(), refresh: vi.fn() }));
vi.mock("@tgbox/search-analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tgbox/search-analytics")>()),
  changeSearchAdmin: mocks.change,
  readSearchAdmin: mocks.read,
}));
vi.mock("./search-publication.ts", () => ({ refreshAdminSearch: mocks.refresh }));

import { SearchAdminError } from "@tgbox/search-analytics";
import { type SearchRuntime, searchAdminCommand, searchAdminRead } from "./search-analytics.ts";

const unexpected = (): never => {
  throw new Error("Unexpected database access in adapter fixture");
};
const runtime = (): SearchRuntime => ({
  DB: { prepare: unexpected },
  ANALYTICS_DB: { prepare: unexpected, batch: unexpected, withSession: unexpected },
  PUBLIC_CACHE: { get: async () => null, put: async () => undefined },
  SEARCH_JOBS_ENABLED: "1",
  SETTINGS_KEY: "x".repeat(32),
});
const data = {
  version: 1 as const,
  action: "settings" as const,
  expectedVersion: 1,
  value: defaultSettings,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.change.mockResolvedValue({ refresh: true, usage: { rowsRead: 4, rowsWritten: 3 } });
  mocks.refresh.mockResolvedValue({ status: "succeeded" });
});
test("audit identity is HMAC and refresh attaches only after a successful durable mutation", async () => {
  const wait = vi.fn();
  expect(await searchAdminCommand(runtime(), data, "tg:123", wait)).toMatchObject({
    saved: true,
    refresh: "scheduled",
  });
  expect(mocks.change.mock.calls[0]?.[2]).toMatch(/^[0-9a-f]{64}$/u);
  expect(mocks.change.mock.calls[0]?.[2]).not.toContain("tg:");
  expect(wait).toHaveBeenCalledOnce();
  await wait.mock.calls[0]?.[0];
  mocks.change.mockRejectedValue(new SearchAdminError("版本冲突"));
  wait.mockClear();
  mocks.refresh.mockClear();
  await expect(searchAdminCommand(runtime(), data, "tg:123", wait)).rejects.toThrow("版本冲突");
  expect(wait).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
test("database failure is sanitized, logged with a fixed code and does not trigger publication", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mocks.change.mockRejectedValue(new Error("SELECT private-keyword secret"));
  await expect(searchAdminCommand(runtime(), data, "tg:123", vi.fn())).rejects.toThrow("保存失败");
  expect(warn).toHaveBeenCalledWith("search-analytics", "admin-write");
  expect(JSON.stringify(warn.mock.calls)).not.toContain("private-keyword");
  expect(mocks.refresh).not.toHaveBeenCalled();
  warn.mockRestore();
});
test("manual refresh refuses disabled deployment before writing audit", async () => {
  const disabled = runtime();
  disabled.SEARCH_JOBS_ENABLED = "0";
  await expect(
    searchAdminCommand(
      disabled,
      { version: 1, action: "refresh", expectedVersion: 1 },
      "tg:123",
      vi.fn(),
    ),
  ).rejects.toThrow("部署开关");
  expect(mocks.change).not.toHaveBeenCalled();
});

test.each([
  ["succeeded", "completed"],
  ["busy", "busy"],
  ["failed", "failed"],
])(
  "manual refresh awaits %s and reports %s without HTTP background lifetime dependence",
  async (status, expected) => {
    mocks.refresh.mockResolvedValue({ status });
    const wait = vi.fn();
    expect(
      await searchAdminCommand(
        runtime(),
        { version: 1, action: "refresh", expectedVersion: 1 },
        "tg:123",
        wait,
      ),
    ).toMatchObject({ refresh: expected });
    expect(wait).not.toHaveBeenCalled();
  },
);
test("read failures never expose raw SQL or credentials", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  mocks.read.mockRejectedValue(new Error("raw private-keyword initData"));
  await expect(
    searchAdminRead(runtime(), {
      version: 1,
      view: "settings",
      from: "2026-11-28",
      to: "2026-11-28",
    }),
  ).rejects.toThrow("读取失败");
  expect(warn).toHaveBeenCalledWith("search-analytics", "admin-read");
  warn.mockRestore();
});
