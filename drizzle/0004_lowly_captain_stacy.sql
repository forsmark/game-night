CREATE TABLE `catalogue` (
	`bgg_id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`search` text NOT NULL,
	`year` integer,
	`rank` integer,
	`users_rated` integer NOT NULL,
	`kind` text NOT NULL
);
