CREATE TABLE `bingo_events` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`state` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`owner_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bingo_events_status_updated` ON `bingo_events` (`status`,`updated_at`);