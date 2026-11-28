import { z } from "zod";

export const SEARCH_EVENT_VERSION = 1;
export const SearchSource = z.enum(["website", "miniapp", "bot"]);
export const SearchTrigger = z.enum(["manual", "trending", "recommended", "prefill"]);
export const SearchLocale = z.enum(["zh", "zh-hant", "en"]);
export const ReportedResult = z.enum(["results", "zero"]);

/** Wire input deliberately has no source or identity: adapters authenticate those. */
export const SearchEvent = z.strictObject({
  version: z.literal(SEARCH_EVENT_VERSION),
  eventId: z.uuid(),
  keyword: z.string().refine((text) => {
    const length = [...text].length;
    return length >= 2 && length <= 64;
  }, "Keyword must contain 2 to 64 Unicode codepoints"),
  trigger: SearchTrigger,
  reportedResult: ReportedResult,
  locale: SearchLocale,
});
export type SearchEvent = z.infer<typeof SearchEvent>;
export type SearchSource = z.infer<typeof SearchSource>;
export type SearchTrigger = z.infer<typeof SearchTrigger>;
export type SearchLocale = z.infer<typeof SearchLocale>;

export type WriteOutcome =
  | { status: "accepted" | "duplicate" }
  | {
      status: "rejected";
      reason: "disabled" | "invalid" | "private" | "blocked" | "limited" | "conflict";
    }
  | { status: "unavailable" };

/** One replacement point for a future writer; no queue infrastructure in v1. */
export interface SearchEventWriter<TAuthenticated> {
  write(event: SearchEvent, authenticated: TAuthenticated): Promise<WriteOutcome>;
}
