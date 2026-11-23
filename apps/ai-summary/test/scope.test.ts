import { expect, test } from "vitest";
import { summaryGenerationScope } from "../src/scope.ts";

test("global generation requires explicit all mode; invalid or missing selected IDs never expand", () => {
  expect(summaryGenerationScope("all", "")).toBeUndefined();
  expect(summaryGenerationScope("all", "1,2")).toBeUndefined();
  expect(summaryGenerationScope(undefined, "")).toEqual([]);
  expect(summaryGenerationScope("selected", "*")).toEqual([]);
  expect(summaryGenerationScope("selected", "1,2")).toEqual([1, 2]);
  expect(summaryGenerationScope("typo", "1,2")).toEqual([]);
});
