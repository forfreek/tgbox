import type { EntryKind, SiteLocale } from "@tgbox/shared";

const zh = {
  heading: "查找 Telegram 频道、群组和机器人",
  lead: "按关键词搜索，或按分类和标签浏览。查看公开简介、可用的成员资料及部分频道的消息预览，再前往 Telegram 核对内容与使用条件。",
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
  heading: "Find public Telegram channels, groups and bots",
  lead: "Search by keyword or browse by topic and tag. Check public profiles, available member data and posts from selected channels, then open Telegram to review the content and usage conditions.",
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

const zhHant: typeof zh = {
  ...zh,
  heading: "尋找 Telegram 頻道、群組與機器人",
  lead: "用關鍵字搜尋，或依主題和標籤瀏覽。先看公開簡介、可用的成員資料及部分頻道的貼文預覽，再到 Telegram 核對內容與使用條件。",
  searchPlaceholder: "搜尋 Telegram 頻道、群組與機器人…",
  hotCategories: "依分類瀏覽",
};

const dictionaries: Record<SiteLocale, typeof zh> = { zh, "zh-hant": zhHant, en };

export function homeUi(locale: SiteLocale) {
  return dictionaries[locale];
}
