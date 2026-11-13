import { z } from "zod";
import { ActivityTier, EntryKind } from "./domain.ts";

/** Shared JavaScript rounding for snapshot and D1-prepared rankings. */
export function growthFromBaseline(members: number | null, baseline: number | null) {
  if (members === null || baseline === null) return null;
  const growth = members - baseline;
  return { growth, growthPct: baseline > 0 ? Math.round((growth / baseline) * 1000) / 10 : null };
}

// Contract for the static `/data/rankings.json` built by apps/web and read by the bot's daily digest.
export const RankItem = z.object({
  username: z.string(),
  kind: EntryKind,
  title: z.string(),
  members: z.number().nullable(),
  growth: z.number().nullable(),
  growthPct: z.number().nullable(),
  listedAt: z.string(),
  activityTier: ActivityTier.nullable(),
});
export type RankItem = z.infer<typeof RankItem>;

export const RankingsData = z.object({
  generatedAt: z.string(),
  weeklyGrowth: z.array(RankItem),
  monthlyGrowth: z.array(RankItem),
  newest: z.array(RankItem),
  active: z.array(RankItem),
});
export type RankingsData = z.infer<typeof RankingsData>;
