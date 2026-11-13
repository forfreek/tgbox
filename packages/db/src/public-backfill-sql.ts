/** Shared by D1 backfill and the offline SQLite recovery tool. */
export function publicBackfillStatements(cursor: number, last: number) {
  if (!Number.isSafeInteger(cursor) || cursor < 0 || !Number.isSafeInteger(last) || last <= cursor)
    throw new RangeError("Invalid public backfill range");
  const guard = `(SELECT value FROM site_state WHERE key='public_backfill_cursor')=?
    AND (SELECT value FROM site_state WHERE key='public_projection_enabled')='1'
    AND (SELECT value FROM site_state WHERE key='public_projection_ready')='0'`;
  return [
    {
      sql: `INSERT INTO public_promotion_state(entry_id,is_public,valid_until)
      SELECT e.id,e.status='approved',CASE WHEN EXISTS
        (SELECT 1 FROM promotions p WHERE p.entry_username=e.username) THEN 0 ELSE 9007199254740991 END
      FROM entries e WHERE e.id>? AND e.id<=? AND ${guard}
      ON CONFLICT(entry_id) DO UPDATE SET is_public=excluded.is_public,tier=0,valid_from=0,
        valid_until=excluded.valid_until,input_revision=input_revision+1,evaluation_key=''`,
      params: [cursor, last, String(cursor)],
    },
    {
      sql: `DELETE FROM public_listing WHERE entry_id>? AND entry_id<=? AND ${guard}`,
      params: [cursor, last, String(cursor)],
    },
    {
      sql: `INSERT INTO public_listing SELECT * FROM public_listing_source
      WHERE entry_id>? AND entry_id<=? AND ${guard}`,
      params: [cursor, last, String(cursor)],
    },
    {
      sql: `UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT)
      WHERE key='public_content_revision' AND ${guard}`,
      params: [String(cursor)],
    },
    {
      sql: `UPDATE site_state SET value=? WHERE key='public_backfill_cursor' AND ${guard}`,
      params: [String(last), String(cursor)],
    },
  ];
}
