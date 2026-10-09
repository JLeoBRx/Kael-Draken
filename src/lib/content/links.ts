import 'server-only'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { db, schema as s } from '../db'
import type { EntityType } from '../editorial'
import { normalizeTarget, type ResolvedLink } from '../markdown/render'
import { paths } from '../routes'
import { normalizePair, selfIsA } from './link-pairs'
import type { Viewer } from './viewer'
import { isVisible } from './visibility'

/** Ids de entidades do tipo `other` relacionadas à entidade informada. */
export async function getLinkedIds(selfType: EntityType, selfId: number, otherType: EntityType): Promise<number[]> {
  if (selfIsA(selfType, otherType)) {
    const rows = await db
      .select({ id: s.links.bId })
      .from(s.links)
      .where(and(eq(s.links.aType, selfType), eq(s.links.aId, selfId), eq(s.links.bType, otherType)))
    return rows.map((r) => r.id)
  }
  const rows = await db
    .select({ id: s.links.aId })
    .from(s.links)
    .where(and(eq(s.links.bType, selfType), eq(s.links.bId, selfId), eq(s.links.aType, otherType)))
  return rows.map((r) => r.id)
}

/** Substitui todas as relações entre a entidade e um tipo de destino. */
export async function replaceLinks(selfType: EntityType, selfId: number, otherType: EntityType, ids: number[]) {
  if (selfIsA(selfType, otherType)) {
    await db.delete(s.links).where(and(eq(s.links.aType, selfType), eq(s.links.aId, selfId), eq(s.links.bType, otherType)))
  } else {
    await db.delete(s.links).where(and(eq(s.links.bType, selfType), eq(s.links.bId, selfId), eq(s.links.aType, otherType)))
  }
  const unique = [...new Set(ids)].filter((id) => !(selfType === otherType && id === selfId))
  if (unique.length) {
    await db
      .insert(s.links)
      .values(unique.map((id) => normalizePair(selfType, selfId, otherType, id)))
      .onConflictDoNothing()
  }
}

/** Remove todas as referências de uma entidade excluída. */
export async function removeAllLinks(type: EntityType, id: number) {
  await db.delete(s.links).where(and(eq(s.links.aType, type), eq(s.links.aId, id)))
  await db.delete(s.links).where(and(eq(s.links.bType, type), eq(s.links.bId, id)))
  await db.delete(s.mediaLinks).where(and(eq(s.mediaLinks.entityType, type), eq(s.mediaLinks.entityId, id)))
  await db.delete(s.entityTags).where(and(eq(s.entityTags.entityType, type), eq(s.entityTags.entityId, id)))
}

const ROOTS: Record<string, ResolvedLink> = {
  atlas: { href: paths.atlas, title: 'Atlas dos Seis Reinos' },
  personagens: { href: paths.characters, title: 'Personagens' },
  locais: { href: paths.locations, title: 'Cidades e locais' },
  mitologia: { href: paths.mythology, title: 'Mitologia' },
  ressonancia: { href: paths.resonance, title: 'Sistema da Ressonância' },
  cronologia: { href: paths.timeline, title: 'Cronologia' },
  manuscritos: { href: paths.documents, title: 'Manuscritos' },
  livros: { href: paths.books, title: 'Livros' },
  novidades: { href: paths.news, title: 'Novidades' },
}

/**
 * Resolve referências internas [[tipo/slug]] contra o banco, respeitando a
 * visibilidade do visitante. Alvos ocultos ou inexistentes resolvem para null.
 */
export async function resolveWikiTargets(targets: string[], viewer: Viewer): Promise<Map<string, ResolvedLink | null>> {
  const result = new Map<string, ResolvedLink | null>()
  const bySection = new Map<string, string[]>()
  for (const raw of targets) {
    const target = normalizeTarget(raw)
    if (ROOTS[target]) {
      result.set(target, ROOTS[target])
      continue
    }
    const [section, ...rest] = target.split('/')
    const slug = rest.join('/')
    result.set(target, null)
    if (!slug) continue
    bySection.set(section, [...(bySection.get(section) ?? []), slug])
  }

  const visibleRows = async <T extends { slug: string; status: string; canon: string; spoiler: number }>(
    section: string,
    rows: T[],
    toLink: (row: T) => ResolvedLink,
  ) => {
    for (const row of rows) {
      if (isVisible(row, viewer)) result.set(`${section}/${row.slug}`, toLink(row))
    }
  }

  for (const [section, slugs] of bySection) {
    switch (section) {
      case 'reinos': {
        const rows = await db.select().from(s.kingdoms).where(inArray(s.kingdoms.slug, slugs))
        await visibleRows(section, rows, (r) => ({ href: paths.kingdom(r.slug), title: r.name }))
        break
      }
      case 'locais': {
        const rows = await db.select().from(s.locations).where(inArray(s.locations.slug, slugs))
        await visibleRows(section, rows, (r) => ({ href: paths.location(r.slug), title: r.name }))
        break
      }
      case 'personagens': {
        const rows = await db.select().from(s.characters).where(inArray(s.characters.slug, slugs))
        await visibleRows(section, rows, (r) => ({ href: paths.character(r.slug), title: r.name }))
        break
      }
      case 'mitologia':
      case 'ressonancia': {
        const rows = await db
          .select()
          .from(s.articles)
          .where(and(eq(s.articles.section, section), inArray(s.articles.slug, slugs)))
        await visibleRows(section, rows, (r) => ({ href: paths.article(r.section, r.slug), title: r.title }))
        break
      }
      case 'manuscritos': {
        const rows = await db.select().from(s.documents).where(inArray(s.documents.slug, slugs))
        await visibleRows(section, rows, (r) => ({ href: paths.document(r.slug), title: r.title }))
        break
      }
      case 'cronologia': {
        const rows = await db.select().from(s.events).where(inArray(s.events.slug, slugs))
        await visibleRows(section, rows, (r) => ({ href: paths.event(r.slug), title: r.title }))
        break
      }
      case 'livros': {
        const rows = await db.select().from(s.books).where(inArray(s.books.slug, slugs))
        await visibleRows(section, rows, (r) => ({ href: paths.book(r.slug), title: r.title }))
        break
      }
      case 'novidades': {
        const rows = await db.select().from(s.posts).where(and(inArray(s.posts.slug, slugs), ne(s.posts.status, 'arquivado')))
        await visibleRows(section, rows, (r) => ({ href: paths.post(r.slug), title: r.title }))
        break
      }
      case 'atlas': {
        const mapSlugs = slugs.filter((x) => x.startsWith('mapas/')).map((x) => x.slice('mapas/'.length))
        if (!mapSlugs.length) break
        const rows = await db.select().from(s.maps).where(inArray(s.maps.slug, mapSlugs))
        for (const r of rows) if (isVisible(r, viewer)) result.set(`atlas/mapas/${r.slug}`, { href: paths.map(r.slug), title: r.title })
        break
      }
    }
  }
  return result
}
