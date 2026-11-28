import server from "@tanstack/react-start/server-entry";
import { SEARCH_CRON } from "@tgbox/search-analytics";
import { refreshAdminSearch, type SearchAdminRuntime } from "./server/search-publication.ts";

type Runtime = Env & SearchAdminRuntime;
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
    ctx.waitUntil(refreshAdminSearch(env, "cron"));
  },
} satisfies ExportedHandler<Runtime>;
