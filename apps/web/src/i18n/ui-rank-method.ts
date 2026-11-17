import type { SiteLocale } from "@tgbox/shared";

type RankMethodStrings = {
  description: string;
  updated: string;
  timeNote: string;
  scope: string;
  browse: string;
  methodTitle: string;
  methods: string[];
  coverage: string;
  reasons: { noEntries: string; noCurrent: string; noBaseline: string; noPositive: string };
  activeEmpty: string;
  kindEmpty: string;
  growthTitle: string;
};

const dictionaries: Record<SiteLocale, RankMethodStrings> = {
  zh: {
    description:
      "查看本站收录资源的增长、最新收录与频道活跃榜，了解采样基线、排序规则和数据覆盖范围。",
    updated: "快照生成时间",
    timeNote: "各条目的统计采集时间可能不同，榜单随站点构建更新。",
    scope: "各榜最多展示全站前 {limit} 条，类型筛选仅筛选这些上榜条目。推广不影响排名。",
    browse: "按类型浏览目录",
    methodTitle: "统计口径与排序规则",
    methods: [
      "周榜和月榜分别选择距快照时间至少 {week} 天、{month} 天的最近历史点作为基线，采用采样容差，实际比较跨度取决于历史点的时间。当前数值减去基线，仅正增长上榜。",
      "频道与群组使用订阅或成员数，机器人使用 Telegram 提供的月活用户数。百分比以基线为分母，基线为零时只显示增量。",
      "增长榜依次按绝对增量、增长率和用户名排序。最新榜按本站收录时间降序，同时间按用户名排序，收录时间与 Telegram 创建时间分别记录。",
      "活跃榜按已记录的频道活跃等级、成员数和用户名排序，等级须大于零。等级来自近 30 天公开帖文采样，满页且至少 20 篇全部位于 30 天窗口内时，按采样跨度外推频率，平均浏览不足 100 时可能降低一级。",
      "每 30 天 1、4、15、60 篇为等级 1 至 4 的频率界线，无近期帖文时为 0。公开采样可能不完整，群组与机器人当前没有这项等级。",
    ],
    coverage:
      "共 {total} 条资源，{comparable} 条具备可比较数值，{missingCurrent} 条缺少当前数值，{missingBaseline} 条缺少足够早的历史基线，{positive} 条为正增长。",
    reasons: {
      noEntries: "当前快照没有收录条目。",
      noCurrent: "当前快照缺少可用于计算增长的当前数值。",
      noBaseline: "已有数值的条目尚无足够早的历史基线，暂时无法计算此榜增长。",
      noPositive: "已有可比较数据，但没有条目满足正增长条件。",
    },
    activeEmpty: "当前快照没有已记录活跃等级大于零的频道条目。",
    kindEmpty: "该类型没有进入当前全站榜单。",
    growthTitle: "相对于历史基线的数值变化",
  },
  "zh-hant": {
    description: "探索本站目錄的成長排行、新收錄資源與頻道活躍榜，同時查看資料涵蓋範圍及排名依據。",
    updated: "快照產生時間",
    timeNote: "每筆統計的採集時間可能不同，排名會隨網站重新建置而更新。",
    scope: "每份榜單最多列出全站前 {limit} 筆，類型篩選的範圍為這些上榜項目。推廣不影響名次。",
    browse: "依類型探索目錄",
    methodTitle: "資料如何計算與排序",
    methods: [
      "週榜與月榜各取快照時間至少 {week} 天、{month} 天前的最近一筆歷史數值為基準。實際比較跨度視可用的取樣日期而定，只有目前數值高於基準的項目會上榜。",
      "頻道及群組採用訂閱或成員人數，機器人則採用 Telegram 提供的每月活躍使用者數。成長率以基準值計算，基準為零時僅呈現增加量。",
      "成長榜先比較增加量，再比較成長率及使用者名稱。新收錄榜依加入本站目錄的時間由新到舊排列，同時間再依使用者名稱排序，收錄日期與 Telegram 建立日期各有紀錄。",
      "活躍榜依已記錄的頻道活躍等級、成員人數及使用者名稱排序，須有大於零的等級才會列入。等級參考近 30 天公開貼文，取樣滿頁且至少 20 篇全在 30 天內時，依涵蓋時長推估發文頻率，平均瀏覽數不足 100 時可能調降一級。",
      "每 30 天 1、4、15、60 篇為等級 1 到 4 的頻率界線，近期無貼文則為 0。公開取樣可能不完整，群組與機器人目前沒有此等級資料。",
    ],
    coverage:
      "本次快照共 {total} 筆，其中 {comparable} 筆可比較，{missingCurrent} 筆尚無目前數值，{missingBaseline} 筆缺少時間足夠早的基準資料，具正成長的有 {positive} 筆。",
    reasons: {
      noEntries: "這份快照尚無收錄項目。",
      noCurrent: "目前缺少計算成長所需的當前數值。",
      noBaseline: "已有當前數值的項目，尚缺足夠早的歷史基準，因此暫時無法計算此榜。",
      noPositive: "已有可比較的資料，目前沒有符合正成長條件的項目。",
    },
    activeEmpty: "此快照尚無已記錄活躍等級大於零的頻道項目。",
    kindEmpty: "此類型目前未進入這份全站榜單。",
    growthTitle: "與歷史基準相比的數值變化",
  },
  en: {
    description:
      "Explore growth rankings, recent listings and channel activity across the TGsearch directory, with sampling rules and data coverage explained.",
    updated: "Snapshot generated",
    timeNote:
      "Individual statistics may have different collection times. Rankings refresh when the site is rebuilt.",
    scope:
      "Each list contains up to {limit} site-wide entries. Type filters narrow those ranked entries. Promotions do not affect ranking.",
    browse: "Browse the directory by type",
    methodTitle: "How the rankings are calculated",
    methods: [
      "Weekly and monthly lists use the latest historical point at least {week} and {month} days before the snapshot respectively. The comparison window varies with available sample dates. Only positive changes from the baseline qualify.",
      "Channels and groups use subscriber or member counts. Bots use monthly active users reported by Telegram. Percentages are relative to the baseline, with only the absolute change shown when the baseline is zero.",
      "Growth lists sort by absolute increase, then percentage increase and username. Newest sorts by the date added to TGsearch, with username as the tie-breaker. The listing date and Telegram creation date are separate fields.",
      "Activity ranks recorded tiers above zero, then member count and username. Tiers come from public channel posts sampled over 30 days. When every post in a full sample of at least 20 falls within the window, frequency is extrapolated over the sampling span. Average views below 100 may lower a tier by one.",
      "The frequency boundaries for tiers 1 to 4 are 1, 4, 15 and 60 posts per 30 days. No recent posts gives tier 0. Public samples can be incomplete, and groups and bots currently have no activity tier.",
    ],
    coverage:
      "Of {total} listings, {comparable} have comparable values, {missingCurrent} lack a current value and {missingBaseline} lack an old enough historical baseline. {positive} have positive growth.",
    reasons: {
      noEntries: "This snapshot contains no listed entries.",
      noCurrent: "Current values needed to calculate growth are unavailable in this snapshot.",
      noBaseline:
        "Entries with current values do not yet have an old enough historical baseline for this list.",
      noPositive: "Comparable data exists, but no entries meet the positive-growth condition.",
    },
    activeEmpty: "No channel entries in this snapshot have a recorded activity tier above zero.",
    kindEmpty: "No entries of this type made the current site-wide list.",
    growthTitle: "Change relative to the historical baseline",
  },
};

export function rankMethodUi(locale: SiteLocale) {
  return dictionaries[locale];
}
