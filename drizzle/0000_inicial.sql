CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`section` text NOT NULL,
	`group` text DEFAULT '' NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`image_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_section_slug_idx` ON `articles` (`section`,`slug`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`volume` integer DEFAULT 1 NOT NULL,
	`title` text NOT NULL,
	`subtitle` text DEFAULT '' NOT NULL,
	`cover_id` integer,
	`synopsis` text DEFAULT '' NOT NULL,
	`synopsis_official` integer DEFAULT false NOT NULL,
	`editorial_info` text DEFAULT '' NOT NULL,
	`materials` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`cover_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_slug_unique` ON `books` (`slug`);--> statement-breakpoint
CREATE TABLE `chapters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`book_id` integer NOT NULL,
	`number` integer NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chapters_book_number_idx` ON `chapters` (`book_id`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `chapters_book_slug_idx` ON `chapters` (`book_id`,`slug`);--> statement-breakpoint
CREATE TABLE `character_relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`character_id` integer NOT NULL,
	`related_id` integer NOT NULL,
	`kind` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'publicado' NOT NULL,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`related_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `character_relations_idx` ON `character_relations` (`character_id`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`titles` text DEFAULT '' NOT NULL,
	`age` text DEFAULT '' NOT NULL,
	`kingdom_id` integer,
	`origin_location_id` integer,
	`role` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`personality` text DEFAULT '' NOT NULL,
	`history` text DEFAULT '' NOT NULL,
	`family` text DEFAULT '' NOT NULL,
	`abilities` text DEFAULT '' NOT NULL,
	`story_role` text DEFAULT '' NOT NULL,
	`secrets` text DEFAULT '' NOT NULL,
	`portrait_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`kingdom_id`) REFERENCES `kingdoms`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`origin_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`portrait_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `characters_slug_unique` ON `characters` (`slug`);--> statement-breakpoint
CREATE INDEX `characters_kingdom_idx` ON `characters` (`kingdom_id`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`doc_type` text DEFAULT '' NOT NULL,
	`image_id` integer,
	`excerpt` text DEFAULT '' NOT NULL,
	`transcription` text DEFAULT '' NOT NULL,
	`translation` text DEFAULT '' NOT NULL,
	`language` text DEFAULT '' NOT NULL,
	`origin` text DEFAULT '' NOT NULL,
	`date_label` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`reliability` text DEFAULT 'desconhecido' NOT NULL,
	`reliability_note` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_slug_unique` ON `documents` (`slug`);--> statement-breakpoint
CREATE TABLE `entity_tags` (
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`term_id` integer NOT NULL,
	PRIMARY KEY(`entity_type`, `entity_id`, `term_id`),
	FOREIGN KEY (`term_id`) REFERENCES `terms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `entity_tags_term_idx` ON `entity_tags` (`term_id`);--> statement-breakpoint
CREATE TABLE `eras` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`date_label` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eras_slug_unique` ON `eras` (`slug`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`era_id` integer,
	`date_label` text DEFAULT '' NOT NULL,
	`sort_order` real DEFAULT 0 NOT NULL,
	`certainty` text DEFAULT 'desconhecido' NOT NULL,
	`event_type` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`era_id`) REFERENCES `eras`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE INDEX `events_era_idx` ON `events` (`era_id`);--> statement-breakpoint
CREATE TABLE `kingdoms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`epithet` text DEFAULT '' NOT NULL,
	`government` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`geography` text DEFAULT '' NOT NULL,
	`capital` text DEFAULT '' NOT NULL,
	`culture` text DEFAULT '' NOT NULL,
	`economy` text DEFAULT '' NOT NULL,
	`resonance` text DEFAULT '' NOT NULL,
	`history` text DEFAULT '' NOT NULL,
	`relations` text DEFAULT '' NOT NULL,
	`mysteries` text DEFAULT '' NOT NULL,
	`emblem_id` integer,
	`image_id` integer,
	`accent` text DEFAULT '#b8975a' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`emblem_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kingdoms_slug_unique` ON `kingdoms` (`slug`);--> statement-breakpoint
CREATE TABLE `links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`a_type` text NOT NULL,
	`a_id` integer NOT NULL,
	`b_type` text NOT NULL,
	`b_id` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `links_pair_idx` ON `links` (`a_type`,`a_id`,`b_type`,`b_id`);--> statement-breakpoint
CREATE INDEX `links_b_idx` ON `links` (`b_type`,`b_id`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`kingdom_id` integer,
	`category` text DEFAULT '' NOT NULL,
	`is_capital` integer DEFAULT false NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`history` text DEFAULT '' NOT NULL,
	`geography` text DEFAULT '' NOT NULL,
	`inhabitants` text DEFAULT '' NOT NULL,
	`image_id` integer,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`kingdom_id`) REFERENCES `kingdoms`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_slug_unique` ON `locations` (`slug`);--> statement-breakpoint
CREATE INDEX `locations_kingdom_idx` ON `locations` (`kingdom_id`);--> statement-breakpoint
CREATE TABLE `map_markers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`map_id` integer NOT NULL,
	`label` text NOT NULL,
	`marker_type` text DEFAULT 'cidade' NOT NULL,
	`x` real NOT NULL,
	`y` real NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`location_id` integer,
	`kingdom_id` integer,
	`provisional` integer DEFAULT true NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	FOREIGN KEY (`map_id`) REFERENCES `maps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`kingdom_id`) REFERENCES `kingdoms`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `map_markers_map_idx` ON `map_markers` (`map_id`);--> statement-breakpoint
CREATE TABLE `maps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_id` integer,
	`is_primary` integer DEFAULT false NOT NULL,
	`provisional` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `maps_slug_unique` ON `maps` (`slug`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`path` text NOT NULL,
	`original_name` text DEFAULT '' NOT NULL,
	`mime` text NOT NULL,
	`width` integer DEFAULT 0 NOT NULL,
	`height` integer DEFAULT 0 NOT NULL,
	`size` integer DEFAULT 0 NOT NULL,
	`alt` text DEFAULT '' NOT NULL,
	`caption` text DEFAULT '' NOT NULL,
	`credit` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `media_path_unique` ON `media` (`path`);--> statement-breakpoint
CREATE TABLE `media_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`media_id` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`media_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_links_entity_idx` ON `media_links` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `mysteries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`related_href` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mysteries_slug_unique` ON `mysteries` (`slug`);--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`image_id` integer,
	`excerpt` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`canon` text DEFAULT 'provisorio' NOT NULL,
	`spoiler` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'rascunho' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`published_at` text,
	FOREIGN KEY (`image_id`) REFERENCES `media`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_slug_unique` ON `posts` (`slug`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `terms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`vocabulary` text NOT NULL,
	`slug` text NOT NULL,
	`label` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `terms_vocab_slug_idx` ON `terms` (`vocabulary`,`slug`);