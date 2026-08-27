ALTER TABLE `businesses` ADD `logo_key` text;--> statement-breakpoint
ALTER TABLE `businesses` ADD `brand_color` text DEFAULT '#fa7c4a' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `minimum_order` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `delivery_zones` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `businesses` ADD `delivery_days` text DEFAULT '' NOT NULL;