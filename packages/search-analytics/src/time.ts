export const MINUTE_MS = 60000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
export const SEARCH_CRON = "5 16 * * *";
export function beijingDay(now: number) {
  if (!Number.isSafeInteger(now) || now < 0) throw new RangeError("Invalid time");
  return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
export function previousCompleteWindow(now: number, days = 7) {
  if (!Number.isInteger(days) || days < 1 || days > 7) throw new RangeError("Invalid window");
  const today = beijingDay(now);
  const end = Date.parse(`${today}T00:00:00+08:00`);
  return {
    from: beijingDay(end - days * DAY_MS),
    to: beijingDay(end - DAY_MS),
    endExclusive: today,
  };
}
