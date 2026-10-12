import 'server-only'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { asc, eq, inArray, and } from 'drizzle-orm'
import { imageSize } from 'image-size'
import { db, schema as s } from '../db'
import type { EntityType } from '../editorial'

export interface ImageData {
  id?: number
  src: string
  width: number
  height: number
  alt: string
  caption?: string
  credit?: string
  /** Enquadramento quando a imagem é recortada (valor de object-position). */
  focus?: string
}

/** Imagem de destaque que pode ser apresentada como prancha (título, legenda e link). */
export interface FeatureImage extends ImageData {
  kicker?: string
  title?: string
  href?: string
  hrefLabel?: string
  /** Observação editorial exibida junto à legenda (por exemplo, "Estudo — arte provisória"). */
  note?: string
}

type MediaRow = typeof s.media.$inferSelect

export function toImage(row: MediaRow): ImageData {
  return {
    id: row.id,
    src: `/media/${row.path}`,
    width: row.width || 1200,
    height: row.height || 800,
    alt: row.alt,
    caption: row.caption,
    credit: row.credit,
  }
}

export async function getImages(ids: Array<number | null | undefined>): Promise<Map<number, ImageData>> {
  const unique = [...new Set(ids.filter((id): id is number => typeof id === 'number'))]
  if (!unique.length) return new Map()
  const rows = await db.select().from(s.media).where(inArray(s.media.id, unique))
  return new Map(rows.map((row) => [row.id, toImage(row)]))
}

export async function getImage(id: number | null | undefined): Promise<ImageData | null> {
  if (!id) return null
  return (await getImages([id])).get(id) ?? null
}

export async function getGallery(entityType: EntityType, entityId: number): Promise<ImageData[]> {
  const rows = await db
    .select({ media: s.media })
    .from(s.mediaLinks)
    .innerJoin(s.media, eq(s.media.id, s.mediaLinks.mediaId))
    .where(and(eq(s.mediaLinks.entityType, entityType), eq(s.mediaLinks.entityId, entityId)))
    .orderBy(asc(s.mediaLinks.sortOrder))
  return rows.map((r) => toImage(r.media))
}

const COVER_CANDIDATES = ['capa-oficial.jpg', 'capa-oficial.jpeg', 'capa-oficial.png', 'capa-oficial.webp']

/**
 * Capa oficial aprovada. Ordem de prioridade:
 * 1. Imagem escolhida no painel (Configurações → Capa oficial);
 * 2. Arquivo versionado em public/capa/capa-oficial.(jpg|png|webp);
 * Sem nenhuma das duas, o site exibe uma moldura neutra — nunca uma capa redesenhada.
 */
export async function getOfficialCover(settingValue: string | undefined, alt: string): Promise<ImageData | null> {
  const id = Number(settingValue)
  if (Number.isInteger(id) && id > 0) {
    const image = await getImage(id)
    if (image) return { ...image, alt: image.alt || alt }
  }
  for (const name of COVER_CANDIDATES) {
    const file = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'capa', name)
    if (existsSync(file)) {
      try {
        const size = imageSize(readFileSync(file))
        return { src: `/capa/${name}`, width: size.width ?? 1200, height: size.height ?? 1800, alt }
      } catch {
        return { src: `/capa/${name}`, width: 1200, height: 1800, alt }
      }
    }
  }
  return null
}

const FULL_COVER_CANDIDATES = ['capa-completa.webp', 'capa-completa.jpg', 'capa-completa.jpeg', 'capa-completa.png']

/** Capa completa (contracapa, lombada e capa), se houver um arquivo em public/capa/. */
export function getFullCover(alt: string): ImageData | null {
  for (const name of FULL_COVER_CANDIDATES) {
    const file = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'capa', name)
    if (existsSync(file)) {
      try {
        const size = imageSize(readFileSync(file))
        return { src: `/capa/${name}`, width: size.width ?? 2000, height: size.height ?? 1333, alt }
      } catch {
        return { src: `/capa/${name}`, width: 2000, height: 1333, alt }
      }
    }
  }
  return null
}
