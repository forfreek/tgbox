CREATE TABLE `ai_summary_attempts` (
	`token` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`day` text NOT NULL,
	`neurons` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "ai_summary_attempt_positive" CHECK("ai_summary_attempts"."neurons" > 0 AND "ai_summary_attempts"."attempt" > 0)
);
--> statement-breakpoint
CREATE INDEX `ai_summary_attempts_day` ON `ai_summary_attempts` (`day`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_summary_attempt_number` ON `ai_summary_attempts` (`job_id`,`attempt`);--> statement-breakpoint
CREATE TABLE `ai_summary_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` integer NOT NULL,
	`generation` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`input` text NOT NULL,
	`source_guard` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` text NOT NULL,
	`params_version` text NOT NULL,
	`edit_version` integer NOT NULL,
	`status` text NOT NULL,
	`reason` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`dispatched_at` integer,
	`lease_token` text,
	`lease_until` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "ai_summary_job_status" CHECK("ai_summary_jobs"."status" IN ('pending','queued','running','retry_wait','succeeded','skipped','blocked','superseded','failed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_summary_job_variant` ON `ai_summary_jobs` (`entry_id`,`generation`,`model`,`prompt_version`,`params_version`);--> statement-breakpoint
CREATE INDEX `ai_summary_jobs_due` ON `ai_summary_jobs` (`status`,`due_at`,`priority`);--> statement-breakpoint
CREATE INDEX `ai_summary_jobs_entry` ON `ai_summary_jobs` (`entry_id`,`generation`);--> statement-breakpoint
CREATE TABLE `ai_summary_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`entry_id` integer NOT NULL,
	`generation` integer NOT NULL,
	`edit_version` integer NOT NULL,
	`input` text NOT NULL,
	`output` text NOT NULL,
	`review_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `ai_summary_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_summary_revisions_job_id_unique` ON `ai_summary_revisions` (`job_id`);--> statement-breakpoint
CREATE INDEX `ai_summary_revisions_entry` ON `ai_summary_revisions` (`entry_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_summary_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`upper_bound` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	CONSTRAINT "ai_summary_run_status" CHECK("ai_summary_runs"."status" IN ('active','paused','completed'))
);
--> statement-breakpoint
CREATE TABLE `ai_summary_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`model` text DEFAULT 'disabled' NOT NULL,
	`prompt_version` text DEFAULT 'v1' NOT NULL,
	`params_version` text DEFAULT 'v1' NOT NULL,
	`daily_calls` integer DEFAULT 100 NOT NULL,
	`daily_neurons` integer DEFAULT 10000 NOT NULL,
	`reservation` integer DEFAULT 100 NOT NULL,
	`max_attempts` integer DEFAULT 3 NOT NULL,
	CONSTRAINT "ai_summary_settings_valid" CHECK("ai_summary_settings"."id" = 1 AND "ai_summary_settings"."daily_calls" >= 0 AND "ai_summary_settings"."daily_neurons" >= 0 AND "ai_summary_settings"."reservation" > 0 AND "ai_summary_settings"."max_attempts" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE TABLE `ai_summary_sources` (
	`entry_id` integer PRIMARY KEY NOT NULL,
	`generation` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`input` text NOT NULL,
	`decision` text NOT NULL,
	`source_guard` text NOT NULL,
	`observation_token` text NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`edit_version` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
-- Local-first task infrastructure. Generation remains disabled until explicitly enabled.
--> statement-breakpoint
INSERT INTO ai_summary_settings(id) VALUES(1);
