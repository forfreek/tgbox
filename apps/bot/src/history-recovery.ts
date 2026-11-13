import { mirrorHistoryStep } from "@tgbox/core";
import { type Db, getSiteStates } from "@tgbox/db";

const enabledKey = "public_history_recovery_enabled";
const cursorKey = "public_history_recovery_cursor";
// Includes SQL statements, R2 reads and late object-check failure invalidation.
const TICK_COST = 16;
const LIMIT = 50;

/** One entry/one mirror phase using spare cron budget. Failed entries yield until the next pass. */
export async function runHistoryRecoveryTick(
  db: Db,
  media: Pick<R2Bucket, "get" | "head">,
  spent: number,
  now: () => number,
) {
  if (!Number.isSafeInteger(spent) || spent < 0) throw new RangeError("Invalid tick budget");
  if (LIMIT - spent < TICK_COST) return { status: "budget" as const, reserved: 0 };
  try {
    const state = await getSiteStates(db, [
      enabledKey,
      cursorKey,
      "public_projection_enabled",
      "public_projection_ready",
    ]);
    if (state[enabledKey] !== "1") return { status: "disabled" as const, reserved: 1 };
    if (state.public_projection_enabled !== "1" || state.public_projection_ready !== "1")
      return { status: "not_ready" as const, reserved: 1 };
    const original = state[cursorKey];
    const parsed = Number(original ?? "0");
    const cursor = Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
    const entry = await db.$client
      .prepare("SELECT id FROM entries WHERE id>? ORDER BY id LIMIT 1")
      .bind(cursor)
      .first<{ id: number }>();
    let status: string = "wrapped";
    let next = 0;
    if (entry) {
      try {
        status = (await mirrorHistoryStep(db, media, entry.id, now())).status;
      } catch (error) {
        console.error("history recovery entry failed", entry.id, error);
        status = "failed";
      }
      if (["clean", "write", "verify"].includes(status))
        return { status, entryId: entry.id, reserved: TICK_COST };
      // The recurring sweep revisits failures and oversized sources without blocking other entries.
      next = entry.id;
    }
    await db.$client
      .prepare(`INSERT INTO site_state(key,value) SELECT ?,? WHERE
      COALESCE((SELECT value FROM site_state WHERE key=?),'')=?
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
      .bind(cursorKey, String(next), cursorKey, original ?? "")
      .run();
    return { status, entryId: entry?.id, reserved: TICK_COST };
  } catch (error) {
    console.error("history recovery tick failed", error);
    return { status: "failed" as const, reserved: TICK_COST };
  }
}
