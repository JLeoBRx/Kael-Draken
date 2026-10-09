import type { Metadata } from 'next'
import type { ImageData } from './content/media'
import { toPlainText } from './markdown/render'

/** Metadados de uma página de verbete. A descrição nunca inclui trechos de spoiler. */
export function entryMetadata({ title, description, path, image }: { title: string; description?: string; path: string; image?: ImageData | null }): Metadata {
  const desc = description ? toPlainText(description, 180) : undefined
  return {
    title,
    description: desc,
    alternates: { canonical: path },
    openGraph: { title, description: desc, url: path, images: image ? [{ url: image.src, width: image.width, height: image.height, alt: image.alt }] : undefined },
  }
}

export const lockedMetadata: Metadata = { title: 'Conteúdo protegido por spoiler', robots: { index: false } }
