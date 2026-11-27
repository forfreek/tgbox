import { and, desc, eq } from "drizzle-orm";
import type { Db } from "./access.ts";
import { auditLog, entries, entryHealth, submissions } from "./schema.ts";

/**
 * Recent activity for the admin dashboard. Scans `entries` for system hides (no index by design,
 * admin traffic only); every list is bounded by `limit`.
 */
export async function dashboardActivity(db: Db, { limit }: { limit: number }) {
  const take = Math.max(1, Math.min(limit, 20));
  const [recentSubmissions, systemHides, audit, lastTrigger] = await db.batch([
    db.select().from(submissions).orderBy(desc(submissions.id)).limit(take),
    db
      .select({
        id: entries.id,
        username: entries.username,
        kind: entries.kind,
        title: entries.title,
        health: entryHealth,
        updatedAt: entries.updatedAt,
      })
      .from(entries)
      .leftJoin(
        entryHealth,
        and(
          eq(entryHealth.entryId, entries.id),
          eq(entryHealth.bindingUsername, entries.username),
          eq(entryHealth.bindingKind, entries.kind),
        ),
      )
      .where(eq(entries.status, "hidden_by_system"))
      .orderBy(desc(entries.updatedAt), desc(entries.id))
      .limit(take),
    db.select().from(auditLog).orderBy(desc(auditLog.id)).limit(take),
    db
      .select({ createdAt: auditLog.createdAt })
      .from(auditLog)
      .where(eq(auditLog.action, "build.trigger"))
      .orderBy(desc(auditLog.id))
      .limit(1),
  ]);
  return {
    submissions: recentSubmissions,
    systemHides,
    audit,
    lastBuildTriggerAt: lastTrigger[0]?.createdAt ?? null,
  };
}
export type DashboardActivity = Awaited<ReturnType<typeof dashboardActivity>>;
