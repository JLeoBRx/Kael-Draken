import Link from 'next/link'
import type { ReactNode } from 'react'
import type { ImageData } from '@/lib/content/media'
import type { RenderResult } from '@/lib/markdown/render'
import { SPOILER_INFO, type SpoilerLevel } from '@/lib/editorial'
import { Glyph, type GlyphName } from './glyphs'
import { MediaImage } from './media'
import { Prose } from './Prose'

export interface SectionDef {
  id: string
  title: string
  result?: RenderResult | null
  children?: ReactNode
}

/** Uma seção de verbete; não renderiza nada se não houver conteúdo. */
export function EntrySection({ id, title, result, children, note }: SectionDef & { note?: ReactNode }) {
  const hasHtml = !!result?.html.trim()
  if (!hasHtml && !children) return null
  return (
    <section className="entry-section" id={id} aria-labelledby={`${id}-titulo`}>
      <h2 className="entry-section__title" id={`${id}-titulo`}>
        {title}
        {note ? <small>{note}</small> : null}
      </h2>
      {hasHtml ? <Prose result={result!} /> : null}
      {children}
    </section>
  )
}

/** Lista compacta das seções ainda sem conteúdo (evita páginas que aparentam estar completas). */
export function PendingSections({ titles, intro }: { titles: string[]; intro?: string }) {
  if (!titles.length) return null
  return (
    <section className="pending" aria-labelledby="pendentes-titulo">
      <h2 className="pending__title" id="pendentes-titulo">
        <Glyph name="manuscritos" className="pending__glyph" />
        Ainda não documentado
      </h2>
      <p>{intro ?? 'As seções abaixo fazem parte do verbete, mas ainda não foram escritas ou aprovadas.'}</p>
      <ul className="pending__list">
        {titles.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </section>
  )
}

export function Toc({ items, title = 'Neste verbete' }: { items: Array<{ id: string; title: string }>; title?: string }) {
  if (items.length < 2) return null
  return (
    <nav className="toc" aria-label={title}>
      <h2>{title}</h2>
      <ol>
        {items.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>{item.title}</a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

export interface RelatedItem {
  title: string
  href?: string | null
  meta?: ReactNode
}

export function RelatedList({ title, items, empty }: { title: string; items: RelatedItem[]; empty?: string }) {
  if (!items.length && !empty) return null
  return (
    <section className="related">
      <h3>{title}</h3>
      {items.length ? (
        <ul className="related-list">
          {items.map((item, i) => (
            <li key={`${item.title}-${i}`}>
              {item.href ? (
                <Link href={item.href}>
                  <span className="related-list__title">{item.title}</span>
                  {item.meta ? <span className="related-list__meta">{item.meta}</span> : null}
                </Link>
              ) : (
                <span className="related-list__static">
                  <span className="related-list__title">{item.title}</span>
                  {item.meta ? <span className="related-list__meta">{item.meta}</span> : null}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="timeline-empty">{empty}</p>
      )}
    </section>
  )
}

export function Facts({ items }: { items: Array<{ label: string; value: ReactNode | null | undefined }> }) {
  const visible = items.filter((i) => i.value !== null && i.value !== undefined && i.value !== '')
  if (!visible.length) return null
  return (
    <dl className="facts">
      {visible.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Gallery({ images, title = 'Galeria' }: { images: ImageData[]; title?: string }) {
  if (!images.length) return null
  return (
    <section className="entry-section" id="galeria" aria-labelledby="galeria-titulo">
      <h2 className="entry-section__title" id="galeria-titulo">
        {title}
      </h2>
      <ul className="gallery">
        {images.map((img) => (
          <li key={img.src}>
            <figure>
              <a href={img.src} target="_blank" rel="noopener">
                <MediaImage image={img} sizes="(min-width: 1000px) 320px, 50vw" />
              </a>
              {img.caption || img.credit ? (
                <figcaption>
                  {img.caption}
                  {img.caption && img.credit ? ' · ' : ''}
                  {img.credit}
                </figcaption>
              ) : null}
            </figure>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function TagList({ tags }: { tags: Array<{ slug: string; label: string }> }) {
  if (!tags.length) return null
  return (
    <ul className="tag-list" aria-label="Tags">
      {tags.map((t) => (
        <li key={t.slug}>
          <Link href={`/busca?tag=${encodeURIComponent(t.slug)}`}>{t.label}</Link>
        </li>
      ))}
    </ul>
  )
}

export function HiddenNotice({ count, level }: { count: number; level: number }) {
  if (!count) return null
  return (
    <p className="notice notice--fire" role="note">
      <span>
        <strong>{count === 1 ? '1 trecho oculto' : `${count} trechos ocultos`}</strong> pelo seu nível de spoiler atual ({SPOILER_INFO[level as SpoilerLevel].label}). Use o seletor
        de spoilers no topo da página para revelá-los.
      </span>
    </p>
  )
}

export function SpoilerGate({ level }: { level: number }) {
  return (
    <div className="container">
      <div className="spoiler-gate">
        <span className="spoiler-gate__seal">
          <Glyph name="misterios" />
        </span>
        <p className="eyebrow eyebrow--ember">Conteúdo protegido</p>
        <h1>Este verbete contém {SPOILER_INFO[level as SpoilerLevel].label.toLowerCase()}</h1>
        <p>
          Para preservar a experiência de leitura, o conteúdo só é exibido para quem escolheu o nível de spoiler “{SPOILER_INFO[level as SpoilerLevel].label}”. Você
          pode alterar seu nível no seletor de spoilers, no topo da página.
        </p>
        <Link className="btn" href="/">
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}

/** Estado vazio de uma listagem: o símbolo da seção, um título e, se houver, uma orientação. */
export function EmptyState({ title, children, glyph = 'arquivo' }: { title: string; children?: ReactNode; glyph?: GlyphName }) {
  return (
    <div className="empty-state">
      <Glyph name={glyph} className="empty-state__glyph" />
      <div className="empty-state__text">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
