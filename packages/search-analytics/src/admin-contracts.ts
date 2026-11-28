import { z } from "zod";
import { HARD_LIMITS, SearchSettings } from "./config.ts";

const date = z.iso.date();
export const AdminSearchQuery = z.strictObject({
  version: z.literal(1),
  view: z.enum([
    "overview",
    "keywords",
    "zero",
    "publication",
    "rules",
    "security",
    "settings",
    "jobs",
  ]),
  from: date,
  to: date,
  source: z.enum(["all", "website", "miniapp", "bot"]).default("all"),
  locale: z.enum(["all", "zh", "zh-hant", "en"]).default("all"),
  search: z.string().max(128).default(""),
  sort: z.enum(["searches", "zero_results", "keyword"]).default("searches"),
  page: z.number().int().min(0).max(999).default(0),
  size: z.number().int().min(1).max(HARD_LIMITS.queryPage).default(25),
  ruleStatus: z.enum(["all", "blacklist", "hidden", "pending", "approved"]).default("all"),
});
export type AdminSearchQuery = z.infer<typeof AdminSearchQuery>;
export const AdminSearchCommand = z.discriminatedUnion("action", [
  z.strictObject({
    version: z.literal(1),
    action: z.literal("settings"),
    expectedVersion: z.number().int().positive(),
    value: SearchSettings,
  }),
  z.strictObject({
    version: z.literal(1),
    action: z.literal("rule"),
    id: z.number().int().nonnegative(),
    expectedRevision: z.number().int().nonnegative(),
    pattern: z.string().min(2).max(128),
    match: z.enum(["exact", "contains"]),
    status: z.enum(["blacklist", "hidden", "pending", "approved"]),
    enabled: z.boolean(),
  }),
  z.strictObject({
    version: z.literal(1),
    action: z.literal("refresh"),
    expectedVersion: z.number().int().positive(),
  }),
]);
export type AdminSearchCommand = z.infer<typeof AdminSearchCommand>;
