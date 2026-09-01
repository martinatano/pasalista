CREATE TABLE `promo_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`plan` text NOT NULL,
	`months` integer NOT NULL,
	`expires_at` text,
	`redeemed_at` text,
	`redeemed_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_promo_codes_code` ON `promo_codes` (`code`);