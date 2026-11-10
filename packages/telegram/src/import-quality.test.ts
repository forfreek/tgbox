import { describe, expect, test } from "vitest";
import { adHeavyRatio, isAdPreviewPost, judgeImportQuality } from "./import-quality.ts";
import type { EntrySnapshot } from "./snapshot.ts";

function snap(
  partial: Partial<EntrySnapshot> & { profile: EntrySnapshot["profile"] },
): EntrySnapshot {
  return {
    liveness: "active",
    kind: "channel",
    posts: null,
    createdAt: null,
    lang: "zh",
    activityTier: 2,
    subrequests: 1,
    rateLimited: false,
    ...partial,
  };
}

describe("import quality gates", () => {
  test("rejects grey lexicon hits", () => {
    const verdict = judgeImportQuality(
      "channel",
      snap({
        profile: {
          kind: "channel",
          title: "星探海选",
          description: "平面模特海选报名",
          avatarUrl: null,
          verified: false,
          members: 5000,
          online: null,
          monthlyUsers: null,
          pageShape: "entity",
        },
      }),
      "",
    );
    expect(verdict).toMatchObject({ action: "reject", reason: "grey_lexicon" });
  });

  test("rejects low member channels", () => {
    const verdict = judgeImportQuality(
      "channel",
      snap({
        profile: {
          kind: "channel",
          title: "小频道",
          description: "日常分享开源工具",
          avatarUrl: null,
          verified: false,
          members: 12,
          online: null,
          monthlyUsers: null,
          pageShape: "entity",
        },
      }),
      "",
    );
    expect(verdict).toMatchObject({ action: "reject", reason: "low_members" });
  });

  test("scores ad-heavy previews", () => {
    expect(isAdPreviewPost("广告投放 商务合作 https://t.me/+abc https://example.com")).toBe(true);
    expect(
      adHeavyRatio([
        { id: 1, date: 1, text: "广告投放 加我", views: 1 },
        { id: 2, date: 2, text: "同上优惠码", views: 1 },
      ]),
    ).toBe(1);
  });
});
