import { env, waitUntil } from "cloudflare:workers";
import { queryOptions } from "@tanstack/react-query";
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader, setResponseStatus } from "@tanstack/react-start/server";
import { AdminSearchCommand, AdminSearchQuery } from "@tgbox/search-analytics/admin-contracts";
import { adminMiddleware } from "@/server/middleware.ts";
import {
  type SearchRuntime,
  searchAdminCommand,
  searchAdminRead,
  searchWriteOriginAllowed,
} from "@/server/search-analytics.ts";

const runtime = (): Env & SearchRuntime => env;
const privateResponse = createMiddleware({ type: "function" }).server(async ({ next }) => {
  setResponseHeader("Cache-Control", "no-store");
  return next();
});
const writeGuard = createMiddleware({ type: "function" }).server(async ({ next }) => {
  if (!searchWriteOriginAllowed(getRequest())) {
    setResponseStatus(403);
    throw new Error("Forbidden origin");
  }
  return next();
});
export const $searchAnalytics = createServerFn({ method: "GET" })
  .middleware([privateResponse, adminMiddleware])
  .validator(AdminSearchQuery)
  .handler(({ data }) => searchAdminRead(runtime(), data));
export const $searchAnalyticsCommand = createServerFn({ method: "POST" })
  .middleware([privateResponse, adminMiddleware, writeGuard])
  .validator(AdminSearchCommand)
  .handler(({ data, context }) =>
    searchAdminCommand(runtime(), data, context.auth.actor, context.core.waitUntil ?? waitUntil),
  );
export const searchAnalyticsOptions = (data: AdminSearchQuery) =>
  queryOptions({
    queryKey: ["searchAnalytics", data],
    queryFn: ({ signal }) => $searchAnalytics({ data, signal }),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
export type SearchAdminView = Awaited<ReturnType<typeof $searchAnalytics>>;
