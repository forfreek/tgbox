CREATE TABLE `public_rankings` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`username_key` text DEFAULT '' NOT NULL,
	`members` integer,
	`week_growth` real,
	`week_pct` real,
	`week_pct_order` real DEFAULT 0 NOT NULL,
	`month_growth` real,
	`month_pct` real,
	`month_pct_order` real DEFAULT 0 NOT NULL,
	`member_order` integer DEFAULT -1 NOT NULL,
	`listed_at` integer DEFAULT 0 NOT NULL,
	`activity_tier` integer,
	`dirty` integer DEFAULT 1 NOT NULL,
	`evaluated_at` integer DEFAULT 0 NOT NULL,
	`valid_until` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `public_rank_week` ON `public_rankings` (week_growth DESC,week_pct_order DESC,`username_key`) WHERE "public_rankings"."dirty"=0 AND "public_rankings"."week_growth">0;--> statement-breakpoint
CREATE INDEX `public_rank_month` ON `public_rankings` (month_growth DESC,month_pct_order DESC,`username_key`) WHERE "public_rankings"."dirty"=0 AND "public_rankings"."month_growth">0;--> statement-breakpoint
CREATE INDEX `public_rank_newest` ON `public_rankings` (listed_at DESC,`username_key`) WHERE "public_rankings"."dirty"=0;--> statement-breakpoint
CREATE INDEX `public_rank_active` ON `public_rankings` (activity_tier DESC,member_order DESC,`username_key`) WHERE "public_rankings"."dirty"=0 AND "public_rankings"."activity_tier">0;--> statement-breakpoint
CREATE INDEX `public_rank_dirty` ON `public_rankings` (`entry_id`) WHERE "public_rankings"."dirty"=1;--> statement-breakpoint
CREATE INDEX `public_rank_due` ON `public_rankings` (`valid_until`,`entry_id`) WHERE "public_rankings"."dirty"=0;

--> statement-breakpoint
INSERT INTO site_state(key,value) VALUES('public_rank_count','0') ON CONFLICT(key) DO NOTHING;
--> statement-breakpoint
INSERT INTO site_state(key,value) VALUES('public_rank_revision','0') ON CONFLICT(key) DO NOTHING;
--> statement-breakpoint
CREATE TRIGGER public_rank_entry_insert AFTER INSERT ON entries
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=NEW.id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=NEW.id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_entry_update AFTER UPDATE OF username,listed_at,status,category_id ON entries
WHEN OLD.username IS NOT NEW.username OR OLD.listed_at IS NOT NEW.listed_at OR OLD.status IS NOT NEW.status OR OLD.category_id IS NOT NEW.category_id
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=NEW.id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=NEW.id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_entry_delete AFTER DELETE ON entries
BEGIN
DELETE FROM public_rankings WHERE entry_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_stats_insert AFTER INSERT ON entry_stats
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=NEW.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=NEW.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.entry_id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_stats_update AFTER UPDATE OF members,activity_tier ON entry_stats
WHEN OLD.members IS NOT NEW.members OR OLD.activity_tier IS NOT NEW.activity_tier
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=NEW.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=NEW.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.entry_id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_stats_delete AFTER DELETE ON entry_stats
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=OLD.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=OLD.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=OLD.entry_id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_mirror_insert AFTER INSERT ON history_mirrors
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=NEW.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=NEW.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.entry_id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_mirror_update AFTER UPDATE OF phase,generation ON history_mirrors
WHEN OLD.phase IS NOT NEW.phase OR OLD.generation IS NOT NEW.generation
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=NEW.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=NEW.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.entry_id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_mirror_delete AFTER DELETE ON history_mirrors
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=OLD.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=OLD.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=OLD.entry_id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_write_insert AFTER INSERT ON history_writes
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=NEW.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=NEW.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.entry_id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_write_delete AFTER DELETE ON history_writes
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=OLD.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=OLD.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=OLD.entry_id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_count_insert AFTER INSERT ON public_rankings
BEGIN
UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key IN('public_rank_count','public_rank_revision');
INSERT INTO site_state(key,value) SELECT 'public_rank_evaluated_max',CAST(NEW.evaluated_at AS TEXT) WHERE NEW.dirty=0
ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(value AS INTEGER),NEW.evaluated_at) AS TEXT);
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_count_delete AFTER DELETE ON public_rankings
BEGIN
UPDATE site_state SET value=CAST(CAST(value AS INTEGER)-1 AS TEXT) WHERE key='public_rank_count';
UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='public_rank_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_publish AFTER UPDATE ON public_rankings WHEN NEW.dirty=0
BEGIN
UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='public_rank_revision';
INSERT INTO site_state(key,value) VALUES('public_rank_evaluated_max',CAST(NEW.evaluated_at AS TEXT))
ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(value AS INTEGER),NEW.evaluated_at) AS TEXT);
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_invalidate AFTER UPDATE ON public_rankings WHEN NEW.dirty=1 AND OLD.dirty=0
BEGIN
UPDATE site_state SET value=CAST(CAST(value AS INTEGER)+1 AS TEXT) WHERE key='public_rank_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_category_delete AFTER DELETE ON categories
BEGIN
UPDATE public_rankings SET dirty=1 WHERE dirty=0 AND entry_id IN(SELECT id FROM entries WHERE status='approved' AND category_id=OLD.id);
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_category_move AFTER UPDATE OF id ON categories WHEN OLD.id IS NOT NEW.id
BEGIN
UPDATE public_rankings SET dirty=1 WHERE dirty=0 AND entry_id IN(SELECT id FROM entries WHERE status='approved' AND category_id IN(OLD.id,NEW.id));
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_stats_move AFTER UPDATE OF entry_id ON entry_stats WHEN OLD.entry_id IS NOT NEW.entry_id
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=OLD.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=OLD.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=OLD.entry_id AND status='approved');
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=NEW.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=NEW.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.entry_id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_entry_move AFTER UPDATE OF id ON entries WHEN OLD.id IS NOT NEW.id
BEGIN
DELETE FROM public_rankings WHERE entry_id=OLD.id;
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=NEW.id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=NEW.id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.id AND status='approved');
END;
--> statement-breakpoint
CREATE TRIGGER public_rank_mirror_identity AFTER UPDATE OF entry_id,username,listed_at ON history_mirrors
WHEN OLD.entry_id IS NOT NEW.entry_id OR OLD.username IS NOT NEW.username OR OLD.listed_at IS NOT NEW.listed_at
BEGIN
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=OLD.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=OLD.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=OLD.entry_id AND status='approved');
INSERT INTO public_rankings(entry_id) SELECT e.id FROM entries e WHERE e.id=NEW.entry_id AND e.status='approved'
AND ((SELECT value FROM site_state WHERE key='public_rankings_enabled')='1' OR EXISTS(SELECT 1 FROM public_rankings r WHERE r.entry_id=e.id))
ON CONFLICT(entry_id) DO UPDATE SET dirty=1 WHERE public_rankings.dirty<>1;
DELETE FROM public_rankings WHERE entry_id=NEW.entry_id AND NOT EXISTS(SELECT 1 FROM entries WHERE id=NEW.entry_id AND status='approved');
END;

