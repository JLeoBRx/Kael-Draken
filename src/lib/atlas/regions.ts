import 'server-only'
import type { ImageData } from '../content/media'
import { getImages } from '../content/media'
import { listKingdoms } from '../content/queries'
import type { Viewer } from '../content/viewer'
import { CANON_INFO, type CanonState } from '../editorial'
import { paths } from '../routes'
import { ART, emblemArt } from './art'
import { WORLD, type Point } from './world'

export interface AtlasRegionView {
  id: string
  kingdomSlug: string
  /** O reino está publicado e visível para este visitante. */
  documented: boolean
  name: string
  epithet: string
  government: string
  summary: string
  canon: string
  canonLabel: string
  href: string | null
  accent: string
  image: (ImageData & { concept?: boolean }) | null
  emblem: ImageData | null
  polygon: Point[]
  label: Point
}

/** Junta a geometria conceitual (world.json) ao conteúdo editorial dos reinos (banco). */
export async function getAtlasRegions(viewer: Viewer): Promise<AtlasRegionView[]> {
  const kingdoms = await listKingdoms(viewer)
  const bySlug = new Map(kingdoms.map((k) => [k.slug, k]))
  const images = await getImages(kingdoms.map((k) => k.imageId))
  return WORLD.regioes.map((r) => {
    const k = bySlug.get(r.reino)
    const dbImage = k?.imageId ? (images.get(k.imageId) ?? null) : null
    return {
      id: r.id,
      kingdomSlug: r.reino,
      documented: !!k,
      name: k?.name ?? 'Região não documentada',
      epithet: k?.epithet ?? '',
      government: k?.government ?? '',
      summary: k?.summary ?? 'Esta região ainda está em desenvolvimento.',
      canon: k?.canon ?? 'em_desenvolvimento',
      canonLabel: CANON_INFO[(k?.canon ?? 'em_desenvolvimento') as CanonState].label,
      href: k ? paths.kingdom(k.slug) : null,
      accent: k?.accent ?? '#8a847b',
      image: dbImage ?? ART.reino[r.reino] ?? null,
      emblem: k?.emblem ?? emblemArt(r.reino),
      polygon: r.poligono,
      label: r.rotulo,
    }
  })
}
