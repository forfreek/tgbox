import { expect, test } from "vitest";
import { functionVerificationInput, identityReviewInput } from "./health-input.ts";

const input = {
  id: 1,
  expectedRevision: 0,
  result: "responded",
  action: "/start",
  scope: "Welcome response only",
  note: "",
};
test("manual forms reject client identity, time and publication fields", () => {
  expect(functionVerificationInput.safeParse(input).success).toBe(true);
  for (const key of ["actor", "observedAt", "observationId", "status", "username"])
    expect(functionVerificationInput.safeParse({ ...input, [key]: "forged" }).success).toBe(false);
  for (const fields of [
    { action: " " },
    { scope: " " },
    { expectedRevision: -1 },
    { result: "unverified" },
  ])
    expect(functionVerificationInput.safeParse({ ...input, ...fields }).success).toBe(false);
});
test("identity confirmation requires acknowledgement and a positive revision", () => {
  const identity = {
    id: 1,
    expectedRevision: 1,
    scope: "Confirmed original identity",
    note: "",
    confirmed: true,
  };
  expect(identityReviewInput.safeParse(identity).success).toBe(true);
  for (const fields of [
    { confirmed: false },
    { expectedRevision: 0 },
    { actor: "forged" },
    { scope: " " },
  ])
    expect(identityReviewInput.safeParse({ ...identity, ...fields }).success).toBe(false);
});
