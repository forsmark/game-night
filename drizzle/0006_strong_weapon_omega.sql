ALTER TABLE `votes` ADD `top_pick` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `votes_one_top_pick` ON `votes` (`event_id`,`member_id`) WHERE "votes"."top_pick" = 1;