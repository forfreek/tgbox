import { describe, expect, test } from "vitest";
import {
  kindFromHeading,
  parseAwesomeReadme,
  placeAwesomeCandidate,
  seedSuggestTaxonomy,
} from "./awesome-list.ts";
import { categorySlugFromModel } from "./suggest.ts";

const README = `
# Awesome Telegram

## Contents

- [Bots](#bots)
- [Tools](#tools)

## Bots

* [@downbot](https://t.me/downbot) – Download videos from YouTube and TikTok.
* [@AwakariBit](https://t.me/AwakariBot) – [Open Source](https://github.com/awakari/bot-telegram) bot for search results.
* [@DownBot](https://telegram.me/downbot?start=awesome) – listed twice

### Games

* [@gamebot](https://telegram.me/gamebot) – Official telegram bot for HTML5 gaming.
* [Multi
line](https://t.me/mytetrisbot) – Tetris reborn!
Challenge your friends in a game.

### Bot Libs

#### Python

* [AIOGram](https://github.com/aiogram/aiogram) – A framework for the Telegram Bot API.

## Groups

* [@css_ru](https://t.me/css_ru) – Discussion about CSS, and solving issues

## Channels

### Unofficial

* [Daily Crypto](https://t.me/CryptoWeb3NewsDaily) – Daily digest of crypto, Web3 and DeFi news.

## Tools

* [telegram-send](https://github.com/rahiel/telegram-send) – Send messages from the command line.

## Security

* [@yazoul](https://t.me/yazoul) – Automated CVE advisories.

## 频道

* [新闻](https://t.me/some_news) – 每日新闻快讯
`;

describe("parseAwesomeReadme", () => {
  const parsed = parseAwesomeReadme(README);
  const byUser = new Map(parsed.candidates.map((candidate) => [candidate.username, candidate]));

  test("headings set the kind and nested headings inherit it", () => {
    expect(byUser.get("downbot")).toMatchObject({
      kind: "bot",
      title: "downbot",
      sections: ["Awesome Telegram", "Bots"],
    });
    expect(byUser.get("downbot")?.description).toContain("YouTube");
    expect(byUser.get("awakaribot")).toMatchObject({
      title: "AwakariBit",
      kind: "bot",
    });
    expect(byUser.get("awakaribot")?.description).toMatch(/^Open Source bot/);
    expect(byUser.get("gamebot")?.kind).toBe("bot");
    expect(byUser.get("gamebot")?.sections).toEqual(["Awesome Telegram", "Bots", "Games"]);
    expect(byUser.get("css_ru")).toMatchObject({ kind: "group", title: "css_ru" });
    expect(byUser.get("cryptoweb3newsdaily")?.kind).toBe("channel");
  });

  test("a topic heading does not invent a kind", () => {
    expect(byUser.get("yazoul")).toMatchObject({
      kind: null,
      sections: ["Awesome Telegram", "Security"],
    });
  });

  test("a Chinese kind heading counts", () => {
    expect(kindFromHeading("频道")).toBe("channel");
    expect(byUser.get("some_news")?.kind).toBe("channel");
  });

  test("markdown table rows yield candidates", () => {
    const table = `
## 一、搜索机器人

| 名字 | 链接 | 功能描述 |
| :--- | :---: | :--- |
| SOSO | [@soso](https://t.me/soso?start=a_1) | 搜索群组 |
| 网站 | [example.com](https://example.com/) | 不是用户名 |
`;
    const parsedTable = parseAwesomeReadme(table);
    expect(parsedTable.candidates).toEqual([
      expect.objectContaining({
        username: "soso",
        kind: "bot",
        description: expect.stringContaining("搜索群组"),
      }),
    ]);
    // Rows without a t.me username are ignored (not listed as skipped).
    expect(parsedTable.candidates.map((row) => row.username)).not.toContain("example");
  });

  test("joins a wrapped bullet, skips libraries, and drops a repeated username", () => {
    expect(byUser.get("mytetrisbot")?.description).toContain("Challenge your friends");
    expect(parsed.candidates.map((candidate) => candidate.username)).not.toContain("aiogram");
    expect(parsed.skipped.filter((item) => item.reason === "no_username").length).toBeGreaterThan(
      0,
    );
    expect(parsed.skipped).toContainEqual(
      expect.objectContaining({ title: "downbot", reason: "duplicate" }),
    );
  });
});

describe("placeAwesomeCandidate", () => {
  const taxonomy = seedSuggestTaxonomy();
  const parsed = parseAwesomeReadme(README);

  test("a specific blurb becomes a category; a vague one stays blank", async () => {
    const down = parsed.candidates.find((candidate) => candidate.username === "downbot");
    const css = parsed.candidates.find((candidate) => candidate.username === "css_ru");
    const crypto = parsed.candidates.find(
      (candidate) => candidate.username === "cryptoweb3newsdaily",
    );
    const security = parsed.candidates.find((candidate) => candidate.username === "yazoul");
    if (!down || !css || !crypto || !security) throw new Error("fixture parse missed a row");

    expect(await placeAwesomeCandidate(down, taxonomy)).toMatchObject({
      category: "media",
      source: "rules",
    });
    expect(await placeAwesomeCandidate(crypto, taxonomy)).toMatchObject({
      category: "crypto",
      source: "rules",
    });
    expect(await placeAwesomeCandidate(css, taxonomy)).toMatchObject({
      category: null,
      source: "none",
    });
    expect(await placeAwesomeCandidate(security, taxonomy)).toMatchObject({
      category: null,
      kind: null,
    });
  });
});

describe("categorySlugFromModel", () => {
  test("reads a binding response, a chat completion, and the HTTP envelope", () => {
    expect(categorySlugFromModel({ response: "News" })).toBe("news");
    expect(categorySlugFromModel({ choices: [{ message: { content: "group-admin" } }] })).toBe(
      "group-admin",
    );
    expect(categorySlugFromModel({ result: { response: "none" } })).toBe("none");
    expect(categorySlugFromModel({ result: "model overloaded" })).toBeNull();
  });
});
