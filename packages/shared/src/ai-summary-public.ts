import { z } from "zod";
export const AI_SUMMARY_PUBLIC_VERSION = 1;
const chinese = z
  .string()
  .trim()
  .min(1)
  .refine((s) => s.length <= 240 && Array.from(s).length <= 120);
export const PublicSummaryText = z.strictObject({
  zh: chinese,
  hant: chinese,
  en: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((s) => s.split(/\s+/u).length <= 90),
});
export const PublicSummary = PublicSummaryText.extend({
  fingerprint: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  contractVersion: z.literal(AI_SUMMARY_PUBLIC_VERSION),
});
