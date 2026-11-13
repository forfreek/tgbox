CREATE TABLE `history_writes` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`listed_at` integer NOT NULL,
	`token` text NOT NULL,
	`base_etag` text,
	`sampled_at` integer NOT NULL,
	`members` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER history_write_begin AFTER INSERT ON history_writes
BEGIN
UPDATE history_mirrors SET phase='stale',commit_token=NEW.token WHERE entry_id=NEW.entry_id;
UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER history_write_finish AFTER DELETE ON history_writes
BEGIN
UPDATE history_mirrors SET phase='stale',commit_token=OLD.token WHERE entry_id=OLD.entry_id;
UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='public_content_revision';
INSERT INTO site_state(key,value) VALUES('dirty_since',CAST(CAST(unixepoch('subsec')*1000 AS INTEGER) AS TEXT)) ON CONFLICT(key) DO NOTHING;
END;
--> statement-breakpoint
CREATE TRIGGER history_write_entry_delete AFTER DELETE ON entries
BEGIN
DELETE FROM history_writes WHERE entry_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER history_write_entry_identity AFTER UPDATE OF username,listed_at ON entries
WHEN OLD.username IS NOT NEW.username OR OLD.listed_at IS NOT NEW.listed_at
BEGIN
DELETE FROM history_writes WHERE entry_id=OLD.id;
END;
