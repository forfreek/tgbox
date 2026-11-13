export type Statement = { sql: string; params?: (string | number)[] };
export type QueryResult = {
  results: Record<string, unknown>[];
  meta?: { changes?: number; rows_read?: number; rows_written?: number };
};
export type Query = (statements: Statement[]) => Promise<QueryResult[]>;

/** Administrative REST transport. No token or server error body is printed. */
export function remoteD1(
  account: string,
  database: string,
  token: string,
  request: typeof fetch = fetch,
): Query {
  if (!account || !database || !token)
    throw new Error("Explicit account, database and API token are required");
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${encodeURIComponent(database)}/query`;
  return async (statements) => {
    const response = await request(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        batch: statements.map((statement) => ({
          sql: statement.sql,
          params: (statement.params ?? []).map(String),
        })),
      }),
    });
    if (!response.ok) throw new Error(`D1 request failed (HTTP ${response.status})`);
    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("success" in body) ||
      body.success !== true ||
      !("result" in body) ||
      !Array.isArray(body.result) ||
      body.result.length !== statements.length
    )
      throw new Error("Invalid or unsuccessful D1 response");
    return body.result.map((value): QueryResult => {
      if (
        typeof value !== "object" ||
        value === null ||
        value.success === false ||
        !Array.isArray(value.results) ||
        value.results.some(
          (row: unknown) => typeof row !== "object" || row === null || Array.isArray(row),
        )
      )
        throw new Error("Invalid D1 query result");
      return { results: value.results, meta: value.meta };
    });
  };
}
