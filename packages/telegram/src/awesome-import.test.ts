import { describe, expect, test } from "vitest";
import { clefOmniCategoryClassifier, importAwesomeReadme } from "./awesome-import.ts";
import { fixture } from "./fixtures.ts";

const LIST = `
## Bots

* [@downbot](https://t.me/downbot) – Download videos from YouTube and TikTok.

## Security

* [One](https://t.me/telegram) – notes
* [Two](https://t.me/other_channel) – also notes
`;

function fetchCounting(routes: Record<string, () => Response>) {
  const urls: string[] = [];
  const fetch = async (input: string) => {
    urls.push(input);
    const route = routes[input];
    if (!route) throw new Error(`unexpected ${input}`);
    return route();
  };
  return { fetch, urls };
}

describe("importAwesomeReadme", () => {
  test("the keyword pass files a bot and leaves the rest for later, without fetching", async () => {
    const { fetch, urls } = fetchCounting({});
    const report = await importAwesomeReadme(LIST, { fetch, fetchProfiles: false });
    expect(urls).toEqual([]);
    expect(report.ready.map((row) => row.username)).toEqual(["downbot"]);
    expect(report.ready[0]).toMatchObject({ category: "media", pace: "fast", source: "rules" });
    expect(report.review.map((row) => row.username)).toEqual(["telegram", "other_channel"]);
    expect(report.review[0]).toMatchObject({ pace: "slow", reason: "no_kind", category: null });
  });

  test("a profile supplies the kind and the category the heading did not", async () => {
    const { fetch, urls } = fetchCounting({
      "https://t.me/telegram": () => new Response(fixture("profile-channel.html"), { status: 200 }),
      "https://t.me/other_channel": () =>
        new Response(
          fixture("profile-not-found.html").replaceAll("zzqq_not_exist_987654", "other_channel"),
          { status: 200 },
        ),
    });
    const report = await importAwesomeReadme(LIST, { fetch, fetchProfiles: true, concurrency: 1 });
    expect(urls).toEqual(["https://t.me/telegram", "https://t.me/other_channel"]);
    const row = report.ready.find((item) => item.username === "telegram");
    expect(row).toMatchObject({
      pace: "slow",
      kind: "channel",
      category: "news",
      source: "rules",
      title: "Telegram News",
    });
    expect(report.rejected.map((item) => item.username)).toEqual(["other_channel"]);
    expect(report.ready.some((item) => item.username === "downbot" && item.pace === "fast")).toBe(
      true,
    );
  });

  test("a 429 stops the rest of the round", async () => {
    const { fetch, urls } = fetchCounting({
      "https://t.me/telegram": () => new Response("", { status: 429 }),
      "https://t.me/other_channel": () =>
        new Response(fixture("profile-channel.html"), { status: 200 }),
    });
    const report = await importAwesomeReadme(LIST, { fetch, fetchProfiles: true, concurrency: 1 });
    expect(urls).toEqual(["https://t.me/telegram"]);
    expect(report.unknown.map((row) => row.username)).toEqual(["telegram", "other_channel"]);
    expect(report.unknown[0]?.reason).toBe("unreachable");
  });

  test("a model slug is accepted only when it is a real category", async () => {
    const vague = `
## Groups
* [@css_ru](https://t.me/css_ru) – hello
`;
    const groupHtml = fixture("profile-group.html").replaceAll("some_group", "css_ru");
    const { fetch } = fetchCounting({
      "https://t.me/css_ru": () => new Response(groupHtml, { status: 200 }),
    });
    const report = await importAwesomeReadme(vague, {
      fetch,
      fetchProfiles: true,
      classify: async () => "tech",
    });
    expect(report.ready[0]).toMatchObject({
      username: "css_ru",
      kind: "group",
      category: "tech",
      source: "ai",
      pace: "slow",
    });
  });
});

describe("clefOmniCategoryClassifier", () => {
  const candidates = [
    { slug: "media", nameZh: "影音下载" },
    { slug: "search", nameZh: "搜索" },
  ];

  function answering(answer: { choice: string; probabilities: Record<string, number> }) {
    return async () =>
      new Response(JSON.stringify({ result: { answers: { category: answer } } }), { status: 200 });
  }

  test("keeps a category that leads every other option, including none", async () => {
    const classify = clefOmniCategoryClassifier({
      accountId: "acct",
      apiToken: "token",
      fetch: answering({ choice: "media", probabilities: { media: 0.8, none: 0.1, search: 0.05 } }),
    });
    expect(
      await classify({ kind: "bot", title: "Downloader", description: "YouTube", candidates }),
    ).toBe("media");
  });

  test("returns null when the model abstains or the lead is too small", async () => {
    const abstain = clefOmniCategoryClassifier({
      accountId: "acct",
      apiToken: "token",
      fetch: answering({ choice: "none", probabilities: { none: 0.6, media: 0.2 } }),
    });
    const close = clefOmniCategoryClassifier({
      accountId: "acct",
      apiToken: "token",
      fetch: answering({ choice: "media", probabilities: { media: 0.42, none: 0.4 } }),
    });
    expect(await abstain({ kind: "bot", title: "x", description: "y", candidates })).toBeNull();
    expect(await close({ kind: "bot", title: "x", description: "y", candidates })).toBeNull();
  });
});
