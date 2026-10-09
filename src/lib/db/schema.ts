import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { CANON_STATES, CERTAINTY_STATES, PUBLICATION_STATES, RELIABILITY_STATES } from '../editorial'

/**
 * Colunas editoriais comuns a todo conteúdo do arquivo.
 * - canon: estado narrativo (canônico, provisório…)
 * - spoiler: 0 sem spoilers · 1 revelações iniciais · 2 revelações avançadas
 * - status: estado de publicação (rascunho, publicado, arquivado)
 * - notes: anotações privadas — nunca são renderizadas no site público
 */
const editorial = () => ({
  canon: text('canon', { enum: CANON_STATES }).notNull().default('provisorio'),
  spoiler: integer('spoiler').notNull().default(0),
  status: text('status', { enum: PUBLICATION_STATES }).notNull().default('rascunho'),
  notes: text('notes').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  publishedAt: text('published_at'),
})

export const media = sqliteTable('media', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull().unique(),
  originalName: text('original_name').notNull().default(''),
  mime: text('mime').notNull(),
  width: integer('width').notNull().default(0),
  height: integer('height').notNull().default(0),
  size: integer('size').notNull().default(0),
  alt: text('alt').notNull().default(''),
  caption: text('caption').notNull().default(''),
  credit: text('credit').notNull().default(''),
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
})

export const kingdoms = sqliteTable('kingdoms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  epithet: text('epithet').notNull().default(''),
  government: text('government').notNull().default(''),
  summary: text('summary').notNull().default(''),
  body: text('body').notNull().default(''),
  geography: text('geography').notNull().default(''),
  capital: text('capital').notNull().default(''),
  culture: text('culture').notNull().default(''),
  economy: text('economy').notNull().default(''),
  resonance: text('resonance').notNull().default(''),
  history: text('history').notNull().default(''),
  relations: text('relations').notNull().default(''),
  mysteries: text('mysteries').notNull().default(''),
  emblemId: integer('emblem_id').references(() => media.id, { onDelete: 'set null' }),
  imageId: integer('image_id').references(() => media.id, { onDelete: 'set null' }),
  accent: text('accent').notNull().default('#b8975a'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editorial(),
})

export const locations = sqliteTable(
  'locations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    kingdomId: integer('kingdom_id').references(() => kingdoms.id, { onDelete: 'set null' }),
    category: text('category').notNull().default(''),
    isCapital: integer('is_capital', { mode: 'boolean' }).notNull().default(false),
    summary: text('summary').notNull().default(''),
    body: text('body').notNull().default(''),
    history: text('history').notNull().default(''),
    geography: text('geography').notNull().default(''),
    inhabitants: text('inhabitants').notNull().default(''),
    imageId: integer('image_id').references(() => media.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...editorial(),
  },
  (t) => [index('locations_kingdom_idx').on(t.kingdomId)],
)

export const characters = sqliteTable(
  'characters',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    titles: text('titles').notNull().default(''),
    age: text('age').notNull().default(''),
    kingdomId: integer('kingdom_id').references(() => kingdoms.id, { onDelete: 'set null' }),
    originLocationId: integer('origin_location_id').references(() => locations.id, { onDelete: 'set null' }),
    role: text('role').notNull().default(''),
    summary: text('summary').notNull().default(''),
    personality: text('personality').notNull().default(''),
    history: text('history').notNull().default(''),
    family: text('family').notNull().default(''),
    abilities: text('abilities').notNull().default(''),
    storyRole: text('story_role').notNull().default(''),
    secrets: text('secrets').notNull().default(''),
    portraitId: integer('portrait_id').references(() => media.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...editorial(),
  },
  (t) => [index('characters_kingdom_idx').on(t.kingdomId)],
)

export const characterRelations = sqliteTable(
  'character_relations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    characterId: integer('character_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    relatedId: integer('related_id')
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default(''),
    description: text('description').notNull().default(''),
    spoiler: integer('spoiler').notNull().default(0),
    status: text('status', { enum: PUBLICATION_STATES }).notNull().default('publicado'),
  },
  (t) => [index('character_relations_idx').on(t.characterId)],
)

export const eras = sqliteTable('eras', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  dateLabel: text('date_label').notNull().default(''),
  summary: text('summary').notNull().default(''),
  body: text('body').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editorial(),
})

export const events = sqliteTable(
  'events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    eraId: integer('era_id').references(() => eras.id, { onDelete: 'set null' }),
    dateLabel: text('date_label').notNull().default(''),
    sortOrder: real('sort_order').notNull().default(0),
    certainty: text('certainty', { enum: CERTAINTY_STATES }).notNull().default('desconhecido'),
    eventType: text('event_type').notNull().default(''),
    summary: text('summary').notNull().default(''),
    body: text('body').notNull().default(''),
    ...editorial(),
  },
  (t) => [index('events_era_idx').on(t.eraId)],
)

export const articles = sqliteTable(
  'articles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    section: text('section', { enum: ['mitologia', 'ressonancia'] }).notNull(),
    group: text('group').notNull().default(''),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    subtitle: text('subtitle').notNull().default(''),
    summary: text('summary').notNull().default(''),
    body: text('body').notNull().default(''),
    imageId: integer('image_id').references(() => media.id, { onDelete: 'set null' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...editorial(),
  },
  (t) => [uniqueIndex('articles_section_slug_idx').on(t.section, t.slug)],
)

export const mysteries = sqliteTable('mysteries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  relatedHref: text('related_href').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editorial(),
})

export const documents = sqliteTable('documents', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  docType: text('doc_type').notNull().default(''),
  imageId: integer('image_id').references(() => media.id, { onDelete: 'set null' }),
  excerpt: text('excerpt').notNull().default(''),
  transcription: text('transcription').notNull().default(''),
  translation: text('translation').notNull().default(''),
  language: text('language').notNull().default(''),
  origin: text('origin').notNull().default(''),
  dateLabel: text('date_label').notNull().default(''),
  context: text('context').notNull().default(''),
  reliability: text('reliability', { enum: RELIABILITY_STATES }).notNull().default('desconhecido'),
  reliabilityNote: text('reliability_note').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editorial(),
})

export const maps = sqliteTable('maps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  imageId: integer('image_id').references(() => media.id, { onDelete: 'set null' }),
  isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
  provisional: integer('provisional', { mode: 'boolean' }).notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editorial(),
})

export const mapMarkers = sqliteTable(
  'map_markers',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    mapId: integer('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    markerType: text('marker_type').notNull().default('cidade'),
    x: real('x').notNull(),
    y: real('y').notNull(),
    description: text('description').notNull().default(''),
    locationId: integer('location_id').references(() => locations.id, { onDelete: 'set null' }),
    kingdomId: integer('kingdom_id').references(() => kingdoms.id, { onDelete: 'set null' }),
    provisional: integer('provisional', { mode: 'boolean' }).notNull().default(true),
    spoiler: integer('spoiler').notNull().default(0),
    status: text('status', { enum: PUBLICATION_STATES }).notNull().default('rascunho'),
  },
  (t) => [index('map_markers_map_idx').on(t.mapId)],
)

export const books = sqliteTable('books', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  volume: integer('volume').notNull().default(1),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull().default(''),
  coverId: integer('cover_id').references(() => media.id, { onDelete: 'set null' }),
  synopsis: text('synopsis').notNull().default(''),
  synopsisOfficial: integer('synopsis_official', { mode: 'boolean' }).notNull().default(false),
  editorialInfo: text('editorial_info').notNull().default(''),
  materials: text('materials').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  ...editorial(),
})

export const chapters = sqliteTable(
  'chapters',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    bookId: integer('book_id')
      .notNull()
      .references(() => books.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    body: text('body').notNull().default(''),
    ...editorial(),
  },
  (t) => [uniqueIndex('chapters_book_number_idx').on(t.bookId, t.number), uniqueIndex('chapters_book_slug_idx').on(t.bookId, t.slug)],
)

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  title: text('title').notNull(),
  category: text('category').notNull().default(''),
  imageId: integer('image_id').references(() => media.id, { onDelete: 'set null' }),
  excerpt: text('excerpt').notNull().default(''),
  body: text('body').notNull().default(''),
  ...editorial(),
})

/** Galerias: imagens associadas a qualquer entidade, em ordem. */
export const mediaLinks = sqliteTable(
  'media_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    mediaId: integer('media_id')
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('media_links_entity_idx').on(t.entityType, t.entityId)],
)

/**
 * Referências cruzadas genéricas entre entidades (personagem ↔ local,
 * acontecimento ↔ reino…). Os pares são guardados em ordem canônica
 * (ver lib/content/links.ts), de modo que editar a relação em qualquer
 * um dos lados altera o mesmo registro.
 */
export const links = sqliteTable(
  'links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    aType: text('a_type').notNull(),
    aId: integer('a_id').notNull(),
    bType: text('b_type').notNull(),
    bId: integer('b_id').notNull(),
  },
  (t) => [
    uniqueIndex('links_pair_idx').on(t.aType, t.aId, t.bType, t.bId),
    index('links_b_idx').on(t.bType, t.bId),
  ],
)

/** Vocabulários controlados: categorias, tipos e tags. */
export const terms = sqliteTable(
  'terms',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vocabulary: text('vocabulary').notNull(),
    slug: text('slug').notNull(),
    label: text('label').notNull(),
    description: text('description').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [uniqueIndex('terms_vocab_slug_idx').on(t.vocabulary, t.slug)],
)

export const entityTags = sqliteTable(
  'entity_tags',
  {
    entityType: text('entity_type').notNull(),
    entityId: integer('entity_id').notNull(),
    termId: integer('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.entityType, t.entityId, t.termId] }), index('entity_tags_term_idx').on(t.termId)],
)

/** Configurações editoriais do site (capa oficial, textos da página inicial…). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull().default(''),
})
