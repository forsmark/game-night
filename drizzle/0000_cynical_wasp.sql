CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`starts_at` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`split_at` integer DEFAULT 7 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `games` (
	`bgg_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`year` integer,
	`min_players` integer NOT NULL,
	`max_players` integer NOT NULL,
	`best_with` text DEFAULT '[]' NOT NULL,
	`min_time` integer,
	`max_time` integer,
	`weight` real,
	`thumbnail` text,
	`fetched_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`color` text NOT NULL,
	`link_token` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_link_token_unique` ON `members` (`link_token`);--> statement-breakpoint
CREATE TABLE `nominations` (
	`event_id` text NOT NULL,
	`bgg_id` integer NOT NULL,
	`nominated_by` text NOT NULL,
	`brought_by` text,
	`created_at` text NOT NULL,
	PRIMARY KEY(`event_id`, `bgg_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`bgg_id`) REFERENCES `games`(`bgg_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`nominated_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`brought_by`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `rsvps` (
	`event_id` text NOT NULL,
	`member_id` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`event_id`, `member_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `shelf` (
	`bgg_id` integer PRIMARY KEY NOT NULL,
	`added_at` text NOT NULL,
	FOREIGN KEY (`bgg_id`) REFERENCES `games`(`bgg_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`event_id` text NOT NULL,
	`bgg_id` integer NOT NULL,
	`member_id` text NOT NULL,
	PRIMARY KEY(`event_id`, `bgg_id`, `member_id`),
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
