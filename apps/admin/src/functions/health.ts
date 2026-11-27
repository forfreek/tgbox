import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { confirmEntryIdentity, currentEntryHealth, verifyEntryFunction } from "@tgbox/core";
import { getEntryHealthEvidence, getEntryWithStats } from "@tgbox/db";
import { z } from "zod";
import { functionVerificationInput, identityReviewInput } from "@/features/entries/health-input.ts";
import { adminMiddleware } from "@/server/middleware.ts";

const id = z.number().int().positive();
export const $getEntryHealth = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(z.object({ id }).strict())
  .handler(async ({ data, context }) => {
    const row = await getEntryWithStats(context.core.db, data.id);
    if (!row) return null;
    const [health, evidence] = await Promise.all([
      currentEntryHealth(context.core, data.id),
      getEntryHealthEvidence(context.core.db, data.id),
    ]);
    return {
      entry: {
        id: row.entry.id,
        username: row.entry.username,
        title: row.entry.title,
        kind: row.entry.kind,
        status: row.entry.status,
      },
      health,
      evidence,
    };
  });
export const entryHealthQueryOptions = (id: number) =>
  queryOptions({
    queryKey: ["entry-health", id],
    queryFn: ({ signal }) => $getEntryHealth({ data: { id }, signal }),
    staleTime: 0,
  });
export const $verifyEntryFunction = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(functionVerificationInput)
  .handler(({ data, context }) =>
    verifyEntryFunction(context.core, { ...data, actor: context.auth.actor }),
  );
export const $confirmEntryIdentity = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .validator(identityReviewInput)
  .handler(({ data, context }) =>
    confirmEntryIdentity(context.core, {
      id: data.id,
      expectedRevision: data.expectedRevision,
      scope: data.scope,
      note: data.note,
      actor: context.auth.actor,
    }),
  );
