CREATE TABLE `sign_in_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE cascade
);
