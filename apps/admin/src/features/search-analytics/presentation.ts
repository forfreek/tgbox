export const statusLabels: Record<string, string> = {
  blacklist: "黑名单",
  hidden: "隐藏",
  pending: "待审核",
  approved: "已批准",
  unreviewed: "未标记",
  running: "执行中",
  succeeded: "成功",
  failed: "失败",
  superseded: "已失效",
};
export const sourceLabels: Record<string, string> = {
  website: "网站",
  miniapp: "Mini App",
  bot: "Telegram Bot",
};
export const control = "min-h-12 rounded-md border border-input bg-background px-3 text-base";
export const time = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        dateStyle: "short",
        timeStyle: "medium",
      }).format(value);
