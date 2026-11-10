import { sqlValue } from "../lib/sql.ts";
import type { SeedRow } from "./seed-sql.ts";

/**
 * Insert-only seed SQL for bulk list imports: never updates an existing username.
 * Matches the import rule "skip existing D1 usernames (no update)".
 */
export function seedEntryInsertSql(row: SeedRow, now: number) {
  const u = sqlValue(row.username.toLowerCase());
  const id = `(SELECT id FROM entries WHERE username = ${u})`;
  const v = sqlValue;
  return [
    `INSERT INTO entries (username, kind, category_id, title, description, lang, verified, avatar_version, tg_created_at, listed_at, status, updated_at)
SELECT ${u}, ${v(row.kind)}, c.id, ${v(row.title)}, ${v(row.description)}, ${v(row.lang)}, ${v(row.verified)}, ${v(row.avatarVersion)}, ${v(row.tgCreatedAt)}, ${now}, 'approved', ${now}
FROM categories c WHERE c.kind = ${v(row.kind)} AND c.slug = ${v(row.category)}
AND NOT EXISTS (SELECT 1 FROM entries e WHERE e.username = ${u});`,
    `INSERT INTO entry_stats (entry_id, members, online, activity_tier, stats_written_at)
SELECT ${id}, ${v(row.members)}, ${v(row.online)}, ${v(row.activityTier)}, ${now} WHERE ${id} IS NOT NULL
ON CONFLICT (entry_id) DO NOTHING;`,
    `INSERT OR IGNORE INTO entry_tags (entry_id, tag_id) SELECT ${id}, t.id FROM tags t WHERE t.slug IN (${row.tags.map(v).join(", ") || "NULL"}) AND ${id} IS NOT NULL;`,
    `DELETE FROM entries_fts WHERE rowid = ${id};`,
    `INSERT INTO entries_fts (rowid, title, username, tag_names)
SELECT e.id, e.title, e.username, coalesce((SELECT group_concat(t.name_zh || ' ' || t.name_en, ' ') FROM entry_tags et JOIN tags t ON t.id = et.tag_id WHERE et.entry_id = e.id), '')
FROM entries e WHERE e.username = ${u};`,
  ].join("\n");
}
