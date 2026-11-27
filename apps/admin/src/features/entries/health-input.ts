import { FunctionHealth } from "@tgbox/shared";
import { z } from "zod";

const id = z.number().int().positive();
export const functionVerificationInput = z
  .object({
    id,
    expectedRevision: z.number().int().nonnegative(),
    result: FunctionHealth.exclude(["unverified"]),
    action: z.string().trim().min(1).max(160),
    scope: z.string().trim().min(1).max(400),
    note: z.string().trim().max(500),
  })
  .strict();
export const identityReviewInput = z
  .object({
    id,
    expectedRevision: z.number().int().positive(),
    scope: z.string().trim().min(1).max(400),
    note: z.string().trim().max(500),
    confirmed: z.literal(true),
  })
  .strict();
