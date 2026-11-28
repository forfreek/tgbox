import {
  HARD_LIMITS,
  type PublicationCache,
  type PublicationDatabase,
  refreshSearchPublication,
} from "@tgbox/search-analytics";

export type SearchAdminRuntime = {
  DB: Pick<D1Database, "prepare">;
  ANALYTICS_DB?: PublicationDatabase;
  PUBLIC_CACHE?: PublicationCache;
  SEARCH_JOBS_ENABLED?: string;
};
/** One adapter supplies core recommendations to cron and authenticated manual refresh. */
export function refreshAdminSearch(env: SearchAdminRuntime, kind: "cron" | "manual") {
  if (!env.ANALYTICS_DB || !env.PUBLIC_CACHE || env.SEARCH_JOBS_ENABLED !== "1")
    return Promise.resolve({ status: "disabled" as const });
  return refreshSearchPublication(
    {
      db: env.ANALYTICS_DB,
      cache: env.PUBLIC_CACHE,
      enabled: true,
      now: Date.now,
      recommended: async () => {
        const rows = await env.DB.prepare(
          "SELECT e.title FROM entries e LEFT JOIN entry_stats s ON s.entry_id=e.id WHERE e.status='approved' ORDER BY s.members DESC,e.id ASC LIMIT ?",
        )
          .bind(HARD_LIMITS.recommendationCandidates)
          .all<{ title: string }>();
        return rows.results.map((r) => r.title);
      },
    },
    kind,
  );
}
