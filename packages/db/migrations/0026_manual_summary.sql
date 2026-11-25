CREATE TABLE `__new_ai_summary_reviews` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`revision_id` text,
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
	CONSTRAINT "ai_summary_review_status" CHECK("__new_ai_summary_reviews"."status" IN ('draft','approved','withdrawn'))
);
--> statement-breakpoint
INSERT INTO `__new_ai_summary_reviews`("entry_id", "revision_id", "zh", "hant", "en", "status", "version", "actor", "updated_at", "sampled_at") SELECT "entry_id", "revision_id", "zh", "hant", "en", "status", "version", "actor", "updated_at", "sampled_at" FROM `ai_summary_reviews`;--> statement-breakpoint
DROP TABLE `ai_summary_reviews`;--> statement-breakpoint
ALTER TABLE `__new_ai_summary_reviews` RENAME TO `ai_summary_reviews`;
