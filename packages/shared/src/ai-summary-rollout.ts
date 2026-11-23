/** Empty or invalid means disabled; a rollout never implicitly includes the whole site. */
export const SUMMARY_ROLLOUT_LIMIT = 50;
export function summaryEntryIds(value: string | undefined): number[] {
  if (!value?.trim()) return [];
  const parts = value.split(",").map((s) => s.trim());
  if (parts.length > SUMMARY_ROLLOUT_LIMIT || parts.some((s) => !/^\d+$/.test(s))) return [];
  const ids = parts.map(Number);
  return ids.every((id) => Number.isSafeInteger(id) && id > 0) ? [...new Set(ids)] : [];
}
