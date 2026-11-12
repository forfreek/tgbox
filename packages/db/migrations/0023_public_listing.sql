CREATE TABLE `public_listing` (
	`scope` text NOT NULL,
	`entry_id` integer NOT NULL,
	`username` text NOT NULL,
	`member_order` integer NOT NULL,
	`latest_order` integer NOT NULL,
	PRIMARY KEY(`scope`, `entry_id`)
);
--> statement-breakpoint
CREATE INDEX `public_listing_entry` ON `public_listing` (`entry_id`);--> statement-breakpoint
CREATE INDEX `public_listing_members` ON `public_listing` (`scope`,`member_order`,`username`);--> statement-breakpoint
CREATE INDEX `public_listing_latest` ON `public_listing` (`scope`,`latest_order`,`username`);
--> statement-breakpoint
-- Projection and invalidation are opt-in until the batched backfill is complete.
CREATE VIEW public_listing_source AS
SELECT 'all' AS scope, e.id AS entry_id, e.username, -coalesce(s.members, -1) AS member_order, -e.listed_at AS latest_order FROM entries e LEFT JOIN entry_stats s ON s.entry_id = e.id WHERE e.status = 'approved'
UNION ALL
SELECT 'kind:' || e.kind AS scope, e.id AS entry_id, e.username, -coalesce(s.members, -1) AS member_order, -e.listed_at AS latest_order FROM entries e LEFT JOIN entry_stats s ON s.entry_id = e.id WHERE e.status = 'approved'
UNION ALL
SELECT 'category:' || e.category_id AS scope, e.id AS entry_id, e.username, -coalesce(s.members, -1) AS member_order, -e.listed_at AS latest_order FROM entries e LEFT JOIN entry_stats s ON s.entry_id = e.id WHERE e.status = 'approved'
UNION ALL
SELECT 'tag:' || et.tag_id AS scope, e.id AS entry_id, e.username, -coalesce(s.members, -1) AS member_order, -e.listed_at AS latest_order FROM entries e LEFT JOIN entry_stats s ON s.entry_id = e.id JOIN entry_tags et ON et.entry_id = e.id JOIN tags t ON t.id = et.tag_id WHERE e.status = 'approved';
--> statement-breakpoint
CREATE TRIGGER public_listing_entries_insert AFTER INSERT ON entries
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN

DELETE FROM public_listing WHERE entry_id = NEW.id;
INSERT INTO public_listing SELECT * FROM public_listing_source WHERE entry_id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER public_listing_entries_update AFTER UPDATE OF username, kind, category_id, listed_at, status ON entries
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
DELETE FROM public_listing WHERE entry_id = OLD.id;
INSERT INTO public_listing SELECT * FROM public_listing_source WHERE entry_id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER public_listing_entries_delete AFTER DELETE ON entries
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
DELETE FROM public_listing WHERE entry_id = OLD.id;

END;
--> statement-breakpoint
CREATE TRIGGER public_listing_entry_stats_insert AFTER INSERT ON entry_stats
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN

UPDATE public_listing SET member_order = -coalesce(NEW.members, -1) WHERE entry_id = NEW.entry_id;
END;
--> statement-breakpoint
CREATE TRIGGER public_listing_entry_stats_update AFTER UPDATE OF members, entry_id ON entry_stats
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE public_listing SET member_order = -coalesce((SELECT members FROM entry_stats WHERE entry_id = public_listing.entry_id), -1) WHERE entry_id IN (OLD.entry_id, NEW.entry_id);
END;
--> statement-breakpoint
CREATE TRIGGER public_listing_entry_stats_delete AFTER DELETE ON entry_stats
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE public_listing SET member_order = 1 WHERE entry_id = OLD.entry_id;
END;
--> statement-breakpoint
CREATE TRIGGER public_listing_entry_tags_insert AFTER INSERT ON entry_tags
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN

INSERT INTO public_listing SELECT * FROM public_listing_source WHERE entry_id = NEW.entry_id AND scope = 'tag:' || NEW.tag_id;
END;
--> statement-breakpoint
CREATE TRIGGER public_listing_entry_tags_update AFTER UPDATE OF entry_id, tag_id ON entry_tags
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
DELETE FROM public_listing WHERE entry_id = OLD.entry_id AND scope = 'tag:' || OLD.tag_id;
INSERT INTO public_listing SELECT * FROM public_listing_source WHERE entry_id = NEW.entry_id AND scope = 'tag:' || NEW.tag_id;
END;
--> statement-breakpoint
CREATE TRIGGER public_listing_entry_tags_delete AFTER DELETE ON entry_tags
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
DELETE FROM public_listing WHERE entry_id = OLD.entry_id AND scope = 'tag:' || OLD.tag_id;
END;
--> statement-breakpoint
CREATE TRIGGER public_listing_tags_delete AFTER DELETE ON tags
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
DELETE FROM public_listing WHERE scope = 'tag:' || OLD.id;
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_entries_insert AFTER INSERT ON entries
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_entries_update AFTER UPDATE ON entries
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_entries_delete AFTER DELETE ON entries
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_entry_stats_insert AFTER INSERT ON entry_stats
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_entry_stats_update AFTER UPDATE ON entry_stats
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_entry_stats_delete AFTER DELETE ON entry_stats
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_entry_tags_insert AFTER INSERT ON entry_tags
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_entry_tags_update AFTER UPDATE ON entry_tags
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_entry_tags_delete AFTER DELETE ON entry_tags
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_categories_insert AFTER INSERT ON categories
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_categories_update AFTER UPDATE ON categories
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_categories_delete AFTER DELETE ON categories
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_tags_insert AFTER INSERT ON tags
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_tags_update AFTER UPDATE ON tags
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_tags_delete AFTER DELETE ON tags
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_promotions_insert AFTER INSERT ON promotions
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_promotions_update AFTER UPDATE ON promotions
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_promotions_delete AFTER DELETE ON promotions
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_products_insert AFTER INSERT ON products
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_products_update AFTER UPDATE ON products
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_products_delete AFTER DELETE ON products
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_hidden_posts_insert AFTER INSERT ON hidden_posts
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_hidden_posts_update AFTER UPDATE ON hidden_posts
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_hidden_posts_delete AFTER DELETE ON hidden_posts
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_settings_insert AFTER INSERT ON settings
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_settings_update AFTER UPDATE ON settings
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
--> statement-breakpoint
CREATE TRIGGER public_revision_settings_delete AFTER DELETE ON settings
WHEN (SELECT value FROM site_state WHERE key = 'public_projection_enabled') = '1'
BEGIN
UPDATE site_state SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT) WHERE key = 'public_content_revision';
END;
