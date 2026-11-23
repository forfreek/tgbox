/** Empty means disabled, never an implicit all-site rollout. Invalid configuration fails closed. */
export function summaryEntryIds(value: string | undefined): number[] {
  if (!value?.trim()) return [];
  const parts = value.split(",").map((s) => s.trim());
  if (parts.length > 20 || parts.some((s) => !/^\d+$/.test(s))) return [];
  const ids = parts.map(Number);
  return ids.every((id) => Number.isSafeInteger(id) && id > 0) ? [...new Set(ids)] : [];
}
