import { MemberPoint } from "@tgbox/shared";

export const HISTORY_POINT_LIMIT = 4096;
export const HISTORY_BYTE_LIMIT = 1024 * 1024;
export type HistoryBaseline = { sampledAt: number; members: number; ordinal: number };

/** Preserve findLast(array order) for every cutoff, including unsorted and duplicate timestamps. */
export function normalizeHistory(value: unknown) {
  if (Array.isArray(value) && value.length > HISTORY_POINT_LIMIT)
    return {
      status: "oversized" as const,
      rawPoints: value.length,
      invalidTimes: 0,
      points: [] as HistoryBaseline[],
    };
  const parsed = MemberPoint.array().safeParse(value);
  if (!parsed.success)
    return {
      status: "invalid" as const,
      rawPoints: 0,
      invalidTimes: 0,
      points: [] as HistoryBaseline[],
    };
  const points: HistoryBaseline[] = [];
  let minimum = Infinity;
  let invalidTimes = 0;
  for (let ordinal = parsed.data.length - 1; ordinal >= 0; ordinal--) {
    const point = parsed.data[ordinal];
    if (!point) continue;
    const sampledAt = Date.parse(point.t);
    if (!Number.isFinite(sampledAt)) {
      invalidTimes++;
      continue;
    }
    // A later array element with an earlier/equal timestamp dominates this point at every cutoff.
    if (sampledAt < minimum) {
      points.push({ sampledAt, members: point.members, ordinal });
      minimum = sampledAt;
    }
  }
  points.reverse();
  return { status: "valid" as const, rawPoints: parsed.data.length, invalidTimes, points };
}
