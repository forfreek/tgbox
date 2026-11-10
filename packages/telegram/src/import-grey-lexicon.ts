/**
 * Grey / spam lexicon for bulk import hard-rejects.
 * Match against normalized title + description (+ optional preview snippets).
 * Obfuscation: NFKC, strip zero-width/separators, map common 异体字 and lookalikes.
 */

export type GreyLexiconCategory =
  | "casting" // 海选 / 星探 / 兼职引流
  | "adult"
  | "gambling"
  | "fake_subs"
  | "airdrop_drain"
  | "finance_scam"
  | "ads_agency"
  | "account_trade"
  | "drugs_weapons"
  | "misc_scam";

export type GreyLexiconEntry = {
  category: GreyLexiconCategory;
  /** Plain term; matcher runs both sides through `normalizeGreyText`. */
  term: string;
};

/** Per-character folds after phrase folds + separator strip. */
const VARIANT_FOLDS: Readonly<Record<string, string>> = {
  選: "选",
  羣: "群",
  衆: "众",
  網: "网",
  賭: "赌",
  錢: "钱",
  幣: "币",
  廣: "广",
  飛: "飞",
  機: "机",
  碼: "码",
  買: "买",
  賣: "卖",
  億: "亿",
  萬: "万",
  與: "与",
  為: "为",
  這: "这",
  還: "还",
  來: "来",
  說: "说",
  對: "对",
  開: "开",
  關: "关",
  門: "门",
  見: "见",
  條: "条",
  產: "产",
  發: "发",
  現: "现",
  線: "线",
  國: "国",
  區: "区",
  達: "达",
  進: "进",
  運: "运",
  態: "态",
  點: "点",
  擊: "击",
  總: "总",
  監: "监",
  證: "证",
  權: "权",
  長: "长",
  東: "东",
  絲: "丝",
  襪: "袜",
  約: "约",
  砲: "炮",
  兒: "儿",
  無: "无",
  陽: "阳",
  陰: "阴",
  紙: "纸",
  賺: "赚",
  帳: "账",
  號: "号",
  優: "优",
  勢: "势",
  訊: "讯",
  聯: "联",
  繫: "系",
  絡: "络",
  經: "经",
  紀: "纪",
  攝: "摄",
  視: "视",
  頻: "频",
  導: "导",
  舊: "旧",
  務: "务",
  會: "会",
  員: "员",
  業: "业",
  餘: "余",
  薇: "微",
  崴: "微",
  伩: "信",
  // 形近 / 谐音替身（单字，靠多字词降低误伤）
  睹: "赌",
  嘟: "赌",
  // Cyrillic lookalikes often mixed into Latin spam URLs/words
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  і: "i",
  ј: "j",
};

/** Longer replacements first. */
const PHRASE_FOLDS: readonly [string, string][] = [
  ["海選", "海选"],
  ["網賭", "网赌"],
  ["廣告", "广告"],
  ["飛機號", "飞机号"],
  ["經紀人", "经纪人"],
  ["薇信", "微信"],
  ["崴信", "微信"],
  ["ｖｘ", "微信"],
  ["vx", "微信"],
  ["ｖ信", "微信"],
  ["加ｖ", "加微"],
  ["加v", "加微"],
  ["ｑｑ", "qq"],
];

const SEPARATORS =
  /[\s\u200b\u200c\ufeff\u00ad·•・‧｡。、，,._\-|/\\~～*＊+＋=＝'"`‘’“”()[\]{}<>【】『』「」]+/g;
/** Emoji and ZWJ as alternation — ZWJ must not live inside a character class (Biome). */
const DECORATION = /\u200d|⭐|🌟|🔥|💰|🔞|➡️|👉/g;

export function normalizeGreyText(input: string): string {
  let text = input.normalize("NFKC").toLowerCase();
  for (const [from, to] of PHRASE_FOLDS) {
    text = text.split(from.toLowerCase()).join(to.toLowerCase());
  }
  text = text.replace(DECORATION, "").replace(SEPARATORS, "");
  let out = "";
  for (const char of text) {
    out += VARIANT_FOLDS[char] ?? char;
  }
  return out;
}

/**
 * Seed terms. Prefer multi-character phrases to limit false positives.
 * Expand here as new spam patterns show up in imports.
 */
export const GREY_LEXICON: readonly GreyLexiconEntry[] = [
  // —— 海选 / 星探 / 兼职引流 ——
  { category: "casting", term: "海选" },
  { category: "casting", term: "海選" },
  { category: "casting", term: "艺人海选" },
  { category: "casting", term: "藝人海選" },
  { category: "casting", term: "模特海选" },
  { category: "casting", term: "平面海选" },
  { category: "casting", term: "演员海选" },
  { category: "casting", term: "主播海选" },
  { category: "casting", term: "童星海选" },
  { category: "casting", term: "星探" },
  { category: "casting", term: "星探招募" },
  { category: "casting", term: "星探经纪" },
  { category: "casting", term: "经纪人收费" },
  { category: "casting", term: "经纪收费" },
  { category: "casting", term: "试镜费" },
  { category: "casting", term: "試鏡費" },
  { category: "casting", term: "报名费" },
  { category: "casting", term: "定妆费" },
  { category: "casting", term: "通告费" },
  { category: "casting", term: "日结兼职" },
  { category: "casting", term: "兼职日结" },
  { category: "casting", term: "日结女" },
  { category: "casting", term: "线下日结" },
  { category: "casting", term: "模特兼职" },
  { category: "casting", term: "学生兼职妹" },
  { category: "casting", term: "貌美兼职" },
  { category: "casting", term: "包吃住日结" },
  { category: "casting", term: "写真私拍" },
  { category: "casting", term: "私拍约拍" },
  { category: "casting", term: "约拍私影" },
  { category: "casting", term: "高薪招聘女" },
  { category: "casting", term: "颜值兼职" },
  { category: "casting", term: "陪玩招女" },

  // —— 色情 / 擦边引流 ——
  { category: "adult", term: "裸聊" },
  { category: "adult", term: "约炮" },
  { category: "adult", term: "约啪" },
  { category: "adult", term: "一夜情" },
  { category: "adult", term: "上门服务" },
  { category: "adult", term: "兼职女上门" },
  { category: "adult", term: "楼凤" },
  { category: "adult", term: "外围女" },
  { category: "adult", term: "包养" },
  { category: "adult", term: "色情群" },
  { category: "adult", term: "黄色群" },
  { category: "adult", term: "黄片资源" },
  { category: "adult", term: "黄网" },
  { category: "adult", term: "色群" },
  { category: "adult", term: "福利姬" },
  { category: "adult", term: "onlyfans资源" },
  { category: "adult", term: "泄密资源" },
  { category: "adult", term: "偷拍资源" },
  { category: "adult", term: "幼女" },
  { category: "adult", term: "萝莉资源" },
  { category: "adult", term: "乱伦资源" },
  { category: "adult", term: "换妻" },
  { category: "adult", term: "sm调教" },
  { category: "adult", term: "色情直播" },
  { category: "adult", term: "成人直播" },
  { category: "adult", term: "黄播" },
  { category: "adult", term: "同城约" },
  { category: "adult", term: "莞式服务" },
  { category: "adult", term: "去衣" },
  { category: "adult", term: "脱衣" },
  { category: "adult", term: "换脸" },
  { category: "adult", term: "裸替" },

  // —— 博彩 ——
  { category: "gambling", term: "网赌" },
  { category: "gambling", term: "網賭" },
  { category: "gambling", term: "网络赌博" },
  { category: "gambling", term: "赌球" },
  { category: "gambling", term: "赌站" },
  { category: "gambling", term: "百家乐" },
  { category: "gambling", term: "六合彩" },
  { category: "gambling", term: "时时彩" },
  { category: "gambling", term: "竞彩代购" },
  { category: "gambling", term: "葡京娱乐" },
  { category: "gambling", term: "澳门赌场" },
  { category: "gambling", term: "上分下分" },
  { category: "gambling", term: "代充上分" },
  { category: "gambling", term: "回水优惠" },
  { category: "gambling", term: "返水佣金" },
  { category: "gambling", term: "开户送彩金" },
  { category: "gambling", term: "首存送" },
  { category: "gambling", term: "博彩平台" },
  { category: "gambling", term: "娱乐城代理" },
  { category: "gambling", term: "威尼斯人赌" },
  { category: "gambling", term: "太阳城赌" },
  { category: "gambling", term: "足球内幕推介" },

  // —— 刷粉 / 假活跃 ——
  { category: "fake_subs", term: "刷粉" },
  { category: "fake_subs", term: "买粉" },
  { category: "fake_subs", term: "卖粉" },
  { category: "fake_subs", term: "涨粉包" },
  { category: "fake_subs", term: "僵尸粉" },
  { category: "fake_subs", term: "假粉" },
  { category: "fake_subs", term: "加粉平台" },
  { category: "fake_subs", term: "刷播放" },
  { category: "fake_subs", term: "刷阅读" },
  { category: "fake_subs", term: "刷订阅" },
  { category: "fake_subs", term: "刷群成员" },
  { category: "fake_subs", term: "代刷粉" },
  { category: "fake_subs", term: "粉商" },
  { category: "fake_subs", term: "量粉批发" },
  { category: "fake_subs", term: "粉丝批发" },

  // —— 假空投 / 盗钱包 ——
  { category: "airdrop_drain", term: "领空投" },
  { category: "airdrop_drain", term: "免费空投" },
  { category: "airdrop_drain", term: "空投领取" },
  { category: "airdrop_drain", term: "连接钱包领" },
  { category: "airdrop_drain", term: "授权钱包" },
  { category: "airdrop_drain", term: "领取空投" },
  { category: "airdrop_drain", term: "假空投" },
  { category: "airdrop_drain", term: "盗u" },
  { category: "airdrop_drain", term: "盗币" },
  { category: "airdrop_drain", term: "批准钱包" },
  { category: "airdrop_drain", term: "claimairdrop" },
  { category: "airdrop_drain", term: "connectwallet" },
  { category: "airdrop_drain", term: "免费领币" },
  { category: "airdrop_drain", term: "点击领取代币" },
  { category: "airdrop_drain", term: "钱包授权盗" },

  // —— 荐股 / 杀猪盘口吻 ——
  { category: "finance_scam", term: "老师带单" },
  { category: "finance_scam", term: "跟单必赚" },
  { category: "finance_scam", term: "稳赚不赔" },
  { category: "finance_scam", term: "内幕荐股" },
  { category: "finance_scam", term: "荐股群" },
  { category: "finance_scam", term: "必涨代码" },
  { category: "finance_scam", term: "炒股带单" },
  { category: "finance_scam", term: "期货跟单保证" },
  { category: "finance_scam", term: "合约稳赢" },
  { category: "finance_scam", term: "免费老师指导炒股" },
  { category: "finance_scam", term: "杀猪盘" },
  { category: "finance_scam", term: "高收益理财保本" },
  { category: "finance_scam", term: "日赚千元" },
  { category: "finance_scam", term: "日入过万包教" },
  { category: "finance_scam", term: "内部消息炒股" },

  // —— 广告代理 / 供需广告壳 ——
  { category: "ads_agency", term: "广告投放" },
  { category: "ads_agency", term: "投放广告" },
  { category: "ads_agency", term: "广告位出租" },
  { category: "ads_agency", term: "售广告位" },
  { category: "ads_agency", term: "双向广告" },
  { category: "ads_agency", term: "互推代理" },
  { category: "ads_agency", term: "广告代理招商" },
  { category: "ads_agency", term: "供需广告群" },
  { category: "ads_agency", term: "广告商务合作位" },
  { category: "ads_agency", term: "频道广告报价" },
  { category: "ads_agency", term: "买量代投飞机" },
  { category: "ads_agency", term: "飞机广告代发" },

  // —— 账号买卖 / 接码灰产 ——
  { category: "account_trade", term: "飞机号批发" },
  { category: "account_trade", term: "telegram号商" },
  { category: "account_trade", term: "tg号批发" },
  { category: "account_trade", term: "成品号出售" },
  { category: "account_trade", term: "老人号出售" },
  { category: "account_trade", term: "接码注册机" },
  { category: "account_trade", term: "实名账号出" },
  { category: "account_trade", term: "买卖tg号" },
  { category: "account_trade", term: "出号回收号" },
  { category: "account_trade", term: "协议号出售" },

  // —— 毒枪等 ——
  { category: "drugs_weapons", term: "出售冰毒" },
  { category: "drugs_weapons", term: "卖冰毒" },
  { category: "drugs_weapons", term: "大麻寄送" },
  { category: "drugs_weapons", term: "出枪渠道" },
  { category: "drugs_weapons", term: "卖枪渠道" },
  { category: "drugs_weapons", term: "枪支弹药" },

  // —— 杂类诈骗话术 ——
  { category: "misc_scam", term: "刷单赚钱" },
  { category: "misc_scam", term: "刷单日结" },
  { category: "misc_scam", term: "任务刷单" },
  { category: "misc_scam", term: "返利刷单" },
  { category: "misc_scam", term: "解封缴费" },
  { category: "misc_scam", term: "解封转账" },
  { category: "misc_scam", term: "中奖请缴费" },
  { category: "misc_scam", term: "冒充客服退款" },
  { category: "misc_scam", term: "代办入职收费" },
  { category: "misc_scam", term: "假冒公检法" },
  { category: "misc_scam", term: "安全账户转账" },
];

export type GreyMatch = {
  category: GreyLexiconCategory;
  term: string;
};

/** Every lexicon hit in the haystack (normalized substring match). */
export function matchGreyLexicon(
  text: string,
  lexicon: readonly GreyLexiconEntry[] = GREY_LEXICON,
): GreyMatch[] {
  const haystack = normalizeGreyText(text);
  if (!haystack) return [];
  const hits: GreyMatch[] = [];
  const seen = new Set<string>();
  for (const entry of lexicon) {
    const needle = normalizeGreyText(entry.term);
    if (needle.length < 2) continue;
    if (!haystack.includes(needle)) continue;
    const key = `${entry.category}:${needle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ category: entry.category, term: entry.term });
  }
  return hits;
}

export function hitsGreyLexicon(
  text: string,
  lexicon: readonly GreyLexiconEntry[] = GREY_LEXICON,
): boolean {
  return matchGreyLexicon(text, lexicon).length > 0;
}
