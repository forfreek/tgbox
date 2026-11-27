import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { HealthView } from "@tgbox/db";
import {
  type EntryKind,
  functionHealthLabels,
  healthReasonLabels,
  publicHealthLabels,
} from "@tgbox/shared";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Badge } from "@/components/coss/ui/badge.tsx";
import { Button } from "@/components/coss/ui/button.tsx";
import { Field, FieldLabel } from "@/components/coss/ui/field.tsx";
import { Fieldset as FieldGroup, FieldsetLegend } from "@/components/coss/ui/fieldset.tsx";
import { Input } from "@/components/coss/ui/input.tsx";
import { Label } from "@/components/coss/ui/label.tsx";
import { Radio, RadioGroup } from "@/components/coss/ui/radio-group.tsx";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from "@/components/coss/ui/sheet.tsx";
import { Skeleton } from "@/components/coss/ui/skeleton.tsx";
import type { EntryRow } from "@/functions/entries.ts";
import {
  $confirmEntryIdentity,
  $verifyEntryFunction,
  entryHealthQueryOptions,
} from "@/functions/health.ts";
import { functionVerificationInput, identityReviewInput } from "./health-input.ts";
import { healthVariant } from "./labels.ts";
import { useIsMobile } from "./use-is-mobile.ts";

const formatTime = (at: number | null) =>
  at === null
    ? "尚无记录"
    : new Date(at).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        dateStyle: "medium",
        timeStyle: "short",
      });
export function HealthBadge({ health, kind }: { health: HealthView; kind: EntryKind }) {
  return (
    <div className="flex flex-col gap-1">
      <Badge variant={healthVariant[health.publicState]}>
        {publicHealthLabels[health.publicState]}
      </Badge>
      {kind === "bot" && (
        <span className="text-muted-foreground text-xs">
          {functionHealthLabels[health.functionState]}
        </span>
      )}
    </div>
  );
}
export function EntryHealthSheet({
  entry,
  onClose,
}: {
  entry: EntryRow | null;
  onClose: () => void;
}) {
  const mobile = useIsMobile();
  return (
    <Sheet open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetPopup side={mobile ? "bottom" : "right"} className="md:max-w-xl">
        {entry && <HealthPanel key={entry.id} entry={entry} onClose={onClose} />}
      </SheetPopup>
    </Sheet>
  );
}
function HealthPanel({ entry, onClose }: { entry: EntryRow; onClose: () => void }) {
  const view = useQuery(entryHealthQueryOptions(entry.id));
  const data = view.data;
  return (
    <>
      <SheetHeader>
        <SheetTitle>检查证据与人工验证</SheetTitle>
        <SheetDescription>
          {entry.title} · @{entry.username}
        </SheetDescription>
      </SheetHeader>
      <SheetPanel className="flex flex-col gap-6">
        {view.isPending ? (
          <Skeleton className="h-28 w-full" />
        ) : view.isError ? (
          <p role="alert">检查记录加载失败，请稍后重新打开。</p>
        ) : !data ? (
          <p role="status">条目不存在。</p>
        ) : (
          <>
            <HealthBadge health={data.health} kind={data.entry.kind} />
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <dt>最近检查（北京时间）</dt>
              <dd>{formatTime(data.health.observedAt)}</dd>
              <dt>最近确认公开可识别</dt>
              <dd>{formatTime(data.health.confirmedAt)}</dd>
              <dt>本次原因</dt>
              <dd>
                {data.health.reason
                  ? (healthReasonLabels[data.health.reason as keyof typeof healthReasonLabels] ??
                    "需复核的检查结果")
                  : "尚无新规则检查记录"}
              </dd>
            </dl>
            <p className="text-muted-foreground text-xs">
              检查状态与是否上线分开记录。本面板的验证不会隐藏或恢复条目。
            </p>
            {data.entry.kind === "bot" && (
              <section className="flex flex-col gap-2">
                <h3 className="font-medium">最近人工功能记录</h3>
                <p>
                  {functionHealthLabels[data.health.functionState]} ·{" "}
                  {formatTime(data.health.functionObservedAt)}
                </p>
                {data.health.functionEvidence && (
                  <>
                    <p className="break-words text-sm">
                      操作：{data.health.functionEvidence.action}
                    </p>
                    <p className="break-words text-sm">
                      范围：{data.health.functionEvidence.scope}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      仅代表所记录时间与操作范围内的结果。
                    </p>
                  </>
                )}
              </section>
            )}
            <details className="flex flex-col gap-3">
              <summary className="cursor-pointer">最近检查证据（最多16条）</summary>
              <ul className="flex flex-col gap-3 py-3">
                {data.evidence.length === 0 ? (
                  <li>尚无证据记录。旧状态不会转换成新检查结果。</li>
                ) : (
                  data.evidence.map((item) => (
                    <li key={item.id} className="flex flex-col gap-1 border-b pb-3 text-sm">
                      <span>
                        {formatTime(item.observedAt)} ·{" "}
                        {item.source === "tme_profile"
                          ? "网页检查"
                          : item.source === "manual_identity_review"
                            ? "人工身份确认"
                            : "人工功能记录"}
                      </span>
                      {"reason" in item.evidence ? (
                        <>
                          <span>
                            {healthReasonLabels[item.evidence.reason]}
                            {item.evidence.httpStatus !== null
                              ? ` · HTTP ${item.evidence.httpStatus}`
                              : ""}
                          </span>
                          {item.evidence.previewUnavailable && <span>消息预览不可用</span>}
                        </>
                      ) : (
                        <>
                          <span className="break-words">操作：{item.evidence.action}</span>
                          <span className="break-words">范围：{item.evidence.scope}</span>
                          <span className="break-words">记录人：{item.evidence.actor}</span>
                        </>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </details>
            {data.health.publicState === "identity_review" ? (
              <VerificationForm entry={entry} health={data.health} identity onSaved={onClose} />
            ) : (
              data.entry.kind === "bot" && (
                <VerificationForm entry={entry} health={data.health} onSaved={onClose} />
              )
            )}
          </>
        )}
      </SheetPanel>
    </>
  );
}

function RequiredInput({
  label,
  name,
  maxLength,
  onFeedback,
}: {
  label: string;
  name: string;
  maxLength: number;
  onFeedback: (message: string) => void;
}) {
  const id = useId();
  const [invalid, setInvalid] = useState(false);
  return (
    <Field invalid={invalid}>
      <FieldLabel htmlFor={id}>
        {label} <span aria-hidden="true">*</span>
      </FieldLabel>
      <Input
        nativeInput
        id={id}
        name={name}
        required
        minLength={1}
        maxLength={maxLength}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        onInvalid={() => setInvalid(true)}
        onBlur={(e) => {
          const invalid = e.currentTarget.matches(":user-invalid");
          setInvalid(invalid);
          onFeedback(invalid ? `请填写${label}。` : "");
        }}
        onChange={(e) => {
          if (e.currentTarget.validity.valid) setInvalid(false);
        }}
      />
      {invalid && (
        <p id={`${id}-error`} className="text-destructive-foreground text-xs">
          请填写{label}。
        </p>
      )}
    </Field>
  );
}
function VerificationForm({
  entry,
  health,
  identity = false,
  onSaved,
}: {
  entry: EntryRow;
  health: HealthView;
  identity?: boolean;
  onSaved: () => void;
}) {
  const id = useId();
  const [revision] = useState(health.revision);
  const [message, setMessage] = useState("");
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(feedbackTimer.current), []);
  const feedback = (message: string) => {
    clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setMessage(message), 200);
  };
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: async (data: FormData) => {
      const values = {
        id: entry.id,
        expectedRevision: revision,
        scope: String(data.get("scope") ?? ""),
        note: String(data.get("note") ?? ""),
      };
      if (identity) {
        const input = identityReviewInput.parse({
          ...values,
          confirmed: data.get("confirmed") === "on",
        });
        return $confirmEntryIdentity({ data: input });
      }
      const input = functionVerificationInput.parse({
        ...values,
        result: data.get("result"),
        action: String(data.get("action") ?? ""),
      });
      return $verifyEntryFunction({ data: input });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setMessage(
          result.error === "conflict"
            ? "记录已变化或身份尚待复核，请关闭后重新打开，核对后再保存。"
            : "无法保存此条目的验证记录。",
        );
        return;
      }
      await Promise.all(
        [["entry-health"], ["entries"], ["dashboard-activity"], ["audit"]].map((queryKey) =>
          client.invalidateQueries({ queryKey }),
        ),
      );
      onSaved();
    },
    onError: () => setMessage("保存失败，请检查必填项；若记录已变化，请重新打开后核对。"),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearTimeout(feedbackTimer.current);
    setMessage("");
    save.mutate(new FormData(event.currentTarget));
  };
  return (
    <form method="post" onSubmit={submit} aria-labelledby={`${id}-heading`}>
      <FieldGroup className="flex flex-col gap-4">
        <FieldsetLegend id={`${id}-heading`}>
          {identity ? "确认原账号身份与收录类型" : "记录人工功能验证"}
        </FieldsetLegend>
        <p className="text-muted-foreground text-xs">
          标 * 为必填项。
          {identity
            ? "请先在客户端核对原账号与收录类型；确认后需重新检查，不会自动恢复上线。"
            : "请先在客户端实际操作，再记录结果；本表单不会向机器人发送消息。"}
        </p>
        {!identity && (
          <>
            <FieldGroup className="flex flex-col gap-2">
              <FieldsetLegend id={`${id}-result`}>本次结果 *</FieldsetLegend>
              <RadioGroup name="result" required aria-labelledby={`${id}-result`}>
                {(["responded", "no_response", "reported_issue"] as const).map((result) => (
                  <Label key={result} className="flex min-h-12 items-center gap-3">
                    <Radio value={result} />
                    {functionHealthLabels[result]}
                  </Label>
                ))}
              </RadioGroup>
            </FieldGroup>
            <RequiredInput name="action" label="实际操作" maxLength={160} onFeedback={feedback} />
          </>
        )}
        <RequiredInput
          name="scope"
          label={identity ? "身份核对依据" : "验证范围与实际结果"}
          maxLength={400}
          onFeedback={feedback}
        />
        <Field>
          <FieldLabel htmlFor={`${id}-note`}>备注（选填）</FieldLabel>
          <Input nativeInput id={`${id}-note`} name="note" maxLength={500} />
        </Field>
        {identity && (
          <Label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" name="confirmed" required />
            我已核对原账号身份与收录类型
          </Label>
        )}
        <p role="status" aria-live="polite" className="text-sm">
          {message}
        </p>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "正在保存…" : identity ? "记录身份确认" : "保存功能验证记录"}
        </Button>
      </FieldGroup>
    </form>
  );
}
