import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { approvedMediaKeys, downloadR2Objects, mediaObjectKeys } from "./r2-media.ts";

test("channels get posts and history; groups and bots get history only", () => {
  assert.deepEqual(
    mediaObjectKeys([
      { username: "news", kind: "channel" },
      { username: "chat", kind: "group" },
      { username: "helper", kind: "bot" },
    ]),
    ["posts/news.json", "history/news.json", "history/chat.json", "history/helper.json"],
  );
});

test("approved entries in a D1 dump become media keys, pending ones do not", () => {
  const dbPath = path.join(tmpdir(), `r2-media-${Date.now()}-${Math.random()}.sql`);
  writeFileSync(
    dbPath,
    `
    CREATE TABLE entries (username text, kind text, status text);
    INSERT INTO entries VALUES ('paymentoappbot', 'bot', 'approved');
    INSERT INTO entries VALUES ('draftchan', 'channel', 'pending');
    INSERT INTO entries VALUES ('TechDaily', 'channel', 'approved');
    INSERT INTO entries VALUES ('hiddenchan', 'channel', 'hidden_by_admin');
  `,
  );

  assert.deepEqual(approvedMediaKeys(dbPath), [
    "posts/TechDaily.json",
    "history/TechDaily.json",
    "history/paymentoappbot.json",
  ]);
});

test("downloads objects through the R2 API and skips missing keys", async () => {
  const destDir = await mkdtemp(path.join(tmpdir(), "r2-media-"));
  const seen: { url: string; authorization: string | null }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    seen.push({ url, authorization: headers.get("authorization") });
    if (url.endsWith("/objects/history/paymentoappbot.json")) {
      return new Response(JSON.stringify([{ t: "2026-11-09T00:00:00.000Z", members: 3 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ success: false }), { status: 404 });
  };

  const result = await downloadR2Objects({
    accountId: "acct",
    apiToken: "test-token",
    bucket: "tgbox-media",
    keys: ["history/paymentoappbot.json", "posts/paymentoappbot.json"],
    destDir,
    fetch: fetchImpl,
  });

  assert.deepEqual(result, { written: 1, missing: 1 });
  assert.equal(seen[0]?.authorization, "Bearer test-token");
  assert.equal(
    seen[0]?.url,
    "https://api.cloudflare.com/client/v4/accounts/acct/r2/buckets/tgbox-media/objects/history/paymentoappbot.json",
  );
  assert.equal(
    await readFile(path.join(destDir, "history/paymentoappbot.json"), "utf8"),
    '[{"t":"2026-11-09T00:00:00.000Z","members":3}]',
  );
  await assert.rejects(readFile(path.join(destDir, "posts/paymentoappbot.json"), "utf8"));
});

test("retries a rate limit, then stores the object", async () => {
  const destDir = await mkdtemp(path.join(tmpdir(), "r2-media-"));
  let calls = 0;
  const fetchImpl: typeof fetch = async () => {
    calls++;
    if (calls === 1) {
      return new Response("slow down", { status: 429, headers: { "retry-after": "0" } });
    }
    return new Response("[]", { status: 200 });
  };

  const result = await downloadR2Objects({
    accountId: "acct",
    apiToken: "test-token",
    bucket: "tgbox-media",
    keys: ["history/helper.json"],
    destDir,
    fetch: fetchImpl,
  });

  assert.equal(calls, 2);
  assert.deepEqual(result, { written: 1, missing: 0 });
  assert.equal(await readFile(path.join(destDir, "history/helper.json"), "utf8"), "[]");
});

test("a refused R2 read fails the build instead of looking like a missing file", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response('{"success":false,"errors":[{"message":"Authentication error"}]}', {
      status: 403,
    });
  await assert.rejects(
    downloadR2Objects({
      accountId: "acct",
      apiToken: "test-token",
      bucket: "tgbox-media",
      keys: ["history/helper.json"],
      destDir: await mkdtemp(path.join(tmpdir(), "r2-media-")),
      fetch: fetchImpl,
    }),
    /GET R2 object history\/helper\.json failed: HTTP 403/,
  );
});
