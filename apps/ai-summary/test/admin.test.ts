import { env } from "cloudflare:workers";
import {
  createDb,
  getSummaryConfig,
  getSummaryJob,
  getSummarySource,
  getSummaryUsage,
  insertApprovedEntry,
  listSummaryAdmin,
  listSummaryRevisions,
  summaryAdminDetail,
} from "@tgbox/db";
import { SUMMARY_MODEL, SUMMARY_PARAMS_VERSION, SUMMARY_PROMPT_VERSION } from "@tgbox/shared";
import { beforeEach, expect, test, vi } from "vitest";
import {
  SummaryBatch,
  SummaryConfigInput,
  summaryBatch,
  summaryCommand,
} from "../../admin/src/server/ai-summary.ts";
import worker from "../src/index.ts";
import { createSummaryModel } from "../src/models.ts";
import { publishSummaryEntry } from "../src/publish.ts";
import { observeEntry } from "../src/sources.ts";
import {
  consumeSummaryMessage,
  dispatchSummaryOutbox,
  type SummaryMessage,
  tickSummaryTasks,
} from "../src/tasks.ts";

type CoreContext = Parameters<typeof summaryBatch>[0];

const db = createDb(env.DB),
  NOW = Date.UTC(2026, 10, 22, 14);
const core: CoreContext = {
  db,
  now: () => NOW,
  fetch: vi.fn(),
  config: { GITHUB_REPO: "", GITHUB_DISPATCH_TOKEN: "" },
};
const actor = "email:reviewer@example.com";
const output = {
  status: "ok",
  sentences: [{ zh: "将语音转为文字。", en: "Transcribes speech into text.", refs: ["profile"] }],
};
beforeEach(async () => {
  await env.DB.batch(
    [
      "DELETE FROM entries",
      "DELETE FROM entry_stats",
      "DELETE FROM entry_tags",
      "DELETE FROM entries_fts",
      "DELETE FROM hidden_posts",
      "DELETE FROM ai_summary_attempts",
      "DELETE FROM ai_summary_runs",
      "DELETE FROM audit_log",
      "DELETE FROM settings",
    ].map((sql) => env.DB.prepare(sql)),
  );
  await env.DB.prepare(
    "UPDATE ai_summary_settings SET enabled=1,auto_scan=0,model=?,prompt_version=?,params_version=?,daily_calls=100,daily_neurons=10000,reservation=100,max_attempts=3 WHERE id=1",
  )
    .bind(SUMMARY_MODEL, SUMMARY_PROMPT_VERSION, SUMMARY_PARAMS_VERSION)
    .run();
});
async function entry(username = "summary_bot", kind: "bot" | "channel" = "bot") {
  return (
    await insertApprovedEntry(db, {
      entry: {
        username,
        kind,
        description: "将语音转为文字",
        title: username,
        categoryId: kind === "bot" ? 24 : 1,
        listedAt: NOW,
      },
      stats: { members: 1, online: null, activityTier: null, statsWrittenAt: NOW },
      tagIds: [],
      now: NOW,
    })
  ).id;
}
async function queued(id: number) {
  await observeEntry(db, env.MEDIA, id, await getSummaryConfig(db), NOW);
  const rows: SummaryMessage[] = [];
  await dispatchSummaryOutbox(
    db,
    {
      sendBatch: async (messages) => {
        rows.push(...messages.map((m) => m.body));
      },
    },
    NOW,
  );
  const message = rows.find((r) => r.entryId === id);
  if (!message) throw new Error("Missing message");
  return message;
}
async function draft() {
  const id = await entry();
  const message = await queued(id);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    message,
    () => NOW,
    async () => output,
  );
  return { id, revision: (await listSummaryRevisions(db, id))[0] };
}
async function base(entryId: number) {
  const s = await getSummarySource(db, entryId);
  if (!s) throw new Error("Missing source");
  return { entryId, expectedVersion: s.editVersion, observationToken: s.observationToken };
}
async function edit(id: number, revisionId: string) {
  return summaryCommand(
    core,
    env.MEDIA,
    {
      action: "edit",
      ...(await base(id)),
      revisionId,
      zh: "将语音转为文字。",
      hant: "將語音轉為文字。",
      en: "Transcribes speech into text.",
    },
    actor,
  );
}

test("one manual command publishes with no source or revision, locks, and rejects stale writes", async () => {
  const id = await entry();
  await env.DB.prepare("UPDATE entries SET description='' WHERE id=?").bind(id).run();
  const before = await summaryAdminDetail(db, id);
  const command = {
    action: "publish_manual",
    entryId: id,
    expectedVersion: 0,
    observationToken: null,
    sourceGuard: before.entry?.source_guard,
    zh: "将语音转为文字。",
    hant: "將語音轉為文字。",
    en: "Transcribes speech into text.",
  };
  expect(before.source).toBeNull();
  await expect(summaryCommand(core, env.MEDIA, command, actor)).resolves.toEqual({ ok: true });
  const after = await summaryAdminDetail(db, id);
  expect(after.revisions).toEqual([]);
  expect(after.source).toMatchObject({ locked: true, editVersion: 1 });
  expect(after.review).toMatchObject({ status: "approved", revision_id: null, hant: command.hant });
  expect(after.publicContract).toBe(1);
  expect(await getSummaryUsage(db, NOW)).toMatchObject({ calls: 0, neurons: 0 });
  await expect(summaryCommand(core, env.MEDIA, command, actor)).rejects.toThrow("编辑版本已变化");
  await summaryCommand(core, env.MEDIA, { action: "withdraw", ...(await base(id)) }, actor);
  expect((await summaryAdminDetail(db, id)).publicContract).toBeNull();
});

test("publishing by hand supersedes queued generation and supports subsequent manual edits", async () => {
  const id = await entry();
  const message = await queued(id);
  const sourceGuard = (await summaryAdminDetail(db, id)).entry?.source_guard;
  const text = { zh: "手写摘要。", hant: "手寫摘要。", en: "Handwritten summary." };
  await summaryCommand(
    core,
    env.MEDIA,
    { action: "publish_manual", ...(await base(id)), sourceGuard, ...text },
    actor,
  );
  expect((await getSummaryJob(db, message.jobId))?.status).toBe("superseded");
  await summaryCommand(
    core,
    env.MEDIA,
    { action: "publish_manual", ...(await base(id)), sourceGuard, ...text, en: "Updated text." },
    actor,
  );
  const detail = await summaryAdminDetail(db, id);
  expect(detail.review).toMatchObject({
    revision_id: null,
    status: "approved",
    en: "Updated text.",
  });
  expect(detail.source?.locked).toBe(true);
});

test("preflight is read-only, selected generation is idempotent and does not infer", async () => {
  const id = await entry();
  expect(
    (await summaryBatch(core, env.MEDIA, { ids: [id], generate: false }, actor)).rows[0]?.status,
  ).toBe("eligible");
  expect(await getSummarySource(db, id)).toBeUndefined();
  await summaryBatch(core, env.MEDIA, { ids: [id], generate: true }, actor);
  await summaryBatch(core, env.MEDIA, { ids: [id], generate: true }, actor);
  expect(
    (await env.DB.prepare("SELECT count(*) AS n FROM ai_summary_jobs").first<{ n: number }>())?.n,
  ).toBe(1);
  expect((await getSummaryUsage(db, NOW))?.calls).toBe(0);
  expect(
    SummaryBatch.safeParse({ ids: Array.from({ length: 21 }, (_, i) => i + 1), generate: true })
      .success,
  ).toBe(false);
  expect(SummaryBatch.safeParse({ ids: [id, id], generate: true }).success).toBe(false);
});

test("machine publications appear in published and sampling lists; sampling keeps automatic updates enabled", async () => {
  const { id } = await draft();
  await publishSummaryEntry(db, env.MEDIA, id, NOW);
  expect((await summaryAdminDetail(db, id)).publicContract).toBe(2);
  expect(
    (await listSummaryAdmin(db, "approved", Number.MAX_SAFE_INTEGER)).rows[0]?.review_status,
  ).toBe("auto_published");
  expect((await listSummaryAdmin(db, "pending", Number.MAX_SAFE_INTEGER)).rows).toHaveLength(0);
  const source = await getSummarySource(db, id);
  await summaryCommand(core, env.MEDIA, { action: "sample", ...(await base(id)) }, actor);
  expect(await getSummarySource(db, id)).toEqual(source);
  expect((await listSummaryAdmin(db, "sample", Number.MAX_SAFE_INTEGER)).rows[0]?.sampled_at).toBe(
    NOW,
  );
  expect((await summaryAdminDetail(db, id)).review).toBeNull();
});

test("withdrawing machine publication prevents republishing and preserves a manual withdrawal", async () => {
  const { id } = await draft();
  await publishSummaryEntry(db, env.MEDIA, id, NOW);
  await summaryCommand(core, env.MEDIA, { action: "withdraw", ...(await base(id)) }, actor);
  expect((await summaryAdminDetail(db, id)).review?.status).toBe("withdrawn");
  await publishSummaryEntry(db, env.MEDIA, id, NOW);
  expect(
    await env.DB.prepare("SELECT * FROM ai_summary_public WHERE entry_id=?").bind(id).first(),
  ).toBeNull();
});

test("automatic publisher leaves manual draft, approval and lock untouched", async () => {
  const { id, revision } = await draft();
  if (!revision) throw new Error("Missing revision");
  await edit(id, revision.id);
  await publishSummaryEntry(db, env.MEDIA, id, NOW);
  expect(
    await env.DB.prepare("SELECT * FROM ai_summary_public WHERE entry_id=?").bind(id).first(),
  ).toBeNull();
  await summaryCommand(
    core,
    env.MEDIA,
    { action: "approve", ...(await base(id)), revisionId: revision.id },
    actor,
  );
  const before = await env.DB.prepare("SELECT * FROM ai_summary_public WHERE entry_id=?")
    .bind(id)
    .first();
  await publishSummaryEntry(db, env.MEDIA, id, NOW);
  expect(
    await env.DB.prepare("SELECT * FROM ai_summary_public WHERE entry_id=?").bind(id).first(),
  ).toEqual(before);
  expect(before?.contract_version).toBe(1);
});

test("quota waits are not included in the failures list", async () => {
  const id = await entry();
  const msg = await queued(id);
  await env.DB.prepare("UPDATE ai_summary_settings SET daily_neurons=0 WHERE id=1").run();
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    msg,
    () => NOW,
    async () => output,
  );
  expect((await getSummaryJob(db, msg.jobId))?.reason).toBe("quota_or_policy");
  expect((await listSummaryAdmin(db, "failed", Number.MAX_SAFE_INTEGER)).rows).toEqual([]);
});

test.each(["approve", "edit", "withdraw"] as const)(
  "%s during a build preserves a subsequent build",
  async (action) => {
    const { id, revision } = await draft();
    if (!revision) throw new Error("Missing revision");
    await edit(id, revision.id);
    if (action !== "approve")
      await summaryCommand(
        core,
        env.MEDIA,
        { action: "approve", ...(await base(id)), revisionId: revision.id },
        actor,
      );
    await env.DB.prepare("INSERT OR REPLACE INTO site_state(key,value) VALUES('dirty_since',?)")
      .bind(String(NOW - 1000))
      .run();
    if (action === "edit") await edit(id, revision.id);
    else
      await summaryCommand(
        core,
        env.MEDIA,
        {
          action,
          ...(await base(id)),
          ...(action === "approve" ? { revisionId: revision.id } : {}),
        },
        actor,
      );
    await env.DB.prepare(
      "DELETE FROM site_state WHERE key='dirty_since' AND CAST(value AS INTEGER)<?",
    )
      .bind(NOW - 1)
      .run();
    expect(
      await env.DB.prepare("SELECT value FROM site_state WHERE key='dirty_since'").first(),
    ).toEqual({ value: String(NOW) });
  },
);
test("configuration CAS prevents lost updates and unverified model or tiny reservation is rejected", async () => {
  const expected = await getSummaryConfig(db);
  const { id: _, ...config } = expected;
  const results = await Promise.allSettled(
    [10, 20].map((dailyCalls) =>
      summaryCommand(
        core,
        env.MEDIA,
        { action: "config", expected, config: { ...config, dailyCalls } },
        actor,
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(SummaryConfigInput.safeParse({ ...config, model: "unreviewed" }).success).toBe(false);
  expect(SummaryConfigInput.safeParse({ ...config, reservation: 1 }).success).toBe(false);
});
test("edit locks and fences the source; approve sample withdraw are explicit and audited", async () => {
  const { id, revision } = await draft();
  if (!revision) throw new Error("Missing draft");
  await edit(id, revision.id);
  expect((await getSummarySource(db, id))?.locked).toBe(true);
  await expect(
    summaryCommand(core, env.MEDIA, { action: "sample", ...(await base(id)) }, actor),
  ).rejects.toThrow("已批准");
  await summaryCommand(
    core,
    env.MEDIA,
    { action: "approve", ...(await base(id)), revisionId: revision.id },
    actor,
  );
  expect((await summaryAdminDetail(db, id)).review?.status).toBe("approved");
  expect((await listSummaryAdmin(db, "sample", Number.MAX_SAFE_INTEGER)).rows[0]?.id).toBe(id);
  await summaryCommand(core, env.MEDIA, { action: "sample", ...(await base(id)) }, actor);
  expect((await summaryAdminDetail(db, id)).review?.sampled_at).toBe(NOW);
  await summaryCommand(core, env.MEDIA, { action: "withdraw", ...(await base(id)) }, actor);
  expect((await summaryAdminDetail(db, id)).review?.status).toBe("withdrawn");
  expect(
    (
      await env.DB.prepare("SELECT description FROM entries WHERE id=?")
        .bind(id)
        .first<{ description: string }>()
    )?.description,
  ).toBe("将语音转为文字");
  expect(
    (await env.DB.prepare("SELECT count(*) AS n FROM audit_log").first<{ n: number }>())?.n,
  ).toBe(4);
});
test("two editors cannot overwrite each other and changed profiles cannot be approved", async () => {
  const { id, revision } = await draft();
  if (!revision) throw new Error("Missing draft");
  const stale = await base(id);
  await edit(id, revision.id);
  await expect(
    summaryCommand(
      core,
      env.MEDIA,
      {
        action: "edit",
        ...stale,
        revisionId: revision.id,
        zh: "旧内容",
        hant: "舊內容",
        en: "Old text.",
      },
      actor,
    ),
  ).rejects.toThrow("版本已变化");
  await env.DB.prepare("UPDATE entries SET description='内容已变化' WHERE id=?").bind(id).run();
  await expect(
    summaryCommand(
      core,
      env.MEDIA,
      { action: "approve", ...(await base(id)), revisionId: revision.id },
      actor,
    ),
  ).rejects.toThrow();
  expect((await summaryAdminDetail(db, id)).review?.status).toBe("draft");
  await summaryCommand(core, env.MEDIA, { action: "withdraw", ...(await base(id)) }, actor);
  expect((await summaryAdminDetail(db, id)).review?.status).toBe("withdrawn");
});
test("manual edit prevents a concurrently running model from committing a new revision", async () => {
  const { id, revision } = await draft();
  if (!revision) throw new Error("Missing draft");
  await summaryCommand(core, env.MEDIA, { action: "lock", ...(await base(id)) }, actor);
  await summaryCommand(core, env.MEDIA, { action: "unlock", ...(await base(id)) }, actor);
  const msg = await queued(id);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    msg,
    () => NOW,
    async () => {
      await edit(id, revision.id);
      return output;
    },
  );
  expect(await listSummaryRevisions(db, id)).toHaveLength(1);
  expect((await summaryAdminDetail(db, id)).review?.zh).toBe("将语音转为文字。");
  expect((await getSummaryJob(db, msg.jobId))?.status).toBe("superseded");
});
test("changed R2 evidence cannot be approved even while the manual draft is locked", async () => {
  const id = await entry("review_channel", "channel");
  const path = "posts/review_channel.json";
  await env.MEDIA.put(
    path,
    JSON.stringify([{ id: 1, date: "2026-11-22T00:00:00Z", text: "分享公开说明", views: 1 }]),
  );
  const msg = await queued(id);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    msg,
    () => NOW,
    async () => output,
  );
  const revision = (await listSummaryRevisions(db, id))[0];
  if (!revision) throw new Error("Missing draft");
  await edit(id, revision.id);
  await env.MEDIA.put(
    path,
    JSON.stringify([{ id: 1, date: "2026-11-22T00:00:00Z", text: "资料已经更换", views: 2 }]),
  );
  await expect(
    summaryCommand(
      core,
      env.MEDIA,
      { action: "approve", ...(await base(id)), revisionId: revision.id },
      actor,
    ),
  ).rejects.toThrow();
  expect((await summaryAdminDetail(db, id)).review?.status).toBe("draft");
});

test("public projection follows approval/edit/withdraw atomically and only content changes dirty the site", async () => {
  const { id, revision } = await draft();
  if (!revision) throw new Error("Missing draft");
  await edit(id, revision.id);
  await env.DB.prepare("DELETE FROM site_state WHERE key='dirty_since'").run();
  const act = async (action: "approve" | "withdraw" | "sample") =>
    summaryCommand(
      core,
      env.MEDIA,
      { action, ...(await base(id)), ...(action === "approve" ? { revisionId: revision.id } : {}) },
      actor,
    );
  await act("approve");
  const row = await env.DB.prepare("SELECT * FROM ai_summary_public WHERE entry_id=?")
    .bind(id)
    .first();
  expect(Object.keys(row ?? {}).sort()).toEqual(
    ["entry_id", "zh", "hant", "en", "fingerprint", "contract_version"].sort(),
  );
  expect(row?.hant).toBe("將語音轉為文字。");
  expect(
    await env.DB.prepare("SELECT value FROM site_state WHERE key='dirty_since'").first(),
  ).not.toBeNull();
  await env.DB.prepare("DELETE FROM site_state WHERE key='dirty_since'").run();
  await act("approve");
  await act("sample");
  expect(
    await env.DB.prepare("SELECT value FROM site_state WHERE key='dirty_since'").first(),
  ).toBeNull();
  await edit(id, revision.id);
  expect(
    await env.DB.prepare("SELECT * FROM ai_summary_public WHERE entry_id=?").bind(id).first(),
  ).toBeNull();
  await act("approve");
  await act("withdraw");
  expect(
    await env.DB.prepare("SELECT * FROM ai_summary_public WHERE entry_id=?").bind(id).first(),
  ).toBeNull();
});

test("projection write failure rolls back approval and source fencing together", async () => {
  const { id, revision } = await draft();
  if (!revision) throw new Error("Missing draft");
  await edit(id, revision.id);
  const old = await base(id);
  await env.DB.exec(
    "CREATE TRIGGER reject_projection BEFORE INSERT ON ai_summary_public BEGIN SELECT RAISE(ABORT,'test_failure'); END;",
  );
  try {
    await expect(
      summaryCommand(
        core,
        env.MEDIA,
        { action: "approve", ...old, revisionId: revision.id },
        actor,
      ),
    ).rejects.toThrow();
    expect((await summaryAdminDetail(db, id)).review?.status).toBe("draft");
    expect(await base(id)).toEqual(old);
  } finally {
    await env.DB.exec("DROP TRIGGER reject_projection");
  }
});

test("insufficient results cannot be ordinarily retried or approved", async () => {
  const id = await entry();
  const msg = await queued(id);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    msg,
    () => NOW,
    async () => ({ status: "insufficient", sentences: [] }),
  );
  await expect(
    summaryCommand(core, env.MEDIA, { action: "retry", entryId: id }, actor),
  ).rejects.toThrow("技术失败");
  const revision = (await listSummaryRevisions(db, id))[0];
  if (!revision) throw new Error("Missing skipped result");
  await expect(edit(id, revision.id)).rejects.toThrow();
  expect((await getSummaryUsage(db, NOW))?.calls).toBe(1);
});
test("technical retry preserves spent quota and creates a new generation", async () => {
  const id = await entry();
  const msg = await queued(id);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    msg,
    () => NOW,
    async () => {
      throw new Error("upstream");
    },
  );
  await summaryCommand(core, env.MEDIA, { action: "retry", entryId: id }, actor);
  expect((await getSummaryUsage(db, NOW))?.calls).toBe(1);
  expect((await getSummaryJob(db, msg.jobId))?.status).toBe("superseded");
  expect((await getSummarySource(db, id))?.generation).toBe(2);
});
test("unsupported combinations do not reserve quota and each call receives job versions", async () => {
  const id = await entry();
  const msg = await queued(id);
  const model = vi.fn(async () => output);
  await env.DB.prepare("UPDATE ai_summary_settings SET prompt_version='old' WHERE id=1").run();
  await consumeSummaryMessage(db, env.MEDIA, msg, () => NOW, model);
  expect(model).not.toHaveBeenCalled();
  expect((await getSummaryUsage(db, NOW))?.calls).toBe(0);
  expect((await getSummaryJob(db, msg.jobId))?.reason).toBe("unsupported_config");
  const run = vi.fn();
  const adapter = createSummaryModel(
    { run },
    { promptVersion: SUMMARY_PROMPT_VERSION, paramsVersion: SUMMARY_PARAMS_VERSION },
  );
  await expect(
    adapter({}, SUMMARY_MODEL, { promptVersion: "old", paramsVersion: SUMMARY_PARAMS_VERSION }),
  ).rejects.toThrow("unsupported_summary_version");
  expect(run).not.toHaveBeenCalled();
});
test("newly enabled queue processing does not start all-site scanning unless opted in", async () => {
  await entry();
  const sendBatch = vi.fn();
  await tickSummaryTasks(db, env.MEDIA, { sendBatch }, () => NOW);
  expect(
    (await env.DB.prepare("SELECT count(*) AS n FROM ai_summary_sources").first<{ n: number }>())
      ?.n,
  ).toBe(0);
  expect(
    (await env.DB.prepare("SELECT count(*) AS n FROM ai_summary_runs").first<{ n: number }>())?.n,
  ).toBe(0);
  expect(sendBatch).not.toHaveBeenCalled();
});
test("queue passes versions to the model and the entry point uses the adapter with a mocked binding", async () => {
  const id = await entry();
  const msg = await queued(id);
  const model = vi.fn(async () => output);
  await consumeSummaryMessage(db, env.MEDIA, msg, () => NOW, model);
  expect(model).toHaveBeenCalledWith(expect.any(Object), SUMMARY_MODEL, {
    promptVersion: SUMMARY_PROMPT_VERSION,
    paramsVersion: SUMMARY_PARAMS_VERSION,
  });
  const second = await entry("second_bot");
  const next = await queued(second);
  const spy = vi.spyOn(env.AI, "run").mockResolvedValue({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(output) } }],
  });
  try {
    const ack = vi.fn(),
      retry = vi.fn();
    await worker.queue(
      {
        queue: "tgbox-ai-summary",
        metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } },
        ackAll: vi.fn(),
        retryAll: vi.fn(),
        messages: [
          { body: next, id: "mocked-ai", timestamp: new Date(NOW), attempts: 1, ack, retry },
        ],
      },
      { ...env, AI_SUMMARY_ENTRY_IDS: String(second) },
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
    expect(await listSummaryRevisions(db, second)).toHaveLength(1);
  } finally {
    spy.mockRestore();
  }
});
