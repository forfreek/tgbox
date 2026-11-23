import { PublicSummaryText, type SiteLocale } from "@tgbox/shared";
/** Rendering is separately gated; a partial/invalid language tuple never renders. */
export function approvedSummaryText(
  raw: unknown,
  locale: SiteLocale,
  enabled: boolean,
): string | null {
  if (!enabled) return null;
  const result = PublicSummaryText.safeParse(raw);
  if (!result.success) return null;
  return locale === "en"
    ? result.data.en
    : locale === "zh-hant"
      ? result.data.hant
      : result.data.zh;
}
