import { EntryView } from "@tgbox/shared";
import { expect, test } from "vitest";
import { approvedSummaryText } from "./ai-summary.ts";
import { devSiteData } from "./dev-site-data.ts";

const summary = { zh: "简体介绍", hant: "人工繁體介紹", en: "Reviewed introduction." };
test("display is off by default even when snapshot has an approved tuple", () => {
  expect(approvedSummaryText(summary, "zh", false)).toBeNull();
});
test.each([
  ["zh", summary.zh],
  ["zh-hant", summary.hant],
  ["en", summary.en],
] as const)("selects %s from the same approved version", (locale, value) => {
  expect(approvedSummaryText(summary, locale, true)).toBe(value);
});
test.each([
  undefined,
  null,
  {},
  { ...summary, hant: "" },
  { ...summary, en: "word ".repeat(91) },
  { ...summary, zh: "字".repeat(121) },
])("invalid language tuples always fall back", (value) => {
  expect(approvedSummaryText(value, "zh", true)).toBeNull();
  const entry = EntryView.parse({ ...devSiteData.entries[0], aiSummary: value });
  expect(entry.aiSummary ?? null).toBeNull();
});
