import { HARD_LIMITS, type SearchSettings } from "./config.ts";
import type { AnalyticsDb } from "./runtime.ts";
import { previousCompleteWindow } from "./time.ts";

export type SearchRank = { keyword: string; identities: number; score: number };
/** The same global distinct/latest-day algorithm serves publication and bounded admin pages. */
export function readSearchRanks(
  db: AnalyticsDb,
  settings: SearchSettings,
  now: number,
  keywords?: string[],
) {
  if (keywords && (keywords.length === 0 || keywords.length > HARD_LIMITS.rankingPage))
    throw new RangeError("Invalid ranking page");
  const window = previousCompleteWindow(now, settings.windowDays);
  const selection = keywords ? ` AND keyword IN (${keywords.map(() => "?").join(",")})` : "";
  return db
    .prepare(`WITH latest AS (SELECT keyword,identity,MAX(day) day FROM search_daily_identities WHERE eligible=1 AND day>=? AND day<=?${selection} GROUP BY keyword,identity),
    scores AS MATERIALIZED (SELECT keyword,COUNT(*) identities,ROUND(SUM(CASE WHEN day=? THEN ? WHEN day>=date(?,'-2 days') THEN ? ELSE ? END),6) score FROM latest GROUP BY keyword HAVING COUNT(*)>=?)
    SELECT keyword,identities,score FROM scores WHERE NOT EXISTS(SELECT 1 FROM search_keyword_rules r WHERE r.enabled=1 AND r.status<>'approved' AND (r.match_mode='exact' AND r.pattern=scores.keyword OR r.match_mode='contains' AND instr(scores.keyword,r.pattern)>0)) ORDER BY score DESC,identities DESC,keyword COLLATE BINARY ASC LIMIT ?`)
    .bind(
      window.from,
      window.to,
      ...(keywords ?? []),
      window.to,
      settings.weights[0],
      window.to,
      settings.weights[1],
      settings.weights[2],
      settings.minimumIdentities,
      keywords?.length ?? HARD_LIMITS.rules + settings.rankingSize,
    )
    .all<SearchRank>();
}
