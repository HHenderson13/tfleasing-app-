CREATE TABLE `funder_commission` (
	`funder_id` text NOT NULL,
	`contract` text NOT NULL,
	`maintenance` text NOT NULL,
	`commission_gbp` real NOT NULL,
	PRIMARY KEY(`funder_id`, `contract`, `maintenance`)
);
--> statement-breakpoint
CREATE TABLE `funders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `model_discounts` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`trim_note` text,
	`terms_pct` real DEFAULT 0 NOT NULL,
	`dealer_pct` real DEFAULT 0 NOT NULL,
	`grant_text` text,
	`customer_saving_gbp` real,
	`notes` text,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ratebook` (
	`funder_id` text NOT NULL,
	`cap_code` text NOT NULL,
	`initial_rental_multiplier` integer NOT NULL,
	`term_months` integer NOT NULL,
	`annual_mileage` integer NOT NULL,
	`is_business` integer NOT NULL,
	`is_maintained` integer NOT NULL,
	`monthly_rental` real NOT NULL,
	`monthly_maintenance` real DEFAULT 0 NOT NULL,
	PRIMARY KEY(`funder_id`, `cap_code`, `initial_rental_multiplier`, `term_months`, `annual_mileage`, `is_business`, `is_maintained`)
);
--> statement-breakpoint
CREATE INDEX `idx_ratebook_lookup` ON `ratebook` (`cap_code`,`term_months`,`annual_mileage`,`is_business`,`is_maintained`);--> statement-breakpoint
CREATE TABLE `ratebook_uploads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`funder_id` text NOT NULL,
	`is_maintained` integer NOT NULL,
	`filename` text NOT NULL,
	`row_count` integer NOT NULL,
	`uploaded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`cap_code` text PRIMARY KEY NOT NULL,
	`model` text NOT NULL,
	`derivative` text NOT NULL,
	`is_van` integer DEFAULT false NOT NULL,
	`list_price_net` real,
	`discount_key` text
);
--> statement-breakpoint
CREATE INDEX `idx_vehicles_model` ON `vehicles` (`model`);