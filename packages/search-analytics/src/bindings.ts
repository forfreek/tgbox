import type { AnalyticsDb } from "./runtime.ts";

/** Optional until resources are explicitly provisioned. Missing capability means stop collecting. */
export type AnalyticsBindings = {
  ANALYTICS_DB?: AnalyticsDb;
  SEARCH_IDENTITY_SECRET?: string;
  SEARCH_SESSION_SECRET?: string;
  SEARCH_ANALYTICS_ENABLED?: string;
  SEARCH_WEBSITE_ENABLED?: string;
  SEARCH_MINIAPP_ENABLED?: string;
  SEARCH_BOT_ENABLED?: string;
  SEARCH_TURNSTILE_ENABLED?: string;
  SEARCH_ALLOWED_ORIGINS?: string;
  SEARCH_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  SEARCH_TURNSTILE_SITE_KEY?: string;
  SEARCH_TURNSTILE_SECRET?: string;
};
export function collectionEnabled(env: AnalyticsBindings, source: "website" | "miniapp" | "bot") {
  const flag = {
    website: env.SEARCH_WEBSITE_ENABLED,
    miniapp: env.SEARCH_MINIAPP_ENABLED,
    bot: env.SEARCH_BOT_ENABLED,
  }[source];
  return (
    env.SEARCH_ANALYTICS_ENABLED === "1" &&
    flag === "1" &&
    !!env.ANALYTICS_DB &&
    (env.SEARCH_IDENTITY_SECRET?.length ?? 0) >= 32
  );
}
