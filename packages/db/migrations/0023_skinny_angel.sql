CREATE TABLE `ai_summary_reviews` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`zh` text NOT NULL,
	`hant` text NOT NULL,
	`en` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer NOT NULL,
	`actor` text NOT NULL,
	`updated_at` integer NOT NULL,
	`sampled_at` integer,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `ai_summary_revisions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_summary_review_status" CHECK("ai_summary_reviews"."status" IN ('draft','approved','withdrawn'))
);
