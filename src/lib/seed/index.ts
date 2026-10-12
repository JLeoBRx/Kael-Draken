import { and, count, eq } from 'drizzle-orm'
import type { Database } from '../db/connect'
import * as s from '../db/schema'
import type { EntityType, Vocabulary } from '../editorial'
import { normalizePair } from '../content/link-pairs'
import { illustrationTitle } from '../illustrations'
import {
  SEED_ARTICLES,
  LEGACY_BOOK_SYNOPSIS,
  LEGACY_SAFRA_BODY,
  MANUSCRIPT_AUTHOR,
  OFFICIAL_BOOK_SYNOPSIS,
  SAFRA_BODY,
  SEED_BOOK,
  SEED_CHAPTERS,
  SEED_CHARACTERS,
  SEED_DOCUMENTS,
  SEED_ERAS,
  SEED_EVENTS,
  SEED_ILLUSTRATIONS,
  SEED_KINGDOMS,
  SEED_LOCATIONS,
  SEED_MYSTERIES,
  SEED_POST,
  SEED_SETTINGS,
  SEED_TERMS,
} from './content'

/**
 * Carrega o conteúdo inicial confirmado. Só executa em um banco vazio
 * (sem reinos cadastrados), para nunca sobrescrever o trabalho editorial.
 */
export async function seedDatabase(db: Database, opts: { log?: (msg: string) => void } = {}): Promise<boolean> {
  const log = opts.log ?? (() => {})
  const [{ value: existing }] = await db.select({ value: count() }).from(s.kingdoms)
  if (existing > 0) {
    log('O banco já possui conteúdo — carga inicial ignorada.')
    return false
  }

  const now = new Date().toISOString()
  const published = { status: 'publicado' as const, publishedAt: now }

  await db.transaction(async (tx) => {
    // Vocabulários
    const termIds = new Map<string, number>()
    for (const [vocabulary, entries] of Object.entries(SEED_TERMS) as [Vocabulary, Array<[string, string]>][]) {
      let order = 0
      for (const [slug, label] of entries) {
        const [row] = await tx
          .insert(s.terms)
          .values({ vocabulary, slug, label, sortOrder: order++ })
          .returning({ id: s.terms.id })
        termIds.set(`${vocabulary}:${slug}`, row.id)
      }
    }

    const linkRows: Array<{ aType: string; aId: number; bType: string; bId: number }> = []
    const link = (t1: EntityType, id1: number, t2: EntityType, id2: number) => linkRows.push(normalizePair(t1, id1, t2, id2))

    // Reinos
    const kingdomIds = new Map<string, number>()
    let order = 0
    for (const k of SEED_KINGDOMS) {
      const [row] = await tx
        .insert(s.kingdoms)
        .values({
          slug: k.slug,
          name: k.name,
          epithet: k.epithet ?? '',
          government: k.government ?? '',
          summary: k.summary,
          body: k.body ?? '',
          resonance: k.resonance ?? '',
          history: k.history ?? '',
          relations: k.relations ?? '',
          mysteries: k.mysteries ?? '',
          accent: k.accent,
          sortOrder: order++,
          canon: k.canon,
          spoiler: k.spoiler ?? 0,
          notes: k.notes ?? '',
          ...published,
        })
        .returning({ id: s.kingdoms.id })
      kingdomIds.set(k.slug, row.id)
    }

    // Locais
    const locationIds = new Map<string, number>()
    order = 0
    for (const l of SEED_LOCATIONS) {
      const [row] = await tx
        .insert(s.locations)
        .values({
          slug: l.slug,
          name: l.name,
          kingdomId: l.kingdom ? kingdomIds.get(l.kingdom) : null,
          category: l.category,
          summary: l.summary,
          body: l.body ?? '',
          history: l.history ?? '',
          sortOrder: order++,
          canon: l.canon,
          spoiler: l.spoiler ?? 0,
          notes: l.notes ?? '',
          ...published,
        })
        .returning({ id: s.locations.id })
      locationIds.set(l.slug, row.id)
    }

    // Personagens
    const characterIds = new Map<string, number>()
    for (const c of SEED_CHARACTERS) {
      const [row] = await tx
        .insert(s.characters)
        .values({
          slug: c.slug,
          name: c.name,
          age: c.age ?? '',
          role: c.role,
          originLocationId: c.origin ? locationIds.get(c.origin) : null,
          summary: c.summary,
          personality: c.personality ?? '',
          history: c.history ?? '',
          family: c.family ?? '',
          storyRole: c.storyRole ?? '',
          secrets: c.secrets ?? '',
          canon: c.canon,
          spoiler: c.spoiler ?? 0,
          notes: c.notes ?? '',
          ...published,
        })
        .returning({ id: s.characters.id })
      characterIds.set(c.slug, row.id)
      if (c.origin && locationIds.has(c.origin)) link('character', row.id, 'location', locationIds.get(c.origin)!)
    }

    // Eras e acontecimentos
    const eraIds = new Map<string, number>()
    order = 0
    for (const e of SEED_ERAS) {
      const [row] = await tx
        .insert(s.eras)
        .values({
          slug: e.slug,
          name: e.name,
          dateLabel: e.dateLabel,
          summary: e.summary,
          sortOrder: order++,
          canon: e.canon,
          notes: e.notes ?? '',
          ...published,
        })
        .returning({ id: s.eras.id })
      eraIds.set(e.slug, row.id)
    }

    order = 0
    for (const ev of SEED_EVENTS) {
      const [row] = await tx
        .insert(s.events)
        .values({
          slug: ev.slug,
          title: ev.title,
          eraId: ev.era ? eraIds.get(ev.era) : null,
          dateLabel: ev.dateLabel,
          sortOrder: (order += 10),
          certainty: ev.certainty,
          eventType: ev.eventType,
          summary: ev.summary,
          body: ev.body ?? '',
          canon: ev.canon,
          spoiler: ev.spoiler ?? 0,
          notes: ev.notes ?? '',
          ...published,
        })
        .returning({ id: s.events.id })
      for (const k of ev.kingdoms ?? []) link('kingdom', kingdomIds.get(k)!, 'event', row.id)
      for (const l of ev.locations ?? []) link('location', locationIds.get(l)!, 'event', row.id)
      for (const c of ev.characters ?? []) link('character', characterIds.get(c)!, 'event', row.id)
    }

    // Verbetes de mitologia e da Ressonância
    const sectionOrder = { mitologia: 0, ressonancia: 0 }
    for (const a of SEED_ARTICLES) {
      await tx.insert(s.articles).values({
        section: a.section,
        group: a.group,
        slug: a.slug,
        title: a.title,
        subtitle: a.subtitle ?? '',
        summary: a.summary,
        body: a.body ?? '',
        sortOrder: sectionOrder[a.section]++,
        canon: a.canon,
        spoiler: a.spoiler ?? 0,
        notes: a.notes ?? '',
        ...published,
      })
    }

    // Mistérios preservados
    order = 0
    for (const m of SEED_MYSTERIES) {
      await tx.insert(s.mysteries).values({
        slug: m.slug,
        title: m.title,
        description: m.description,
        relatedHref: m.relatedHref,
        sortOrder: order++,
        canon: 'desconhecido',
        spoiler: m.spoiler ?? 0,
        ...published,
      })
    }

    // Manuscritos
    for (const d of SEED_DOCUMENTS) {
      const [row] = await tx
        .insert(s.documents)
        .values({
          slug: d.slug,
          title: d.title,
          docType: d.docType,
          excerpt: d.excerpt,
          transcription: d.transcription,
          origin: d.origin,
          dateLabel: d.dateLabel,
          context: d.context,
          reliability: d.reliability,
          canon: d.canon,
          spoiler: d.spoiler ?? 0,
          ...published,
        })
        .returning({ id: s.documents.id })
      for (const tag of d.tags ?? []) {
        const termId = termIds.get(`tag:${tag}`)
        if (termId) await tx.insert(s.entityTags).values({ entityType: 'document', entityId: row.id, termId })
      }
    }


    // Livro I
    await tx.insert(s.books).values({
      slug: SEED_BOOK.slug,
      volume: SEED_BOOK.volume,
      title: SEED_BOOK.title,
      subtitle: SEED_BOOK.subtitle,
      synopsis: SEED_BOOK.synopsis,
      synopsisOfficial: true,
      editorialInfo: SEED_BOOK.editorialInfo,
      canon: 'canonico',
      notes: 'Sinopse oficial transcrita da contracapa do Livro I.',
      ...published,
    })

    // Novidades
    await tx.insert(s.posts).values({
      slug: SEED_POST.slug,
      title: SEED_POST.title,
      category: SEED_POST.category,
      excerpt: SEED_POST.excerpt,
      body: SEED_POST.body,
      canon: 'canonico',
      ...published,
    })

    if (linkRows.length) await tx.insert(s.links).values(linkRows).onConflictDoNothing()

    for (const [key, value] of Object.entries(SEED_SETTINGS)) {
      await tx.insert(s.settings).values({ key, value }).onConflictDoNothing()
    }
  })

  await ensureBookIllustrations(db, opts)
  log('Conteúdo inicial carregado.')
  return true
}

/** Marca, em settings, que a carga das ilustrações do Livro I já foi feita. */
export const ILLUSTRATIONS_SEED_KEY = 'seed_ilustracoes_livro_1'

/**
 * Acrescenta, uma única vez, os capítulos I–X do Livro I (como rascunho, só
 * com o título) e os registros de ilustração de cada um. Funciona também em
 * bancos que já têm conteúdo: não altera capítulos existentes e não recria
 * nada depois de executada (o painel passa a ser a fonte da verdade).
 */
export async function ensureBookIllustrations(db: Database, opts: { log?: (msg: string) => void } = {}): Promise<boolean> {
  const log = opts.log ?? (() => {})
  const [done] = await db.select().from(s.settings).where(eq(s.settings.key, ILLUSTRATIONS_SEED_KEY))
  if (done) return false
  const [book] = await db.select().from(s.books).where(eq(s.books.slug, SEED_BOOK.slug))
  if (!book) return false

  const now = new Date().toISOString()
  let created = 0
  await db.transaction(async (tx) => {
    const chapterIds = new Map<number, { id: number; title: string }>()
    for (const ch of SEED_CHAPTERS) {
      const [existing] = await tx.select().from(s.chapters).where(and(eq(s.chapters.bookId, book.id), eq(s.chapters.number, ch.number)))
      if (existing) {
        chapterIds.set(ch.number, { id: existing.id, title: existing.title })
        continue
      }
      const [row] = await tx
        .insert(s.chapters)
        .values({
          bookId: book.id,
          number: ch.number,
          slug: `capitulo-${ch.number}`,
          title: ch.title,
          canon: 'canonico',
          status: 'rascunho',
          notes: 'Registro criado para organizar as ilustrações. O texto do capítulo não é publicado automaticamente: cole aqui apenas trechos autorizados.',
        })
        .returning({ id: s.chapters.id })
      chapterIds.set(ch.number, { id: row.id, title: ch.title })
    }

    for (const ill of SEED_ILLUSTRATIONS) {
      const chapter = chapterIds.get(ill.chapter)
      if (!chapter) continue
      const [byChapter] = await tx.select({ id: s.illustrations.id }).from(s.illustrations).where(eq(s.illustrations.chapterId, chapter.id))
      const [bySlug] = await tx.select({ id: s.illustrations.id }).from(s.illustrations).where(eq(s.illustrations.slug, ill.slug))
      if (byChapter || bySlug) continue
      await tx.insert(s.illustrations).values({
        chapterId: chapter.id,
        slug: ill.slug,
        title: illustrationTitle(ill.chapter, chapter.title),
        artState: ill.artState,
        alt: ill.alt,
        caption: ill.caption,
        credit: '',
        direction: ill.direction,
        canon: 'canonico',
        status: 'publicado',
        publishedAt: now,
        notes: ill.notes,
      })
      created++
    }
    await tx.insert(s.settings).values({ key: ILLUSTRATIONS_SEED_KEY, value: now }).onConflictDoNothing()
  })
  log(`Ilustrações do Livro I: ${created} registro(s) criado(s).`)
  return true
}

/** Garante a existência das configurações padrão (útil após atualizações). */
export async function ensureSettings(db: Database) {
  for (const [key, value] of Object.entries(SEED_SETTINGS)) {
    const existing = await db.select().from(s.settings).where(eq(s.settings.key, key))
    if (!existing.length) await db.insert(s.settings).values({ key, value })
  }
}

/** Marca, em settings, que a sinopse oficial já foi aplicada ao Livro I. */
export const SYNOPSIS_UPDATE_KEY = 'seed_sinopse_oficial_livro_1'

/**
 * Troca, uma única vez, a apresentação provisória do Livro I pela sinopse
 * oficial da contracapa — apenas se o texto provisório continuar intacto
 * (nada editado no painel é sobrescrito).
 */
export async function ensureOfficialSynopsis(db: Database, opts: { log?: (msg: string) => void } = {}): Promise<boolean> {
  const log = opts.log ?? (() => {})
  const [done] = await db.select().from(s.settings).where(eq(s.settings.key, SYNOPSIS_UPDATE_KEY))
  if (done) return false
  const [book] = await db.select().from(s.books).where(eq(s.books.slug, SEED_BOOK.slug))
  if (!book) return false
  const now = new Date().toISOString()
  let changed = false
  if (!book.synopsisOfficial && book.synopsis.trim() === LEGACY_BOOK_SYNOPSIS.trim()) {
    await db.update(s.books).set({ synopsis: OFFICIAL_BOOK_SYNOPSIS, synopsisOfficial: true, updatedAt: now }).where(eq(s.books.id, book.id))
    changed = true
  }
  await db.insert(s.settings).values({ key: SYNOPSIS_UPDATE_KEY, value: now }).onConflictDoNothing()
  if (changed) log('Livro I: sinopse oficial da contracapa aplicada.')
  return changed
}

/** Marca, em settings, que o verbete de Safra já recebeu a carta do mundo conhecido. */
export const SAFRA_ART_UPDATE_KEY = 'seed_safra_carta_conhecida'

/**
 * Troca, uma única vez, as três imagens procedurais do verbete "Safra e a
 * Noite das Cinzas" pela carta do mundo conhecido (versão do manuscrito) —
 * apenas se o texto carregado inicialmente continuar intacto.
 */
export async function ensureSafraArticleArt(db: Database, opts: { log?: (msg: string) => void } = {}): Promise<boolean> {
  const log = opts.log ?? (() => {})
  const [done] = await db.select().from(s.settings).where(eq(s.settings.key, SAFRA_ART_UPDATE_KEY))
  if (done) return false
  const now = new Date().toISOString()
  const [article] = await db
    .select()
    .from(s.articles)
    .where(and(eq(s.articles.section, 'mitologia'), eq(s.articles.slug, 'safra-e-a-noite-das-cinzas')))
  let changed = false
  if (article && article.body.trim() === LEGACY_SAFRA_BODY.trim()) {
    await db.update(s.articles).set({ body: SAFRA_BODY, updatedAt: now }).where(eq(s.articles.id, article.id))
    changed = true
  }
  await db.insert(s.settings).values({ key: SAFRA_ART_UPDATE_KEY, value: now }).onConflictDoNothing()
  if (changed) log('Verbete de Safra: carta do mundo conhecido no lugar das imagens procedurais.')
  return changed
}

/** Marca, em settings, que o crédito do autor já foi preenchido a partir do manuscrito. */
export const AUTHOR_UPDATE_KEY = 'seed_autor_manuscrito'

/** Preenche, uma única vez, o nome do autor do rodapé — só se o campo ainda estiver vazio. */
export async function ensureAuthorCredit(db: Database, opts: { log?: (msg: string) => void } = {}): Promise<boolean> {
  const log = opts.log ?? (() => {})
  const [done] = await db.select().from(s.settings).where(eq(s.settings.key, AUTHOR_UPDATE_KEY))
  if (done) return false
  const now = new Date().toISOString()
  const [current] = await db.select().from(s.settings).where(eq(s.settings.key, 'author_name'))
  let changed = false
  if (!current?.value.trim()) {
    await db.insert(s.settings).values({ key: 'author_name', value: MANUSCRIPT_AUTHOR }).onConflictDoUpdate({ target: s.settings.key, set: { value: MANUSCRIPT_AUTHOR } })
    changed = true
  }
  await db.insert(s.settings).values({ key: AUTHOR_UPDATE_KEY, value: now }).onConflictDoNothing()
  if (changed) log('Crédito do autor preenchido a partir do manuscrito.')
  return changed
}

/** Atualizações de conteúdo aplicadas uma única vez na inicialização. */
export async function ensureContentUpdates(db: Database, opts: { log?: (msg: string) => void } = {}) {
  await ensureBookIllustrations(db, opts)
  await ensureOfficialSynopsis(db, opts)
  await ensureSafraArticleArt(db, opts)
  await ensureAuthorCredit(db, opts)
}
