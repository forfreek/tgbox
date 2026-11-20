import { compareAndSetSiteState, type Db, getSiteState } from "@tgbox/db";

export const REFRESH_PROGRESS_KEY = "refresh_progress_v1";
// A scheduled Worker has a 15 minute wall-time limit. A live owner must finish before takeover.
const LEASE_MS = 20 * 60_000;

type Progress = {
  nextId: number;
  cycle: number;
  lastScheduledTime: number;
  lease: { token: string; until: number } | null;
};

function parse(raw: string): Progress {
  const state: Progress = JSON.parse(raw);
  if (
    !Number.isSafeInteger(state.nextId) ||
    state.nextId < 1 ||
    !Number.isSafeInteger(state.cycle) ||
    state.cycle < 0 ||
    !Number.isSafeInteger(state.lastScheduledTime) ||
    state.lastScheduledTime < 0 ||
    (state.lease !== null &&
      (typeof state.lease?.token !== "string" || !Number.isSafeInteger(state.lease?.until)))
  )
    throw new Error("Invalid refresh progress; refusing to reset it");
  return state;
}

export async function claimRefreshProgress(
  db: Db,
  input: { maxId: number; batchSize: number; scheduledTime: number; now: number },
) {
  const previous = await getSiteState(db, REFRESH_PROGRESS_KEY);
  // First rollout catches the newest slice, then begins a complete sweep. It does not invent
  // a historical checkpoint from the old clock formula, which could already have skipped IDs.
  const state: Progress =
    previous === undefined
      ? {
          nextId: Math.floor((input.maxId - 1) / input.batchSize) * input.batchSize + 1,
          cycle: 0,
          lastScheduledTime: 0,
          lease: null,
        }
      : parse(previous);
  if (
    state.lastScheduledTime >= input.scheduledTime ||
    (state.lease !== null && state.lease.until > input.now)
  )
    return null;
  if (state.nextId > input.maxId) {
    state.nextId = 1;
    state.cycle++;
  }
  state.lease = { token: crypto.randomUUID(), until: input.now + LEASE_MS };
  const claimed = JSON.stringify(state);
  if (!(await compareAndSetSiteState(db, REFRESH_PROGRESS_KEY, previous, claimed))) return null;
  return { state, claimed };
}

export async function finishRefreshProgress(
  db: Db,
  claim: NonNullable<Awaited<ReturnType<typeof claimRefreshProgress>>>,
  completed?: { nextId: number; scheduledTime: number },
) {
  const state: Progress = { ...claim.state, lease: null };
  if (completed) {
    state.nextId = completed.nextId;
    state.lastScheduledTime = completed.scheduledTime;
  }
  if (
    !(await compareAndSetSiteState(db, REFRESH_PROGRESS_KEY, claim.claimed, JSON.stringify(state)))
  ) {
    throw new Error("Refresh progress ownership lost; checkpoint was not advanced");
  }
}
