import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IllustrationStrip } from '@/components/book/IllustrationViews'
import { EditorialBadges } from '@/components/ui/editorial'
import { EntrySection, Gallery, RelatedList, SpoilerGate, TagList } from '@/components/ui/entry'
import { BookCover } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { listBookIllustrations, toIllustrationItems } from '@/lib/content/illustrations'
import { getFullCover, getOfficialCover } from '@/lib/content/media'
import { getBook } from '@/lib/content/queries'
import { prepareRichText } from '@/lib/content/rich'
import { getSettings } from '@/lib/content/settings'
import { getViewer } from '@/lib/content/viewer'
import { isLocked } from '@/lib/content/visibility'
import { toRoman } from '@/lib/format'
import { entryMetadata, lockedMetadata } from '@/lib/metadata'
import { paths } from '@/lib/routes'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getBook(slug, viewer)
  if (!data) return {}
  if (isLocked(data.book, viewer)) return lockedMetadata
  const settings = await getSettings()
  const cover = data.cover ?? (data.book.volume === 1 ? await getOfficialCover(settings.cover_media_id, data.book.title) : null)
  return entryMetadata({ title: `Livro ${toRoman(data.book.volume)} — ${data.book.title}`, description: data.book.synopsis, path: paths.book(slug), image: cover })
}

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getBook(slug, viewer)
  if (!data) notFound()
  const { book: b } = data
  if (isLocked(b, viewer)) return <SpoilerGate level={b.spoiler} />
  const settings = await getSettings()
  const cover = data.cover ?? (b.volume === 1 ? await getOfficialCover(settings.cover_media_id, `Capa oficial de ${b.title}`) : null)
  const render = await prepareRichText(viewer, [b.synopsis, b.editorialInfo, b.materials])
  const synopsis = render(b.synopsis, { headingOffset: 1 })
  const editorial = render(b.editorialInfo, { headingOffset: 1 })
  const materials = render(b.materials, { headingOffset: 1 })
  const illustrations = toIllustrationItems(await listBookIllustrations(b, viewer))
  const fullCover = b.volume === 1 ? getFullCover(`Capa completa de ${b.title}`) : null

  return (
    <article>
      <PageHero eyebrow={`Livro ${toRoman(b.volume)}`} title={b.title} subtitle={b.subtitle || undefined} crumbs={[{ label: 'Livros', href: paths.books }, { label: b.title }]}>
        <EditorialBadges canon={b.canon} spoiler={b.spoiler} status={b.status} preview={viewer.preview} />
      </PageHero>
      <div className="container book-layout">
        <div className="book-layout__cover">
          <BookCover cover={cover} title={b.title} priority note="A capa aprovada será exibida aqui assim que o arquivo for adicionado." />
          {b.volume === 1 && settings.author_name?.trim() ? (
            <p className="book-layout__author">
              <span className="eyebrow">Autor</span>
              {settings.author_name}
            </p>
          ) : null}
          {fullCover ? (
            <a className="book-layout__full-cover" href={fullCover.src} target="_blank" rel="noopener">
              Ver a capa completa <span className="related-list__meta">contracapa, lombada e capa</span>
            </a>
          ) : null}
        </div>
        <div className="entry-main">
          {b.volume === 1 && settings.book_epigraph?.trim() ? (
            <figure className="book-epigraph">
              <blockquote>
                <p>“{settings.book_epigraph.trim()}”</p>
              </blockquote>
              <figcaption>Epígrafe do Livro I</figcaption>
            </figure>
          ) : null}
          <EntrySection
            id="sinopse"
            title={b.synopsisOfficial ? 'Sinopse oficial' : 'Apresentação'}
            result={synopsis}
            note={b.synopsisOfficial ? undefined : 'texto provisório — a sinopse oficial será publicada aqui'}
          />
          <EntrySection id="informacoes" title="Informações editoriais" result={editorial} />
          <EntrySection id="materiais" title="Materiais de divulgação" result={materials} />
          <section className="entry-section" id="capitulos" aria-labelledby="capitulos-titulo">
            <h2 className="entry-section__title" id="capitulos-titulo">
              Capítulos e trechos autorizados
            </h2>
            {data.chapters.length ? (
              <ul className="chapter-list">
                {data.chapters.map((ch) => (
                  <li key={ch.id}>
                    <Link href={paths.chapter(b.slug, ch.number)}>
                      <span className="chapter-list__num">{ch.number}</span>
                      <span>
                        <span className="chapter-list__title">{ch.title}</span>
                        {ch.summary ? (
                          <span className="related-list__meta" style={{ display: 'block' }}>
                            {ch.summary}
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="timeline-empty">Nenhum capítulo ou trecho foi autorizado para publicação até o momento.</p>
            )}
          </section>
          <IllustrationStrip
            items={illustrations}
            galleryHref={paths.bookIllustrations(b.slug)}
            volume={toRoman(b.volume)}
            intro="Imagens que acompanham os primeiros passos de Kael Draken e os vestígios de uma história que o mundo tentou esquecer."
          />
          <div className="related-grid">
            <RelatedList title="Personagens" items={data.characters.map((c) => ({ title: c.name, href: paths.character(c.slug) }))} />
            <RelatedList title="Lugares" items={data.locations.map((l) => ({ title: l.name, href: paths.location(l.slug) }))} />
          </div>
          <TagList tags={data.tags} />
          <Gallery images={data.gallery} title="Imagens e materiais" />
        </div>
      </div>
    </article>
  )
}
