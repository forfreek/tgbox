import { AuthenticatedSearch } from "./auth.ts";
import { type AnalyticsBindings, collectionEnabled } from "./bindings.ts";
import type { SearchLocale } from "./contracts.ts";
import { hmac } from "./identity.ts";
import { sampleSecurity } from "./security.ts";
import { writeSearch } from "./writer.ts";

/** Caller must already have authenticated the Telegram webhook. No HTTP entry here. */
export async function collectBotSearch(
  env: AnalyticsBindings,
  input: {
    telegramUserId: number;
    inlineQueryId: string;
    keyword: string;
    locale: SearchLocale;
    hasResults: boolean;
    now: number;
  },
) {
  if (!collectionEnabled(env, "bot") || !env.ANALYTICS_DB || !env.SEARCH_IDENTITY_SECRET) return;
  try {
    const secret = env.SEARCH_IDENTITY_SECRET;
    const digest = await hmac(secret, "bot-event", input.inlineQueryId);
    // Deterministic UUID-shaped event key gives webhook retries the same receipt.
    const eventId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    const auth = await AuthenticatedSearch.bot(secret, input.telegramUserId, input.now);
    const report = await writeSearch(
      {
        db: env.ANALYTICS_DB,
        secret,
        enabled: true,
        now: () => input.now,
        verifyResult: async () => input.hasResults,
      },
      {
        version: 1,
        eventId,
        keyword: input.keyword,
        locale: input.locale,
        trigger: "manual",
        reportedResult: input.hasResults ? "results" : "zero",
      },
      auth,
    );
    if (report.outcome.status === "duplicate")
      await sampleSecurity(env.ANALYTICS_DB, secret, "duplicate", input.now);
    else if (
      report.outcome.status === "rejected" &&
      (report.outcome.reason === "limited" || report.outcome.reason === "private")
    )
      await sampleSecurity(env.ANALYTICS_DB, secret, report.outcome.reason, input.now);
  } catch {
    console.warn("search-analytics", "bot");
  }
}
