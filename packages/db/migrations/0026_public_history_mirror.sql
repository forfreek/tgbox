CREATE TABLE `history_baselines` (
	`entry_id` integer NOT NULL,
	`sampled_at` integer NOT NULL,
	`members` integer NOT NULL,
	`ordinal` integer NOT NULL,
	PRIMARY KEY(`entry_id`, `sampled_at`)
);
--> statement-breakpoint
CREATE TABLE `history_mirrors` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`listed_at` integer NOT NULL,
	`object_version` text NOT NULL,
	`object_etag` text NOT NULL,
	`generation` text NOT NULL,
	`phase` text NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`raw_points` integer NOT NULL,
	`point_count` integer NOT NULL,
	`invalid_times` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`commit_token` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER history_mirror_entry_delete AFTER DELETE ON entries
BEGIN
DELETE FROM history_baselines WHERE entry_id=OLD.id;
DELETE FROM history_mirrors WHERE entry_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER history_mirror_entry_identity AFTER UPDATE OF username,listed_at ON entries
WHEN OLD.username IS NOT NEW.username OR OLD.listed_at IS NOT NEW.listed_at
BEGIN
DELETE FROM history_baselines WHERE entry_id=OLD.id;
DELETE FROM history_mirrors WHERE entry_id=OLD.id;
UPDATE site_state SET value=CAST(NEW.id-1 AS TEXT)
WHERE key='public_history_backfill_cursor' AND CAST(value AS INTEGER)>=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER history_mirror_entry_insert AFTER INSERT ON entries
BEGIN
UPDATE site_state SET value=CAST(NEW.id-1 AS TEXT)
WHERE key='public_history_backfill_cursor' AND CAST(value AS INTEGER)>=NEW.id;
END;
