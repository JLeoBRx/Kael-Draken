import 'server-only'
import { and, asc, count, desc, eq, like, ne, or, sql, type SQL } from 'drizzle-orm'
import type { AnySQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'
import { db, schema as s } from '../db'
import { CANON_STATES, ENTITY_LABELS, PUBLICATION_STATES, SPOILER_LEVELS, type EntityType, type Vocabulary } from '../editorial'
import { paths } from '../routes'
import { SLUG_PATTERN, slugify } from '../slug'
import { getLinkedIds, removeAllLinks, replaceLinks } from '../content/links'
import { findIllustrationFile } from '../content/illustrations'
import { defaultIllustrationSlug, illustrationTitle, printWarnings } from '../illustrations'
import { allFields, COLLECTIONS, type CollectionDef, type CollectionKey, type FieldDef } from './collections'

/* eslint-disable @typescript-eslint/no-explicit-any -- acesso genérico às tabelas a partir das definições */

export const TABLES: Record<CollectionKey, SQLiteTable & Record<string, any>> = {
  reinos: s.kingdoms,
  locais: s.locations,
  personagens: s.characters,
  eras: s.eras,
  acontecimentos: s.events,
  verbetes: s.articles,
  misterios: s.mysteries,
  manuscritos: s.documents,
  mapas: s.maps,
  livros: s.books,
  capitulos: s.chapters,
  ilustracoes: s.illustrations,
  publicacoes: s.posts,
}

export const ENTITY_TABLE: Record<EntityType, CollectionKey> = {
  kingdom: 'reinos',
  location: 'locais',
  character: 'personagens',
  era: 'eras',
  event: 'acontecimentos',
  article: 'verbetes',
  mystery: 'misterios',
  document: 'manuscritos',
  map: 'mapas',
  book: 'livros',
  chapter: 'capitulos',
  post: 'publicacoes',
  illustration: 'ilustracoes',
}

type Row = Record<string, any>

export interface Option {
  value: string
  label: string
}

function titleColumn(def: CollectionDef): AnySQLiteColumn {
  return TABLES[def.key][def.titleField]
}

export function publicPathFor(key: CollectionKey, row: Row, extra: { bookSlug?: string } = {}): string | null {
  switch (key) {
    case 'reinos':
      return paths.kingdom(row.slug)
    case 'locais':
      return paths.location(row.slug)
    case 'personagens':
      return paths.character(row.slug)
    case 'eras':
      return paths.era(row.slug)
    case 'acontecimentos':
      return paths.event(row.slug)
    case 'verbetes':
      return paths.article(row.section, row.slug)
    case 'misterios':
      return paths.mysteries
    case 'manuscritos':
      return paths.document(row.slug)
    case 'mapas':
      return paths.map(row.slug)
    case 'livros':
      return paths.book(row.slug)
    case 'capitulos':
      return extra.bookSlug ? paths.chapter(extra.bookSlug, row.number) : null
    case 'ilustracoes':
      return extra.bookSlug ? paths.illustration(extra.bookSlug, row.slug) : null
    case 'publicacoes':
      return paths.post(row.slug)
  }
}

// ── Opções para formulários ─────────────────────────────────────────────

export async function entityOptions(entity: EntityType): Promise<Option[]> {
  const key = ENTITY_TABLE[entity]
  const def = COLLECTIONS[key]
  const table = TABLES[key]
  const rows: Row[] = await db
    .select()
    .from(table)
    .orderBy(...(key === 'capitulos' ? [asc(table.bookId), asc(table.number)] : [asc(titleColumn(def))]))
  return rows.map((r) => {
    let label = String(r[def.titleField])
    if (key === 'capitulos') label = `Cap. ${r.number} — ${label}`
    if (key === 'verbetes') label = `${label} (${r.section === 'mitologia' ? 'mitologia' : 'Ressonância'})`
    if (r.status && r.status !== 'publicado') label += ` · ${r.status}`
    return { value: String(r.id), label }
  })
}

export async function vocabularyOptions(vocabulary: Vocabulary): Promise<Option[]> {
  const rows = await db.select().from(s.terms).where(eq(s.terms.vocabulary, vocabulary)).orderBy(asc(s.terms.sortOrder), asc(s.terms.label))
  return rows.map((r) => ({ value: r.slug, label: r.label }))
}

export async function tagOptions(): Promise<Option[]> {
  const rows = await db.select().from(s.terms).where(eq(s.terms.vocabulary, 'tag')).orderBy(asc(s.terms.label))
  return rows.map((r) => ({ value: String(r.id), label: r.label }))
}

export interface MediaOption {
  id: number
  src: string
  alt: string
  width: number
  height: number
  name: string
}

export async function mediaOptions(): Promise<MediaOption[]> {
  const rows = await db.select().from(s.media).orderBy(desc(s.media.createdAt))
  return rows.map((m) => ({ id: m.id, src: `/media/${m.path}`, alt: m.alt, width: m.width, height: m.height, name: m.originalName || m.path }))
}

/** Reúne tudo o que um formulário precisa: valores, opções de referências, relações, vocabulários e mídia. */
export async function loadForm(key: CollectionKey, id: number | null) {
  const def = COLLECTIONS[key]
  const fields = allFields(def)
  const options: Record<string, Option[]> = {}
  for (const f of fields) {
    if (f.type === 'reference' && f.collection) options[f.name] = await entityOptions(COLLECTIONS[f.collection].entity)
    else if (f.type === 'links' && f.entity) options[f.name] = (await entityOptions(f.entity)).filter((o) => !(f.entity === def.entity && id && o.value === String(id)))
    else if (f.type === 'select' && f.vocabulary) options[f.name] = await vocabularyOptions(f.vocabulary)
    else if (f.type === 'select' && f.options) options[f.name] = f.options
    else if (f.type === 'tags') options[f.name] = await tagOptions()
  }

  let values: Row = {}
  let row: Row | null = null
  if (id) {
    const table = TABLES[key]
    row = (await db.select().from(table).where(eq(table.id, id)))[0] ?? null
    if (!row) return null
    values = { ...row }
    for (const f of fields) {
      if (f.type === 'links' && f.entity) values[f.name] = (await getLinkedIds(def.entity, id, f.entity)).map(String)
      if (f.type === 'tags') {
        const tags = await db.select().from(s.entityTags).where(and(eq(s.entityTags.entityType, def.entity), eq(s.entityTags.entityId, id)))
        values[f.name] = tags.map((t) => String(t.termId))
      }
      if (f.type === 'gallery') {
        const items = await db
          .select()
          .from(s.mediaLinks)
          .where(and(eq(s.mediaLinks.entityType, def.entity), eq(s.mediaLinks.entityId, id)))
          .orderBy(asc(s.mediaLinks.sortOrder))
        values[f.name] = items.map((i) => String(i.mediaId))
      }
    }
  } else {
    values = { status: 'rascunho', canon: 'provisorio', spoiler: 0, provisional: true, certainty: 'desconhecido', reliability: 'desconhecido', accent: '#b8975a', volume: 1 }
  }

  let previewPath: string | null = null
  if (row) {
    let bookSlug: string | undefined
    if (key === 'capitulos') bookSlug = (await db.select({ slug: s.books.slug }).from(s.books).where(eq(s.books.id, row.bookId)))[0]?.slug
    if (key === 'ilustracoes') bookSlug = (await chapterContext(row.chapterId))?.book.slug
    previewPath = publicPathFor(key, row, { bookSlug })
  }

  return { def, values: serializeValues(values), options, media: await mediaOptions(), previewPath, row }
}

/** Capítulo e livro de uma ilustração. */
async function chapterContext(chapterId: number | null | undefined) {
  if (!chapterId) return null
  const [found] = await db
    .select({ chapter: s.chapters, book: s.books })
    .from(s.chapters)
    .innerJoin(s.books, eq(s.books.id, s.chapters.bookId))
    .where(eq(s.chapters.id, chapterId))
  return found ?? null
}

export interface IllustrationStatus {
  source: 'painel' | 'arquivo' | null
  src: string | null
  width: number
  height: number
  warnings: string[]
}

/** De onde vem a imagem de uma ilustração e se ela atende ao formato de impressão. */
export async function illustrationStatus(row: Row): Promise<IllustrationStatus> {
  const ctx = await chapterContext(row.chapterId)
  if (row.imageId) {
    const [m] = await db.select().from(s.media).where(eq(s.media.id, row.imageId))
    if (m) return { source: 'painel', src: `/media/${m.path}`, width: m.width, height: m.height, warnings: printWarnings(m.width, m.height) }
  }
  const file = ctx ? findIllustrationFile(ctx.book.volume, String(row.slug ?? '')) : null
  if (file) return { source: 'arquivo', src: file.src, width: file.width, height: file.height, warnings: printWarnings(file.width, file.height) }
  return { source: null, src: null, width: 0, height: 0, warnings: [] }
}

/** Converte valores para strings/arrays simples (campos de formulário). */
function serializeValues(values: Row): Record<string, string | string[] | boolean> {
  const out: Record<string, string | string[] | boolean> = {}
  for (const [k, v] of Object.entries(values)) {
    if (Array.isArray(v)) out[k] = v.map(String)
    else if (typeof v === 'boolean') out[k] = v
    else if (v === null || v === undefined) out[k] = ''
    else out[k] = String(v)
  }
  return out
}

// ── Listagem ────────────────────────────────────────────────────────────

export interface ListFilters {
  q?: string
  status?: string
  canon?: string
}

export async function listRows(key: CollectionKey, filters: ListFilters = {}) {
  const def = COLLECTIONS[key]
  const table = TABLES[key]
  const conditions: SQL[] = []
  if (filters.q) conditions.push(like(titleColumn(def), `%${filters.q}%`))
  if (filters.status && (PUBLICATION_STATES as readonly string[]).includes(filters.status)) conditions.push(eq(table.status, filters.status))
  if (filters.canon && (CANON_STATES as readonly string[]).includes(filters.canon)) conditions.push(eq(table.canon, filters.canon))
  const orderBy = key === 'publicacoes' ? [desc(sql`coalesce(${table.publishedAt}, ${table.createdAt})`)] : key === 'capitulos' ? [asc(table.bookId), asc(table.number)] : table.sortOrder ? [asc(table.sortOrder), asc(titleColumn(def))] : [asc(titleColumn(def))]
  const rows: Row[] = await db
    .select()
    .from(table)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderBy)

  // Rótulos legíveis para colunas de referência e vocabulário
  const labels: Record<string, Map<string, string>> = {}
  for (const name of def.listFields) {
    const field = allFields(def).find((f) => f.name === name)
    if (!field) continue
    if (field.type === 'reference' && field.collection) labels[name] = new Map((await entityOptions(COLLECTIONS[field.collection].entity)).map((o) => [o.value, o.label]))
    if (field.type === 'select') labels[name] = new Map((field.vocabulary ? await vocabularyOptions(field.vocabulary) : (field.options ?? [])).map((o) => [o.value, o.label]))
  }
  return rows.map((r) => ({
    id: r.id as number,
    title: String(r[def.titleField]),
    slug: (r.slug as string) ?? '',
    status: r.status as string,
    canon: r.canon as string,
    spoiler: r.spoiler as number,
    updatedAt: r.updatedAt as string,
    extra: def.listFields.map((name) => {
      const field = allFields(def).find((f) => f.name === name)
      const raw = r[name]
      let value = raw === null || raw === undefined || raw === '' ? '—' : String(raw)
      if (labels[name] && raw !== null && raw !== undefined) value = labels[name].get(String(raw)) ?? value
      if (field?.type === 'boolean') value = raw ? 'Sim' : 'Não'
      if (field?.type === 'date' && raw) value = String(raw).slice(0, 10)
      return { label: field?.label ?? name, value }
    }),
  }))
}

// ── Gravação ────────────────────────────────────────────────────────────

export interface SaveResult {
  ok: boolean
  id?: number
  errors: string[]
  values?: Record<string, string | string[] | boolean>
  message?: string
  version: number
}

function readField(f: FieldDef, form: FormData): unknown {
  switch (f.type) {
    case 'boolean':
      return form.get(f.name) === 'on'
    case 'number': {
      const raw = String(form.get(f.name) ?? '').trim()
      return raw === '' ? null : Number(raw)
    }
    case 'media':
    case 'reference': {
      const raw = String(form.get(f.name) ?? '').trim()
      return raw ? Number(raw) : null
    }
    case 'links':
    case 'tags':
    case 'gallery':
      return form
        .getAll(f.name)
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0)
    case 'date': {
      const raw = String(form.get(f.name) ?? '').trim()
      return raw ? new Date(`${raw}T12:00:00Z`).toISOString() : null
    }
    default:
      return String(form.get(f.name) ?? '').replace(/\r\n/g, '\n')
  }
}

export async function saveRow(key: CollectionKey, id: number | null, form: FormData): Promise<SaveResult> {
  const def = COLLECTIONS[key]
  const table = TABLES[key]
  const fields = allFields(def)
  const errors: string[] = []
  const submitted: Record<string, string | string[] | boolean> = {}
  for (const [k] of form.entries()) {
    const all = form.getAll(k).map(String)
    submitted[k] = all.length > 1 || ['__'].some((p) => k.startsWith(p)) ? all : (all[0] ?? '')
  }
  for (const f of fields) if (f.type === 'boolean') submitted[f.name] = form.get(f.name) === 'on'

  const row: Row = {}
  const relations: Array<{ field: FieldDef; ids: number[] }> = []
  for (const f of fields) {
    const value = readField(f, form)
    if (f.type === 'links' || f.type === 'tags' || f.type === 'gallery') {
      relations.push({ field: f, ids: value as number[] })
      continue
    }
    if (f.required && (value === null || value === '' || (typeof value === 'number' && Number.isNaN(value)))) errors.push(`Preencha o campo “${f.label}”.`)
    if (f.type === 'number' && typeof value === 'number' && !Number.isFinite(value)) errors.push(`“${f.label}” precisa ser um número.`)
    if (f.type === 'select' && value && f.options && !f.options.some((o) => o.value === value)) errors.push(`Valor inválido em “${f.label}”.`)
    if (f.type === 'color' && value && !/^#[0-9a-f]{6}$/i.test(String(value))) errors.push('A cor precisa estar no formato #rrggbb.')
    if (f.name === 'relatedHref' && value && !String(value).startsWith('/')) errors.push('O verbete relacionado precisa ser um endereço interno começando com /.')
    if (value === null && f.type === 'number') continue
    row[f.name] = value
  }

  // Campos editoriais
  const canon = String(form.get('canon') ?? 'provisorio')
  row.canon = def.hasCanon && (CANON_STATES as readonly string[]).includes(canon) ? canon : 'canonico'
  const spoiler = Number(form.get('spoiler') ?? 0)
  row.spoiler = (SPOILER_LEVELS as readonly number[]).includes(spoiler) ? spoiler : 0
  row.notes = String(form.get('notes') ?? '')

  let defaultSlug: string | null = null
  if (key === 'ilustracoes') {
    const ctx = await chapterContext(row.chapterId as number | null)
    if (!ctx) errors.push('Escolha um capítulo existente.')
    else {
      row.title = illustrationTitle(ctx.chapter.number, ctx.chapter.title)
      defaultSlug = defaultIllustrationSlug(ctx.chapter.number, ctx.chapter.title)
    }
  }

  if (def.hasSlug) {
    let slug = String(form.get('slug') ?? '').trim()
    if (!slug) slug = defaultSlug ?? slugify(String(row[def.titleField] ?? ''))
    if (!SLUG_PATTERN.test(slug)) errors.push('O identificador (slug) deve conter apenas letras minúsculas, números e hífens.')
    row.slug = slug
  }
  if (key === 'capitulos') row.slug = `capitulo-${row.number}`

  // Unicidade
  if (!errors.length) {
    const conflict: SQL[] = []
    if (key === 'verbetes') conflict.push(and(eq(table.section, row.section), eq(table.slug, row.slug))!)
    else if (key === 'capitulos') conflict.push(and(eq(table.bookId, row.bookId), eq(table.number, row.number))!)
    else if (def.hasSlug) conflict.push(eq(table.slug, row.slug))
    if (conflict.length) {
      const where = id ? and(conflict[0], ne(table.id, id)) : conflict[0]
      const [{ value }] = await db.select({ value: count() }).from(table).where(where)
      if (value > 0) errors.push(key === 'capitulos' ? 'Já existe um capítulo com este número neste livro.' : 'Já existe um item com este identificador (slug).')
    }
    if (key === 'ilustracoes') {
      const sameChapter = eq(table.chapterId, row.chapterId)
      const [{ value }] = await db.select({ value: count() }).from(table).where(id ? and(sameChapter, ne(table.id, id)) : sameChapter)
      if (value > 0) errors.push('Este capítulo já tem uma ilustração cadastrada.')
    }
  }

  const version = Date.now()
  if (errors.length) return { ok: false, errors, values: submitted, version }

  // Publicação
  const intent = String(form.get('intent') ?? 'salvar')
  const now = new Date().toISOString()
  let current: Row | null = null
  if (id) current = (await db.select().from(table).where(eq(table.id, id)))[0] ?? null
  if (id && !current) return { ok: false, errors: ['Item não encontrado.'], version }
  let status = current?.status ?? 'rascunho'
  if (intent === 'publicar') status = 'publicado'
  else if (intent === 'despublicar') status = 'rascunho'
  else if (intent === 'arquivar') status = 'arquivado'
  if (key === 'capitulos' && status === 'publicado' && !String(row.body ?? '').trim()) {
    return { ok: false, errors: ['Um capítulo só pode ser publicado com o trecho autorizado preenchido.'], values: submitted, version }
  }
  row.status = status
  if (status === 'publicado' && !row.publishedAt && !current?.publishedAt) row.publishedAt = now
  if (key !== 'publicacoes' && current?.publishedAt && !row.publishedAt) row.publishedAt = current.publishedAt
  row.updatedAt = now

  if (key === 'mapas' && row.isPrimary) await db.update(s.maps).set({ isPrimary: false }).where(id ? ne(s.maps.id, id) : undefined)

  let savedId = id
  if (id) {
    await db.update(table).set(row).where(eq(table.id, id))
  } else {
    const [created] = await db.insert(table).values(row).returning({ id: table.id })
    savedId = created.id
  }

  for (const { field, ids } of relations) {
    if (field.type === 'links' && field.entity) await replaceLinks(def.entity, savedId!, field.entity, ids)
    if (field.type === 'tags') {
      await db.delete(s.entityTags).where(and(eq(s.entityTags.entityType, def.entity), eq(s.entityTags.entityId, savedId!)))
      if (ids.length) await db.insert(s.entityTags).values([...new Set(ids)].map((termId) => ({ entityType: def.entity, entityId: savedId!, termId }))).onConflictDoNothing()
    }
    if (field.type === 'gallery') {
      await db.delete(s.mediaLinks).where(and(eq(s.mediaLinks.entityType, def.entity), eq(s.mediaLinks.entityId, savedId!)))
      if (ids.length) await db.insert(s.mediaLinks).values(ids.map((mediaId, i) => ({ entityType: def.entity, entityId: savedId!, mediaId, sortOrder: i })))
    }
  }

  if (key === 'capitulos') {
    await db
      .update(s.illustrations)
      .set({ title: illustrationTitle(Number(row.number), String(row.title)) })
      .where(eq(s.illustrations.chapterId, savedId!))
  }

  const messages: Record<string, string> = { publicar: 'Publicado.', despublicar: 'Retirado do site (rascunho).', arquivar: 'Arquivado.', salvar: 'Alterações salvas.' }
  let message = messages[intent] ?? 'Salvo.'
  if (key === 'ilustracoes') {
    const info = await illustrationStatus({ ...row, id: savedId })
    const notes = [...info.warnings]
    if (!info.src && row.artState !== 'pendente') notes.push('Ainda não há imagem para esta ilustração: o site mostrará “Arte em produção”.')
    if (notes.length) message += ` Atenção: ${notes.join(' ')}`
  }
  return { ok: true, id: savedId!, errors: [], message, version }
}

export async function setRowStatus(key: CollectionKey, id: number, status: 'rascunho' | 'publicado' | 'arquivado') {
  const table = TABLES[key]
  const now = new Date().toISOString()
  const [row] = await db.select().from(table).where(eq(table.id, id))
  if (!row) return
  // capítulo sem trecho autorizado nunca vai ao ar
  if (key === 'capitulos' && status === 'publicado' && !String(row.body ?? '').trim()) return
  await db
    .update(table)
    .set({ status, updatedAt: now, ...(status === 'publicado' && !row.publishedAt ? { publishedAt: now } : {}) })
    .where(eq(table.id, id))
}

export async function deleteRow(key: CollectionKey, id: number) {
  const def = COLLECTIONS[key]
  const table = TABLES[key]
  // Referências diretas que apontam para o item passam a ficar vazias
  if (key === 'reinos') {
    await db.update(s.locations).set({ kingdomId: null }).where(eq(s.locations.kingdomId, id))
    await db.update(s.characters).set({ kingdomId: null }).where(eq(s.characters.kingdomId, id))
    await db.update(s.mapMarkers).set({ kingdomId: null }).where(eq(s.mapMarkers.kingdomId, id))
  }
  if (key === 'locais') {
    await db.update(s.characters).set({ originLocationId: null }).where(eq(s.characters.originLocationId, id))
    await db.update(s.mapMarkers).set({ locationId: null }).where(eq(s.mapMarkers.locationId, id))
  }
  if (key === 'eras') await db.update(s.events).set({ eraId: null }).where(eq(s.events.eraId, id))
  if (key === 'personagens') await db.delete(s.characterRelations).where(or(eq(s.characterRelations.characterId, id), eq(s.characterRelations.relatedId, id)))
  if (key === 'mapas') await db.delete(s.mapMarkers).where(eq(s.mapMarkers.mapId, id))
  if (key === 'livros') {
    const chapterIds = (await db.select({ id: s.chapters.id }).from(s.chapters).where(eq(s.chapters.bookId, id))).map((c) => c.id)
    for (const cid of chapterIds) {
      await removeAllLinks('chapter', cid)
      await db.delete(s.illustrations).where(eq(s.illustrations.chapterId, cid))
    }
    await db.delete(s.chapters).where(eq(s.chapters.bookId, id))
  }
  if (key === 'capitulos') await db.delete(s.illustrations).where(eq(s.illustrations.chapterId, id))
  await removeAllLinks(def.entity, id)
  await db.delete(table).where(eq(table.id, id))
}

// ── Painel inicial ──────────────────────────────────────────────────────

export async function dashboard() {
  const stats = []
  for (const key of Object.keys(COLLECTIONS) as CollectionKey[]) {
    const table = TABLES[key]
    const rows = await db
      .select({ status: table.status, value: count() })
      .from(table)
      .groupBy(table.status)
    const by = Object.fromEntries(rows.map((r: { status: string; value: number }) => [r.status, r.value]))
    stats.push({ key, label: COLLECTIONS[key].label, publicado: by.publicado ?? 0, rascunho: by.rascunho ?? 0, arquivado: by.arquivado ?? 0 })
  }
  const recent: Array<{ key: CollectionKey; id: number; title: string; status: string; updatedAt: string }> = []
  for (const key of Object.keys(COLLECTIONS) as CollectionKey[]) {
    const def = COLLECTIONS[key]
    const table = TABLES[key]
    const rows: Row[] = await db.select().from(table).orderBy(desc(table.updatedAt)).limit(5)
    for (const r of rows) recent.push({ key, id: r.id, title: String(r[def.titleField]), status: r.status, updatedAt: r.updatedAt })
  }
  recent.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  const [{ value: mediaCount }] = await db.select({ value: count() }).from(s.media)
  return { stats, recent: recent.slice(0, 12), mediaCount }
}

export function entityLabel(entity: EntityType) {
  return ENTITY_LABELS[entity].singular
}

