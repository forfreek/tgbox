CREATE TABLE `public_counts` (
	`scope` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `promotions_public_end` ON `promotions` (`ends_at`,`id`);
--> statement-breakpoint
CREATE TRIGGER public_counts_insert AFTER INSERT ON public_listing
BEGIN
INSERT INTO public_counts (scope, count) VALUES (NEW.scope, 1)
ON CONFLICT(scope) DO UPDATE SET count = count + 1;
END;
--> statement-breakpoint
CREATE TRIGGER public_counts_delete AFTER DELETE ON public_listing
BEGIN
UPDATE public_counts SET count = count - 1 WHERE scope = OLD.scope;
END;
