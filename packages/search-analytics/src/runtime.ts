import { SearchSettings } from "./config.ts";
export type DiagnosticCode =
  | "database"
  | "configuration"
  | "verification"
  | "identity"
  | "turnstile"
  | "boundary";
export type Observer = (code: DiagnosticCode) => void;
export const observeFailure: Observer = (code) => console.warn("search-analytics", code);
export type Usage = { rowsRead: number; rowsWritten: number };
export function usage(results: readonly D1Result<unknown>[]): Usage {
  return results.reduce(
    (a, r) => ({
      rowsRead: a.rowsRead + r.meta.rows_read,
      rowsWritten: a.rowsWritten + r.meta.rows_written,
    }),
    { rowsRead: 0, rowsWritten: 0 },
  );
}
export type AnalyticsDb = Pick<D1Database, "prepare" | "batch">;
export async function readSettings(db: AnalyticsDb) {
  const query = await db
    .prepare(
      "SELECT s.version,s.value,c.rules_revision FROM search_settings s JOIN search_control c ON c.id=s.id WHERE s.id=1",
    )
    .all<{ version: number; value: string; rules_revision: number }>();
  const row = query.results[0];
  if (!row) throw new Error("Analytics settings missing");
  return {
    version: row.version,
    rulesRevision: row.rules_revision,
    value: SearchSettings.parse(JSON.parse(row.value)),
    usage: usage([query]),
  };
}
