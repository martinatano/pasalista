CREATE TABLE `cancellation_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`type` text DEFAULT 'cancellation' NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`confirmation_code` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cancellation_confirmation` ON `cancellation_requests` (`confirmation_code`);--> statement-breakpoint
CREATE INDEX `idx_cancellation_email_created` ON `cancellation_requests` (`email`,`created_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL
);
