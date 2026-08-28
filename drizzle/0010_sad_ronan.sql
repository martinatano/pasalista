DROP INDEX `idx_businesses_owner_user`;--> statement-breakpoint
CREATE INDEX `idx_businesses_owner_user` ON `businesses` (`owner_user_id`);