import type { EntryView } from "@tgbox/shared";
import { describe, expect, test } from "vitest";
import { aiCategoryUi } from "../i18n/ui-ai-category.ts";
import { aiCategoryResources } from "./ai-category.ts";
import { devSiteData } from "./dev-site-data.ts";

describe("AI category resources", () => {
  test("omits absent resources and ranks real tags by group association", () => {
    const data = structuredClone(devSiteData);
    const entry = data.entries[0];
    if (!entry) throw new Error("Expected a fixture entry");
    data.tags = ["a", "b", "unused"].map((slug, index) => ({
      id: index + 1,
      slug,
      nameZh: slug,
      nameEn: slug,
      count: 99,
    }));
    const groups: EntryView[] = [
      { ...entry, kind: "group", category: "ai", tags: ["b", "a", "a", "orphan"] },
      { ...entry, kind: "group", category: "ai", tags: ["b"] },
    ];
    data.entries = groups;
    expect(aiCategoryResources(data, groups).tags.map((tag) => tag.slug)).toEqual(["b", "a"]);
    expect(aiCategoryResources(data, groups).categories).toEqual([]);
    expect(aiCategoryResources(data, []).tags).toEqual([]);
  });

  test("limits topic links and uses entry presence rather than stale category counts", () => {
    const data = structuredClone(devSiteData);
    const entry = data.entries[0];
    if (!entry) throw new Error("Expected a fixture entry");
    data.tags = Array.from({ length: 10 }, (_, id) => ({
      id,
      slug: `tag${id}`,
      nameZh: "标签",
      nameEn: "Tag",
      count: 1,
    }));
    const group = {
      ...entry,
      kind: "group" as const,
      category: "ai",
      tags: data.tags.map((tag) => tag.slug),
    };
    data.categories = [
      {
        id: 1,
        kind: "channel",
        slug: "ai",
        nameZh: "AI",
        nameEn: "AI",
        count: 0,
        sort: 0,
        icon: null,
      },
      {
        id: 2,
        kind: "bot",
        slug: "ai",
        nameZh: "AI",
        nameEn: "AI",
        count: 100,
        sort: 0,
        icon: null,
      },
    ];
    data.entries = [group, { ...group, kind: "channel" }];
    const links = aiCategoryResources(data, [group]);
    expect(links.tags).toHaveLength(8);
    expect(links.categories.map((category) => category.kind)).toEqual(["channel"]);
  });

  test("three languages share a content contract with dedicated Traditional copy", () => {
    const zh = aiCategoryUi("zh");
    const hant = aiCategoryUi("zh-hant");
    const en = aiCategoryUi("en");
    expect(Object.keys(hant)).toEqual(Object.keys(zh));
    expect(Object.keys(en)).toEqual(Object.keys(zh));
    expect(hant).not.toBe(zh);
    expect(hant.title).toContain("人工智慧");
    for (const strings of [zh, hant, en]) {
      expect(strings.description).toContain("{n}");
      expect(strings.missingDescription).toContain("{username}");
      expect(strings.sorts.members).not.toEqual(strings.sorts.latest);
    }
  });
});
