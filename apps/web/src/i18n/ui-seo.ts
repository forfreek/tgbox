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
    title: "Telegram 综合资源导航",
    description:
      "TGsearch 是 Telegram 综合资源导航，已收录 {total} 个频道、群组和机器人，可按分类、标签搜索，或查看涨粉排名，含成员数、活跃度和最近消息。",
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
      "TGsearch 指南：怎么找到优质的 Telegram 频道、频道群组机器人到底有什么区别、怎么让自己的电报频道被更多人发现，依据 Telegram 官方限制和本站收录数据写成。",
  },
  about: {
    title: "关于 TGsearch · 开源的 Telegram 综合资源导航",
    description:
      "TGsearch 是开源（AGPL-3.0）的简繁英三语 Telegram 综合资源导航，说明收录方式、推广标记，以及数据如何刷新。",
  },
  detail: {
    title: "{title}（@{username}）· Telegram {kind}",
  },
  /** Clauses of the auto-written one-sentence entry summary; empty ones are dropped. */
  summary: {
    lead: "{title}（@{username}）是 TGsearch 收录的 Telegram {category}{kind}",
    members: "目前有 {n} {noun}",
    created: "创建于 {date}",
    activity: "活跃度为{tier}",
    language: "内容以{language}为主",
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
        "Telegram 自带的搜索只能按名称匹配，找不到没听说过的频道。在 TGsearch 可以按分类（科技、新闻、影视等）和标签浏览电报频道，用站内搜索按关键词查找，或者打开排行榜看最近涨粉最快、最活跃的频道。条目展示成员数，频道另有活跃度和最近消息，点“直达”即可打开 Telegram。",
    },
    {
      question: "怎么提交收录自己的频道、群组或机器人？",
      answer:
        "在 Telegram 里私聊收录机器人 @tgboxccbot，把频道、群组或机器人的链接（t.me/xxx 或 @xxx）发给它即可提交。系统会自动抓取公开资料，审核通过后上线，结果会私信通知你。收录免费，详见站内的“提交收录说明”。",
    },
    {
      question: "数据多久更新一次？",
      answer:
        "后台按计划刷新条目的成员数、在线人数、活跃度和最近消息，整站页面随构建重新生成。被封禁、删除或转为私有的条目，经多次检测确认后自动隐藏。",
    },
    {
      question: "收录要收费吗？“推广”是什么意思？",
      answer:
        "普通收录完全免费。普通条目按成员数、活跃度等公开数据排列；标有“推广”的条目是付费或合作展示，会单独标记并在推广位展示。",
    },
    {
      question: "发现违规内容或想删除自己的条目怎么办？",
      answer:
        "私聊收录机器人 @tgboxccbot 发送 /help 获取联系方式，说明条目用户名和原因即可。TGsearch 只收录 Telegram 上已经公开的频道、群组和机器人，内容由其所有者负责。",
    },
  ],
};

const en: typeof zh = {
  pageSuffix: " · Page {n}",
  examples: { wrap: " such as {list}", separator: ", " },
  home: {
    title: "Telegram Resource Directory",
    description:
      "TGsearch is a Telegram resource directory of {total} channels, groups and bots. Browse by category, tag or growth ranking, with member counts, activity and recent posts.",
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
      "TGsearch guides: how to find good Telegram channels, what actually separates channels, groups and bots, and how to get your own channel discovered — based on Telegram's documented limits and this directory's data.",
  },
  about: {
    title: "About TGsearch — Open-source Telegram Directory",
    description:
      "An open-source (AGPL-3.0) trilingual Telegram resource directory: how TGsearch lists entries, how to get listed, and how the data is refreshed.",
  },
  detail: {
    title: "{title} (@{username}) — Telegram {kind}",
  },
  summary: {
    lead: "{title} (@{username}) is a Telegram {category} {kind} listed on TGsearch",
    members: "with {n} {noun}",
    created: "created on {date}",
    activity: "activity rated {tier}",
    language: "mainly in {language}",
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
        "Telegram's own search only matches names, so you can't find channels you haven't heard of. On TGsearch you can browse Telegram channels by category (tech, news, video and so on) and by tag, search the whole directory by keyword, or open the rankings to see what is growing fastest and what is most active. Entries show member counts. Channels also show an activity level and recent posts, and a direct link opens the entry in Telegram.",
    },
    {
      question: "How do I get my channel, group or bot listed?",
      answer:
        "Message our submission bot @tgboxccbot privately on Telegram and send the link (t.me/xxx or @xxx). It fetches the public profile automatically; once approved the entry goes live and you get the result by private message. Listing is free — see the submission guide on the site.",
    },
    {
      question: "How often is the data updated?",
      answer:
        "Member counts, online counts, activity levels and recent posts are refreshed on a schedule, and the site is rebuilt with those refreshes. Entries that get banned, deleted or switched to private are hidden after repeated checks confirm the change.",
    },
    {
      question: "Does listing cost anything? What does “Promoted” mean?",
      answer:
        "Regular listings are free. Regular entries are ordered by public data such as member count and activity. Entries marked “Promoted” are paid or partner placements: they are labelled and shown in their promotion slots.",
    },
    {
      question: "How do I report abuse or remove my entry?",
      answer:
        "Message @tgboxccbot and send /help for contact details, then tell us the username and the reason. TGsearch only lists channels, groups and bots that are already public on Telegram; their owners are responsible for the content.",
    },
  ],
};

const dictionaries: Record<SiteLocale, typeof zh> = { zh, "zh-hant": zh, en };

export function seoUi(locale: SiteLocale) {
  return dictionaries[locale];
}
