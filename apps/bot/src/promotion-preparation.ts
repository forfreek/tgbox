import { type Db, getSiteStates, preparePublicPromotions, setSiteState } from "@tgbox/db";
import { ProductKind } from "@tgbox/shared";

// One state read + at most eight preparation statements + one rotation write.
const TICK_COST = 10;
const LIMIT = 50;
const enabledKey = "public_promotion_preparation_enabled";
const cursorKey = "public_promotion_preparation_cursor";

/** Runs after the existing jobs and advances one product scope using only spare budget. */
export async function runPromotionPreparationTick(db: Db, spent: number, now: () => number) {
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
    const parsed = Number(state[cursorKey] ?? "0");
    const cursor =
      Number.isSafeInteger(parsed) && parsed >= 0 ? parsed % ProductKind.options.length : 0;
    const kind = ProductKind.options[cursor];
    if (!kind) throw new Error("Missing promotion scope");
    let outcome: "pending" | "ready" | "contended" | "failed";
    try {
      outcome = (await preparePublicPromotions(db, { kind, limit: 100 }, { now, batchSize: 100 }))
        .status;
    } catch (error) {
      console.error("promotion preparation failed", error);
      outcome = "failed";
    }
    // Failed or already-ready scopes also yield the next available turn to other products.
    await setSiteState(db, cursorKey, String((cursor + 1) % ProductKind.options.length));
    return { status: outcome, kind, reserved: TICK_COST };
  } catch (error) {
    console.error("promotion preparation tick failed", error);
    return { status: "failed" as const, reserved: TICK_COST };
  }
}
