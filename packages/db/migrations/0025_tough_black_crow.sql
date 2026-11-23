CREATE TABLE `ai_summary_public` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`zh` text NOT NULL,
	`hant` text NOT NULL,
	`en` text NOT NULL,
	`fingerprint` text NOT NULL,
	`contract_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
