import { env } from "cloudflare:workers";

/** This pool isolates files, not individual tests. Explicitly reset only the local analytics DB. */
export async function resetAnalytics() {
  const db = env.ANALYTICS_DB;
  const tables = [
    "search_daily_stats",
    "search_daily_identities",
    "search_identity_days",
    "search_daily_totals",
    "search_event_receipts",
    "search_rate_limits",
    "search_keyword_rules",
    "search_job_runs",
    "search_admin_audit",
    "search_security_daily",
  ];
  await db.batch([
    ...tables.map((table) => db.prepare(`DELETE FROM ${table}`)),
    db.prepare("UPDATE search_settings SET version=1,value='{}',updated_at=0 WHERE id=1"),
    db.prepare(
      "UPDATE search_control SET rules_revision=1,publication_generation=0,publication_key=NULL,publication_rules_revision=NULL,publication_config_version=NULL,lease_token=NULL,lease_until=0,fence=0 WHERE id=1",
    ),
  ]);
}
