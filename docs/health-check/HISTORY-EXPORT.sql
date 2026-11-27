-- Read-only. No old failure flag is accepted as proof of a current ban.
SELECT status, liveness, count(*) AS n
FROM entries GROUP BY status, liveness ORDER BY status, liveness;

-- 301 is a truncation sentinel; the collector accepts at most 300 rows.
-- No admin-hidden or removed entries may enter restoration review.
SELECT id, username, kind, title, status, liveness, fail_count,
       first_fail_at, last_fail_at, updated_at, listed_at
FROM entries
WHERE status = 'hidden_by_system'
   OR (status = 'approved' AND (liveness <> 'active' OR fail_count > 0))
ORDER BY id LIMIT 301;

SELECT name FROM d1_migrations WHERE name = '0027_entry_health.sql';
SELECT name FROM sqlite_master
WHERE type = 'table' AND name IN ('entry_health', 'entry_health_evidence');
