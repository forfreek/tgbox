import type { EntryKind, SiteLocale } from "@tgbox/shared";

/**
 * Search-facing copy: titles, meta descriptions, keyword sets, the auto-written entry summary
 * and the about-page FAQ. Kept apart from `ui.ts` because the wording is chosen for search
 * demand (see `docs/seo.md`), not for the on-screen layout — even where a page shows it too.
 */
const zh = {
  /** Appended to paged listings so page 2+ never repeats page 1's title. */
  pageSuffix: " · 第 {n} 页",
  /** Entry names injected into listing descriptions so no two listings read alike. */
  examples: { wrap: "（如{list}）", separator: "、" },
  home: {
    title: "搜索 Telegram 频道、群组与机器人",
    description:
      "搜索本站收录的 {total} 个公开 Telegram 频道、群组和机器人，按分类与标签筛选。查看简介、可用成员资料及部分频道的消息预览，再前往 Telegram。",
  },
  kind: {
    channel: {
      title: "电报频道大全 · Telegram 频道搜索与排名",
      description:
        "按分类搜索 Telegram 频道，共收录 {n} 个电报频道{examples}，按订阅数排列，含简介、成员数、活跃度和最近消息预览，失效频道自动下架。",
    },
    group: {
      title: "电报群组大全 · TG 群组搜索与分享",
      description:
        "按分类搜索 Telegram 群组，共收录 {n} 个电报群{examples}，按成员数排列，含简介、成员数、在线人数和活跃度，失效群组自动下架。",
    },
    bot: {
      title: "电报机器人索引 · Telegram Bot 大全",
      description:
        "Telegram 机器人索引，共收录 {n} 个电报机器人{examples}，按分类和月活用户排列，含功能简介和直达入口，失效机器人自动下架。",
    },
  } satisfies Record<EntryKind, { title: string; description: string }>,
  category: {
    title: "{category}{kind}大全 · Telegram {category}{kind}推荐",
    description:
      "TGsearch 收录的{category}类 Telegram {kind}共 {n} 个{examples}，按成员数排序，含成员数、简介、活跃度和标签，数据定期自动更新。",
  },
  tag: {
    title: "{tag} · Telegram 频道群组与机器人标签",
    description:
      "带有“{tag}”标签的 Telegram 频道、群组和机器人共 {n} 个{examples}，按成员数排序，可继续浏览相关标签发现更多电报频道。",
  },
  tags: {
    title: "Telegram 标签索引 · 按标签找频道群组和机器人",
    description:
      "TGsearch 的全部 {n} 个标签，按主题和属性分组，覆盖 {total} 个 Telegram 频道、群组和机器人。点开任意标签即可看到同一主题下的全部条目。",
  },
  rank: {
    title: "电报频道排名 · Telegram 群组与机器人排行榜",
    description:
      "电报频道排名：按周涨粉、月涨粉、最新收录和活跃度排列的 Telegram 频道、群组和机器人排行榜，数据随站点定期自动更新。",
  },
  guides: {
    title: "Telegram 使用指南 · 频道怎么找、怎么运营",
    description:
      "TGsearch 使用指南介绍频道筛选、频道群组与机器人的使用方式，以及准备收录资料的方法。结合公开说明与本站页面，逐步核对资源是否适合自己的用途。",
  },
  about: {
    title: "关于 TGsearch · 开源的 Telegram 综合资源导航",
    description:
      "了解 TGsearch 如何整理公开的 Telegram 资源、刷新条目资料、处理收录与反馈，以及本站代码和 tgbox 上游项目的来源。",
  },
  detail: {
    title: "{title}（@{username}）· Telegram {kind}",
  },
  /** Clauses of the auto-written one-sentence entry summary; empty ones are dropped. */
  summary: {
    lead: "{title}（@{username}）是 Telegram 上的{category}{kind}",
    members: "公开资料记录 {n} {noun}",
    created: "创建日期为 {date}",
    activity: "近期活跃程度为{tier}",
    language: "主要语言为{language}",
    topics: "主题标签为{topics}",
    topicSeparator: "、",
    updated: "资料更新于 {date}",
    separator: "，",
    terminator: "。",
  },
  keywords: {
    base: ["Telegram", "电报", "电报频道", "电报群", "电报机器人", "TGsearch"],
    kind: {
      channel: ["电报频道大全", "tg频道", "电报频道怎么搜索", "telegram频道", "电报频道排名"],
      group: ["电报群组", "tg群组分享", "电报群怎么搜索", "tg群组入口", "telegram群组"],
      bot: ["电报机器人索引", "tg机器人", "telegram bot", "电报机器人大全"],
    } satisfies Record<EntryKind, string[]>,
    rank: ["电报频道排名", "电报频道排行榜", "telegram频道排名", "电报涨粉排行"],
    tags: ["电报频道标签", "telegram标签", "电报频道分类", "按标签找电报频道"],
    guides: ["telegram 教程", "电报频道怎么找", "电报频道怎么运营", "telegram 频道群组区别"],
    /** "科技频道" / "Tech channels" — how a category and a kind read as one search term. */
    categoryKind: "{category}{kind}",
  },
  faqHeading: "常见问题",
  faq: [
    {
      question: "怎么找 Telegram 频道？",
      answer:
        "先在 TGsearch 按分类、标签或关键词找到候选，再查看详情页的简介、语言和公开数据。频道可结合最近消息判断主题与更新节奏，最后通过“直达”打开 Telegram 核对原始内容。",
    },
    {
      question: "怎么提交收录自己的频道、群组或机器人？",
      answer:
        "打开本站“提交收录说明”，使用页内的收录机器人发送公开 Telegram 链接。确认抓取到的资料并选择分类、标签，提交后等待审核通知。普通收录免费，通过审核的条目随网站构建发布。",
    },
    {
      question: "数据多久更新一次？",
      answer:
        "资料由定时任务从公开页面获取，再随网站构建发布。可用字段因条目类型和公开资料而异。成员趋势需要逐次积累。失效状态经重复检测确认后处理，详情与 Telegram 当前页面可能存在时间差。",
    },
    {
      question: "收录要收费吗？“推广”是什么意思？",
      answer:
        "普通收录免费，审核通过后进入相应分类。付费或合作展示使用“推广”标记，并按对应位置展示。选择条目时，可继续核对其简介、原始内容和使用条件。",
    },
    {
      question: "发现违规内容或想删除自己的条目怎么办？",
      answer:
        "使用本站收录机器人发送 /support，提供条目用户名、本站链接和需要更正或删除的原因，按机器人提示提交反馈。条目资料来自外部公开页面，相关内容由其发布者提供。",
    },
  ],
};

const en: typeof zh = {
  pageSuffix: " · Page {n}",
  examples: { wrap: " such as {list}", separator: ", " },
  home: {
    title: "Telegram Directory: Channels, Groups & Bots",
    description:
      "Search {total} public Telegram channels, groups and bots by topic or tag. Check profiles and member data, and preview posts from selected channels.",
  },
  kind: {
    channel: {
      title: "Telegram Channels List — Search & Browse",
      description:
        "Search {n} public Telegram channels{examples} by category, sorted by subscribers, with descriptions, activity levels and recent posts. Dead channels come down on their own.",
    },
    group: {
      title: "Telegram Groups Directory — Find Groups to Join",
      description:
        "Search {n} public Telegram groups{examples} by category, sorted by members, with descriptions, online counts and activity levels. Dead groups are removed automatically.",
    },
    bot: {
      title: "Telegram Bots List — Useful Bots by Category",
      description:
        "Browse {n} Telegram bots{examples} sorted by monthly users, with what each bot does and a direct link to start it. Dead bots are removed automatically.",
    },
  },
  category: {
    title: "{category} Telegram {kind} — List & Directory",
    description:
      "{n} Telegram {kind} in {category}{examples}, sorted by member count, with descriptions, activity levels and tags. Updated automatically.",
  },
  tag: {
    title: "{tag} — Telegram Channels, Groups & Bots",
    description:
      "{n} Telegram channels, groups and bots tagged “{tag}”{examples}, sorted by member count, plus related tags to keep exploring.",
  },
  tags: {
    title: "Telegram Tags — Browse Channels, Groups & Bots by Topic",
    description:
      "All {n} tags in use on TGsearch, grouped by topic and attribute, across {total} Telegram channels, groups and bots. Open a tag to see everything listed under it.",
  },
  rank: {
    title: "Telegram Rankings — Top & Fastest-growing Channels",
    description:
      "Telegram channels, groups and bots ranked by weekly and monthly growth, newest listings and activity level — refreshed automatically with the rest of the directory.",
  },
  guides: {
    title: "Telegram Guides — Finding, Comparing and Growing Channels",
    description:
      "TGsearch guides cover finding channels, using groups and bots, and preparing a listing. Use documented features and directory examples to check which resources fit your needs.",
  },
  about: {
    title: "About TGsearch — Open-source Telegram Directory",
    description:
      "Learn how TGsearch organizes public Telegram resources, refreshes entries and handles submissions and feedback. Find this site's code and its tgbox upstream project.",
  },
  detail: {
    title: "{title} (@{username}) — Telegram {kind}",
  },
  summary: {
    lead: "{title} (@{username}) is a Telegram {kind} in the {category} category",
    members: "public profile count of {n} {noun}",
    created: "creation date {date}",
    activity: "recent activity rated {tier}",
    language: "primary language {language}",
    topics: "tagged {topics}",
    topicSeparator: " / ",
    updated: "profile updated on {date}",
    separator: ", ",
    terminator: ".",
  },
  keywords: {
    base: ["telegram", "telegram directory", "telegram directory websites", "TGsearch"],
    kind: {
      channel: [
        "telegram channels list",
        "telegram channels search",
        "telegram channels to join",
        "find telegram channels",
        "telegram channel list 2026",
      ],
      group: [
        "telegram groups search",
        "telegram groups links list",
        "find telegram groups",
        "telegram groups to join",
      ],
      bot: ["telegram bots list", "telegram bot directory", "useful telegram bots"],
    },
    rank: [
      "top telegram channels",
      "fastest growing telegram channels",
      "telegram channel ranking",
    ],
    tags: ["telegram tags", "telegram channel tags", "browse telegram channels by topic"],
    guides: [
      "telegram guide",
      "how to find telegram channels",
      "channel vs group vs bot",
      "how to grow a telegram channel",
    ],
    categoryKind: "{category} {kind}",
  },
  faqHeading: "Frequently asked questions",
  faq: [
    {
      question: "How do I find good Telegram channels?",
      answer:
        "Build a shortlist using categories, tags or keywords on TGsearch. Check each description, language and available public data. For channels, review recent posts and their dates, then use the direct link to verify the original content on Telegram.",
    },
    {
      question: "How do I get my channel, group or bot listed?",
      answer:
        "Open the submission guide on this site and use its bot link to send a public Telegram URL. Check the fetched details, choose a category and optional tags, then submit for review. Regular listing is free. Approved entries are published with a site build.",
    },
    {
      question: "How often is the data updated?",
      answer:
        "Scheduled tasks fetch public information, which is published with a site build. Available fields depend on the entry type and source. Member history accumulates over time. Repeated checks confirm unavailable entries, and directory information may lag behind Telegram.",
    },
    {
      question: "Does listing cost anything? What does “Promoted” mean?",
      answer:
        "Regular listing is free, and approved entries appear in their categories. Paid or partner placements carry a “Promoted” label and appear in their assigned positions. Check the description, original content and usage conditions before choosing an entry.",
    },
    {
      question: "How do I report abuse or remove my entry?",
      answer:
        "Send /support to the submission bot linked on this site. Provide the username, directory URL and reason for the correction or removal, then follow the bot instructions. Entry information comes from external public pages and their publishers.",
    },
  ],
};

const zhHant: typeof zh = {
  ...zh,
  home: {
    title: "搜尋 Telegram 頻道、群組與機器人",
    description:
      "探索本站收錄的 {total} 個公開 Telegram 頻道、群組與機器人，依主題和標籤尋找感興趣的內容。查看簡介、成員資料與部分頻道的貼文預覽，再前往 Telegram。",
  },
};

const dictionaries: Record<SiteLocale, typeof zh> = { zh, "zh-hant": zhHant, en };

export function seoUi(locale: SiteLocale) {
  return dictionaries[locale];
}
