import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { searchAnalyticsApi } from "@/lib/search-analytics-api.ts";
export const prerender = false;
export const ALL: APIRoute = ({ request }) =>
  searchAnalyticsApi(request, env, "website", "session");
