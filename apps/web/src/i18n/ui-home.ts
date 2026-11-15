import type { EntryKind, SiteLocale } from "@tgbox/shared";

const zh = {
  lead: "按分类和标签建立候选清单，查看公开简介、成员数据和频道消息预览，再前往 Telegram 核对内容与使用条件。",
  searchPlaceholder: "搜索 Telegram 频道、群组、机器人…",
  hotCategories: "按分类浏览",
  sponsored: "赞助商推广",
  dismissPromos: "隐藏推广",
  hot: { channel: "频道", group: "群组", bot: "机器人" } satisfies Record<EntryKind, string>,
  shuffle: "换一换",
  latest: "新近收录",
  latestDescription: "查看刚加入目录的条目，按用途挑选感兴趣的内容",
  statsLabel: "收录统计",
  total: "已收录",
  ctaEyebrow: "免费收录",
  ctaTitle: "把公开频道、群组或机器人提交到目录",
  ctaText: "发送 Telegram 链接，确认资料并选择分类。审核结果由机器人私信通知。",
  ctaButton: "打开收录机器人",
  ctaGuide: "查看收录说明",
  more: "查看全部",
  rankings: "查看涨粉与活跃排行",
};

const en: typeof zh = {
  lead: "Build a shortlist by category and tag. Review public descriptions, member data and channel post previews, then open Telegram to check the content and usage conditions.",
  searchPlaceholder: "Search Telegram channels, groups and bots…",
  hotCategories: "Browse by category",
  sponsored: "Sponsored",
  dismissPromos: "Hide sponsored",
  hot: { channel: "Channels", group: "Groups", bot: "Bots" },
  shuffle: "Shuffle",
  latest: "Recently listed",
  latestDescription: "Explore recent additions and choose entries that fit your interests",
  statsLabel: "Directory stats",
  total: "Listed",
  ctaEyebrow: "Free listing",
  ctaTitle: "Submit a public channel, group or bot",
  ctaText:
    "Send a Telegram link, check the fetched details and choose a category. The bot sends your review result by private message.",
  ctaButton: "Open the submit bot",
  ctaGuide: "How submission works",
  more: "View all",
  rankings: "See growth and activity rankings",
};

const dictionaries: Record<SiteLocale, typeof zh> = { zh, "zh-hant": zh, en };

export function homeUi(locale: SiteLocale) {
  return dictionaries[locale];
}
