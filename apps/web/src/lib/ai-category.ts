import type { EntryView, SiteData } from "@tgbox/shared";

/** Related links are backed by actual public entries, including tags common to every group. */
export function aiCategoryResources(data: SiteData, groups: EntryView[]) {
  const counts = new Map<string, number>();
  for (const entry of groups) {
    for (const tag of new Set(entry.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return {
    tags: data.tags
      .filter((tag) => (counts.get(tag.slug) ?? 0) > 0)
      .sort(
        (a, b) =>
          (counts.get(b.slug) ?? 0) - (counts.get(a.slug) ?? 0) || a.slug.localeCompare(b.slug),
      )
      .slice(0, 8),
    categories: data.categories.filter(
      (category) =>
        category.slug === "ai" &&
        category.kind !== "group" &&
        data.entries.some(
          (entry) => entry.kind === category.kind && entry.category === category.slug,
        ),
    ),
  };
}
