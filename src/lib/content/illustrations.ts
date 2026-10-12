import 'server-only'
import { closeSync, openSync, readSync, statSync } from 'node:fs'
import path from 'node:path'
import { and, asc, eq, lte, ne, type SQL } from 'drizzle-orm'
import { imageSize } from 'image-size'
import { db, schema as s } from '../db'
import { ART_INFO, type ArtState } from '../editorial'
import { chapterLabel, ILLUSTRATION_EXTENSIONS, illustrationPublicDir, type IllustrationItem } from '../illustrations'
import { toRoman } from '../format'
import { paths } from '../routes'
import { SLUG_PATTERN } from '../slug'
import { getImages, type FeatureImage, type ImageData } from './media'
import type { Viewer } from './viewer'
import { isVisible, listable } from './visibility'

export interface IllustrationView {
  id: number
  slug: string
  number: number
  roman: string
  label: string
  chapterTitle: string
  /** Estado exibido: sem imagem disponível, é sempre "pendente". */
  artState: ArtState
  stateLabel: string
  stateDescription: string
  image: ImageData | null
  caption: string
  credit: string
  chapterHref: string | null
  status: string
  spoiler: number
}

interface BookRef {
  id: number
  slug: string
  volume: number
}

// ── Arquivos versionados em public/images/livro-N/ilustracoes ─────────────

const sizeCache = new Map<string, { mtime: number; width: number; height: number }>()

function readDimensions(file: string): { width: number; height: number } | null {
  let stat
  try {
    stat = statSync(file)
  } catch {
    return null
  }
  const cached = sizeCache.get(file)
  if (cached && cached.mtime === stat.mtimeMs) return cached
  try {
    // O cabeçalho basta para ler as dimensões; evita carregar o arquivo inteiro.
    const fd = openSync(file, 'r')
    const buffer = Buffer.alloc(Math.min(stat.size, 256 * 1024))
    readSync(fd, buffer, 0, buffer.length, 0)
    closeSync(fd)
    const size = imageSize(buffer)
    if (!size.width || !size.height) return null
    const entry = { mtime: stat.mtimeMs, width: size.width, height: size.height }
    sizeCache.set(file, entry)
    return entry
  } catch {
    return null
  }
}

/** Procura o arquivo versionado de uma ilustração pelo identificador (slug). */
export function findIllustrationFile(volume: number, slug: string): { src: string; width: number; height: number } | null {
  if (!SLUG_PATTERN.test(slug)) return null
  const dir = illustrationPublicDir(volume)
  for (const ext of ILLUSTRATION_EXTENSIONS) {
    const file = path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', dir, `${slug}.${ext}`)
    const size = readDimensions(file)
    if (size) return { src: `${dir}/${slug}.${ext}`, width: size.width, height: size.height }
  }
  return null
}

// ── Consultas ─────────────────────────────────────────────────────────────

type IllustrationRow = typeof s.illustrations.$inferSelect
type ChapterRow = typeof s.chapters.$inferSelect

/** Capítulos descartados ou acima do nível de spoiler levam a ilustração junto. */
function chapterCondition(viewer: Viewer): SQL {
  if (viewer.preview) return and(ne(s.chapters.status, 'arquivado'), ne(s.chapters.canon, 'arquivado'))!
  return and(ne(s.chapters.status, 'arquivado'), ne(s.chapters.canon, 'arquivado'), lte(s.chapters.spoiler, viewer.spoiler))!
}

async function toViews(book: BookRef, rows: Array<{ illustration: IllustrationRow; chapter: ChapterRow }>, viewer: Viewer): Promise<IllustrationView[]> {
  const media = await getImages(rows.map((r) => (r.illustration.artState === 'pendente' ? null : r.illustration.imageId)))
  return rows.map(({ illustration: ill, chapter }) => {
    const label = chapterLabel(chapter.number)
    const alt = ill.alt || `Ilustração do ${label.toLowerCase()}: ${chapter.title}`
    let image: ImageData | null = null
    if (ill.artState !== 'pendente') {
      const uploaded = ill.imageId ? media.get(ill.imageId) : undefined
      if (uploaded) image = { ...uploaded, alt: ill.alt || uploaded.alt || alt }
      else {
        const file = findIllustrationFile(book.volume, ill.slug)
        if (file) image = { ...file, alt }
      }
    }
    const artState: ArtState = image ? ill.artState : 'pendente'
    return {
      id: ill.id,
      slug: ill.slug,
      number: chapter.number,
      roman: toRoman(chapter.number),
      label,
      chapterTitle: chapter.title,
      artState,
      stateLabel: ART_INFO[artState].label,
      stateDescription: ART_INFO[artState].description,
      image,
      caption: ill.caption,
      credit: image ? ill.credit || image.credit || '' : '',
      chapterHref: isVisible(chapter, viewer) ? paths.chapter(book.slug, chapter.number) : null,
      status: ill.status,
      spoiler: Math.max(ill.spoiler, chapter.spoiler),
    }
  })
}

/** Ilustrações visíveis de um livro, na ordem dos capítulos. */
export async function listBookIllustrations(book: BookRef, viewer: Viewer): Promise<IllustrationView[]> {
  const rows = await db
    .select({ illustration: s.illustrations, chapter: s.chapters })
    .from(s.illustrations)
    .innerJoin(s.chapters, eq(s.chapters.id, s.illustrations.chapterId))
    .where(and(eq(s.chapters.bookId, book.id), listable(s.illustrations, viewer), chapterCondition(viewer)))
    .orderBy(asc(s.chapters.number))
  return toViews(book, rows, viewer)
}

/** A ilustração de um capítulo, se houver uma visível. */
export async function getChapterIllustration(book: BookRef, chapterId: number, viewer: Viewer): Promise<IllustrationView | null> {
  const rows = await db
    .select({ illustration: s.illustrations, chapter: s.chapters })
    .from(s.illustrations)
    .innerJoin(s.chapters, eq(s.chapters.id, s.illustrations.chapterId))
    .where(and(eq(s.illustrations.chapterId, chapterId), listable(s.illustrations, viewer), chapterCondition(viewer)))
  return (await toViews(book, rows, viewer))[0] ?? null
}

/**
 * Uma ilustração de capítulo usada como imagem de destaque em outro verbete
 * (por exemplo, a do capítulo I na página de Kael). Segue as regras da
 * galeria: some se a ilustração for despublicada, se o capítulo exigir um
 * nível de spoiler maior ou se ainda não houver imagem.
 */
export async function getIllustrationFeature(slug: string, viewer: Viewer): Promise<FeatureImage | null> {
  const rows = await db
    .select({ illustration: s.illustrations, chapter: s.chapters, book: s.books })
    .from(s.illustrations)
    .innerJoin(s.chapters, eq(s.chapters.id, s.illustrations.chapterId))
    .innerJoin(s.books, eq(s.books.id, s.chapters.bookId))
    .where(and(eq(s.illustrations.slug, slug), listable(s.illustrations, viewer), chapterCondition(viewer)))
    .limit(1)
  const row = rows[0]
  if (!row || !isVisible(row.book, viewer)) return null
  const book = { id: row.book.id, slug: row.book.slug, volume: row.book.volume }
  const [view] = await toViews(book, [row], viewer)
  if (!view?.image) return null
  return {
    ...view.image,
    caption: view.caption,
    credit: view.credit,
    kicker: `Ilustração do capítulo ${view.roman}`,
    title: view.chapterTitle,
    href: `${paths.bookIllustrations(book.slug)}#${view.slug}`,
    hrefLabel: 'Ver na galeria de ilustrações',
    note: view.artState === 'final' ? undefined : `${view.stateLabel} — ${view.stateDescription}`,
  }
}

/** Apenas os campos públicos, serializáveis para componentes de cliente. */
export function toIllustrationItems(views: IllustrationView[]): IllustrationItem[] {
  return views.map((v) => ({
    slug: v.slug,
    roman: v.roman,
    label: v.label,
    chapterTitle: v.chapterTitle,
    artState: v.artState,
    stateLabel: v.stateLabel,
    stateDescription: v.stateDescription,
    image: v.image ? { src: v.image.src, width: v.image.width, height: v.image.height, alt: v.image.alt } : null,
    caption: v.caption,
    credit: v.credit,
    chapterHref: v.chapterHref,
  }))
}
