import { describe, expect, test } from "vitest";
import { fixture } from "./fixtures.ts";
import { fetchEntrySnapshot } from "./snapshot.ts";

const now = new Date("2026-05-20T00:00:00Z");

test("profile cooldown emits no synthetic observation or fetch", async () => {
  const { fetch, calls } = fakeFetch({});
  const until = now.getTime() + 60_000;
  const snapshot = await fetchEntrySnapshot("telegram", {
    fetch,
    now,
    knownKind: "channel",
    needCreatedAt: true,
    cooldowns: { tme_profile: until },
  });
  expect(calls).toEqual([]);
  expect(snapshot).toMatchObject({
    health: null,
    subrequests: 0,
    deferredUntil: until,
    sourceResults: {},
  });
});
test("avatar acquisition reads only profile without health or posts", async () => {
  const { fetch, calls } = fakeFetch({ "https://t.me/telegram": html("profile-channel.html") });
  const snapshot = await fetchEntrySnapshot("telegram", {
    fetch,
    now,
    knownKind: "channel",
    needCreatedAt: true,
    purpose: "avatar",
  });
  expect(calls).toHaveLength(1);
  expect(snapshot).toMatchObject({ health: null, posts: null, createdAt: null, subrequests: 1 });
});
test("first-post throttling backs off preview without changing public identity", async () => {
  const { fetch } = fakeFetch({
    "https://t.me/telegram": html("profile-channel.html"),
    "https://t.me/s/telegram": html("channel-posts.html"),
    "https://t.me/s/telegram/1": () =>
      new Response(null, { status: 429, headers: { "retry-after": "600" } }),
  });
  const snapshot = await fetchEntrySnapshot("telegram", {
    fetch,
    now,
    knownKind: "channel",
    needCreatedAt: true,
  });
  expect(snapshot.health?.outcome).toBe("recognized");
  expect(snapshot.sourceResults.tme_preview).toMatchObject({
    outcome: "rate_limited",
    retryAfterMs: 600_000,
  });
});
test("preview 429 retains recognized identity and independent Retry-After", async () => {
  const { fetch } = fakeFetch({
    "https://t.me/telegram": html("profile-channel.html"),
    "https://t.me/s/telegram": () =>
      new Response(null, { status: 429, headers: { "retry-after": "7200" } }),
  });
  const snapshot = await fetchEntrySnapshot("telegram", {
    fetch,
    now,
    knownKind: "channel",
    needCreatedAt: true,
  });
  expect(snapshot.health).toMatchObject({
    outcome: "recognized",
    reason: "profile_recognized",
    previewUnavailable: true,
  });
  expect(snapshot.sourceResults).toMatchObject({
    tme_profile: { outcome: "parsed" },
    tme_preview: { outcome: "rate_limited", retryAfterMs: 7_200_000 },
  });
});
test("redirect evidence strips secrets and absent Location stays absent", async () => {
  for (const location of ["https://t.me/another?token=secret#fragment", null]) {
    const { fetch } = fakeFetch({
      "https://t.me/telegram": () =>
        new Response(null, { status: 302, headers: location ? { location } : {} }),
    });
    const snapshot = await fetchEntrySnapshot("telegram", {
      fetch,
      now,
      knownKind: "channel",
      needCreatedAt: false,
    });
    expect(snapshot.health?.redirectTarget).toBe(location ? "t.me/another" : undefined);
    expect(JSON.stringify(snapshot.health)).not.toContain("secret");
  }
});

type Route = Response | "throw";

function fakeFetch(routes: Record<string, () => Route>) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = routes[url];
    const res = route?.();
    if (!res || res === "throw") throw new TypeError("network error");
    return res;
  };
  return { fetch, calls };
}

const html = (name: string) => () => new Response(fixture(name), { status: 200 });
const redirect = (location: string) => () =>
  new Response(null, { status: 302, headers: { location } });

describe("fetchEntrySnapshot", () => {
  test("active channel: profile + /s/ + first post, with browser UA and manual redirects", async () => {
    const { fetch, calls } = fakeFetch({
      "https://t.me/telegram": html("profile-channel.html"),
      "https://t.me/s/telegram": html("channel-posts.html"),
      "https://t.me/s/telegram/1": html("channel-first-post.html"),
    });
    const snap = await fetchEntrySnapshot("telegram", {
      fetch,
      now,
      knownKind: "channel",
      needCreatedAt: true,
    });
    expect(snap).toMatchObject({
      liveness: "active",
      kind: "channel",
      createdAt: "2015-09-21T02:14:24+00:00",
      lang: "en",
      subrequests: 3,
      rateLimited: false,
    });
    expect(snap.profile?.members).toBe(9538357);
    expect(snap.posts).toHaveLength(20);
    expect(snap.activityTier).not.toBeNull();
    for (const call of calls) {
      expect(new Headers(call.init?.headers).get("user-agent")).toMatch(/Mozilla\/5\.0/);
    }
    expect(calls[1]?.init?.redirect).toBe("manual");
  });

  test("group: creation date from the first message's embed, no posts or tier", async () => {
    const { fetch } = fakeFetch({
      "https://t.me/grammyjs": html("profile-group.html"),
      "https://t.me/grammyjs/1?embed=1&mode=tme": html("group-first-message.html"),
    });
    const snap = await fetchEntrySnapshot("grammyjs", {
      fetch,
      now,
      knownKind: "group",
      needCreatedAt: true,
    });
    expect(snap).toMatchObject({
      liveness: "active",
      kind: "group",
      posts: null,
      createdAt: "2026-06-10T13:05:35+00:00",
      activityTier: null,
      subrequests: 2,
    });
  });

  test("group whose first message was deleted: no creation date", async () => {
    const { fetch } = fakeFetch({
      "https://t.me/grammyjs": html("profile-group.html"),
      "https://t.me/grammyjs/1?embed=1&mode=tme": html("group-first-message-deleted.html"),
    });
    const snap = await fetchEntrySnapshot("grammyjs", {
      fetch,
      now,
      knownKind: "group",
      needCreatedAt: true,
    });
    expect(snap).toMatchObject({ liveness: "active", createdAt: null, subrequests: 2 });
  });

  test("group with a known creation date: only the profile is fetched", async () => {
    const { fetch } = fakeFetch({ "https://t.me/grammyjs": html("profile-group.html") });
    const snap = await fetchEntrySnapshot("grammyjs", {
      fetch,
      now,
      knownKind: "group",
      needCreatedAt: false,
    });
    expect(snap).toMatchObject({ liveness: "active", createdAt: null, subrequests: 1 });
  });

  test("normal channel with redirecting preview stays active", async () => {
    const { fetch } = fakeFetch({
      "https://t.me/telegram": html("profile-channel.html"),
      "https://t.me/s/telegram": redirect("https://t.me/telegram"),
    });
    const snap = await fetchEntrySnapshot("telegram", {
      fetch,
      now,
      knownKind: "channel",
      needCreatedAt: true,
    });
    expect(snap).toMatchObject({
      liveness: "active",
      posts: null,
      createdAt: null,
      subrequests: 2,
    });
  });

  test("new submission of a channel with redirecting preview stays active", async () => {
    const { fetch } = fakeFetch({
      "https://t.me/telegram": html("profile-channel.html"),
      "https://t.me/s/telegram": redirect("https://t.me/telegram"),
    });
    const snap = await fetchEntrySnapshot("telegram", {
      fetch,
      now,
      knownKind: null,
      needCreatedAt: false,
    });
    expect(snap).toMatchObject({ liveness: "active", kind: "channel", posts: null });
  });

  test("429 → unknown and flagged as rate limited", async () => {
    const { fetch } = fakeFetch({
      "https://t.me/telegram": () => new Response("Too Many Requests", { status: 429 }),
    });
    const snap = await fetchEntrySnapshot("telegram", {
      fetch,
      now,
      knownKind: "channel",
      needCreatedAt: true,
    });
    expect(snap).toMatchObject({
      liveness: "unknown",
      profile: null,
      rateLimited: true,
      subrequests: 1,
    });
  });

  test("429 on the /s/ page keeps profile liveness but flags rate limiting", async () => {
    const { fetch } = fakeFetch({
      "https://t.me/telegram": html("profile-channel.html"),
      "https://t.me/s/telegram": () => new Response("", { status: 429 }),
    });
    const snap = await fetchEntrySnapshot("telegram", {
      fetch,
      now,
      knownKind: "channel",
      needCreatedAt: true,
    });
    expect(snap).toMatchObject({
      liveness: "active",
      posts: null,
      rateLimited: true,
      subrequests: 2,
    });
  });

  test.each([
    ["network error", () => "throw" as const],
    ["5xx", () => new Response("", { status: 502 })],
    ["malformed page", html("malformed.html")],
  ])("%s → unknown, never throws", async (_label, route) => {
    const { fetch } = fakeFetch({ "https://t.me/BotFather": route });
    const snap = await fetchEntrySnapshot("BotFather", {
      fetch,
      now,
      knownKind: "bot",
      needCreatedAt: false,
    });
    expect(snap).toMatchObject({ liveness: "unknown", rateLimited: false, subrequests: 1 });
  });

  test("not found profile", async () => {
    const { fetch } = fakeFetch({
      "https://t.me/zzqq_not_exist_987654": html("profile-not-found.html"),
    });
    const snap = await fetchEntrySnapshot("zzqq_not_exist_987654", {
      fetch,
      now,
      knownKind: "bot",
      needCreatedAt: false,
    });
    expect(snap).toMatchObject({ liveness: "unknown", kind: null, lang: null, subrequests: 1 });
  });
});
