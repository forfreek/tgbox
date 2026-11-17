import type { SiteLocale } from "@tgbox/shared";

type AiCategoryStrings = {
  title: string;
  description: string;
  introduction: string;
  sorts: { members: string; latest: string };
  filters: string;
  promotions: string;
  missingDescription: string;
  members: string;
  unknownMembers: string;
  unknownLanguage: string;
  related: string;
  topics: string;
  resources: string;
};

const dictionaries: Record<SiteLocale, AiCategoryStrings> = {
  zh: {
    title: "AI 交流群组 · Telegram 人工智能社区",
    description:
      "浏览 TGsearch 收录的 {n} 个 AI 类 Telegram 群组，查看群组简介、成员数和语言，按标签筛选或切换最新收录。",
    introduction:
      "这里汇集本站 AI 分类下的 Telegram 群组。先阅读群组简介，再结合语言和已有标签查找适合的话题，详情页提供群组入口。",
    sorts: {
      members: "当前按成员数排列，未获取成员数的条目排在其后。",
      latest: "当前按本站收录时间排列，较新收录的条目在前。",
    },
    filters: "语言和标签筛选仅作用于当前页，支持组合选择。标签旁的数量为当前页匹配条目数。",
    promotions: "站点置顶和本分类置顶优先展示，推广条目带有标记。",
    missingDescription: "@{username} 收录于 AI 群组分类，尚无简介。可进入详情页查看已有资料。",
    members: "{n} 名成员",
    unknownMembers: "成员数未获取",
    unknownLanguage: "语言未识别",
    related: "继续浏览 AI 资源",
    topics: "这些群组使用的标签",
    resources: "其他 AI 分类",
  },
  "zh-hant": {
    title: "AI 討論群組 · Telegram 人工智慧社群",
    description:
      "探索 TGsearch 收錄的 {n} 個 AI 類 Telegram 群組，參考簡介、成員人數與使用語言，並透過標籤或最新收錄尋找社群。",
    introduction:
      "想找 AI 討論社群，可從本站此分類的群組簡介與使用語言開始，再依現有標籤縮小範圍。群組連結與已取得的資料可在詳細頁面查看。",
    sorts: {
      members: "目前依成員人數排序，尚未取得人數的項目列於後方。",
      latest: "目前依本站收錄日期排序，最近加入目錄的群組列於前方。",
    },
    filters: "語言與標籤可搭配篩選，範圍限於本頁。標籤旁的數字代表本頁符合的項目數。",
    promotions: "全站與本分類的置頂項目會優先顯示，推廣項目另有標示。",
    missingDescription: "@{username} 已列入 AI 群組分類，目前尚無簡介。詳細頁面提供現有資料。",
    members: "{n} 位成員",
    unknownMembers: "尚未取得成員人數",
    unknownLanguage: "尚未辨識語言",
    related: "探索更多 AI 資源",
    topics: "此分類群組的標籤",
    resources: "其他 AI 資源分類",
  },
  en: {
    title: "AI Telegram Groups · Community Directory",
    description:
      "Browse {n} AI Telegram groups listed on TGsearch. Read descriptions, compare available member counts and languages, or explore tags and recently listed groups.",
    introduction:
      "Explore Telegram groups filed under AI in this directory. Use each group's description, detected language and assigned tags to narrow your search. Open a listing for its group link and available details.",
    sorts: {
      members: "Ordered by member count, with unavailable counts placed last.",
      latest: "Ordered by the date added to TGsearch, with recent listings first.",
    },
    filters:
      "Language and tag filters can be combined and apply to this page only. Tag counts show matching listings on this page.",
    promotions: "Site-wide and category pins appear first. Promoted listings carry a label.",
    missingDescription:
      "@{username} is listed in the AI groups category. A description is not available yet. Open the listing for the details on file.",
    members: "{n} members",
    unknownMembers: "Member count unavailable",
    unknownLanguage: "Language undetected",
    related: "Explore related AI resources",
    topics: "Tags used by these groups",
    resources: "Other AI categories",
  },
};

export function aiCategoryUi(locale: SiteLocale): AiCategoryStrings {
  return dictionaries[locale];
}
