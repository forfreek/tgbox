import { summaryEntryIds } from "@tgbox/shared";

/** Global generation requires an explicit opt-in; missing/invalid selected IDs stay closed. */
export function summaryGenerationScope(
  mode: string | undefined,
  ids: string | undefined,
): readonly number[] | undefined {
  if (mode === "all") return undefined;
  if (mode === undefined || mode === "selected") return summaryEntryIds(ids);
  return [];
}
