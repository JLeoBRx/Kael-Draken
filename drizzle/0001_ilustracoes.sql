CREATE TABLE `illustrations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chapter_id` integer NOT NULL,
	`slug` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`image_id` integer,
	`art_state` text DEFAULT 'pendente' NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`credit` text DEFAULT '' NOT NULL,
	`direction` text DEFAULT '' NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `illustrations_slug_unique` ON `illustrations` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `illustrations_chapter_idx` ON `illustrations` (`chapter_id`);