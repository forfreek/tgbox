import { useId } from "react";
import { Button } from "@/components/coss/ui/button.tsx";
import { Card } from "@/components/coss/ui/card.tsx";
import { Input } from "@/components/coss/ui/input.tsx";
import type { SearchAdminView } from "@/functions/search-analytics.ts";
import { control, statusLabels } from "./presentation.ts";

type Rule = Extract<SearchAdminView, { kind: "rules" }>["rows"][number];
export function RuleForm({
  row,
  busy,
  save,
}: {
  row?: Rule;
  busy: boolean;
  save: (raw: unknown) => void;
}) {
  const fieldId = useId();
  return (
    <Card className="p-4">
      <form
        aria-label={row ? `编辑规则 ${row.pattern}` : "添加规则"}
        method="post"
        action="/search-analytics"
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          save({
            version: 1,
            action: "rule",
            id: row?.id ?? 0,
            expectedRevision: row?.revision ?? 0,
            pattern: f.get("pattern"),
            match: f.get("match"),
            status: f.get("status"),
            enabled: f.get("enabled") === "on",
          });
        }}
      >
        <fieldset disabled={busy} className="flex flex-wrap items-end gap-3">
          <legend className="mb-3 font-medium">
            {row ? `规则 #${row.id} · 版本 ${row.revision}` : "添加规则"}
          </legend>
          <label htmlFor={`${fieldId}-pattern`} className="grid gap-1">
            规则词
            <Input
              id={`${fieldId}-pattern`}
              name="pattern"
              required
              minLength={2}
              maxLength={128}
              defaultValue={row?.pattern ?? ""}
            />
          </label>
          <label className="grid gap-1">
            匹配方式
            <select name="match" defaultValue={row?.match_mode ?? "exact"} className={control}>
              <option value="exact">精确匹配</option>
              <option value="contains">包含匹配</option>
            </select>
          </label>
          <label className="grid gap-1">
            状态
            <select name="status" defaultValue={row?.status ?? "pending"} className={control}>
              {["blacklist", "hidden", "pending", "approved"].map((k) => (
                <option key={k} value={k}>
                  {statusLabels[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-12 items-center gap-2">
            <input name="enabled" type="checkbox" defaultChecked={row ? row.enabled === 1 : true} />
            启用
          </label>
          <Button type="submit">{row ? "保存规则" : "添加规则"}</Button>
        </fieldset>
      </form>
    </Card>
  );
}
