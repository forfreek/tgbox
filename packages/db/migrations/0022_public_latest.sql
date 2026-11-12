CREATE INDEX `entries_public_latest` ON `entries` ("listed_at" DESC,`username`) WHERE status = 'approved';--> statement-breakpoint
CREATE INDEX `entries_public_kind_latest` ON `entries` (`kind`,"listed_at" DESC,`username`) WHERE status = 'approved';--> statement-breakpoint
CREATE INDEX `entries_public_category_latest` ON `entries` (`category_id`,"listed_at" DESC,`username`) WHERE status = 'approved';
