import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AiSummaryModelInput, AiSummaryOutput } from "@tgbox/shared";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/coss/ui/button.tsx";
import { Card } from "@/components/coss/ui/card.tsx";
import {
  Dialog,
  DialogHeader,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "@/components/coss/ui/dialog.tsx";
import { Input } from "@/components/coss/ui/input.tsx";
import { Textarea } from "@/components/coss/ui/textarea.tsx";
import {
  $summaryBatch,
  $summaryCommand,
  type SummaryAction,
  type SummaryDetail,
  type SummaryOverview,
  summaryDetailOptions,
  summaryOverviewOptions,
} from "@/functions/ai-summary.ts";

const filters = [
  ["all", "全部"],
  ["pending", "待审草稿"],
  ["failed", "失败或待处理"],
  ["approved", "已批准"],
  ["locked", "已锁定"],
  ["sample", "抽检：未检优先"],
] as const;
const selectStyle = "min-h-10 rounded-md border border-input bg-background px-3 text-base";
const states: Record<string, string> = {
  eligible: "可尝试生成",
  unavailable: "资源不可用",
  unavailable_or_locked: "不可用或已锁定",
  locked: "已锁定",
  error: "读取失败",
  pending: "待生成",
  queued: "排队中",
  running: "生成中",
  retry_wait: "等待重试",
  succeeded: "已有草稿",
  skipped: "资料不足，已跳过",
  blocked: "需检查来源",
  superseded: "旧任务已失效",
  failed: "失败",
  draft: "待人工审核",
  approved: "已批准",
  withdrawn: "已撤回",
};
const reasons: Record<string, string> = {
  profile_supported: "简介有可用资料",
  posts_supported: "帖子有可用资料",
  no_substantive_evidence: "缺少实质资料",
  model_insufficient: "模型判断资料不足",
  inference_failed: "模型调用或格式校验失败",
  source_read_error: "读取来源失败",
  source_parse_error: "来源格式有误",
  unsupported_config: "任务配置不在已验证范围",
  generation_paused: "生成已暂停",
  quota_or_policy: "配额或执行策略限制",
  source_conflict: "来源存在冲突",
  ambiguous_scope: "资源用途不明确",
  lease_expired: "上次执行中断",
  not_observed: "未创建新任务",
};
export function SummaryPage() {
  const client = useQueryClient();
  const [filter, setFilter] = useState<(typeof filters)[number][0]>("all");
  const [before, setBefore] = useState(Number.MAX_SAFE_INTEGER);
  const [selected, setSelected] = useState<number[]>([]);
  const [entryId, setEntryId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const query = useQuery(summaryOverviewOptions(filter, before));
  const command = useMutation({
    mutationFn: (data: SummaryAction) => $summaryCommand({ data }),
    onSuccess: () => setNotice("已保存。白名单内已批准的内容将在后续网站构建后生效。"),
    onError: (e) => {
      setNotice(e.message);
      noticeRef.current?.focus();
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["aiSummary"] }),
  });
  const batch = useMutation({
    mutationFn: (generate: boolean) => $summaryBatch({ data: { ids: selected, generate } }),
    onSuccess: (r) =>
      setNotice(
        r.rows
          .map(
            (row) =>
              `#${row.entryId}：${states[row.status] ?? row.status}（${reasons[row.reason] ?? row.reason}）`,
          )
          .join("；"),
      ),
    onError: (e) => {
      setNotice(e.message);
      noticeRef.current?.focus();
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["aiSummary"] }),
  });
  if (query.isPending) return <p role="status">正在加载摘要任务…</p>;
  if (query.isError)
    return (
      <p role="alert">加载失败：{query.error.message}。请确认摘要数据库迁移已由发布流程完成。</p>
    );
  const busy = command.isPending || batch.isPending;
  return (
    <Dialog
      open={entryId !== null}
      onOpenChange={(open) => {
        if (!open) setEntryId(null);
      }}
    >
      <div className="flex flex-col gap-6">
        <p
          ref={entryId === null ? noticeRef : undefined}
          tabIndex={-1}
          role="status"
          className="whitespace-pre-wrap text-sm"
        >
          {notice}
        </p>
        <ConfigForm
          key={JSON.stringify(query.data.config)}
          view={query.data}
          busy={busy}
          save={(data) => command.mutate(data)}
        />
        <section aria-labelledby="summary-list-heading" className="flex flex-col gap-3">
          <h2 id="summary-list-heading" className="font-semibold">
            资源与任务
          </h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="summary-filter">状态</label>
              <select
                id="summary-filter"
                name="filter"
                className={selectStyle}
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value as typeof filter);
                  setBefore(Number.MAX_SAFE_INTEGER);
                  setSelected([]);
                }}
              >
                {filters.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={busy || selected.length === 0}
              onClick={() => batch.mutate(false)}
            >
              预检所选（{selected.length}/20）
            </Button>
            <Button
              type="button"
              disabled={busy || selected.length === 0}
              onClick={() => batch.mutate(true)}
            >
              生成所选草稿
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => client.invalidateQueries({ queryKey: ["aiSummary"] })}
            >
              刷新
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            预检不调用模型；生成只加入异步任务，暂停时不会推理。短简介或重复内容可不发布。每日预算按
            UTC 重置。
          </p>
          <div className="flex flex-col gap-2">
            {query.data.list.rows.map((row) => (
              <Card key={row.id} className="flex flex-wrap gap-3 p-4 sm:flex-row sm:items-center">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="entry"
                    value={row.id}
                    checked={selected.includes(row.id)}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked
                          ? [...ids, row.id].slice(0, 20)
                          : ids.filter((id) => id !== row.id),
                      )
                    }
                  />
                  <span>选择 #{row.id}</span>
                </label>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {row.title} <span className="text-muted-foreground">@{row.username}</span>
                  </p>
                  <p className="text-sm">
                    {states[row.review_status ?? ""] ?? states[row.job_status ?? ""] ?? "尚未生成"}
                    {row.locked ? " · 已锁定" : ""}
                    {row.reason ? ` · ${reasons[row.reason] ?? row.reason}` : ""}
                  </p>
                </div>
                <DialogTrigger
                  render={<Button type="button" variant="outline" />}
                  onClick={() => {
                    setNotice("");
                    setEntryId(row.id);
                  }}
                >
                  查看与审核
                </DialogTrigger>
                {row.job_status === "failed" || row.job_status === "retry_wait" ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => command.mutate({ action: "retry", entryId: row.id })}
                  >
                    重试技术失败
                  </Button>
                ) : null}
              </Card>
            ))}
          </div>
          {query.data.list.rows.length === 0 ? <p>没有符合条件的资源。</p> : null}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={before === Number.MAX_SAFE_INTEGER}
              onClick={() => {
                setBefore(Number.MAX_SAFE_INTEGER);
                setSelected([]);
              }}
            >
              回到第一页
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!query.data.list.next}
              onClick={() => {
                if (query.data.list.next) setBefore(query.data.list.next);
                setSelected([]);
              }}
            >
              下一页
            </Button>
          </div>
        </section>
        <DialogPopup
          bottomStickOnMobile={false}
          className="max-h-[calc(100dvh-2rem)] max-w-6xl"
          closeProps={{ "aria-label": "关闭摘要审核" }}
        >
          <DialogHeader className="shrink-0 pr-12">
            <DialogTitle>摘要查看与审核{entryId !== null ? ` · #${entryId}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">
            <p
              ref={entryId !== null ? noticeRef : undefined}
              tabIndex={-1}
              role="status"
              className="whitespace-pre-wrap text-sm"
            >
              {notice}
            </p>
            {entryId !== null ? (
              <Detail
                key={entryId}
                entryId={entryId}
                busy={busy}
                act={(data) => command.mutate(data)}
              />
            ) : null}
          </div>
        </DialogPopup>
      </div>
    </Dialog>
  );
}
function ConfigForm({
  view,
  busy,
  save,
}: {
  view: SummaryOverview;
  busy: boolean;
  save: (data: SummaryAction) => void;
}) {
  const c = view.config;
  return (
    <Card className="p-4">
      <form
        aria-labelledby="summary-config-heading"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save({
            action: "config",
            expected: { ...c, id: 1 },
            config: {
              ...view.supported,
              enabled: f.get("enabled") === "on",
              autoScan: f.get("autoScan") === "on",
              dailyCalls: Number(f.get("calls")),
              dailyNeurons: Number(f.get("neurons")),
              reservation: Number(f.get("reservation")),
              maxAttempts: Number(f.get("attempts")),
            },
          });
        }}
        className="flex flex-col gap-4"
      >
        <h2 id="summary-config-heading" className="font-semibold">
          生成配置
        </h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="summary-model">模型</label>
          <select
            id="summary-model"
            name="model"
            className={selectStyle}
            value={view.supported.model}
            onChange={() => {}}
          >
            <option value={view.supported.model}>Gemma 4 26B A4B（已验证）</option>
          </select>
        </div>
        <p className="text-muted-foreground text-sm">
          当前固定提示词 v7。今日已预留 {view.usage?.calls ?? 0} 次调用、{view.usage?.neurons ?? 0}{" "}
          Neurons；预留预算不是实际账单。
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["calls", "每日最多调用次数", c.dailyCalls, 0, 1000],
              ["neurons", "每日 Neurons 预留预算", c.dailyNeurons, 0, 1_000_000],
              ["reservation", "每次调用预留 Neurons", c.reservation, 100, 10000],
              ["attempts", "每个任务最多尝试次数", c.maxAttempts, 1, 10],
            ] as const
          ).map(([name, label, value, min, max]) => (
            <label key={name} className="flex flex-col gap-1" htmlFor={`summary-${name}`}>
              {label}
              <Input
                id={`summary-${name}`}
                name={name}
                type="number"
                required
                min={min}
                max={max}
                step={1}
                defaultValue={value}
              />
            </label>
          ))}
        </div>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="enabled" defaultChecked={c.enabled} />
          启用异步生成（取消后暂停新推理）
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="autoScan" defaultChecked={c.autoScan} />
          自动扫描全站资源（含历史条目，灰度前保持关闭）
        </label>
        <Button type="submit" disabled={busy}>
          保存配置
        </Button>
      </form>
    </Card>
  );
}
function Detail({
  entryId,
  busy,
  act,
}: {
  entryId: number;
  busy: boolean;
  act: (data: SummaryAction) => void;
}) {
  const query = useQuery(summaryDetailOptions(entryId));
  if (query.isPending) return <p role="status">正在加载证据…</p>;
  if (query.isError) return <p role="alert">加载失败：{query.error.message}</p>;
  return (
    <Editor
      key={`${entryId}:${query.data.source?.editVersion ?? 0}`}
      detail={query.data}
      busy={busy}
      act={act}
    />
  );
}
function Editor({
  detail,
  busy,
  act,
}: {
  detail: SummaryDetail;
  busy: boolean;
  act: (data: SummaryAction) => void;
}) {
  const [revisionId, setRevisionId] = useState(
    detail.review?.revision_id ?? detail.revisions[0]?.id ?? "",
  );
  const revision = detail.revisions.find((r) => r.id === revisionId);
  return (
    <section aria-labelledby="summary-editor-heading" className="flex flex-col gap-3">
      <h2 id="summary-editor-heading" className="font-semibold">
        #{detail.entry?.id} {detail.entry?.title} · 来源与三语草稿
      </h2>
      {detail.source && detail.entry?.source_guard !== detail.source.sourceGuard ? (
        <p role="alert">
          简介或可见性已变化。请先解锁并重新生成，再核对和批准；旧批准不代表当前资料。
        </p>
      ) : null}
      <Card className="p-4">
        <h3 className="font-medium">当前原简介</h3>
        <p className="whitespace-pre-wrap break-words text-sm">
          {detail.entry?.description ?? "资源不存在"}
        </p>
      </Card>
      <label htmlFor="summary-revision">生成版本</label>
      <select
        id="summary-revision"
        name="revision"
        className={selectStyle}
        value={revisionId}
        onChange={(e) => setRevisionId(e.target.value)}
      >
        {detail.revisions.map((r) => (
          <option key={r.id} value={r.id}>
            {new Date(r.createdAt).toLocaleString("zh-CN")} · {r.id.slice(0, 8)}
          </option>
        ))}
      </select>
      {revision ? (
        <Draft key={revisionId} detail={detail} revision={revision} busy={busy} act={act} />
      ) : (
        <p>还没有可审核的生成结果。请先预检并生成草稿。</p>
      )}
      {detail.source ? (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() =>
              act({
                action: detail.source?.locked ? "unlock" : "lock",
                entryId: detail.entry?.id ?? 0,
                expectedVersion: detail.source?.editVersion ?? 0,
                observationToken: detail.source?.observationToken ?? "",
              })
            }
          >
            {detail.source.locked ? "解锁，允许后续生成" : "锁定，阻止自动改写"}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
function Draft({
  detail,
  revision,
  busy,
  act,
}: {
  detail: SummaryDetail;
  revision: SummaryDetail["revisions"][number];
  busy: boolean;
  act: (data: SummaryAction) => void;
}) {
  const parsed = AiSummaryOutput.safeParse(parseJson(revision.output));
  const output = parsed.success && parsed.data.status === "ok" ? parsed.data : null;
  const saved = detail.review?.revision_id === revision.id ? detail.review : null;
  const initialZh = saved?.zh ?? output?.sentences.map((s) => s.zh).join("") ?? "";
  const [zh, setZh] = useState(initialZh);
  const [en, setEn] = useState(saved?.en ?? output?.sentences.map((s) => s.en).join(" ") ?? "");
  const [hant, setHant] = useState(saved?.hant ?? "");
  const [error, setError] = useState("");
  const evidence = AiSummaryModelInput.safeParse(parseJson(revision.input));
  useEffect(() => {
    let cancelled = false;
    if (!saved)
      import("@tgbox/hant")
        .then(({ toHant }) => {
          if (!cancelled) setHant((current) => current || toHant(initialZh));
        })
        .catch(() => {
          if (!cancelled) setError("繁体转换加载失败，请手工填写或重试。");
        });
    return () => {
      cancelled = true;
    };
  }, [saved, initialZh]);
  if (!output) return <p>此版本未生成摘要（资料不足或结果不可用），继续使用原有展示。</p>;
  const base = {
    entryId: revision.entryId,
    expectedVersion: detail.source?.editVersion ?? 0,
    observationToken: detail.source?.observationToken ?? "",
  };
  return (
    <>
      <Card className="p-4">
        <h3 className="font-medium">本次生成引用的证据</h3>
        {evidence.success ? (
          evidence.data.evidence.map((e) => (
            <p key={e.ref} className="whitespace-pre-wrap break-words text-sm">
              <strong>{e.ref}</strong>：{e.text}
            </p>
          ))
        ) : (
          <p>证据格式不可用，不能批准。</p>
        )}
      </Card>
      <form
        aria-labelledby="summary-draft-heading"
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          act({ action: "edit", ...base, revisionId: revision.id, zh, hant, en });
        }}
      >
        <h3 id="summary-draft-heading" className="font-medium">
          三语编辑（保存后自动锁定，需另行批准）
        </h3>
        <p role="status">{error}</p>
        <div className="grid gap-4 lg:grid-cols-3">
          {(
            [
              ["zh", "简体中文", zh, setZh],
              ["hant", "繁体中文", hant, setHant],
              ["en", "English", en, setEn],
            ] as const
          ).map(([name, label, value, setValue]) => (
            <div key={name} className="flex flex-col gap-1">
              <label htmlFor={`summary-draft-${name}`}>{label}</label>
              <Textarea
                id={`summary-draft-${name}`}
                name={name}
                lang={name === "en" ? "en" : name === "hant" ? "zh-Hant" : "zh-Hans"}
                value={value}
                required
                maxLength={name === "en" ? 2000 : 240}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-sm">
          核对事实、重要限制及整页重复内容。中文最多120字，英文最多90词。保存会撤销旧批准；白名单内已批准的内容将在后续网站构建后展示。
        </p>
        <Button type="submit" disabled={busy || !evidence.success}>
          保存三语草稿并锁定
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={
            busy ||
            !saved ||
            !evidence.success ||
            zh !== saved.zh ||
            hant !== saved.hant ||
            en !== saved.en
          }
          onClick={() => act({ action: "approve", ...base, revisionId: revision.id })}
        >
          批准已保存版本
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !saved}
          onClick={() => act({ action: "withdraw", ...base })}
        >
          撤回批准
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || saved?.status !== "approved"}
          onClick={() => act({ action: "sample", ...base })}
        >
          标记已抽检
        </Button>
      </div>
    </>
  );
}
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
