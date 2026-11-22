import { env } from "cloudflare:workers";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { summaryAdminDetail } from "@tgbox/db";
import { z } from "zod";
import {
  SummaryBatch,
  SummaryCommand,
  SummaryList,
  summaryBatch,
  summaryCommand,
  summaryOverview,
} from "@/server/ai-summary.ts";
import { adminMiddleware } from "@/server/middleware.ts";

const $overview = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(SummaryList)
  .handler(({ data, context }) => summaryOverview(context.core, data));
const $detail = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(z.object({ entryId: z.number().int().positive() }))
  .handler(({ data, context }) => summaryAdminDetail(context.core.db, data.entryId));
export const summaryOverviewOptions = (
  filter: z.infer<typeof SummaryList>["filter"],
  before = Number.MAX_SAFE_INTEGER,
) =>
  queryOptions({
    queryKey: ["aiSummary", filter, before],
    queryFn: ({ signal }) => $overview({ data: { filter, before }, signal }),
    staleTime: 30_000,
  });
export const summaryDetailOptions = (entryId: number) =>
  queryOptions({
    queryKey: ["aiSummary", "detail", entryId],
    queryFn: ({ signal }) => $detail({ data: { entryId }, signal }),
    staleTime: 30_000,
  });
export const $summaryBatch = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(SummaryBatch)
  .handler(({ data, context }) => summaryBatch(context.core, env.MEDIA, data, context.auth.actor));
export const $summaryCommand = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(SummaryCommand)
  .handler(({ data, context }) =>
    summaryCommand(context.core, env.MEDIA, data, context.auth.actor),
  );
export type SummaryOverview = Awaited<ReturnType<typeof $overview>>;
export type SummaryDetail = Awaited<ReturnType<typeof $detail>>;
export type SummaryAction = z.infer<typeof SummaryCommand>;
