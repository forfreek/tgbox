import type { DatabaseSync } from "node:sqlite";
import { publicBackfillStatements } from "../../packages/db/src/public-backfill-sql.ts";

const phaseKey = "public_local_rebuild_phase";
const scanKey = "public_local_rebuild_cursor";
function get(db: DatabaseSync, key: string) {
  return db.prepare("SELECT value FROM site_state WHERE key=?").get(key)?.value as
    | string
    | undefined;
}
function set(db: DatabaseSync, key: string, value: string) {
  db.prepare(
    "INSERT INTO site_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(key, value);
}
export function projectionStatus(db: DatabaseSync) {
  return {
    phase: get(db, phaseKey) ?? "not_started",
    cursor: get(db, scanKey) ?? "0",
    backfillCursor: get(db, "public_backfill_cursor") ?? "0",
    enabled: get(db, "public_projection_enabled") ?? "0",
    ready: get(db, "public_projection_ready") ?? "0",
  };
}

/** Full offline audit. These aggregate scans must never run inside SSR or a D1 request. */
export function auditProjection(db: DatabaseSync) {
  const count = (sql: string) => Number(db.prepare(`SELECT count(*) AS n FROM (${sql})`).get()?.n);
  return {
    missing: count("SELECT * FROM public_listing_source EXCEPT SELECT * FROM public_listing"),
    extra: count("SELECT * FROM public_listing EXCEPT SELECT * FROM public_listing_source"),
    counters:
      count(`SELECT c.scope FROM public_counts c WHERE c.count<0 OR c.order_revision<0 OR typeof(c.order_revision)!='integer' OR c.count !=
      (SELECT count(*) FROM public_listing l WHERE l.scope=c.scope)
      UNION SELECT l.scope FROM public_listing l LEFT JOIN public_counts c ON c.scope=l.scope WHERE c.scope IS NULL`),
    promotionState:
      count(`SELECT e.id FROM entries e LEFT JOIN public_promotion_state p ON p.entry_id=e.id
      WHERE p.entry_id IS NULL OR p.is_public!=(e.status='approved') OR p.tier NOT IN(0,1,2,3)
      UNION SELECT p.entry_id FROM public_promotion_state p LEFT JOIN entries e ON e.id=p.entry_id WHERE e.id IS NULL`),
  };
}

export function operateProjection(
  db: DatabaseSync,
  command: "start" | "restart" | "step" | "finish",
  limit = 100,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new RangeError("Batch size must be 1..100");
  db.exec("BEGIN IMMEDIATE");
  try {
    const phase = get(db, phaseKey);
    if (command === "start" || command === "restart") {
      if (command === "restart" || phase === undefined) {
        if (db.prepare("SELECT id FROM entries WHERE id<=0 OR id>9007199254740991 LIMIT 1").get())
          throw new Error("Source IDs are outside the supported positive safe-integer range");
        set(db, "public_projection_ready", "0");
        set(db, "public_projection_enabled", "1");
        set(db, "public_backfill_cursor", "0");
        db.prepare(
          "INSERT INTO site_state(key,value) VALUES('public_content_revision','1') ON CONFLICT(key) DO UPDATE SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)",
        ).run();
        set(db, phaseKey, "listing_cleanup");
        set(db, scanKey, "0");
      }
    } else if (command === "finish") {
      if (phase !== "verify" && phase !== "done")
        throw new Error("Rebuild has not reached verification");
      if (
        get(db, "public_projection_enabled") !== "1" ||
        (phase === "verify" && get(db, "public_projection_ready") !== "0") ||
        (phase === "done" && get(db, "public_projection_ready") !== "1")
      )
        throw new Error("Rebuild gate changed");
      const audit = auditProjection(db);
      if (Object.values(audit).some((value) => value !== 0))
        throw new Error(`Projection audit failed: ${JSON.stringify(audit)}`);
      if (phase !== "done") {
        set(db, "public_projection_ready", "1");
        set(db, phaseKey, "done");
        db.prepare(
          "UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='public_content_revision'",
        ).run();
      }
    } else {
      if (phase === undefined) throw new Error("Start the rebuild first");
      if (
        phase !== "done" &&
        (get(db, "public_projection_enabled") !== "1" || get(db, "public_projection_ready") !== "0")
      )
        throw new Error("Rebuild gate changed");
      const cursor = Number(get(db, scanKey) ?? "0");
      if (!Number.isSafeInteger(cursor) || cursor < 0)
        throw new Error("Invalid local rebuild cursor");
      if (phase === "listing_cleanup" || phase === "promotion_cleanup") {
        const table = phase === "listing_cleanup" ? "public_listing" : "public_promotion_state";
        const rows = db
          .prepare(
            `SELECT DISTINCT entry_id FROM ${table} WHERE entry_id>? ORDER BY entry_id LIMIT ?`,
          )
          .all(cursor, limit);
        for (const row of rows)
          db.prepare(
            `DELETE FROM ${table} WHERE entry_id=? AND NOT EXISTS(SELECT 1 FROM entries WHERE id=?)`,
          ).run(Number(row.entry_id), Number(row.entry_id));
        if (rows.length) set(db, scanKey, String(rows.at(-1)?.entry_id));
        else {
          set(db, phaseKey, phase === "listing_cleanup" ? "promotion_cleanup" : "backfill");
          set(db, scanKey, "0");
        }
      } else if (phase === "backfill") {
        const after = Number(get(db, "public_backfill_cursor"));
        if (!Number.isSafeInteger(after) || after < 0) throw new Error("Invalid backfill cursor");
        const rows = db
          .prepare("SELECT id FROM entries WHERE id>? ORDER BY id LIMIT ?")
          .all(after, limit);
        const last = rows.at(-1)?.id;
        if (typeof last === "number")
          for (const statement of publicBackfillStatements(after, last))
            db.prepare(statement.sql).run(...statement.params);
        else {
          set(db, phaseKey, "counts");
          set(db, scanKey, "0");
          set(db, "public_local_rebuild_scope", "");
        }
      } else if (phase === "counts") {
        const scopes = db
          .prepare(`SELECT scope FROM public_counts WHERE scope>? UNION
          SELECT scope FROM public_listing WHERE scope>? ORDER BY scope LIMIT ?`)
          .all(
            get(db, "public_local_rebuild_scope") ?? "",
            get(db, "public_local_rebuild_scope") ?? "",
            limit,
          );
        for (const row of scopes)
          db.prepare(`INSERT INTO public_counts(scope,count,order_revision)
          SELECT ?,count(*),1 FROM public_listing WHERE scope=? ON CONFLICT(scope) DO UPDATE
          SET count=excluded.count,order_revision=CASE WHEN order_revision>=0 AND typeof(order_revision)='integer'
          THEN order_revision+1 ELSE 1 END`).run(String(row.scope), String(row.scope));
        if (scopes.length) set(db, "public_local_rebuild_scope", String(scopes.at(-1)?.scope));
        else set(db, phaseKey, "verify");
      } else if (phase !== "verify" && phase !== "done") throw new Error("Unknown rebuild phase");
    }
    const status = projectionStatus(db);
    db.exec("COMMIT");
    return status;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
