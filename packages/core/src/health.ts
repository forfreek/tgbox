import {
  type Entry,
  getEntryWithStats,
  type HealthSource,
  listEntryHealth,
  readHealthSources,
  recordFunctionCheck,
  recordHealthObservation,
  recordHealthSource,
  recordIdentityReview,
  unverifiedHealth,
} from "@tgbox/db";
import { FunctionCheck, type HealthSourceResult, IdentityReview } from "@tgbox/shared";
import { type EntrySnapshot, fetchEntrySnapshot, type SnapshotOptions } from "@tgbox/telegram";
import type { Actor, CoreContext } from "./context.ts";

export const healthResultRank = {
  parsed: 0,
  transport_error: 1,
  parse_error: 1,
  server_error: 1,
  rate_limited: 2,
};
export type SourceResults = Partial<Record<HealthSource, HealthSourceResult>>;
export function mergeSourceResults(target: SourceResults, observed: SourceResults) {
  for (const source of ["tme_profile", "tme_preview"] as const) {
    const next = observed[source],
      old = target[source];
    if (
      next &&
      (!old ||
        healthResultRank[next.outcome] > healthResultRank[old.outcome] ||
        (healthResultRank[next.outcome] === healthResultRank[old.outcome] &&
          (next.retryAfterMs ?? 0) > (old.retryAfterMs ?? 0)))
    )
      target[source] = next;
  }
}
export async function saveSourceResults(
  ctx: Pick<CoreContext, "db">,
  controls: Awaited<ReturnType<typeof readHealthSources>>,
  results: SourceResults,
) {
  let subrequests = 0;
  for (const source of ["tme_profile", "tme_preview"] as const) {
    const result = results[source];
    if (result) {
      const saved = await recordHealthSource(ctx.db, source, controls[source], result);
      subrequests += saved.subrequests;
    }
  }
  return subrequests;
}
/** Used by interactive acquisition as well as submission previews; the server owns the clock. */
export async function fetchResourceSnapshot(
  ctx: CoreContext,
  username: string,
  options: Omit<SnapshotOptions, "fetch" | "now" | "cooldowns">,
) {
  const controls = await readHealthSources(ctx.db);
  const snapshot = await fetchEntrySnapshot(username, {
    ...options,
    fetch: ctx.fetch,
    now: new Date(ctx.now()),
    cooldowns: {
      tme_profile: controls.tme_profile.state.notBefore,
      tme_preview: controls.tme_preview.state.notBefore,
    },
  });
  await saveSourceResults(ctx, controls, snapshot.sourceResults);
  return snapshot;
}
export async function saveEntryObservation(
  ctx: Pick<CoreContext, "db">,
  entry: Pick<Entry, "id" | "username" | "kind">,
  snapshot: EntrySnapshot,
) {
  if (!snapshot.health)
    return { accepted: false, publicState: null, rowsWritten: 0, subrequests: 0 };
  return recordHealthObservation(ctx.db, entry.id, {
    ...snapshot.health,
    targetUsername: entry.username,
    expectedKind: entry.kind,
  });
}
export async function currentEntryHealth(ctx: Pick<CoreContext, "db">, id: number) {
  return (await listEntryHealth(ctx.db, [id])).get(id) ?? unverifiedHealth();
}

function requireHuman(actor: Actor) {
  if (actor === "system")
    throw new Error("Human verification requires an authenticated administrator");
}
export async function verifyEntryFunction(
  ctx: CoreContext,
  input: {
    id: number;
    expectedRevision: number;
    result: "responded" | "no_response" | "reported_issue";
    action: string;
    scope: string;
    note: string;
    actor: Actor;
  },
) {
  requireHuman(input.actor);
  const row = await getEntryWithStats(ctx.db, input.id);
  if (row?.entry.kind !== "bot") return { ok: false as const, error: "not_bot" as const };
  const record = FunctionCheck.parse({
    observationId: crypto.randomUUID(),
    targetUsername: row.entry.username,
    observedAt: ctx.now(),
    result: input.result,
    action: input.action,
    scope: input.scope,
    note: input.note,
    actor: input.actor,
  });
  const saved = await recordFunctionCheck(ctx.db, input.id, record, input.expectedRevision);
  return saved.accepted
    ? { ok: true as const }
    : { ok: false as const, error: "conflict" as const };
}
export async function confirmEntryIdentity(
  ctx: CoreContext,
  input: { id: number; expectedRevision: number; scope: string; note: string; actor: Actor },
) {
  requireHuman(input.actor);
  const row = await getEntryWithStats(ctx.db, input.id);
  if (!row) return { ok: false as const, error: "not_found" as const };
  const record = IdentityReview.parse({
    observationId: crypto.randomUUID(),
    targetUsername: row.entry.username,
    expectedKind: row.entry.kind,
    observedAt: ctx.now(),
    action: "confirm_identity",
    scope: input.scope,
    note: input.note,
    actor: input.actor,
  });
  const saved = await recordIdentityReview(ctx.db, input.id, input.expectedRevision, record);
  return saved.accepted
    ? { ok: true as const }
    : { ok: false as const, error: "conflict" as const };
}
