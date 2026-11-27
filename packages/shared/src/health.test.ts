import { expect, test } from "vitest";
import {
  FunctionCheck,
  HEALTH_POLICY_VERSION,
  HealthObservation,
  healthRedirectTarget,
  publicHealthOf,
} from "./health.ts";
import { initialHealthSource, nextHealthSource } from "./health-source.ts";

const good = (): HealthObservation => ({
  observationId: crypto.randomUUID(),
  targetUsername: "example_bot",
  expectedKind: "bot" as const,
  startedAt: 100,
  completedAt: 101,
  parserVersion: "v1",
  policyVersion: HEALTH_POLICY_VERSION,
  outcome: "recognized" as const,
  reason: "profile_recognized" as const,
  httpStatus: 200,
  pageShape: "entity" as const,
  detectedKind: "bot" as const,
  previewUnavailable: false,
});
test("recognition requires positive matching profile evidence", () => {
  expect(publicHealthOf(good())).toBe("accessible");
  for (const change of [
    { httpStatus: 403 },
    { detectedKind: "channel" },
    { pageShape: "view" },
    { reason: "contact_placeholder" },
  ])
    expect(HealthObservation.safeParse({ ...good(), ...change }).success).toBe(false);
});
test("placeholders and timeouts are uncertain regardless of prior success", () => {
  for (const reason of [
    "view_placeholder",
    "contact_placeholder",
    "transport_error",
    "parse_error",
  ] as const)
    expect(
      publicHealthOf({
        ...good(),
        outcome: "uncertain",
        reason,
        httpStatus: null,
        pageShape: null,
        detectedKind: null,
      }),
    ).toBe("uncertain");
});
test("strict evidence rejects raw HTML, secrets, unbounded fields and invalid times", () => {
  for (const change of [
    { html: "private" },
    { token: "secret" },
    { startedAt: 200 },
    { parserVersion: "x".repeat(65) },
    { targetUsername: "https://t.me/example_bot" },
  ])
    expect(HealthObservation.safeParse({ ...good(), ...change }).success).toBe(false);
});
test("functional verification cannot omit actor/action/scope or claim unverified as a test result", () => {
  const record = {
    observationId: crypto.randomUUID(),
    targetUsername: "example_bot",
    observedAt: 100,
    result: "no_response",
    actor: "admin",
    action: "/start",
    scope: "welcome reply",
    note: "",
  };
  expect(FunctionCheck.safeParse(record).success).toBe(true);
  for (const change of [
    { actor: "" },
    { action: "" },
    { scope: "" },
    { result: "unverified" },
    { note: "x".repeat(501) },
  ])
    expect(FunctionCheck.safeParse({ ...record, ...change }).success).toBe(false);
});
test("source delay grows and caps; Retry-After may exceed the local cap", () => {
  let s = initialHealthSource();
  for (let i = 1; i <= 10; i++) {
    const at = i * 10_000_000;
    s = nextHealthSource(s, { at, outcome: "transport_error" });
    expect(s.notBefore - at).toBe(Math.min(300_000 * 2 ** Math.min(i - 1, 4), 3_600_000));
  }
  const at = s.lastObservedAt + 1;
  s = nextHealthSource(s, { at, outcome: "rate_limited", retryAfterMs: 7_200_000 });
  expect(s.notBefore).toBe(at + 7_200_000);
});
test("old source observations cannot shorten a cooldown and parsed pages recover", () => {
  const s = nextHealthSource(initialHealthSource(), {
    at: 100,
    outcome: "rate_limited",
    retryAfterMs: 10000000,
  });
  expect(nextHealthSource(s, { at: 99, outcome: "parsed" })).toEqual(s);
  expect(nextHealthSource(s, { at: 101, outcome: "parse_error" }).notBefore).toBe(s.notBefore);
  expect(nextHealthSource(s, { at: 102, outcome: "parsed" })).toEqual(s);
  expect(nextHealthSource(s, { at: s.notBefore + 1, outcome: "parsed" })).toEqual({
    failures: 0,
    lastObservedAt: s.notBefore + 1,
    notBefore: 0,
  });
});

test("redirect diagnostics never retain credentials, query or fragment", () => {
  expect(healthRedirectTarget("https://name:secret@t.me/example?token=private#private")).toBe(
    "t.me/example",
  );
  expect(healthRedirectTarget("tg://resolve?domain=example")).toBeUndefined();
  expect(
    HealthObservation.safeParse({ ...good(), redirectTarget: "t.me/example?secret=1" }).success,
  ).toBe(false);
});
