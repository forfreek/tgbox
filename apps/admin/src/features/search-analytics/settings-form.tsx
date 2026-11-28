import { SearchSettings } from "@tgbox/search-analytics/config";
import { useId } from "react";
import { Button } from "@/components/coss/ui/button.tsx";
import { Card } from "@/components/coss/ui/card.tsx";
import { Input } from "@/components/coss/ui/input.tsx";
import type { SearchAdminView } from "@/functions/search-analytics.ts";
import { control } from "./presentation.ts";

const settingLabels: Record<keyof SearchSettings, string> = {
  enabled: "全局统计",
  website: "网站采集",
  miniapp: "Mini App采集",
  bot: "Bot采集",
  publication: "公开榜单",
  turnstile: "Turnstile",
  jobs: "每日任务",
  debounceMs: "统计防抖毫秒",
  ipPerMinute: "单IP每分钟",
  sessionPerHour: "会话每小时",
  sessionPerDay: "会话每天",
  telegramPerDay: "Telegram身份每天",
  dailyBudget: "全站每日有效事件预算",
  minimumIdentities: "最低上榜身份",
  rankingSize: "榜单数量",
  windowDays: "榜单完整日窗口",
  aggregateRetentionDays: "聚合保留天数",
  identityRetentionDays: "身份保留天数",
  sessionLifetimeSeconds: "会话有效秒数",
  trustedLifetimeSeconds: "挑战通过后可信秒数",
  sessionIssuesPerIpMinute: "单IP每分钟签发",
  sessionIssuesPerDay: "每日签发预算",
  securitySamplesPerDay: "每日安全样本上限",
  challengeAfterSearches: "达到搜索数触发挑战",
  anomalyIdentitiesPerMinute: "每分钟异常新身份阈值",
  challengeAfterSessionIssues: "达到签发数触发挑战",
  verificationsPerDay: "每日验证预算",
  verificationsPerIdentityMinute: "单身份每分钟验证",
  verificationsPerIpMinute: "单IP每分钟验证",
  cleanupBatch: "每批每表清理行数",
  challengePolicy: "挑战策略",
  weights: "时间权重（第1天 / 第2–3天 / 第4–7天）",
};
export function SettingsForm({
  settings,
  busy,
  save,
  report,
}: {
  settings: Extract<SearchAdminView, { kind: "settings" }>["settings"];
  busy: boolean;
  save: (raw: unknown) => void;
  report: (message: string) => void;
}) {
  const fieldId = useId();
  return (
    <Card className="gap-4 p-5">
      <h2 className="font-semibold">统一配置 · 版本 {settings.version}</h2>
      <p className="text-sm text-muted-foreground">
        数据库配置不能越过部署开关或缺失绑定。保存增加配置版本，旧榜单立即安全失效；新请求读取新配置。降低保留期将在后续清理永久删除旧数据，提高保留期不能恢复已清理记录。限额变更仅保存管理员本次输入，不自动扩额。
      </p>
      <form
        aria-label="搜索配置"
        method="post"
        action="/search-analytics"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const raw: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(settings.value))
            raw[key] =
              typeof value === "boolean"
                ? f.get(key) === "on"
                : typeof value === "number"
                  ? Number(f.get(key))
                  : key === "weights"
                    ? [0, 1, 2].map((i) => Number(f.get(`weight-${i}`)))
                    : f.get(key);
          const parsed = SearchSettings.safeParse(raw);
          if (!parsed.success) {
            report(parsed.error.issues.map((i) => `${i.path.join(".")}：${i.message}`).join("；"));
            return;
          }
          save({
            version: 1,
            action: "settings",
            expectedVersion: settings.version,
            value: parsed.data,
          });
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <legend className="mb-3 font-medium">功能与资源参数（服务端统一校验安全范围）</legend>
          {Object.entries(settings.value).map(([key, value]) => {
            const label = settingLabels[key as keyof SearchSettings];
            if (typeof value === "boolean")
              return (
                <label key={key} className="flex min-h-12 items-center gap-2">
                  <input name={key} type="checkbox" defaultChecked={value} />
                  {label}
                </label>
              );
            if (key === "weights")
              return (
                <fieldset key={key} className="grid grid-cols-3 gap-2">
                  <legend>{label}</legend>
                  {settings.value.weights.map((weight, i) => (
                    <label
                      key={`weight-${i}`}
                      htmlFor={`${fieldId}-weight-${i}`}
                      className="grid gap-1"
                    >
                      {i === 0 ? "第1天" : i === 1 ? "第2–3天" : "第4–7天"}
                      <Input
                        id={`${fieldId}-weight-${i}`}
                        name={`weight-${i}`}
                        type="number"
                        required
                        min={0}
                        max={1}
                        step="0.01"
                        defaultValue={weight}
                      />
                    </label>
                  ))}
                </fieldset>
              );
            if (typeof value === "number")
              return (
                <label key={key} htmlFor={`${fieldId}-${key}`} className="grid gap-1">
                  {label}
                  <Input
                    id={`${fieldId}-${key}`}
                    name={key}
                    type="number"
                    required
                    step="1"
                    defaultValue={value}
                  />
                </label>
              );
            return (
              <label key={key} className="grid gap-1">
                {label}
                <select name={key} defaultValue={String(value)} className={control}>
                  <option value="suspicious">仅可疑时</option>
                  <option value="always">始终验证</option>
                  <option value="off">关闭</option>
                </select>
              </label>
            );
          })}
          <Button type="submit">保存配置</Button>
        </fieldset>
      </form>
    </Card>
  );
}
