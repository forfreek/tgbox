import { z } from "zod";

export const HealthSourceState = z
  .object({
    failures: z.number().int().nonnegative().max(32),
    lastObservedAt: z.number().int().nonnegative(),
    notBefore: z.number().int().nonnegative(),
  })
  .strict();
export type HealthSourceState = z.infer<typeof HealthSourceState>;
export type HealthSourceResult = {
  at: number;
  outcome: "parsed" | "transport_error" | "parse_error" | "rate_limited" | "server_error";
  retryAfterMs?: number;
};
export const initialHealthSource = (): HealthSourceState => ({
  failures: 0,
  lastObservedAt: 0,
  notBefore: 0,
});
/** Source backoff never produces a verdict about any individual resource. */
export function nextHealthSource(
  previous: HealthSourceState,
  result: HealthSourceResult,
): HealthSourceState {
  const old = HealthSourceState.parse(previous);
  if (
    !Number.isSafeInteger(result.at) ||
    result.at < 0 ||
    !Number.isSafeInteger(result.retryAfterMs ?? 0) ||
    (result.retryAfterMs ?? 0) < 0
  )
    throw new Error("Invalid source observation");
  if (result.at <= old.lastObservedAt) return old;
  if (result.outcome === "parsed" && result.at < old.notBefore) return old;
  if (result.outcome === "parsed") return { failures: 0, lastObservedAt: result.at, notBefore: 0 };
  const failures = Math.min(old.failures + 1, 32);
  const delay = Math.max(
    Math.min(300_000 * 2 ** Math.min(failures - 1, 4), 3_600_000),
    result.retryAfterMs ?? 0,
  );
  if (!Number.isSafeInteger(result.at + delay)) throw new Error("Source retry timestamp overflow");
  return {
    failures,
    lastObservedAt: result.at,
    notBefore: Math.max(old.notBefore, result.at + delay),
  };
}
