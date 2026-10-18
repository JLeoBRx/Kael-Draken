import Link from 'next/link'
import { CertaintyBadge, EditorialBadges } from '@/components/ui/editorial'
import { Gallery, HiddenNotice, RelatedList, TagList, Toc } from '@/components/ui/entry'
import { Figure } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { Prose } from '@/components/ui/Prose'
import { artImage } from '@/lib/atlas/art'
import { resolveArt } from '@/lib/atlas/resolve'
import type { getArticle } from '@/lib/content/queries'
import { prepareRichText } from '@/lib/content/rich'
import type { Viewer } from '@/lib/content/viewer'
import { CANON_INFO, type CanonState } from '@/lib/editorial'
import { paths } from '@/lib/routes'

type ArticleData = NonNullable<Awaited<ReturnType<typeof getArticle>>>

const SECTION_LABEL = { mitologia: 'Mitologia e história antiga', ressonancia: 'Sistema da Ressonância' } as const

/** Página de verbete com apresentação de livro de história (mitologia e Ressonância). */
export async function ArticleView({ data, viewer }: { data: ArticleData; viewer: Viewer }) {
  const a = data.article
  const render = await prepareRichText(viewer, [a.body])
  const body = render(a.body)
  const image = data.image ?? (await resolveArt(artImage('article', `${a.section}/${a.slug}`), viewer))
  const sectionHref = a.section === 'mitologia' ? paths.mythology : paths.resonance
  const hasBody = !!body.html.trim()

  return (
    <article className={a.section === 'ressonancia' ? 'resonance-article' : undefined}>
      <PageHero
        glyph={a.section === 'mitologia' ? 'mitologia' : 'ressonancia'}
        eyebrow={SECTION_LABEL[a.section]}
        title={a.title}
        subtitle={a.subtitle || undefined}
        crumbs={[{ label: a.section === 'mitologia' ? 'Mitologia' : 'Ressonância', href: sectionHref }, { label: a.title }]}
        className={a.section === 'ressonancia' ? 'resonance-hero' : undefined}
      >
        <EditorialBadges canon={a.canon} spoiler={a.spoiler} status={a.status} preview={viewer.preview} />
      </PageHero>

      <div className="container entry-layout entry-layout--reverse chronicle" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="entry-main chronicle__body">
          {a.summary ? <p className="prose prose--lead">{a.summary}</p> : null}
          {image ? <Figure image={image} priority /> : null}
          <HiddenNotice count={body.hiddenCount} level={viewer.spoiler} />
          {hasBody ? (
            <Prose result={body} />
          ) : (
            <div className="pending">
              <h2 className="pending__title">Verbete em preparação</h2>
              <p>
                Este verbete faz parte da estrutura do arquivo, mas seu conteúdo ainda não foi escrito ou aprovado. Estado atual:{' '}
                <strong>{CANON_INFO[a.canon as CanonState]?.label}</strong>. Nada aqui foi completado com suposições.
              </p>
            </div>
          )}
          <TagList tags={data.tags} />
          <Gallery images={data.gallery} />
          {data.previous || data.next ? (
            <nav className="pager" aria-label="Verbetes vizinhos">
              {data.previous ? (
                <Link href={paths.article(a.section, data.previous.slug)}>
                  <span className="pager__dir">← Anterior</span>
                  <span className="pager__title">{data.previous.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {data.next ? (
                <Link className="pager__next" href={paths.article(a.section, data.next.slug)}>
                  <span className="pager__dir">Próximo →</span>
                  <span className="pager__title">{data.next.title}</span>
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
        <aside className="entry-aside">
          <Toc items={body.headings.filter((h) => h.depth <= 3).map((h) => ({ id: h.id, title: h.text }))} />
          <RelatedList title="Reinos" items={data.kingdoms.map((k) => ({ title: k.name, href: paths.kingdom(k.slug), meta: k.epithet || k.government }))} />
          <RelatedList title="Lugares" items={data.locations.map((l) => ({ title: l.name, href: paths.location(l.slug) }))} />
          <RelatedList title="Personagens" items={data.characters.map((c) => ({ title: c.name, href: paths.character(c.slug) }))} />
          <RelatedList title="Na cronologia" items={data.events.map((e) => ({ title: e.title, href: paths.event(e.slug), meta: <CertaintyBadge certainty={e.certainty} /> }))} />
          <RelatedList title="Documentos" items={data.documents.map((d) => ({ title: d.title, href: paths.document(d.slug) }))} />
        </aside>
      </div>
    </article>
  )
}
