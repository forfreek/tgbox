-- Suspend derived writes while expanding positional INSERT/SELECT triggers.
INSERT OR IGNORE INTO site_state(key,value)
SELECT 'public_page_migration_resume',value FROM site_state WHERE key='public_projection_enabled';
--> statement-breakpoint
UPDATE site_state SET value='0' WHERE key='public_projection_enabled';
--> statement-breakpoint
UPDATE site_state SET value='0' WHERE key IN ('public_projection_ready','public_backfill_cursor')
AND (SELECT value FROM site_state WHERE key='public_page_migration_resume')='1';
--> statement-breakpoint
DROP TRIGGER public_listing_entries_insert;
--> statement-breakpoint
DROP TRIGGER public_listing_entries_update;
--> statement-breakpoint
DROP TRIGGER public_listing_entry_tags_insert;
--> statement-breakpoint
DROP TRIGGER public_listing_entry_tags_update;
--> statement-breakpoint
CREATE TABLE `public_page_anchors` (
	`scope` text NOT NULL,
	`sort` text NOT NULL,
	`order_revision` integer NOT NULL,
	`page` integer NOT NULL,
	`promotion_order` integer NOT NULL,
	`order_value` integer NOT NULL,
	`username_key` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`scope`, `sort`, `order_revision`, `page`)
);
--> statement-breakpoint
CREATE INDEX `public_page_anchors_created` ON `public_page_anchors` (`created_at`);--> statement-breakpoint
CREATE TABLE `public_promotion_state` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`is_public` integer NOT NULL,
	`tier` integer DEFAULT 0 NOT NULL,
	`valid_from` integer DEFAULT 0 NOT NULL,
	`valid_until` integer DEFAULT 0 NOT NULL,
	`input_revision` integer DEFAULT 0 NOT NULL,
	`evaluation_key` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `public_promotions_due` ON `public_promotion_state` (`valid_until`,`entry_id`) WHERE is_public = 1;--> statement-breakpoint
CREATE INDEX `public_promotions_future` ON `public_promotion_state` (`valid_from`,`entry_id`) WHERE is_public = 1;--> statement-breakpoint
ALTER TABLE `public_counts` ADD `order_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_listing` ADD `promotion_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `public_listing` ADD `username_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `public_listing_page_members` ON `public_listing` (`scope`,`promotion_order`,`member_order`,`username_key`);--> statement-breakpoint
CREATE INDEX `public_listing_page_latest` ON `public_listing` (`scope`,`promotion_order`,`latest_order`,`username_key`);--> statement-breakpoint
CREATE INDEX `promotions_entry_start` ON `promotions` (`entry_username`,`starts_at`,`id`);--> statement-breakpoint
CREATE INDEX `promotions_entry_end` ON `promotions` (`entry_username`,`ends_at`,`starts_at`,`kind`);
--> statement-breakpoint
DROP VIEW public_listing_source;
--> statement-breakpoint
CREATE VIEW public_listing_source AS
SELECT 'all' AS scope, e.id AS entry_id, e.username,
-coalesce(s.members,-1) AS member_order, -e.listed_at AS latest_order,
CASE WHEN e.is_promoted=1 OR ps.tier=3 THEN -2 ELSE 0 END AS promotion_order,
replace(e.username,'_','!') AS username_key
FROM entries e LEFT JOIN entry_stats s ON s.entry_id=e.id
LEFT JOIN public_promotion_state ps ON ps.entry_id=e.id
WHERE e.status='approved'
UNION ALL
SELECT 'kind:' || e.kind AS scope, e.id AS entry_id, e.username,
-coalesce(s.members,-1) AS member_order, -e.listed_at AS latest_order,
CASE WHEN e.is_promoted=1 OR ps.tier=3 THEN -2 ELSE 0 END AS promotion_order,
replace(e.username,'_','!') AS username_key
FROM entries e LEFT JOIN entry_stats s ON s.entry_id=e.id
LEFT JOIN public_promotion_state ps ON ps.entry_id=e.id
WHERE e.status='approved'
UNION ALL
SELECT 'category:' || e.category_id AS scope, e.id AS entry_id, e.username,
-coalesce(s.members,-1) AS member_order, -e.listed_at AS latest_order,
CASE WHEN e.is_promoted=1 OR ps.tier=3 THEN -2 WHEN ps.tier=2 THEN -1 ELSE 0 END AS promotion_order,
replace(e.username,'_','!') AS username_key
FROM entries e LEFT JOIN entry_stats s ON s.entry_id=e.id
LEFT JOIN public_promotion_state ps ON ps.entry_id=e.id
WHERE e.status='approved'
UNION ALL
SELECT 'tag:' || et.tag_id AS scope, e.id AS entry_id, e.username,
-coalesce(s.members,-1) AS member_order, -e.listed_at AS latest_order,
0 AS promotion_order,
replace(e.username,'_','!') AS username_key
FROM entries e LEFT JOIN entry_stats s ON s.entry_id=e.id
LEFT JOIN public_promotion_state ps ON ps.entry_id=e.id JOIN entry_tags et ON et.entry_id=e.id JOIN tags t ON t.id=et.tag_id
WHERE e.status='approved';
--> statement-breakpoint
DROP TRIGGER public_counts_insert;
--> statement-breakpoint
DROP TRIGGER public_counts_delete;
--> statement-breakpoint
CREATE TRIGGER public_counts_insert AFTER INSERT ON public_listing
BEGIN
INSERT INTO public_counts(scope,count,order_revision) VALUES(NEW.scope,1,1)
ON CONFLICT(scope) DO UPDATE SET count=count+1, order_revision=order_revision+1;
END;
--> statement-breakpoint
CREATE TRIGGER public_counts_delete AFTER DELETE ON public_listing
BEGIN
UPDATE public_counts SET count=count-1, order_revision=order_revision+1 WHERE scope=OLD.scope;
END;
--> statement-breakpoint
CREATE TRIGGER public_counts_order_update AFTER UPDATE OF member_order,latest_order,username,promotion_order ON public_listing
WHEN OLD.member_order IS NOT NEW.member_order OR OLD.latest_order IS NOT NEW.latest_order OR
OLD.username IS NOT NEW.username OR OLD.promotion_order IS NOT NEW.promotion_order
BEGIN
UPDATE public_counts SET order_revision=order_revision+1 WHERE scope=NEW.scope;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS public_listing_entries_insert;
--> statement-breakpoint
CREATE TRIGGER public_listing_entries_insert AFTER INSERT ON entries WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
INSERT INTO public_promotion_state (entry_id, is_public, valid_until)
SELECT e.id, e.status = 'approved',
  CASE WHEN EXISTS (SELECT 1 FROM promotions p WHERE p.entry_username = e.username) THEN 0 ELSE 9007199254740991 END
FROM entries e WHERE e.id=NEW.id ON CONFLICT(entry_id) DO NOTHING;
INSERT INTO public_listing SELECT * FROM public_listing_source WHERE entry_id=NEW.id;
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS public_listing_entries_update;
--> statement-breakpoint
CREATE TRIGGER public_listing_entries_update AFTER UPDATE OF username,kind,category_id,listed_at,status,is_promoted ON entries
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
INSERT INTO public_promotion_state (entry_id, is_public, valid_until)
SELECT e.id, e.status = 'approved',
  CASE WHEN EXISTS (SELECT 1 FROM promotions p WHERE p.entry_username = e.username) THEN 0 ELSE 9007199254740991 END
FROM entries e WHERE e.id=NEW.id ON CONFLICT(entry_id) DO NOTHING;
UPDATE public_promotion_state SET is_public=NEW.status='approved',
input_revision=input_revision+1,
valid_until=iif(OLD.username IS NOT NEW.username,0,valid_until)
WHERE entry_id=NEW.id;
DELETE FROM public_listing WHERE entry_id=OLD.id;
INSERT INTO public_listing SELECT * FROM public_listing_source WHERE entry_id=NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER public_promotion_entry_delete AFTER DELETE ON entries
BEGIN
DELETE FROM public_promotion_state WHERE entry_id=OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER public_listing_entry_tags_insert AFTER INSERT ON entry_tags
WHEN (SELECT value FROM site_state WHERE key='public_projection_enabled')='1'
BEGIN
INSERT INTO public_listing SELECT * FROM public_listing_source WHERE entry_id=NEW.entry_id AND scope='tag:' || NEW.tag_id;
END;
--> statement-breakpoint
CREATE TRIGGER public_listing_entry_tags_update AFTER UPDATE OF entry_id,tag_id ON entry_tags
WHEN (SELECT value FROM site_state WHERE key='public_projection_enabled')='1'
BEGIN
DELETE FROM public_listing WHERE entry_id=OLD.entry_id AND scope='tag:' || OLD.tag_id;
INSERT INTO public_listing SELECT * FROM public_listing_source WHERE entry_id=NEW.entry_id AND scope='tag:' || NEW.tag_id;
END;
--> statement-breakpoint
DROP TRIGGER public_listing_entry_stats_insert;
--> statement-breakpoint
CREATE TRIGGER public_listing_entry_stats_insert AFTER INSERT ON entry_stats WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE public_listing SET member_order=-coalesce(NEW.members,-1)
WHERE entry_id=NEW.entry_id AND member_order IS NOT -coalesce(NEW.members,-1);
END;
--> statement-breakpoint
DROP TRIGGER public_listing_entry_stats_update;
--> statement-breakpoint
CREATE TRIGGER public_listing_entry_stats_update AFTER UPDATE OF members,entry_id ON entry_stats
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1' AND (OLD.members IS NOT NEW.members OR OLD.entry_id IS NOT NEW.entry_id)
BEGIN
UPDATE public_listing SET member_order=-coalesce((SELECT members FROM entry_stats WHERE entry_id=public_listing.entry_id),-1)
WHERE entry_id IN (OLD.entry_id,NEW.entry_id);
END;
--> statement-breakpoint
CREATE TRIGGER public_promotion_dirty_insert AFTER INSERT ON promotions
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE public_promotion_state SET valid_until=0, input_revision=input_revision+1
WHERE entry_id IN (SELECT id FROM entries WHERE username IN (NEW.entry_username));
END;
--> statement-breakpoint
CREATE TRIGGER public_promotion_dirty_update AFTER UPDATE ON promotions
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE public_promotion_state SET valid_until=0, input_revision=input_revision+1
WHERE entry_id IN (SELECT id FROM entries WHERE username IN (OLD.entry_username,NEW.entry_username));
END;
--> statement-breakpoint
CREATE TRIGGER public_promotion_dirty_delete AFTER DELETE ON promotions
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE public_promotion_state SET valid_until=0, input_revision=input_revision+1
WHERE entry_id IN (SELECT id FROM entries WHERE username IN (OLD.entry_username));
END;
--> statement-breakpoint
UPDATE site_state SET value=(SELECT value FROM site_state WHERE key='public_page_migration_resume')
WHERE key='public_projection_enabled' AND EXISTS(SELECT 1 FROM site_state WHERE key='public_page_migration_resume');
--> statement-breakpoint
DELETE FROM site_state WHERE key='public_page_migration_resume';
