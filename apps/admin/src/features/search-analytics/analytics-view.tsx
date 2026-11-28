import { Button } from "@/components/coss/ui/button.tsx";
import { Card } from "@/components/coss/ui/card.tsx";
import type { SearchAdminView } from "@/functions/search-analytics.ts";
import { AnalyticsTable } from "./analytics-table.tsx";
import { sourceLabels, statusLabels, time } from "./presentation.ts";
import { RuleForm } from "./rule-form.tsx";
import { SettingsForm } from "./settings-form.tsx";
export function AnalyticsView({
  data,
  busy,
  save,
  report,
}: {
  data: SearchAdminView;
  busy: boolean;
  save: (raw: unknown) => void;
  report: (message: string) => void;
}) {
  if (data.kind === "overview")
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {data.cards.map((c) => (
            <Card key={c.label} className="gap-2 p-4">
              <h2 className="font-semibold">{c.label}</h2>
              <p className="text-3xl tabular-nums">{c.searches.toLocaleString()}</p>
              <p className="text-sm">
                有效搜索 · 零结果率{" "}
                {c.searches ? ((c.zeroResults / c.searches) * 100).toFixed(1) : "0"}%
              </p>
              <p className="text-sm">
                {c.identities === null
                  ? `${c.identityDays} 身份日（非去重用户）`
                  : `${c.identities} 独立搜索身份`}
              </p>
              <p className="text-sm">{c.keywords} 个关键词</p>
              <p className="text-xs text-muted-foreground">
                {c.retainedFrom} 至 {c.to}
              </p>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          聚合可用起点 {data.aggregatesStart}；身份去重起点 {data.identityStart}
          。更早数据可能已清理；身份日不能相加为跨日独立用户。
        </p>
        <AnalyticsTable
          caption="搜索趋势（筛选日期）"
          headers={["日期", "搜索次数", "零结果", "身份日"]}
          rows={data.daily.map((d) => ({
            key: d.day,
            cells: [
              d.day,
              <div key="trend" className="flex items-center gap-2">
                <meter
                  min={0}
                  max={Math.max(1, ...data.daily.map((r) => r.searches))}
                  value={d.searches}
                  aria-label={`${d.day} 搜索次数`}
                />
                {d.searches}
              </div>,
              d.zero_results,
              d.identity_days,
            ],
          }))}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <AnalyticsTable
            caption="来源分布"
            headers={["来源", "搜索次数"]}
            rows={data.sources.map((r) => ({
              key: r.source,
              cells: [sourceLabels[r.source] ?? r.source, r.searches],
            }))}
          />
          <AnalyticsTable
            caption="语言分布"
            headers={["语言", "搜索次数"]}
            rows={data.languages.map((r) => ({ key: r.locale, cells: [r.locale, r.searches] }))}
          />
        </div>
      </>
    );
  if (data.kind === "keywords")
    return (
      <>
        <p className="text-sm text-muted-foreground">
          聚合起点 {data.retainedFrom}；超出身份留存范围（{data.identityStart}起）显示
          —。每日榜单贡献合计不等于7天独立身份。榜单资格得分使用全球 {data.rankingWindow.from} 至{" "}
          {data.rankingWindow.to}{" "}
          的完整日数据，与筛选语言/来源无关；不满足门槛或审核要求为0。已发布得分仅对应当前榜单快照。
        </p>
        <AnalyticsTable
          caption="关键词统计"
          headers={[
            "关键词",
            "搜索",
            "独立身份",
            "零结果",
            "热搜点击",
            "推荐点击",
            "预填",
            "服务端验证",
            "每日贡献合计",
            "榜单资格身份",
            "榜单资格得分",
            "已发布得分",
            "审核",
          ]}
          rows={data.rows.map((r) => ({
            key: r.keyword,
            cells: [
              r.keyword,
              r.searches,
              r.identities ?? "—",
              r.zero_results,
              r.trending_clicks,
              r.recommended_clicks,
              r.prefill_searches,
              r.verified_searches,
              r.eligible_identities,
              r.ranking_identities,
              r.ranking_score,
              r.published_score ?? "—",
              statusLabels[r.review_status] ?? r.review_status,
            ],
          }))}
        />
      </>
    );
  if (data.kind === "publication")
    return (
      <Card className="gap-4 p-5">
        <h2 className="font-semibold">当前公开榜单</h2>
        <p>
          {data.payload
            ? `${data.payload.type === "trending" ? "真实热门搜索" : "推荐搜索"} · 生成于 ${time(data.payload.generatedAt)} · ${data.payload.window.from} 至 ${data.payload.window.to}`
            : "无可用权威榜单（关闭、缺失、版本失效或依赖异常）。不会恢复旧榜单。"}
        </p>
        <AnalyticsTable
          caption="当前榜单与私有得分"
          headers={["关键词", "排名", "独立身份", "加权得分"]}
          rows={(data.payload?.items ?? []).map((r) => ({
            key: r.keyword,
            cells: [
              r.keyword,
              r.rank,
              data.scores.find((s) => s.keyword === r.keyword)?.identities ?? "—",
              data.scores.find((s) => s.keyword === r.keyword)?.score ?? "—",
            ],
          }))}
        />
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            save({ version: 1, action: "refresh", expectedVersion: data.settingsVersion })
          }
        >
          手动刷新榜单
        </Button>
        <p className="text-xs text-muted-foreground">
          每日北京时间00:05运行；手动刷新与Cron共用租约，忙碌时不会并发覆盖。任务受部署开关约束，结果请查任务日志。
        </p>
      </Card>
    );
  if (data.kind === "rules")
    return (
      <>
        <RuleForm key="new" busy={busy} save={save} />
        <p className="text-sm text-muted-foreground">
          黑名单阻止后续统计；隐藏词继续统计但不公开。批准不绕过安全过滤、最低门槛，也不追补原先不具资格的贡献。所有匹配规则共同生效，批准不能覆盖其他禁止规则。审核修改会先失效旧榜单；全球KV同步延迟不能绕过D1校验。
        </p>
        <div className="grid gap-4">
          {data.rows.map((r) => (
            <RuleForm key={`${r.id}:${r.revision}`} row={r} busy={busy} save={save} />
          ))}
        </div>
      </>
    );
  if (data.kind === "settings")
    return (
      <SettingsForm
        key={data.settings.version}
        settings={data.settings}
        busy={busy}
        save={save}
        report={report}
      />
    );
  if (data.kind === "security") {
    const labels: Record<string, string> = {
      limited: "限流拒绝",
      duplicate: "重复事件",
      turnstile_success: "Turnstile成功",
      turnstile_failure: "Turnstile失败",
      invalid_identity: "无效身份",
      private: "敏感词过滤",
      anomaly: "异常增长",
    };
    return (
      <>
        <p>当前启用待审核规则：{data.pendingRules}</p>
        <p className="text-sm text-muted-foreground">
          拒绝等指标按1/{data.sampleDenominator}采样，每天最多{data.sampleDailyCap}
          条安全样本；边缘拒绝未进入D1，不包含在此。不能当作全部攻击次数，也不按采样率直接外推。
        </p>
        <AnalyticsTable
          caption="安全指标"
          headers={["原因", "记录数", "口径"]}
          rows={data.rows.map((r) => ({
            key: r.reason,
            cells: [
              labels[r.reason] ?? r.reason,
              r.count,
              r.sampled ? "有日封顶的采样记录" : "已持久化计数",
            ],
          }))}
        />
      </>
    );
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">
        行数为成功SQL的meta观测，可能不包含失败查询及最终日志写入，不等于完整账单。published=是且状态失败表示发布成功后清理等步骤失败，正常榜单保留。
      </p>
      <p>
        任务共{data.jobTotal}条，管理审计共{data.auditTotal}条；下方分页分别应用于两个列表。
      </p>
      <AnalyticsTable
        caption="任务日志"
        headers={[
          "任务",
          "入口",
          "状态",
          "开始（北京）",
          "耗时ms",
          "处理词",
          "读取行",
          "写入行",
          "已发布",
          "失败原因",
        ]}
        rows={data.rows.map((r) => ({
          key: r.run_id,
          cells: [
            r.run_id,
            r.kind === "cron" ? "定时" : "手动",
            statusLabels[r.status] ?? r.status,
            time(r.started_at),
            r.duration_ms ?? "—",
            r.processed,
            r.rows_read,
            r.rows_written,
            r.published ? "是" : "否",
            r.reason ?? "—",
          ],
        }))}
      />
      <AnalyticsTable
        caption="搜索管理操作审计"
        headers={["审计编号", "操作", "目标", "时间（北京）"]}
        rows={data.audits.map((r) => ({
          key: String(r.id),
          cells: [
            r.id,
            r.action === "rule" ? "修改规则" : r.action === "settings" ? "修改设置" : "请求刷新",
            r.target,
            time(r.created_at),
          ],
        }))}
      />
    </>
  );
}
