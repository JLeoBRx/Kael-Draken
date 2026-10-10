import 'server-only'
import { and, asc, desc, eq, inArray, isNull, like, or, sql, type SQL } from 'drizzle-orm'
import { cache } from 'react'
import { db, schema as s } from '../db'
import type { ArticleSection, EntityType, Vocabulary } from '../editorial'
import { paths } from '../routes'
import { getLinkedIds } from './links'
import { listBookIllustrations } from './illustrations'
import { getGallery, getImage, getImages, type ImageData } from './media'
import type { Viewer } from './viewer'
import { isVisible, listable, reachable } from './visibility'

type Kingdom = typeof s.kingdoms.$inferSelect
type Location = typeof s.locations.$inferSelect
type Character = typeof s.characters.$inferSelect
type Era = typeof s.eras.$inferSelect
type Event = typeof s.events.$inferSelect
type Article = typeof s.articles.$inferSelect
type Mystery = typeof s.mysteries.$inferSelect
type Document = typeof s.documents.$inferSelect
type MapRow = typeof s.maps.$inferSelect
type Book = typeof s.books.$inferSelect
type Chapter = typeof s.chapters.$inferSelect
type Post = typeof s.posts.$inferSelect

/** Remove as anotações privadas antes de qualquer uso público. */
function pub<T extends { notes?: string }>(row: T): Omit<T, 'notes'> {
  const { notes: _notes, ...rest } = row
  void _notes
  return rest
}

export type Public<T extends { notes?: string }> = Omit<T, 'notes'>

export interface LinkItem {
  type: EntityType
  title: string
  href: string
  summary?: string
  canon?: string
  meta?: string
}

// ── Vocabulários ─────────────────────────────────────────────

export const getTerms = cache(async (vocabulary: Vocabulary) => {
  return db.select().from(s.terms).where(eq(s.terms.vocabulary, vocabulary)).orderBy(asc(s.terms.sortOrder), asc(s.terms.label))
})

export async function getTermLabels(vocabulary: Vocabulary): Promise<Map<string, string>> {
  const rows = await getTerms(vocabulary)
  return new Map(rows.map((r) => [r.slug, r.label]))
}

export async function getEntityTags(entityType: EntityType, entityId: number) {
  return db
    .select({ slug: s.terms.slug, label: s.terms.label })
    .from(s.entityTags)
    .innerJoin(s.terms, eq(s.terms.id, s.entityTags.termId))
    .where(and(eq(s.entityTags.entityType, entityType), eq(s.entityTags.entityId, entityId)))
    .orderBy(asc(s.terms.label))
}

// ── Relações genéricas visíveis ──────────────────────────────

async function linkedKingdoms(type: EntityType, id: number, viewer: Viewer): Promise<Public<Kingdom>[]> {
  const ids = await getLinkedIds(type, id, 'kingdom')
  if (!ids.length) return []
  const rows = await db.select().from(s.kingdoms).where(and(inArray(s.kingdoms.id, ids), listable(s.kingdoms, viewer))).orderBy(asc(s.kingdoms.sortOrder))
  return rows.map(pub)
}

async function linkedLocations(type: EntityType, id: number, viewer: Viewer): Promise<Public<Location>[]> {
  const ids = await getLinkedIds(type, id, 'location')
  if (!ids.length) return []
  const rows = await db.select().from(s.locations).where(and(inArray(s.locations.id, ids), listable(s.locations, viewer))).orderBy(asc(s.locations.name))
  return rows.map(pub)
}

async function linkedCharacters(type: EntityType, id: number, viewer: Viewer): Promise<Public<Character>[]> {
  const ids = await getLinkedIds(type, id, 'character')
  if (!ids.length) return []
  const rows = await db.select().from(s.characters).where(and(inArray(s.characters.id, ids), listable(s.characters, viewer))).orderBy(asc(s.characters.name))
  return rows.map(pub)
}

async function linkedEvents(type: EntityType, id: number, viewer: Viewer): Promise<Public<Event>[]> {
  const ids = await getLinkedIds(type, id, 'event')
  if (!ids.length) return []
  const rows = await db
    .select({ event: s.events, eraOrder: s.eras.sortOrder })
    .from(s.events)
    .leftJoin(s.eras, eq(s.eras.id, s.events.eraId))
    .where(and(inArray(s.events.id, ids), listable(s.events, viewer)))
    .orderBy(sql`coalesce(${s.eras.sortOrder}, 999999)`, asc(s.events.sortOrder))
  return rows.map((r) => pub(r.event))
}

async function linkedDocuments(type: EntityType, id: number, viewer: Viewer): Promise<Public<Document>[]> {
  const ids = await getLinkedIds(type, id, 'document')
  if (!ids.length) return []
  const rows = await db.select().from(s.documents).where(and(inArray(s.documents.id, ids), listable(s.documents, viewer))).orderBy(asc(s.documents.title))
  return rows.map(pub)
}

async function linkedArticles(type: EntityType, id: number, viewer: Viewer): Promise<Public<Article>[]> {
  const ids = await getLinkedIds(type, id, 'article')
  if (!ids.length) return []
  const rows = await db.select().from(s.articles).where(and(inArray(s.articles.id, ids), listable(s.articles, viewer))).orderBy(asc(s.articles.sortOrder))
  return rows.map(pub)
}

// ── Reinos ───────────────────────────────────────────────────

export async function listKingdoms(viewer: Viewer) {
  const rows = await db.select().from(s.kingdoms).where(listable(s.kingdoms, viewer)).orderBy(asc(s.kingdoms.sortOrder), asc(s.kingdoms.name))
  const images = await getImages(rows.map((r) => r.emblemId))
  return rows.map((r) => ({ ...pub(r), emblem: r.emblemId ? (images.get(r.emblemId) ?? null) : null }))
}

export async function getKingdom(slug: string, viewer: Viewer) {
  const [row] = await db
    .select()
    .from(s.kingdoms)
    .where(and(eq(s.kingdoms.slug, slug), reachable(s.kingdoms, viewer)))
  if (!row) return null
  const [emblem, image, gallery, tags] = await Promise.all([getImage(row.emblemId), getImage(row.imageId), getGallery('kingdom', row.id), getEntityTags('kingdom', row.id)])

  const locations = (
    await db
      .select()
      .from(s.locations)
      .where(and(eq(s.locations.kingdomId, row.id), listable(s.locations, viewer)))
      .orderBy(desc(s.locations.isCapital), asc(s.locations.sortOrder), asc(s.locations.name))
  ).map(pub)

  const linkedCharacterIds = await getLinkedIds('kingdom', row.id, 'character')
  const characterCondition: SQL = linkedCharacterIds.length ? or(eq(s.characters.kingdomId, row.id), inArray(s.characters.id, linkedCharacterIds))! : eq(s.characters.kingdomId, row.id)
  const characters = (
    await db
      .select()
      .from(s.characters)
      .where(and(characterCondition, listable(s.characters, viewer)))
      .orderBy(asc(s.characters.sortOrder), asc(s.characters.name))
  ).map(pub)

  const [events, documents, articles, otherKingdoms] = await Promise.all([
    linkedEvents('kingdom', row.id, viewer),
    linkedDocuments('kingdom', row.id, viewer),
    linkedArticles('kingdom', row.id, viewer),
    db.select({ slug: s.kingdoms.slug, name: s.kingdoms.name, sortOrder: s.kingdoms.sortOrder }).from(s.kingdoms).where(listable(s.kingdoms, viewer)).orderBy(asc(s.kingdoms.sortOrder)),
  ])

  const markers = await markersFor({ kingdomId: row.id }, viewer)

  return { kingdom: pub(row), emblem, image, gallery, tags, locations, characters, events, documents, articles, siblings: otherKingdoms, markers }
}

// ── Atlas ────────────────────────────────────────────────────

export interface MarkerView {
  id: number
  label: string
  markerType: string
  x: number
  y: number
  description: string
  provisional: boolean
  href: string | null
  status: string
}

async function markersFor(filter: { kingdomId?: number; locationId?: number }, viewer: Viewer) {
  const condition = filter.kingdomId ? eq(s.mapMarkers.kingdomId, filter.kingdomId) : eq(s.mapMarkers.locationId, filter.locationId ?? -1)
  const rows = await db
    .select({ marker: s.mapMarkers, map: s.maps })
    .from(s.mapMarkers)
    .innerJoin(s.maps, eq(s.maps.id, s.mapMarkers.mapId))
    .where(and(condition, listable(s.maps, viewer)))
  return rows
    .filter((r) => viewer.preview || (r.marker.status === 'publicado' && r.marker.spoiler <= viewer.spoiler))
    .map((r) => ({ mapSlug: r.map.slug, mapTitle: r.map.title, isPrimary: r.map.isPrimary, label: r.marker.label, id: r.marker.id }))
}

export async function listMaps(viewer: Viewer) {
  const rows = await db.select().from(s.maps).where(listable(s.maps, viewer)).orderBy(desc(s.maps.isPrimary), asc(s.maps.sortOrder), asc(s.maps.title))
  const images = await getImages(rows.map((r) => r.imageId))
  return rows.map((r) => ({ ...pub(r), image: r.imageId ? (images.get(r.imageId) ?? null) : null }))
}

async function loadMap(row: MapRow, viewer: Viewer) {
  const image = await getImage(row.imageId)
  const markerRows = await db
    .select({
      marker: s.mapMarkers,
      locationSlug: s.locations.slug,
      locationStatus: s.locations.status,
      locationCanon: s.locations.canon,
      locationSpoiler: s.locations.spoiler,
      kingdomSlug: s.kingdoms.slug,
      kingdomStatus: s.kingdoms.status,
      kingdomCanon: s.kingdoms.canon,
      kingdomSpoiler: s.kingdoms.spoiler,
    })
    .from(s.mapMarkers)
    .leftJoin(s.locations, eq(s.locations.id, s.mapMarkers.locationId))
    .leftJoin(s.kingdoms, eq(s.kingdoms.id, s.mapMarkers.kingdomId))
    .where(eq(s.mapMarkers.mapId, row.id))
    .orderBy(asc(s.mapMarkers.label))

  const markers: MarkerView[] = markerRows
    .filter((r) => (viewer.preview ? r.marker.status !== 'arquivado' : r.marker.status === 'publicado' && r.marker.spoiler <= viewer.spoiler))
    .map((r) => {
      let href: string | null = null
      if (r.locationSlug && isVisible({ status: r.locationStatus!, canon: r.locationCanon!, spoiler: r.locationSpoiler! }, viewer)) href = paths.location(r.locationSlug)
      else if (r.kingdomSlug && isVisible({ status: r.kingdomStatus!, canon: r.kingdomCanon!, spoiler: r.kingdomSpoiler! }, viewer)) href = paths.kingdom(r.kingdomSlug)
      return {
        id: r.marker.id,
        label: r.marker.label,
        markerType: r.marker.markerType,
        x: r.marker.x,
        y: r.marker.y,
        description: r.marker.description,
        provisional: r.marker.provisional,
        href,
        status: r.marker.status,
      }
    })
  return { map: pub(row), image, markers }
}

export async function getPrimaryMap(viewer: Viewer) {
  const [row] = await db.select().from(s.maps).where(listable(s.maps, viewer)).orderBy(desc(s.maps.isPrimary), asc(s.maps.sortOrder)).limit(1)
  return row ? loadMap(row, viewer) : null
}

export async function getMap(slug: string, viewer: Viewer) {
  const [row] = await db
    .select()
    .from(s.maps)
    .where(and(eq(s.maps.slug, slug), reachable(s.maps, viewer)))
  return row ? loadMap(row, viewer) : null
}

// ── Locais ───────────────────────────────────────────────────

export interface LocationFilters {
  q?: string
  reino?: string
  categoria?: string
  estado?: string
}

export async function listLocations(viewer: Viewer, filters: LocationFilters = {}) {
  const conditions: SQL[] = [listable(s.locations, viewer)]
  if (filters.q) conditions.push(or(like(s.locations.name, `%${filters.q}%`), like(s.locations.summary, `%${filters.q}%`))!)
  if (filters.categoria) conditions.push(eq(s.locations.category, filters.categoria))
  if (filters.estado) conditions.push(eq(s.locations.canon, filters.estado as Location['canon']))
  if (filters.reino === 'sem-reino') conditions.push(isNull(s.locations.kingdomId))
  else if (filters.reino) conditions.push(eq(s.kingdoms.slug, filters.reino))

  const rows = await db
    .select({ location: s.locations, kingdomName: s.kingdoms.name, kingdomSlug: s.kingdoms.slug, kingdom: s.kingdoms })
    .from(s.locations)
    .leftJoin(s.kingdoms, eq(s.kingdoms.id, s.locations.kingdomId))
    .where(and(...conditions))
    .orderBy(asc(s.locations.name))
  const images = await getImages(rows.map((r) => r.location.imageId))
  return rows.map((r) => ({
    ...pub(r.location),
    kingdom: r.kingdom && isVisible(r.kingdom, viewer) ? { name: r.kingdom.name, slug: r.kingdom.slug } : null,
    image: r.location.imageId ? (images.get(r.location.imageId) ?? null) : null,
  }))
}

export async function getLocation(slug: string, viewer: Viewer) {
  const [row] = await db
    .select()
    .from(s.locations)
    .where(and(eq(s.locations.slug, slug), reachable(s.locations, viewer)))
  if (!row) return null
  const kingdomRow = row.kingdomId ? (await db.select().from(s.kingdoms).where(eq(s.kingdoms.id, row.kingdomId)))[0] : undefined
  const kingdom = kingdomRow && isVisible(kingdomRow, viewer) ? pub(kingdomRow) : null

  const linkedIds = await getLinkedIds('location', row.id, 'character')
  const characterCondition: SQL = linkedIds.length ? or(eq(s.characters.originLocationId, row.id), inArray(s.characters.id, linkedIds))! : eq(s.characters.originLocationId, row.id)
  const characters = (await db.select().from(s.characters).where(and(characterCondition, listable(s.characters, viewer))).orderBy(asc(s.characters.name))).map(pub)

  const [image, gallery, tags, events, documents, markers] = await Promise.all([
    getImage(row.imageId),
    getGallery('location', row.id),
    getEntityTags('location', row.id),
    linkedEvents('location', row.id, viewer),
    linkedDocuments('location', row.id, viewer),
    markersFor({ locationId: row.id }, viewer),
  ])
  return { location: pub(row), kingdom, image, gallery, tags, characters, events, documents, markers }
}

// ── Personagens ──────────────────────────────────────────────

export interface CharacterFilters {
  q?: string
  reino?: string
  papel?: string
  estado?: string
}

export async function listCharacters(viewer: Viewer, filters: CharacterFilters = {}) {
  const conditions: SQL[] = [listable(s.characters, viewer)]
  if (filters.q) conditions.push(or(like(s.characters.name, `%${filters.q}%`), like(s.characters.titles, `%${filters.q}%`))!)
  if (filters.papel) conditions.push(eq(s.characters.role, filters.papel))
  if (filters.estado) conditions.push(eq(s.characters.canon, filters.estado as Character['canon']))
  if (filters.reino === 'sem-reino') conditions.push(isNull(s.characters.kingdomId))
  else if (filters.reino) conditions.push(eq(s.kingdoms.slug, filters.reino))

  const rows = await db
    .select({ character: s.characters, kingdom: s.kingdoms })
    .from(s.characters)
    .leftJoin(s.kingdoms, eq(s.kingdoms.id, s.characters.kingdomId))
    .where(and(...conditions))
    .orderBy(asc(s.characters.sortOrder), asc(s.characters.name))
  const images = await getImages(rows.map((r) => r.character.portraitId))
  return rows.map((r) => ({
    ...pub(r.character),
    // O reino de origem só aparece se o próprio reino estiver visível.
    kingdom: r.kingdom && isVisible(r.kingdom, viewer) ? { name: r.kingdom.name, slug: r.kingdom.slug } : null,
    portrait: r.character.portraitId ? (images.get(r.character.portraitId) ?? null) : null,
  }))
}

export async function getCharacter(slug: string, viewer: Viewer) {
  const [row] = await db
    .select()
    .from(s.characters)
    .where(and(eq(s.characters.slug, slug), reachable(s.characters, viewer)))
  if (!row) return null

  const kingdomRow = row.kingdomId ? (await db.select().from(s.kingdoms).where(eq(s.kingdoms.id, row.kingdomId)))[0] : undefined
  const originRow = row.originLocationId ? (await db.select().from(s.locations).where(eq(s.locations.id, row.originLocationId)))[0] : undefined

  const relationRows = await db
    .select({ relation: s.characterRelations, related: s.characters })
    .from(s.characterRelations)
    .innerJoin(s.characters, eq(s.characters.id, s.characterRelations.relatedId))
    .where(eq(s.characterRelations.characterId, row.id))
  const inverseRows = await db
    .select({ relation: s.characterRelations, related: s.characters })
    .from(s.characterRelations)
    .innerJoin(s.characters, eq(s.characters.id, s.characterRelations.characterId))
    .where(eq(s.characterRelations.relatedId, row.id))

  const relations = [...relationRows, ...inverseRows]
    .filter((r) => isVisible(r.related, viewer) && (viewer.preview || (r.relation.status === 'publicado' && r.relation.spoiler <= viewer.spoiler)))
    .map((r) => ({
      id: r.relation.id,
      kind: r.relation.kind,
      description: r.relation.description,
      spoiler: r.relation.spoiler,
      related: { name: r.related.name, slug: r.related.slug, titles: r.related.titles },
    }))

  const chapterIds = await getLinkedIds('character', row.id, 'chapter')
  const chapters = chapterIds.length
    ? await db
        .select({ chapter: s.chapters, book: s.books })
        .from(s.chapters)
        .innerJoin(s.books, eq(s.books.id, s.chapters.bookId))
        .where(and(inArray(s.chapters.id, chapterIds), listable(s.chapters, viewer), listable(s.books, viewer)))
        .orderBy(asc(s.books.volume), asc(s.chapters.number))
    : []

  const [portrait, gallery, tags, locations, events, documents] = await Promise.all([
    getImage(row.portraitId),
    getGallery('character', row.id),
    getEntityTags('character', row.id),
    linkedLocations('character', row.id, viewer),
    linkedEvents('character', row.id, viewer),
    linkedDocuments('character', row.id, viewer),
  ])

  return {
    character: pub(row),
    kingdom: kingdomRow && isVisible(kingdomRow, viewer) ? pub(kingdomRow) : null,
    origin: originRow && isVisible(originRow, viewer) ? pub(originRow) : null,
    portrait,
    gallery,
    tags,
    relations,
    chapters: chapters.map((c) => ({ number: c.chapter.number, title: c.chapter.title, bookSlug: c.book.slug, bookTitle: c.book.title })),
    locations,
    events,
    documents,
  }
}

// ── Mitologia e Ressonância ──────────────────────────────────

export async function listArticles(section: ArticleSection, viewer: Viewer) {
  const rows = await db
    .select()
    .from(s.articles)
    .where(and(eq(s.articles.section, section), listable(s.articles, viewer)))
    .orderBy(asc(s.articles.sortOrder), asc(s.articles.title))
  return rows.map(pub)
}

export async function getArticle(section: ArticleSection, slug: string, viewer: Viewer) {
  const [row] = await db
    .select()
    .from(s.articles)
    .where(and(eq(s.articles.section, section), eq(s.articles.slug, slug), reachable(s.articles, viewer)))
  if (!row) return null
  const siblings = await listArticles(section, viewer)
  const index = siblings.findIndex((a) => a.id === row.id)
  const [image, gallery, tags, kingdoms, locations, characters, events, documents] = await Promise.all([
    getImage(row.imageId),
    getGallery('article', row.id),
    getEntityTags('article', row.id),
    linkedKingdoms('article', row.id, viewer),
    linkedLocations('article', row.id, viewer),
    linkedCharacters('article', row.id, viewer),
    linkedEvents('article', row.id, viewer),
    linkedDocuments('article', row.id, viewer),
  ])
  return {
    article: pub(row),
    image,
    gallery,
    tags,
    kingdoms,
    locations,
    characters,
    events,
    documents,
    previous: index > 0 ? siblings[index - 1] : null,
    next: index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null,
  }
}

export async function listMysteries(viewer: Viewer): Promise<Public<Mystery>[]> {
  const rows = await db.select().from(s.mysteries).where(listable(s.mysteries, viewer)).orderBy(asc(s.mysteries.sortOrder))
  return rows.map(pub)
}

// ── Cronologia ───────────────────────────────────────────────

export async function getTimeline(viewer: Viewer) {
  const eraRows = (await db.select().from(s.eras).where(listable(s.eras, viewer)).orderBy(asc(s.eras.sortOrder))).map(pub)
  const eventRows = (await db.select().from(s.events).where(listable(s.events, viewer)).orderBy(asc(s.events.sortOrder))).map(pub)

  const eventIds = eventRows.map((e) => e.id)
  const related = new Map<number, LinkItem[]>()
  if (eventIds.length) {
    const linkRows = await db
      .select()
      .from(s.links)
      .where(or(and(eq(s.links.bType, 'event'), inArray(s.links.bId, eventIds)), and(eq(s.links.aType, 'event'), inArray(s.links.aId, eventIds))))
    const want = { kingdom: new Set<number>(), location: new Set<number>(), character: new Set<number>() }
    const pairs: Array<{ eventId: number; type: keyof typeof want; id: number }> = []
    for (const l of linkRows) {
      const eventSide = l.bType === 'event' ? { eventId: l.bId, type: l.aType, id: l.aId } : { eventId: l.aId, type: l.bType, id: l.bId }
      if (eventSide.type in want) {
        want[eventSide.type as keyof typeof want].add(eventSide.id)
        pairs.push({ eventId: eventSide.eventId, type: eventSide.type as keyof typeof want, id: eventSide.id })
      }
    }
    const [ks, ls, cs] = await Promise.all([
      want.kingdom.size ? db.select().from(s.kingdoms).where(and(inArray(s.kingdoms.id, [...want.kingdom]), listable(s.kingdoms, viewer))) : [],
      want.location.size ? db.select().from(s.locations).where(and(inArray(s.locations.id, [...want.location]), listable(s.locations, viewer))) : [],
      want.character.size ? db.select().from(s.characters).where(and(inArray(s.characters.id, [...want.character]), listable(s.characters, viewer))) : [],
    ])
    const lookup = {
      kingdom: new Map(ks.map((k) => [k.id, { type: 'kingdom' as const, title: k.name, href: paths.kingdom(k.slug) }])),
      location: new Map(ls.map((l) => [l.id, { type: 'location' as const, title: l.name, href: paths.location(l.slug) }])),
      character: new Map(cs.map((c) => [c.id, { type: 'character' as const, title: c.name, href: paths.character(c.slug) }])),
    }
    for (const p of pairs) {
      const item = lookup[p.type].get(p.id)
      if (item) related.set(p.eventId, [...(related.get(p.eventId) ?? []), item])
    }
  }

  const eraIds = new Set(eraRows.map((e) => e.id))
  const withRelated = eventRows.map((e) => ({ ...e, related: related.get(e.id) ?? [] }))
  return {
    eras: eraRows.map((era) => ({ ...era, events: withRelated.filter((e) => e.eraId === era.id) })),
    undated: withRelated.filter((e) => !e.eraId || !eraIds.has(e.eraId)),
  }
}

// ── Manuscritos ──────────────────────────────────────────────

export interface DocumentFilters {
  tipo?: string
  confiabilidade?: string
  q?: string
}

export async function listDocuments(viewer: Viewer, filters: DocumentFilters = {}) {
  const conditions: SQL[] = [listable(s.documents, viewer)]
  if (filters.tipo) conditions.push(eq(s.documents.docType, filters.tipo))
  if (filters.confiabilidade) conditions.push(eq(s.documents.reliability, filters.confiabilidade as Document['reliability']))
  if (filters.q) conditions.push(or(like(s.documents.title, `%${filters.q}%`), like(s.documents.excerpt, `%${filters.q}%`))!)
  const rows = await db
    .select()
    .from(s.documents)
    .where(and(...conditions))
    .orderBy(asc(s.documents.sortOrder), desc(s.documents.publishedAt))
  const images = await getImages(rows.map((r) => r.imageId))
  return rows.map((r) => ({ ...pub(r), image: r.imageId ? (images.get(r.imageId) ?? null) : null }))
}

export async function getDocument(slug: string, viewer: Viewer) {
  const [row] = await db
    .select()
    .from(s.documents)
    .where(and(eq(s.documents.slug, slug), reachable(s.documents, viewer)))
  if (!row) return null
  const [image, gallery, tags, kingdoms, locations, characters, events] = await Promise.all([
    getImage(row.imageId),
    getGallery('document', row.id),
    getEntityTags('document', row.id),
    linkedKingdoms('document', row.id, viewer),
    linkedLocations('document', row.id, viewer),
    linkedCharacters('document', row.id, viewer),
    linkedEvents('document', row.id, viewer),
  ])
  return { document: pub(row), image, gallery, tags, kingdoms, locations, characters, events }
}

// ── Livros e capítulos ───────────────────────────────────────

export async function listBooks(viewer: Viewer) {
  const rows = await db.select().from(s.books).where(listable(s.books, viewer)).orderBy(asc(s.books.volume))
  const images = await getImages(rows.map((r) => r.coverId))
  return rows.map((r) => ({ ...pub(r), cover: r.coverId ? (images.get(r.coverId) ?? null) : null }))
}

export async function getBook(slug: string, viewer: Viewer) {
  const [row] = await db
    .select()
    .from(s.books)
    .where(and(eq(s.books.slug, slug), reachable(s.books, viewer)))
  if (!row) return null
  const chapters = (
    await db
      .select()
      .from(s.chapters)
      .where(and(eq(s.chapters.bookId, row.id), listable(s.chapters, viewer)))
      .orderBy(asc(s.chapters.number))
  ).map(pub)
  const [cover, gallery, tags, characters, locations] = await Promise.all([
    getImage(row.coverId),
    getGallery('book', row.id),
    getEntityTags('book', row.id),
    linkedCharacters('book', row.id, viewer),
    linkedLocations('book', row.id, viewer),
  ])
  return { book: pub(row), cover, gallery, tags, chapters, characters, locations }
}

/** Apenas o registro do livro (sem capítulos e relações). */
export async function getBookSummary(slug: string, viewer: Viewer) {
  const [row] = await db
    .select()
    .from(s.books)
    .where(and(eq(s.books.slug, slug), reachable(s.books, viewer)))
  return row ? pub(row) : null
}

export async function getChapter(bookSlug: string, number: number, viewer: Viewer) {
  const [book] = await db
    .select()
    .from(s.books)
    .where(and(eq(s.books.slug, bookSlug), reachable(s.books, viewer)))
  if (!book) return null
  const [chapter] = await db
    .select()
    .from(s.chapters)
    .where(and(eq(s.chapters.bookId, book.id), eq(s.chapters.number, number), reachable(s.chapters, viewer)))
  if (!chapter) return null
  const siblings = await db
    .select({ number: s.chapters.number, title: s.chapters.title })
    .from(s.chapters)
    .where(and(eq(s.chapters.bookId, book.id), listable(s.chapters, viewer)))
    .orderBy(asc(s.chapters.number))
  const index = siblings.findIndex((c) => c.number === chapter.number)
  const [characters, locations] = await Promise.all([linkedCharacters('chapter', chapter.id, viewer), linkedLocations('chapter', chapter.id, viewer)])
  return {
    book: pub(book),
    chapter: pub(chapter),
    characters,
    locations,
    previous: index > 0 ? siblings[index - 1] : null,
    next: index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null,
  }
}

// ── Novidades ────────────────────────────────────────────────

export async function listPosts(viewer: Viewer, opts: { categoria?: string; limit?: number; offset?: number } = {}) {
  const conditions: SQL[] = [listable(s.posts, viewer)]
  if (opts.categoria) conditions.push(eq(s.posts.category, opts.categoria))
  const query = db
    .select()
    .from(s.posts)
    .where(and(...conditions))
    .orderBy(desc(sql`coalesce(${s.posts.publishedAt}, ${s.posts.createdAt})`))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0)
  const rows = await query
  const images = await getImages(rows.map((r) => r.imageId))
  return rows.map((r) => ({ ...pub(r), image: r.imageId ? (images.get(r.imageId) ?? null) : null }))
}

export async function countPosts(viewer: Viewer, categoria?: string) {
  const conditions: SQL[] = [listable(s.posts, viewer)]
  if (categoria) conditions.push(eq(s.posts.category, categoria))
  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(s.posts)
    .where(and(...conditions))
  return Number(row?.value ?? 0)
}

export async function getPost(slug: string, viewer: Viewer) {
  const [row] = await db
    .select()
    .from(s.posts)
    .where(and(eq(s.posts.slug, slug), reachable(s.posts, viewer)))
  if (!row) return null
  const [image, tags] = await Promise.all([getImage(row.imageId), getEntityTags('post', row.id)])
  return { post: pub(row), image, tags }
}

// ── Conteúdo recente (página inicial) ────────────────────────

export interface RecentEntry {
  type: EntityType
  title: string
  href: string
  date: string
  canon: string
}

export async function getRecentEntries(viewer: Viewer, limit = 6): Promise<RecentEntry[]> {
  const take = limit
  const date = (row: { publishedAt: string | null; updatedAt: string }) => row.updatedAt ?? row.publishedAt ?? ''
  const [ks, ls, cs, as, ds, es] = await Promise.all([
    db.select().from(s.kingdoms).where(listable(s.kingdoms, viewer)).orderBy(desc(s.kingdoms.updatedAt)).limit(take),
    db.select().from(s.locations).where(listable(s.locations, viewer)).orderBy(desc(s.locations.updatedAt)).limit(take),
    db.select().from(s.characters).where(listable(s.characters, viewer)).orderBy(desc(s.characters.updatedAt)).limit(take),
    db.select().from(s.articles).where(listable(s.articles, viewer)).orderBy(desc(s.articles.updatedAt)).limit(take),
    db.select().from(s.documents).where(listable(s.documents, viewer)).orderBy(desc(s.documents.updatedAt)).limit(take),
    db.select().from(s.maps).where(listable(s.maps, viewer)).orderBy(desc(s.maps.updatedAt)).limit(take),
  ])
  const entries: RecentEntry[] = [
    ...ks.map((r) => ({ type: 'kingdom' as const, title: r.name, href: paths.kingdom(r.slug), date: date(r), canon: r.canon })),
    ...ls.map((r) => ({ type: 'location' as const, title: r.name, href: paths.location(r.slug), date: date(r), canon: r.canon })),
    ...cs.map((r) => ({ type: 'character' as const, title: r.name, href: paths.character(r.slug), date: date(r), canon: r.canon })),
    ...as.map((r) => ({ type: 'article' as const, title: r.title, href: paths.article(r.section, r.slug), date: date(r), canon: r.canon })),
    ...ds.map((r) => ({ type: 'document' as const, title: r.title, href: paths.document(r.slug), date: date(r), canon: r.canon })),
    ...es.map((r) => ({ type: 'map' as const, title: r.title, href: r.isPrimary ? paths.atlas : paths.map(r.slug), date: date(r), canon: r.canon })),
  ]
  return entries.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, limit)
}

export async function getSectionCounts(viewer: Viewer) {
  const countOf = async (table: typeof s.characters | typeof s.locations | typeof s.events | typeof s.documents) => {
    const [row] = await db
      .select({ value: sql<number>`count(*)` })
      .from(table)
      .where(listable(table, viewer))
    return Number(row?.value ?? 0)
  }
  const [characters, locations, events, documents] = await Promise.all([countOf(s.characters), countOf(s.locations), countOf(s.events), countOf(s.documents)])
  return { characters, locations, events, documents }
}

// ── Busca ────────────────────────────────────────────────────

export interface SearchResult {
  type: EntityType
  title: string
  href: string
  summary: string
  canon: string
}

/**
 * Busca em títulos e resumos. O corpo dos textos não é pesquisado para que
 * trechos ocultos por spoiler ou notas privadas não influenciem os resultados.
 */
export async function search(viewer: Viewer, q: string, tag?: string): Promise<SearchResult[]> {
  const term = q.trim()
  if (!term && !tag) return []
  const pattern = `%${term}%`

  let tagged: Array<{ entityType: string; entityId: number }> | null = null
  if (tag) {
    tagged = await db
      .select({ entityType: s.entityTags.entityType, entityId: s.entityTags.entityId })
      .from(s.entityTags)
      .innerJoin(s.terms, eq(s.terms.id, s.entityTags.termId))
      .where(and(eq(s.terms.vocabulary, 'tag'), eq(s.terms.slug, tag)))
  }
  const idsFor = (type: EntityType) => (tagged ? tagged.filter((t) => t.entityType === type).map((t) => t.entityId) : null)
  const scope = <T extends SQL>(type: EntityType, idColumn: Parameters<typeof inArray>[0], text: T): SQL | null => {
    const ids = idsFor(type)
    if (ids && !ids.length) return null
    const parts: SQL[] = []
    if (term) parts.push(text)
    if (ids) parts.push(inArray(idColumn, ids))
    return and(...parts) ?? null
  }

  const results: SearchResult[] = []
  const c1 = scope('kingdom', s.kingdoms.id, or(like(s.kingdoms.name, pattern), like(s.kingdoms.summary, pattern), like(s.kingdoms.government, pattern))!)
  if (c1) for (const r of await db.select().from(s.kingdoms).where(and(c1, listable(s.kingdoms, viewer)))) results.push({ type: 'kingdom', title: r.name, href: paths.kingdom(r.slug), summary: r.summary, canon: r.canon })
  const c2 = scope('location', s.locations.id, or(like(s.locations.name, pattern), like(s.locations.summary, pattern))!)
  if (c2) for (const r of await db.select().from(s.locations).where(and(c2, listable(s.locations, viewer)))) results.push({ type: 'location', title: r.name, href: paths.location(r.slug), summary: r.summary, canon: r.canon })
  const c3 = scope('character', s.characters.id, or(like(s.characters.name, pattern), like(s.characters.titles, pattern), like(s.characters.summary, pattern))!)
  if (c3) for (const r of await db.select().from(s.characters).where(and(c3, listable(s.characters, viewer)))) results.push({ type: 'character', title: r.name, href: paths.character(r.slug), summary: r.summary, canon: r.canon })
  const c4 = scope('article', s.articles.id, or(like(s.articles.title, pattern), like(s.articles.summary, pattern), like(s.articles.subtitle, pattern))!)
  if (c4) for (const r of await db.select().from(s.articles).where(and(c4, listable(s.articles, viewer)))) results.push({ type: 'article', title: r.title, href: paths.article(r.section, r.slug), summary: r.summary, canon: r.canon })
  const c5 = scope('document', s.documents.id, or(like(s.documents.title, pattern), like(s.documents.excerpt, pattern))!)
  if (c5) for (const r of await db.select().from(s.documents).where(and(c5, listable(s.documents, viewer)))) results.push({ type: 'document', title: r.title, href: paths.document(r.slug), summary: r.excerpt, canon: r.canon })
  const c6 = scope('event', s.events.id, or(like(s.events.title, pattern), like(s.events.summary, pattern))!)
  if (c6) for (const r of await db.select().from(s.events).where(and(c6, listable(s.events, viewer)))) results.push({ type: 'event', title: r.title, href: paths.event(r.slug), summary: r.summary, canon: r.canon })
  const c7 = scope('post', s.posts.id, or(like(s.posts.title, pattern), like(s.posts.excerpt, pattern))!)
  if (c7) for (const r of await db.select().from(s.posts).where(and(c7, listable(s.posts, viewer)))) results.push({ type: 'post', title: r.title, href: paths.post(r.slug), summary: r.excerpt, canon: r.canon })
  return results
}

// ── Sitemap ──────────────────────────────────────────────────

export async function getPublicPaths(): Promise<Array<{ path: string; updated: string }>> {
  const viewer: Viewer = { spoiler: 0, chosenSpoiler: 0, preview: false }
  const [ks, ls, cs, as, ds, bs, ps, ms] = await Promise.all([
    db.select().from(s.kingdoms).where(listable(s.kingdoms, viewer)),
    db.select().from(s.locations).where(listable(s.locations, viewer)),
    db.select().from(s.characters).where(listable(s.characters, viewer)),
    db.select().from(s.articles).where(listable(s.articles, viewer)),
    db.select().from(s.documents).where(listable(s.documents, viewer)),
    db.select().from(s.books).where(listable(s.books, viewer)),
    db.select().from(s.posts).where(listable(s.posts, viewer)),
    db.select().from(s.maps).where(listable(s.maps, viewer)),
  ])
  const illustrated: Array<{ path: string; updated: string }> = []
  for (const b of bs) {
    if (b.spoiler > viewer.spoiler) continue
    const items = await listBookIllustrations(b, viewer)
    if (items.length) illustrated.push({ path: paths.bookIllustrations(b.slug), updated: b.updatedAt })
  }
  return [
    ...illustrated,
    ...ks.map((r) => ({ path: paths.kingdom(r.slug), updated: r.updatedAt })),
    ...ls.map((r) => ({ path: paths.location(r.slug), updated: r.updatedAt })),
    ...cs.map((r) => ({ path: paths.character(r.slug), updated: r.updatedAt })),
    ...as.map((r) => ({ path: paths.article(r.section, r.slug), updated: r.updatedAt })),
    ...ds.map((r) => ({ path: paths.document(r.slug), updated: r.updatedAt })),
    ...bs.map((r) => ({ path: paths.book(r.slug), updated: r.updatedAt })),
    ...ps.map((r) => ({ path: paths.post(r.slug), updated: r.updatedAt })),
    ...ms.filter((r) => !r.isPrimary).map((r) => ({ path: paths.map(r.slug), updated: r.updatedAt })),
  ]
}

export type { Kingdom, Location, Character, Era, Event, Article, Mystery, Document, MapRow, Book, Chapter, Post, ImageData }
