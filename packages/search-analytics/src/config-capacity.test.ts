import { expect, test } from "vitest";
import { defaultSettings, minimumCleanupBatch, SearchSettings } from "./config.ts";

test("cleanup capacity validates high paid budgets without silently changing them", () => {
  expect(minimumCleanupBatch(defaultSettings)).toBe(92);
  expect(minimumCleanupBatch({ ...defaultSettings, sessionIssuesPerDay: 13992 })).toBe(101);
  const high = {
    ...defaultSettings,
    dailyBudget: 100000,
    sessionIssuesPerDay: 100000,
    verificationsPerDay: 100000,
  };
  expect(minimumCleanupBatch(high)).toBe(1334);
  expect(SearchSettings.safeParse({ ...high, cleanupBatch: 500 }).success).toBe(false);
  expect(SearchSettings.parse({ ...high, cleanupBatch: 2000 })).toMatchObject({
    dailyBudget: 100000,
    cleanupBatch: 2000,
  });
  expect(SearchSettings.safeParse({ ...high, cleanupBatch: 2001 }).success).toBe(false);
});
