import server from "@tanstack/react-start/server-entry";
import {
  HARD_LIMITS,
  type PublicationCache,
  type PublicationDatabase,
  refreshSearchPublication,
  SEARCH_CRON,
} from "@tgbox/search-analytics";

type Runtime = Env & {
  ANALYTICS_DB?: PublicationDatabase;
  PUBLIC_CACHE?: PublicationCache;
  SEARCH_JOBS_ENABLED?: string;
};
export default {
  fetch(request: Request) {
    return server.fetch(request);
  },
  scheduled(controller, env, ctx) {
    if (
      controller.cron !== SEARCH_CRON ||
      env.SEARCH_JOBS_ENABLED !== "1" ||
      !env.ANALYTICS_DB ||
      !env.PUBLIC_CACHE
    )
      return;
    ctx.waitUntil(
      refreshSearchPublication(
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
        "cron",
      ),
    );
  },
} satisfies ExportedHandler<Runtime>;
