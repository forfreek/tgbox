import { describe, expect, test } from "vitest";
import {
  GREY_LEXICON,
  hitsGreyLexicon,
  matchGreyLexicon,
  normalizeGreyText,
} from "./import-grey-lexicon.ts";

describe("normalizeGreyText", () => {
  test("folds 异体/繁体 and strips separators", () => {
    expect(normalizeGreyText("海·選")).toBe("海选");
    expect(normalizeGreyText("網 賭")).toBe("网赌");
    expect(normalizeGreyText("薇信")).toBe("微信");
    expect(normalizeGreyText("加Ｖ领空投")).toBe("加微领空投");
  });
});

describe("matchGreyLexicon", () => {
  test("hits casting 海选 even when obfuscated", () => {
    const hits = matchGreyLexicon("本地平面【海·選】星探招募");
    expect(hits.some((hit) => hit.category === "casting")).toBe(true);
  });

  test("hits ads and airdrop phrases", () => {
    expect(hitsGreyLexicon("本频道广告投放 商务")).toBe(true);
    expect(hitsGreyLexicon("点击领取空投 连接钱包")).toBe(true);
  });

  test("does not flag a normal tech channel blurb", () => {
    expect(hitsGreyLexicon("开源 Telegram 机器人开发交流，分享 Bot API 与 grammy 教程")).toBe(
      false,
    );
  });

  test("lexicon stays multi-character heavy", () => {
    const short = GREY_LEXICON.filter((entry) => normalizeGreyText(entry.term).length < 2);
    expect(short).toEqual([]);
  });
});
