ALTER TABLE `businesses` ADD `owner_user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_businesses_owner_user` ON `businesses` (`owner_user_id`);