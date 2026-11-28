import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminSearchCommand, AdminSearchQuery } from "@tgbox/search-analytics/admin-contracts";
import { useRef, useState } from "react";
import { Button } from "@/components/coss/ui/button.tsx";
import { Input } from "@/components/coss/ui/input.tsx";
import { $searchAnalyticsCommand, searchAnalyticsOptions } from "@/functions/search-analytics.ts";
import { AnalyticsView } from "./analytics-view.tsx";
import { control, sourceLabels, statusLabels } from "./presentation.ts";

const views = [
  ["overview", "搜索概览"],
  ["keywords", "关键词统计"],
  ["zero", "零结果搜索"],
  ["publication", "热搜管理"],
  ["rules", "内容审核与规则"],
  ["security", "安全统计"],
  ["settings", "功能设置"],
  ["jobs", "任务日志"],
] as const;
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(Date.now());

export function SearchAnalyticsPage() {
  const client = useQueryClient();
  const [query, setQuery] = useState<AdminSearchQuery>(() =>
    AdminSearchQuery.parse({ version: 1, view: "overview", from: today(), to: today() }),
  );
  const [notice, setNotice] = useState("");
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const read = useQuery(searchAnalyticsOptions(query));
  const report = (message: string) => {
    setNotice(message);
    noticeRef.current?.focus();
  };
  const mutation = useMutation({
    mutationFn: (data: AdminSearchCommand) => $searchAnalyticsCommand({ data }),
    onSuccess: (r) =>
      report(
        r.refresh === "scheduled"
          ? "已保存并请求后台刷新。请查看任务日志确认结果；审核变更已安全失效旧榜单。"
          : r.refresh === "completed"
            ? "已保存刷新记录，榜单任务执行完成。"
            : r.refresh === "busy"
              ? "已保存刷新请求，已有任务执行中；请查看任务日志，稍后重试。"
              : r.refresh === "failed"
                ? "已保存刷新请求，但任务失败。请查看任务日志和运行说明后重试。"
                : "已保存；榜单任务部署开关未开启，旧榜单已安全失效。",
      ),
    onError: (e) => report(e.message),
    onSettled: () => client.invalidateQueries({ queryKey: ["searchAnalytics"] }),
  });
  const save = (raw: unknown) => {
    const parsed = AdminSearchCommand.safeParse(raw);
    if (!parsed.success) {
      report(
        `请检查配置、限额及留存范围：${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("；")}`,
      );
      return;
    }
    mutation.mutate(parsed.data);
  };
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        统计日期：北京时间。匿名身份不等于真人；Telegram 300
        秒缓存直接返回的查询无法完整采集。客户端结果状态仅为遥测，榜单另需服务端验证。
      </p>
      <nav aria-label="搜索分析视图" className="flex flex-wrap gap-2">
        {views.map(([view, label]) => (
          <Button
            key={view}
            type="button"
            variant={query.view === view ? "default" : "outline"}
            aria-pressed={query.view === view}
            onClick={() => {
              setNotice("");
              setQuery((q) => ({ ...q, view, page: 0 }));
            }}
          >
            {label}
          </Button>
        ))}
      </nav>
      <p ref={noticeRef} tabIndex={-1} role="status" className="whitespace-pre-wrap text-sm">
        {notice}
      </p>
      <search>
        <form
          key={`${query.view}:${query.from}:${query.to}`}
          aria-label="统计筛选"
          method="get"
          action="/search-analytics"
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const next = AdminSearchQuery.safeParse({
              ...query,
              from: form.get("from"),
              to: form.get("to"),
              search: form.get("search"),
              source: form.get("source"),
              locale: form.get("locale"),
              sort: form.get("sort"),
              ruleStatus: form.get("ruleStatus"),
              page: 0,
            });
            if (next.success) setQuery(next.data);
            else report("请检查筛选条件");
          }}
        >
          <label htmlFor="search-filter-from" className="grid gap-1">
            开始日期
            <Input
              id="search-filter-from"
              name="from"
              type="date"
              required
              defaultValue={query.from}
            />
          </label>
          <label htmlFor="search-filter-to" className="grid gap-1">
            结束日期
            <Input id="search-filter-to" name="to" type="date" required defaultValue={query.to} />
          </label>
          <label htmlFor="search-filter-query" className="grid gap-1">
            关键词（2至64字）
            <Input
              id="search-filter-query"
              name="search"
              type="search"
              maxLength={128}
              defaultValue={query.search}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </label>
          <label className="grid gap-1">
            来源
            <select name="source" defaultValue={query.source} className={control}>
              <option value="all">全部来源</option>
              {Object.entries(sourceLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            语言
            <select name="locale" defaultValue={query.locale} className={control}>
              <option value="all">全部语言</option>
              <option value="zh">简中</option>
              <option value="zh-hant">繁中</option>
              <option value="en">英文</option>
            </select>
          </label>
          <label className="grid gap-1">
            关键词排序
            <select name="sort" defaultValue={query.sort} className={control}>
              <option value="searches">搜索次数</option>
              <option value="zero_results">零结果次数</option>
              <option value="keyword">关键词</option>
            </select>
          </label>
          <label className="grid gap-1">
            规则状态
            <select name="ruleStatus" defaultValue={query.ruleStatus} className={control}>
              <option value="all">全部规则</option>
              {["blacklist", "hidden", "pending", "approved"].map((k) => (
                <option key={k} value={k}>
                  {statusLabels[k]}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">应用筛选</Button>
          <Button type="button" variant="outline" onClick={() => read.refetch()}>
            重新读取
          </Button>
        </form>
      </search>
      <p className="text-xs text-muted-foreground">
        日期用于趋势、关键词、安全与任务日志；来源、语言和关键词排序用于关键词列表，规则状态用于规则列表。概览卡片使用固定周期。所有查询最多90天，每页25项。
      </p>
      {read.isPending ? (
        <p role="status">正在读取搜索分析…</p>
      ) : read.isError ? (
        <p role="alert">读取失败：{read.error.message}。统计数据库未就绪不影响正常搜索。</p>
      ) : (
        <AnalyticsView data={read.data} busy={mutation.isPending} save={save} report={report} />
      )}
      {read.data && typeof read.data.total === "number" && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={query.page === 0 || read.isFetching}
            onClick={() => setQuery((q) => ({ ...q, page: q.page - 1 }))}
          >
            上一页
          </Button>
          <span>
            第 {query.page + 1} 页，
            {read.data.kind === "jobs"
              ? `较长列表共 ${read.data.total} 项`
              : `共 ${read.data.total} 项`}
          </span>
          <Button
            type="button"
            variant="outline"
            disabled={
              (query.page + 1) * query.size >= read.data.total ||
              query.page >= 999 ||
              read.isFetching
            }
            onClick={() => setQuery((q) => ({ ...q, page: q.page + 1 }))}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
