import type { Actor } from "@tgbox/core";
import {
  changeSearchAdmin,
  hmac,
  readSearchAdmin,
  SearchAdminError,
} from "@tgbox/search-analytics";
import { type AdminSearchCommand, AdminSearchQuery } from "@tgbox/search-analytics/admin-contracts";
import { z } from "zod";
import { refreshAdminSearch, type SearchAdminRuntime } from "./search-publication.ts";

export type SearchRuntime = SearchAdminRuntime & { SETTINGS_KEY: string };
export function searchWriteOriginAllowed(request: Request) {
  return request.method === "POST" && request.headers.get("Origin") === new URL(request.url).origin;
}
export async function searchAdminRead(env: SearchRuntime, raw: unknown, now = Date.now()) {
  if (!env.ANALYTICS_DB) throw new Error("搜索统计数据库未配置");
  try {
    return await readSearchAdmin(
      env.ANALYTICS_DB,
      env.PUBLIC_CACHE,
      AdminSearchQuery.parse(raw),
      now,
    );
  } catch (error) {
    if (error instanceof SearchAdminError) throw error;
    console.warn("search-analytics", "admin-read");
    throw new Error("搜索分析读取失败，请检查筛选范围或统计数据库状态");
  }
}
export async function searchAdminCommand(
  env: SearchRuntime,
  data: AdminSearchCommand,
  actor: Actor,
  waitUntil: (promise: Promise<unknown>) => void,
) {
  if (!env.ANALYTICS_DB) throw new Error("搜索统计数据库未配置");
  if (data.action === "refresh" && (!env.PUBLIC_CACHE || env.SEARCH_JOBS_ENABLED !== "1"))
    throw new Error("榜单任务部署开关或缓存尚未就绪");
  const identity = await hmac(env.SETTINGS_KEY, "search-admin-audit", actor);
  let result: Awaited<ReturnType<typeof changeSearchAdmin>>;
  try {
    result = await changeSearchAdmin(env.ANALYTICS_DB, data, identity, Date.now());
  } catch (error) {
    if (error instanceof SearchAdminError) throw error;
    if (error instanceof z.ZodError) throw new Error("搜索分析参数无效");
    console.warn("search-analytics", "admin-write");
    throw new Error("搜索分析保存失败，未请求刷新，请重新读取配置");
  }
  if (data.action === "refresh") {
    // A connected manual request can await the full job; HTTP waitUntil has a shorter lifetime.
    try {
      const refreshed = await refreshAdminSearch(env, "manual");
      return {
        saved: true,
        refresh: refreshed.status === "succeeded" ? ("completed" as const) : refreshed.status,
        usage: result.usage,
      };
    } catch {
      console.warn("search-analytics", "admin-refresh");
      return { saved: true, refresh: "failed" as const, usage: result.usage };
    }
  }
  // Immediate D1 version invalidation is durable; background regeneration may fail or be interrupted.
  waitUntil(
    refreshAdminSearch(env, "manual")
      .then((r) => {
        if (r.status !== "succeeded" && r.status !== "disabled")
          console.warn("search-analytics", "admin-refresh");
      })
      .catch(() => console.warn("search-analytics", "admin-refresh")),
  );
  return {
    saved: true,
    refresh:
      env.SEARCH_JOBS_ENABLED === "1" && env.PUBLIC_CACHE
        ? ("scheduled" as const)
        : ("disabled" as const),
    usage: result.usage,
  };
}
