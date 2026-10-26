ALTER TABLE `games` ADD `kind` text DEFAULT 'base' NOT NULL;--> statement-breakpoint
ALTER TABLE `games` ADD `base_id` integer;