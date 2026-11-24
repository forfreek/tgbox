import { env } from "cloudflare:workers";
import {
  advanceSummaryRun,
  aiSummaryAttempts,
  aiSummaryJobs,
  aiSummaryRevisions,
  aiSummaryRuns,
  claimSummaryJob,
  claimSummaryRun,
  createDb,
  createSummaryRun,
  finishSummaryJob,
  getSummaryConfig,
  getSummaryJob,
  getSummarySource,
  insertApprovedEntry,
  listSummaryRevisions,
  observeSummarySource,
  readSummaryEntry,
  recoverSummaryLeases,
  SUMMARY_LEASE_MS,
  setSummaryLocked,
} from "@tgbox/db";
import { beforeEach, expect, test, vi } from "vitest";
import worker from "../src/index.ts";
import { publishSummaryEntry, sweepSummaryPublication } from "../src/publish.ts";
import { observeEntry } from "../src/sources.ts";
import {
  consumeSummaryDlq,
  consumeSummaryMessage,
  consumeSummaryObservation,
  dispatchSummaryOutbox,
  type SummaryMessage,
  scanSummaryRun,
  tickSummaryTasks,
} from "../src/tasks.ts";

const db = createDb(env.DB);
const NOW = Date.UTC(2026, 10, 22, 12);
const output = {
  status: "ok",
  sentences: [{ zh: "支持语音转为文字。", en: "Converts voice to text.", refs: ["profile"] }],
};

test("a fixed 50-entry rollout scans and consumes only its scope without repeating inference", async () => {
  const scope: number[] = [];
  for (let i = 0; i < 50; i++) scope.push(await entry(`rollout_${i}_bot`));
  const outside = await entry("outside_rollout_bot");
  await observe(outside);
  const model = vi.fn(async () => output);
  const sendBatch = vi.fn(async (rows: { body: SummaryMessage }[]) => {
    for (const row of rows) {
      expect(scope).toContain(row.body.entryId);
      await consumeSummaryMessage(
        db,
        env.MEDIA,
        row.body,
        () => row.body.dispatchedAt,
        model,
        Math.random,
        scope,
      );
    }
  });
  for (let slot = 0; slot < 26; slot++) {
    await tickSummaryTasks(db, env.MEDIA, { sendBatch }, () => NOW + slot * 300_000, scope);
  }
  expect(model).toHaveBeenCalledTimes(50);
  expect(await db.select().from(aiSummaryRuns)).toEqual([]);
  expect((await db.select().from(aiSummaryJobs)).find((j) => j.entryId === outside)?.status).toBe(
    "pending",
  );
  expect(await db.select().from(aiSummaryAttempts)).toHaveLength(50);
}, 30_000);

test("empty scope blocks scanning, dispatch and forged outside-scope delivery", async () => {
  const msg = await queued(await entry());
  const sendBatch = vi.fn(async () => {});
  const model = vi.fn(async () => output);
  await tickSummaryTasks(db, env.MEDIA, { sendBatch }, () => NOW, []);
  await consumeSummaryMessage(db, env.MEDIA, msg, () => NOW, model, Math.random, []);
  await consumeSummaryMessage(db, env.MEDIA, msg, () => NOW, model, Math.random, [msg.entryId + 1]);
  expect(sendBatch).not.toHaveBeenCalled();
  expect(model).not.toHaveBeenCalled();
  expect(await db.select().from(aiSummaryRuns)).toEqual([]);
  expect(await db.select().from(aiSummaryAttempts)).toEqual([]);
});

test("global entry point discovers resources outside the old selected scope without changing quotas", async () => {
  const first = await entry("global_first_bot");
  const second = await entry("global_second_bot");
  const before = await getSummaryConfig(db);
  const sendBatch = vi.fn(async () => {});
  await worker.scheduled({} as ScheduledController, {
    ...env,
    AI_SUMMARY_SCOPE: "all",
    AI_SUMMARY_ENTRY_IDS: "",
    SUMMARY_QUEUE: { sendBatch } as unknown as Queue,
  });
  expect((await db.select().from(aiSummaryJobs)).map((j) => j.entryId).sort()).toEqual(
    [first, second].sort(),
  );
  expect(sendBatch).toHaveBeenCalledOnce();
  expect(await getSummaryConfig(db)).toEqual(before);
  expect(await db.select().from(aiSummaryAttempts)).toEqual([]);
  expect(await db.select().from(aiSummaryRuns)).toHaveLength(2);
});

test("global observation and consumption still respect daily quota without raising it", async () => {
  const id = await entry("global_budget_bot");
  await env.DB.prepare("UPDATE ai_summary_settings SET daily_neurons=0 WHERE id=1").run();
  const messages: SummaryMessage[] = [];
  await consumeSummaryObservation(
    db,
    env.MEDIA,
    {
      sendBatch: async (rows) => {
        messages.push(...rows.map((row) => row.body));
      },
    },
    { v: 1, action: "observe", entryId: id },
    () => NOW,
  );
  const model = vi.fn(async () => output);
  for (const msg of messages) await consumeSummaryMessage(db, env.MEDIA, msg, () => NOW, model);
  expect(model).not.toHaveBeenCalled();
  expect(await db.select().from(aiSummaryAttempts)).toEqual([]);
  expect((await getSummaryConfig(db)).dailyNeurons).toBe(0);
  expect((await db.select().from(aiSummaryJobs))[0]).toMatchObject({
    status: "retry_wait",
    reason: "quota_or_policy",
  });
});

test("bootstrap observes fresh sources only within scope and is idempotent across duplicate deliveries", async () => {
  const id = await entry();
  const outside = await entry("bootstrap_outside_bot");
  const sendBatch = vi.fn(async () => {});
  const queue = { sendBatch };
  for (const target of [outside, id, id]) {
    await consumeSummaryObservation(
      db,
      env.MEDIA,
      queue,
      { v: 1, action: "observe", entryId: target },
      () => NOW,
      [id],
    );
  }
  expect(await getSummarySource(db, outside)).toBeUndefined();
  expect(await db.select().from(aiSummaryJobs)).toHaveLength(1);
  expect(sendBatch).toHaveBeenCalledOnce();
  await env.DB.prepare("UPDATE ai_summary_settings SET enabled=0 WHERE id=1").run();
  await consumeSummaryObservation(
    db,
    env.MEDIA,
    queue,
    { v: 1, action: "observe", entryId: outside },
    () => NOW,
    [outside],
  );
  expect(await getSummarySource(db, outside)).toBeUndefined();
});

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM entries"),
    env.DB.prepare("DELETE FROM entry_stats"),
    env.DB.prepare("DELETE FROM entry_tags"),
    env.DB.prepare("DELETE FROM entries_fts"),
    env.DB.prepare("DELETE FROM hidden_posts"),
    env.DB.prepare("DELETE FROM ai_summary_runs"),
    env.DB.prepare("DELETE FROM ai_summary_attempts"),
    env.DB.prepare("DELETE FROM settings"),
    env.DB.prepare(
      "UPDATE ai_summary_settings SET enabled=1,auto_scan=1,model='@cf/google/gemma-4-26b-a4b-it',daily_calls=100,daily_neurons=10000,reservation=100,max_attempts=3,prompt_version='summary-prompt-v8',params_version='summary-params-v3' WHERE id=1",
    ),
  ]);
  const keys = await env.MEDIA.list();
  for (const key of keys.objects) await env.MEDIA.delete(key.key);
});

async function entry(
  username = "sample_bot",
  description = "支持语音转为文字",
  kind: "bot" | "channel" = "bot",
) {
  const { id } = await insertApprovedEntry(db, {
    entry: {
      username,
      kind,
      description,
      title: username,
      categoryId: kind === "bot" ? 24 : 1,
      listedAt: NOW,
    },
    stats: { members: 1, online: null, activityTier: null, statsWrittenAt: NOW },
    tagIds: [],
    now: NOW,
  });
  return id;
}
async function observe(id: number, now = NOW) {
  return observeEntry(db, env.MEDIA, id, await getSummaryConfig(db), now);
}
async function messages(now = NOW) {
  const bodies: SummaryMessage[] = [];
  await dispatchSummaryOutbox(
    db,
    {
      sendBatch: async (rows) => {
        bodies.push(...rows.map((row) => row.body));
      },
    },
    now,
  );
  return bodies;
}
async function queued(id: number) {
  await observe(id);
  const message = (await messages()).find((row) => row.entryId === id);
  if (!message) throw new Error("Expected queued job");
  return message;
}

test("migration defaults disable generation and enabled mock pipeline writes one pending revision", async () => {
  // Migration default is checked independently of the test's enabled configuration.
  const defaultRow = await env.DB.prepare(
    "SELECT sql FROM sqlite_master WHERE name='ai_summary_settings'",
  ).first<{ sql: string }>();
  expect(defaultRow?.sql).toContain("DEFAULT false");
  const id = await entry();
  const message = await queued(id);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    message,
    () => NOW,
    async () => output,
  );
  expect((await getSummaryJob(db, message.jobId))?.status).toBe("succeeded");
  expect(await listSummaryRevisions(db, id)).toMatchObject([{ reviewStatus: "pending" }]);
});

test("opt-in auto publication is idempotent, dirties the site and preserves quotas without locking", async () => {
  const id = await entry();
  const message = await queued(id);
  const config = await getSummaryConfig(db);
  const model = vi.fn(async () => output);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    message,
    () => NOW,
    model,
    Math.random,
    undefined,
    true,
  );
  expect((await getSummaryJob(db, message.jobId))?.status).toBe("succeeded");
  expect(
    await env.DB.prepare("SELECT zh,contract_version FROM ai_summary_public WHERE entry_id=?")
      .bind(id)
      .first(),
  ).toEqual({ zh: "支持语音转为文字。", contract_version: 2 });
  expect(await env.DB.prepare("SELECT * FROM ai_summary_reviews").first()).toBeNull();
  expect((await getSummarySource(db, id))?.locked).toBe(false);
  await env.DB.prepare("DELETE FROM site_state WHERE key='dirty_since'").run();
  await Promise.all([
    publishSummaryEntry(db, env.MEDIA, id, NOW),
    publishSummaryEntry(db, env.MEDIA, id, NOW),
  ]);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    message,
    () => NOW,
    model,
    Math.random,
    undefined,
    true,
  );
  expect(
    await env.DB.prepare("SELECT * FROM site_state WHERE key='dirty_since'").first(),
  ).toBeNull();
  expect(model).toHaveBeenCalledTimes(1);
  expect(await getSummaryConfig(db)).toEqual(config);
});

test("publication sweep reuses existing machine revisions even with scanning paused and daily budget exhausted", async () => {
  const id = await entry();
  const message = await queued(id);
  const model = vi.fn(async () => output);
  await consumeSummaryMessage(db, env.MEDIA, message, () => NOW, model);
  expect(await env.DB.prepare("SELECT * FROM ai_summary_public").first()).toBeNull();
  await env.DB.prepare(
    "UPDATE ai_summary_settings SET auto_scan=0,daily_neurons=0 WHERE id=1",
  ).run();
  await sweepSummaryPublication(db, env.MEDIA, () => NOW);
  expect(
    await env.DB.prepare("SELECT * FROM ai_summary_public WHERE entry_id=?").bind(id).first(),
  ).not.toBeNull();
  expect(model).toHaveBeenCalledTimes(1);
  expect(await db.select().from(aiSummaryAttempts)).toHaveLength(1);
});

test.each(["locked", "d1", "r2", "invalid", "insufficient", "config"])(
  "automatic publication rejects %s without inference",
  async (mode) => {
    const id = await entry("publish_channel", "支持语音转为文字", "channel");
    await env.MEDIA.put(
      "posts/publish_channel.json",
      JSON.stringify([{ id: 1, date: "2026-11-22T00:00:00Z", text: "语音识别说明", views: 1 }]),
    );
    const message = await queued(id);
    await consumeSummaryMessage(
      db,
      env.MEDIA,
      message,
      () => NOW,
      async () => output,
    );
    if (mode === "locked")
      await env.DB.prepare("UPDATE ai_summary_sources SET locked=1 WHERE entry_id=?")
        .bind(id)
        .run();
    if (mode === "d1")
      await env.DB.prepare("UPDATE entries SET description='新用途' WHERE id=?").bind(id).run();
    if (mode === "r2") await env.MEDIA.put("posts/publish_channel.json", "[]");
    if (mode === "invalid")
      await env.DB.prepare("UPDATE ai_summary_revisions SET output='{}' WHERE entry_id=?")
        .bind(id)
        .run();
    if (mode === "insufficient")
      await env.DB.prepare(
        `UPDATE ai_summary_revisions SET output='{"status":"insufficient","reason":"no_substantive_evidence"}' WHERE entry_id=?`,
      )
        .bind(id)
        .run();
    if (mode === "config")
      await env.DB.prepare("UPDATE ai_summary_settings SET prompt_version='old' WHERE id=1").run();
    await publishSummaryEntry(db, env.MEDIA, id, NOW);
    expect(
      await env.DB.prepare("SELECT * FROM ai_summary_public WHERE entry_id=?").bind(id).first(),
    ).toBeNull();
    expect(await db.select().from(aiSummaryAttempts)).toHaveLength(1);
  },
);

test("duplicate delivery and overlapping consumers infer once", async () => {
  const message = await queued(await entry());
  const model = vi.fn(async () => output);
  await Promise.all([
    consumeSummaryMessage(db, env.MEDIA, message, () => NOW, model),
    consumeSummaryMessage(db, env.MEDIA, message, () => NOW, model),
  ]);
  await consumeSummaryMessage(db, env.MEDIA, message, () => NOW, model);
  expect(model).toHaveBeenCalledTimes(1);
  expect(await db.select().from(aiSummaryAttempts)).toHaveLength(1);
  expect(await db.select().from(aiSummaryRevisions)).toHaveLength(1);
});

test("empty skipped source is durable and changed content enters a new generation", async () => {
  const id = await entry("empty_bot", "");
  await observe(id);
  await observe(id);
  expect(await db.select().from(aiSummaryJobs)).toMatchObject([{ status: "skipped" }]);
  expect(await messages()).toEqual([]);
  await env.DB.prepare("UPDATE entries SET description='语音转文字' WHERE id=?").bind(id).run();
  await observe(id);
  expect(await db.select().from(aiSummaryJobs)).toHaveLength(2);
  expect(await messages()).toHaveLength(1);
});

test("source errors cannot reuse empty skipped results and are bounded without inference", async () => {
  let time = NOW;
  const id = await entry("empty_channel", "", "channel");
  await observe(id);
  await env.MEDIA.put("posts/empty_channel.json", "invalid json");
  await observe(id);
  const model = vi.fn(async () => output);
  for (let i = 0; i < 3; i++) {
    const message = (await messages(time))[0];
    if (!message) throw new Error("Expected source retry");
    await consumeSummaryMessage(db, env.MEDIA, message, () => time, model);
    time += 60_001;
  }
  expect(model).not.toHaveBeenCalled();
  expect((await db.select().from(aiSummaryJobs)).map((j) => j.status)).toEqual([
    "skipped",
    "failed",
  ]);
});

test("transactional quota allows one of concurrent different jobs, resets at UTC midnight", async () => {
  await env.DB.prepare(
    "UPDATE ai_summary_settings SET daily_calls=1,daily_neurons=100 WHERE id=1",
  ).run();
  const a = await entry("first_bot"),
    b = await entry("second_bot");
  await observe(a);
  await observe(b);
  const jobs = await messages();
  const results = await Promise.all(jobs.map((j) => claimSummaryJob(db, j.jobId, NOW)));
  expect(results.filter(Boolean)).toHaveLength(1);
  expect(await db.select().from(aiSummaryAttempts)).toHaveLength(1);
  const denied = jobs.find((j) => !results.some((r) => r?.id === j.jobId));
  expect(await claimSummaryJob(db, denied?.jobId ?? "", NOW + 86_400_000)).not.toBeNull();
});

test("outbox survives failed send, stale dispatch and duplicate publication", async () => {
  await observe(await entry());
  await expect(
    dispatchSummaryOutbox(
      db,
      {
        sendBatch: async () => {
          throw new Error("transport");
        },
      },
      NOW,
    ),
  ).rejects.toThrow();
  expect(await messages(NOW + 1)).toEqual([]);
  const resent = (await messages(NOW + 300_001))[0];
  expect(resent).toBeDefined();
  const model = vi.fn(async () => output);
  if (!resent) throw new Error("Missing recovered message");
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    { ...resent, dispatchedAt: NOW },
    () => NOW + 300_001,
    model,
  );
  expect(model).not.toHaveBeenCalled();
  await consumeSummaryMessage(db, env.MEDIA, resent, () => NOW + 300_001, model);
  expect(model).toHaveBeenCalledTimes(1);
});

test("expired lease rejects late result, reserves again and exhausts bounded attempts", async () => {
  const message = await queued(await entry());
  const first = await claimSummaryJob(db, message.jobId, NOW);
  if (!first) throw new Error("Missing claim");
  let time = NOW;
  for (let i = 0; i < 3; i++) {
    time += SUMMARY_LEASE_MS + 1;
    await recoverSummaryLeases(db, time);
    expect(await finishSummaryJob(db, first, JSON.stringify(output), time, false)).toBe(false);
    if (i < 2) expect(await claimSummaryJob(db, message.jobId, time)).not.toBeNull();
  }
  expect((await getSummaryJob(db, message.jobId))?.status).toBe("failed");
  expect(await db.select().from(aiSummaryAttempts)).toHaveLength(3);
});

test("source changes during inference fence old results and create new work", async () => {
  const id = await entry();
  const message = await queued(id);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    message,
    () => NOW,
    async () => {
      await env.DB.prepare("UPDATE entries SET description='仅支持图片压缩' WHERE id=?")
        .bind(id)
        .run();
      return output;
    },
  );
  expect(await listSummaryRevisions(db, id)).toEqual([]);
  expect((await getSummaryJob(db, message.jobId))?.status).toBe("superseded");
  expect(await messages(NOW + 1)).toHaveLength(1);
});

test("manual locks and removal during inference fence results", async () => {
  const id = await entry();
  const message = await queued(id);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    message,
    () => NOW,
    async () => {
      await setSummaryLocked(db, id, true, NOW);
      return output;
    },
  );
  expect(await listSummaryRevisions(db, id)).toEqual([]);
  await setSummaryLocked(db, id, false, NOW + 1);
  await observe(id, NOW + 1);
  expect(await messages(NOW + 1)).toHaveLength(1);
  const id2 = await entry("removed_bot");
  const msg2 = await queued(id2);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    msg2,
    () => NOW,
    async () => {
      await env.DB.prepare("UPDATE entries SET status='removed' WHERE id=?").bind(id2).run();
      return output;
    },
  );
  expect(await listSummaryRevisions(db, id2)).toEqual([]);
});

test("D1 final guard rejects edits even without a source observer", async () => {
  const id = await entry();
  const msg = await queued(id);
  const job = await claimSummaryJob(db, msg.jobId, NOW);
  await env.DB.prepare("UPDATE entries SET description='不同资料' WHERE id=?").bind(id).run();
  if (!job) throw new Error("Missing claim");
  expect(await finishSummaryJob(db, job, JSON.stringify(output), NOW, false)).toBe(false);
});

test("read observation CAS refuses slow stale input", async () => {
  const id = await entry();
  const first = await observe(id);
  const old = await getSummarySource(db, id);
  const row = await readSummaryEntry(db, id);
  await observe(id);
  if (!first || !row?.source_guard) throw new Error("Missing source");
  expect(
    await observeSummarySource(
      db,
      {
        entryId: id,
        previousToken: old?.observationToken ?? null,
        guard: row.source_guard,
        ...first,
        now: NOW,
        priority: 0,
      },
      await getSummaryConfig(db),
    ),
  ).toBe(false);
});

test("model failure backs off without starving later jobs and insufficient output is cached", async () => {
  const a = await entry("broken_bot"),
    b = await entry("good_bot");
  await observe(a);
  await observe(b);
  const batch = await messages();
  for (const msg of batch)
    await consumeSummaryMessage(
      db,
      env.MEDIA,
      msg,
      () => NOW,
      async () => {
        if (msg.entryId === a) throw new Error("upstream");
        return { status: "insufficient", sentences: [] };
      },
      () => 0,
    );
  const jobs = await db.select().from(aiSummaryJobs);
  expect(jobs.find((j) => j.entryId === a)).toMatchObject({
    status: "retry_wait",
    attempts: 1,
    dueAt: NOW + 60_000,
  });
  expect(jobs.find((j) => j.entryId === b)).toMatchObject({
    status: "skipped",
    reason: "model_insufficient",
  });
  await observe(b);
  expect(await messages(NOW + 1)).toEqual([]);
});

test("pausing dispatch and absent real adapter never infer or reserve quota", async () => {
  const msg = await queued(await entry());
  await consumeSummaryMessage(db, env.MEDIA, msg, () => NOW);
  expect(await db.select().from(aiSummaryAttempts)).toEqual([]);
  expect((await getSummaryJob(db, msg.jobId))?.status).toBe("retry_wait");
  await env.DB.prepare("UPDATE ai_summary_settings SET enabled=0 WHERE id=1").run();
  const sendBatch = vi.fn(async () => {});
  await tickSummaryTasks(db, env.MEDIA, { sendBatch }, () => NOW);
  expect(sendBatch).not.toHaveBeenCalled();
});

test("backfill fixes upper bound, pages, pauses and resumes with cursor lease", async () => {
  const a = await entry("first_bot");
  await entry("second_bot");
  await createSummaryRun(db, "batch-one");
  await entry("later_bot");
  await scanSummaryRun(db, env.MEDIA, "batch-one", () => NOW);
  const run = (await db.select().from(aiSummaryRuns)).find((row) => row.id === "batch-one");
  expect(run).toMatchObject({ cursor: a + 1, upperBound: a + 1, status: "completed" });
  expect(await db.select().from(aiSummaryJobs)).toHaveLength(2);
  await createSummaryRun(db, "paused");
  await env.DB.prepare("UPDATE ai_summary_runs SET status='paused' WHERE id='paused'").run();
  expect(await claimSummaryRun(db, "paused", NOW)).toBeNull();
  await env.DB.prepare("UPDATE ai_summary_runs SET status='active' WHERE id='paused'").run();
  const claim = await claimSummaryRun(db, "paused", NOW);
  expect(claim).not.toBeNull();
  expect(await claimSummaryRun(db, "paused", NOW)).toBeNull();
  if (!claim) throw new Error("Missing lease");
  await advanceSummaryRun(db, claim, a, false, NOW);
  expect((await claimSummaryRun(db, "paused", NOW))?.cursor).toBe(a);
});

test("dead letters fence by dispatch identity and source generation", async () => {
  const msg = await queued(await entry());
  await consumeSummaryDlq(db, { ...msg, dispatchedAt: NOW - 1 }, NOW);
  expect((await getSummaryJob(db, msg.jobId))?.status).toBe("queued");
  await consumeSummaryDlq(db, msg, NOW);
  expect((await getSummaryJob(db, msg.jobId))?.status).toBe("failed");
});

test("R2 visible evidence invalidates results when a post is hidden during inference", async () => {
  const id = await entry("sample_channel", "", "channel");
  await env.MEDIA.put(
    "posts/sample_channel.json",
    JSON.stringify([{ id: 1, date: "2026-11-20T00:00:00Z", text: "分享开源软件指南", views: 2 }]),
  );
  const msg = await queued(id);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    msg,
    () => NOW,
    async () => {
      await env.DB.prepare("INSERT INTO hidden_posts(entry_id,post_id,created_at) VALUES(?,1,?)")
        .bind(id, NOW)
        .run();
      return {
        status: "ok",
        sentences: [{ zh: "分享软件指南。", en: "Shares software guides.", refs: ["post:1"] }],
      };
    },
  );
  expect(await listSummaryRevisions(db, id)).toEqual([]);
});

test("entry point acknowledges poison messages", async () => {
  const ack = vi.fn();
  const retry = vi.fn();
  const message = {
    body: { v: 999 },
    id: "poison",
    ack,
    retry,
    timestamp: new Date(NOW),
    attempts: 1,
  };
  await worker.queue(
    {
      queue: "tgbox-ai-summary",
      messages: [message],
      ackAll: vi.fn(),
      retryAll: vi.fn(),
      metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } },
    },
    env,
  );
  expect(ack).toHaveBeenCalledOnce();
  expect(retry).not.toHaveBeenCalled();
});

test("pause during inference can resume the same source generation", async () => {
  const id = await entry();
  const msg = await queued(id);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    msg,
    () => NOW,
    async () => {
      await env.DB.prepare("UPDATE ai_summary_settings SET enabled=0 WHERE id=1").run();
      return output;
    },
  );
  expect(await listSummaryRevisions(db, id)).toEqual([]);
  expect((await getSummaryJob(db, msg.jobId))?.status).toBe("retry_wait");
  expect(await messages(NOW + 300_001)).toEqual([]);
  await env.DB.prepare("UPDATE ai_summary_settings SET enabled=1 WHERE id=1").run();
  const resumed = (await messages(NOW + 300_001))[0];
  if (!resumed) throw new Error("Missing resumed job");
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    resumed,
    () => NOW + 300_001,
    async () => output,
  );
  expect(await listSummaryRevisions(db, id)).toHaveLength(1);
});

test("model and prompt changes supersede obsolete jobs", async () => {
  const id = await entry();
  const old = await queued(id);
  await env.DB.prepare(
    "UPDATE ai_summary_settings SET model='new-model',prompt_version='v2' WHERE id=1",
  ).run();
  await observe(id);
  expect((await getSummaryJob(db, old.jobId))?.status).toBe("superseded");
  expect(await messages()).toHaveLength(1);
});

test("source reversion creates a fresh generation without reviving obsolete leases", async () => {
  const id = await entry();
  const original = await queued(id);
  const stale = await claimSummaryJob(db, original.jobId, NOW);
  await env.DB.prepare("UPDATE entries SET description='图片压缩' WHERE id=?").bind(id).run();
  await observe(id);
  await env.DB.prepare("UPDATE entries SET description='支持语音转为文字' WHERE id=?")
    .bind(id)
    .run();
  await observe(id);
  expect((await getSummarySource(db, id))?.generation).toBe(3);
  if (!stale) throw new Error("Missing old lease");
  expect(await finishSummaryJob(db, stale, JSON.stringify(output), NOW, false)).toBe(false);
});

test("source-independent stats and avatar changes do not regenerate", async () => {
  const id = await entry();
  await observe(id);
  await env.DB.prepare("UPDATE entries SET avatar_version='new',updated_at=? WHERE id=?")
    .bind(NOW + 1, id)
    .run();
  await env.DB.prepare("UPDATE entry_stats SET members=999 WHERE entry_id=?").bind(id).run();
  await observe(id, NOW + 1);
  expect(await db.select().from(aiSummaryJobs)).toHaveLength(1);
});

test("invalid outputs and source read exceptions are isolated", async () => {
  const msg = await queued(await entry());
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    msg,
    () => NOW,
    async () => ({ status: "ok", sentences: [] }),
  );
  expect((await getSummaryJob(db, msg.jobId))?.status).toBe("retry_wait");
  const id = await entry("read_error_channel", "", "channel");
  const observed = await observeEntry(
    db,
    {
      get: async () => {
        throw new Error("network");
      },
    },
    id,
    await getSummaryConfig(db),
    NOW,
  );
  expect(observed?.decision).toEqual({ status: "retry_wait", reason: "source_read_error" });
});

test("new resource discovery bypasses the historical rolling cursor", async () => {
  await entry("old_bot_a");
  await entry("old_bot_b");
  const sendBatch = vi.fn(async () => {});
  await tickSummaryTasks(db, env.MEDIA, { sendBatch }, () => NOW);
  const added = await entry("newest_bot");
  await tickSummaryTasks(db, env.MEDIA, { sendBatch }, () => NOW + 300_001);
  const fresh = (await db.select().from(aiSummaryJobs)).find((row) => row.entryId === added);
  expect(fresh?.priority).toBe(1);
  expect(fresh?.status).toBe("queued");
});

test("hard deletion preserves reservations used for the daily quota", async () => {
  await env.DB.prepare("UPDATE ai_summary_settings SET daily_calls=1 WHERE id=1").run();
  const id = await entry("delete_bot");
  const msg = await queued(id);
  await claimSummaryJob(db, msg.jobId, NOW);
  const otherId = await entry("other_bot");
  await env.DB.prepare("DELETE FROM entries WHERE id=?").bind(id).run();
  const other = await queued(otherId);
  expect(await claimSummaryJob(db, other.jobId, NOW)).toBeNull();
  expect(await db.select().from(aiSummaryAttempts)).toHaveLength(1);
});

test("R2 content changes during inference supersede the old content hash", async () => {
  const id = await entry("sample_channel", "", "channel");
  const write = (text: string) =>
    env.MEDIA.put(
      "posts/sample_channel.json",
      JSON.stringify([{ id: 1, date: "2026-11-20T00:00:00Z", text, views: 1 }]),
    );
  await write("开源软件指南");
  const msg = await queued(id);
  await consumeSummaryMessage(
    db,
    env.MEDIA,
    msg,
    () => NOW,
    async () => {
      await write("烹饪食谱指南");
      return {
        status: "ok",
        sentences: [{ zh: "分享软件指南。", en: "Shares software guides.", refs: ["post:1"] }],
      };
    },
  );
  expect(await listSummaryRevisions(db, id)).toEqual([]);
  expect((await getSummaryJob(db, msg.jobId))?.status).toBe("superseded");
});

test("stale configuration cannot supersede a newer model's queued work", async () => {
  const id = await entry();
  const prepared = await observe(id);
  const old = await getSummaryConfig(db);
  await env.DB.prepare("UPDATE ai_summary_settings SET model='new-model' WHERE id=1").run();
  await observe(id);
  const current = await getSummarySource(db, id);
  const row = await readSummaryEntry(db, id);
  if (!prepared || !current || !row?.source_guard) throw new Error("Missing source");
  const accepted = await observeSummarySource(
    db,
    {
      entryId: id,
      previousToken: current.observationToken,
      guard: row.source_guard,
      ...prepared,
      now: NOW,
      priority: 0,
    },
    old,
  );
  expect(accepted).toBe(false);
  const jobs = await db.select().from(aiSummaryJobs);
  expect(jobs.find((j) => j.model === "new-model")?.status).toBe("pending");
});

test("estimated daily Neuron budget is reserved atomically independently of call count", async () => {
  await env.DB.prepare("UPDATE ai_summary_settings SET daily_neurons=150 WHERE id=1").run();
  const a = await entry("budget_bot_a"),
    b = await entry("budget_bot_b");
  await observe(a);
  await observe(b);
  const jobs = await messages();
  const results = await Promise.all(jobs.map((j) => claimSummaryJob(db, j.jobId, NOW)));
  expect(results.filter(Boolean)).toHaveLength(1);
});

test("expired scan lease cannot advance the replacement owner's cursor", async () => {
  await entry();
  await createSummaryRun(db, "recover-scan");
  const old = await claimSummaryRun(db, "recover-scan", NOW);
  const replacement = await claimSummaryRun(db, "recover-scan", NOW + SUMMARY_LEASE_MS + 1);
  if (!old || !replacement) throw new Error("Missing scan lease");
  await advanceSummaryRun(db, old, 999, true, NOW + SUMMARY_LEASE_MS + 1);
  const row = (await db.select().from(aiSummaryRuns)).find((run) => run.id === "recover-scan");
  expect(row?.cursor).toBe(0);
  expect(row?.status).toBe("active");
  await advanceSummaryRun(db, replacement, 1, true, NOW + SUMMARY_LEASE_MS + 1);
  expect(
    (await db.select().from(aiSummaryRuns)).find((run) => run.id === "recover-scan")?.status,
  ).toBe("completed");
});

test("settings constraints reject negative quotas", async () => {
  await expect(
    env.DB.prepare("UPDATE ai_summary_settings SET daily_calls=-1 WHERE id=1").run(),
  ).rejects.toThrow();
  expect((await getSummaryConfig(db)).dailyCalls).toBe(100);
});

test("pausing an in-flight scan is preserved when its processed page checkpoints", async () => {
  await entry();
  await createSummaryRun(db, "pause-in-flight");
  const run = await claimSummaryRun(db, "pause-in-flight", NOW);
  if (!run) throw new Error("Missing scan");
  await env.DB.prepare("UPDATE ai_summary_runs SET status='paused' WHERE id=?").bind(run.id).run();
  await advanceSummaryRun(db, run, 1, true, NOW);
  const state = (await db.select().from(aiSummaryRuns)).find((row) => row.id === run.id);
  expect(state).toMatchObject({ status: "paused", cursor: 1, leaseToken: null });
  expect(await claimSummaryRun(db, run.id, NOW)).toBeNull();
});

test("queue handler retries a broken delivery and continues acknowledging poison messages", async () => {
  const msg = await queued(await entry());
  const retry = vi.fn(),
    ack = vi.fn(),
    poisonAck = vi.fn();
  const brokenDb = new Proxy(env.DB, {
    get(target, property, receiver) {
      if (property === "prepare") throw new Error("Database unavailable");
      return Reflect.get(target, property, receiver);
    },
  });
  await worker.queue(
    {
      queue: "tgbox-ai-summary",
      metadata: { metrics: { backlogCount: 2, backlogBytes: 0 } },
      ackAll: vi.fn(),
      retryAll: vi.fn(),
      messages: [
        { body: msg, id: "broken", timestamp: new Date(NOW), attempts: 1, retry, ack },
        {
          body: { v: 999 },
          id: "poison",
          timestamp: new Date(NOW),
          attempts: 1,
          retry: vi.fn(),
          ack: poisonAck,
        },
      ],
    },
    { ...env, DB: brokenDb, AI_SUMMARY_ENTRY_IDS: String(msg.entryId) },
  );
  expect(retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  expect(ack).not.toHaveBeenCalled();
  expect(poisonAck).toHaveBeenCalledOnce();
});
