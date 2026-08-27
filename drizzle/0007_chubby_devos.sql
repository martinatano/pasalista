ALTER TABLE `businesses` ADD `plan` text DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `subscription_status` text DEFAULT 'trial' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `mp_preapproval_id` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `trial_ends_at` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `current_period_end` text;