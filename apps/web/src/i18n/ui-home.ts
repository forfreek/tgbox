import type { EntryKind, SiteLocale } from "@tgbox/shared";

const zh = {
  searchPlaceholder: "搜索 Telegram 频道、群组、机器人…",
  hotCategories: "按分类浏览",
  sponsored: "赞助商推广",
  dismissPromos: "隐藏推广",
  hot: { channel: "频道", group: "群组", bot: "机器人" } satisfies Record<EntryKind, string>,
  shuffle: "换一换",
  latest: "新近收录",
  latestDescription: "最近通过审核上线的条目",
  statsLabel: "收录统计",
  total: "已收录",
  ctaEyebrow: "免费收录",
  ctaTitle: "有好的频道、群组或机器人？",
  ctaText: "私聊收录机器人发送链接即可提交，审核通过后上线。",
  ctaButton: "打开收录机器人",
  ctaGuide: "查看收录说明",
  more: "查看全部",
  rankings: "查看涨粉与活跃排行",
};

const en: typeof zh = {
  searchPlaceholder: "Search Telegram channels, groups and bots…",
  hotCategories: "Browse by category",
  sponsored: "Sponsored",
  dismissPromos: "Hide sponsored",
  hot: { channel: "Channels", group: "Groups", bot: "Bots" },
  shuffle: "Shuffle",
  latest: "Recently listed",
  latestDescription: "Entries that recently passed review",
  statsLabel: "Directory stats",
  total: "Listed",
  ctaEyebrow: "Free listing",
  ctaTitle: "Know a great channel, group or bot?",
  ctaText: "Send the link to our bot in a private chat — approved entries go live after review.",
  ctaButton: "Open the submit bot",
  ctaGuide: "How submission works",
  more: "View all",
  rankings: "See growth and activity rankings",
};

const dictionaries: Record<SiteLocale, typeof zh> = { zh, "zh-hant": zh, en };

export function homeUi(locale: SiteLocale) {
  return dictionaries[locale];
}
