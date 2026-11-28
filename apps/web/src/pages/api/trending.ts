import { env } from "cloudflare:workers";
import type { PublicationCache, PublicationDatabase } from "@tgbox/search-analytics";
import { HARD_LIMITS, hmac, readPublishedSearches } from "@tgbox/search-analytics";
import type { APIRoute } from "astro";

export const prerender = false;
type Bindings = {
  ANALYTICS_DB?: PublicationDatabase;
  PUBLIC_CACHE?: PublicationCache;
  SEARCH_PUBLICATION_ENABLED?: string;
  SEARCH_IDENTITY_SECRET?: string;
  SEARCH_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
};
export async function trendingResponse(bindings: Bindings, request: Request) {
  let permitted = false;
  if (
    bindings.SEARCH_PUBLICATION_ENABLED === "1" &&
    bindings.SEARCH_RATE_LIMITER &&
    (bindings.SEARCH_IDENTITY_SECRET?.length ?? 0) >= HARD_LIMITS.secretMinCharacters
  ) {
    try {
      const ip = request.headers.get("CF-Connecting-IP");
      if (ip && ip.length <= 64)
        permitted = (
          await bindings.SEARCH_RATE_LIMITER.limit({
            key: await hmac(bindings.SEARCH_IDENTITY_SECRET ?? "", "trending-ip", ip),
          })
        ).success;
    } catch {
      console.warn("search-analytics", "trending-edge");
    }
  }
  const payload =
    permitted && bindings.ANALYTICS_DB && bindings.PUBLIC_CACHE
      ? await readPublishedSearches(
          bindings.ANALYTICS_DB,
          bindings.PUBLIC_CACHE,
          bindings.SEARCH_PUBLICATION_ENABLED === "1",
        )
      : null;
  const body = payload
    ? {
        version: payload.version,
        type: payload.type,
        generatedAt: payload.generatedAt,
        window: payload.window,
        items: payload.items,
      }
    : { version: 1, type: "unavailable", items: [] };
  return Response.json(body, {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
export const GET: APIRoute = ({ request }) => trendingResponse(env, request);
