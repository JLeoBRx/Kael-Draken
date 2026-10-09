import { count, eq } from 'drizzle-orm'
import type { Database } from '../db/connect'
import * as s from '../db/schema'
import type { EntityType, Vocabulary } from '../editorial'
import { normalizePair } from '../content/link-pairs'
import {
  SEED_ARTICLES,
  SEED_BOOK,
  SEED_CHARACTERS,
  SEED_DOCUMENTS,
  SEED_ERAS,
  SEED_EVENTS,
  SEED_KINGDOMS,
  SEED_LOCATIONS,
  SEED_MAP,
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

    // Atlas
    await tx.insert(s.maps).values({
      slug: SEED_MAP.slug,
      title: SEED_MAP.title,
      description: SEED_MAP.description,
      isPrimary: true,
      provisional: true,
      canon: 'em_desenvolvimento',
      ...published,
    })

    // Livro I
    await tx.insert(s.books).values({
      slug: SEED_BOOK.slug,
      volume: SEED_BOOK.volume,
      title: SEED_BOOK.title,
      subtitle: SEED_BOOK.subtitle,
      synopsis: SEED_BOOK.synopsis,
      synopsisOfficial: false,
      editorialInfo: SEED_BOOK.editorialInfo,
      canon: 'canonico',
      notes: 'A sinopse acima é uma apresentação provisória escrita a partir da bíblia narrativa. Substituir pela sinopse oficial e marcar "Sinopse oficial".',
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

  log('Conteúdo inicial carregado.')
  return true
}

/** Garante a existência das configurações padrão (útil após atualizações). */
export async function ensureSettings(db: Database) {
  for (const [key, value] of Object.entries(SEED_SETTINGS)) {
    const existing = await db.select().from(s.settings).where(eq(s.settings.key, key))
    if (!existing.length) await db.insert(s.settings).values({ key, value })
  }
}
