import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CertaintyBadge, EditorialBadges, Reliability } from '@/components/ui/editorial'
import { Facts, Gallery, HiddenNotice, RelatedList, SpoilerGate, TagList } from '@/components/ui/entry'
import { MediaImage } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { Prose } from '@/components/ui/Prose'
import { artImage } from '@/lib/atlas/art'
import { resolveArt } from '@/lib/atlas/resolve'
import { getDocument, getTermLabels } from '@/lib/content/queries'
import { prepareRichText } from '@/lib/content/rich'
import { getViewer } from '@/lib/content/viewer'
import { isLocked } from '@/lib/content/visibility'
import { RELIABILITY_INFO, type ReliabilityState } from '@/lib/editorial'
import { entryMetadata, lockedMetadata } from '@/lib/metadata'
import { paths } from '@/lib/routes'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getDocument(slug, viewer)
  if (!data) return {}
  if (isLocked(data.document, viewer)) return lockedMetadata
  return entryMetadata({ title: data.document.title, description: data.document.excerpt || data.document.context, path: paths.document(slug), image: data.image })
}

export default async function DocumentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getDocument(slug, viewer)
  if (!data) notFound()
  const { document: d } = data
  if (isLocked(d, viewer)) return <SpoilerGate level={d.spoiler} />

  const types = await getTermLabels('document_type')
  const render = await prepareRichText(viewer, [d.transcription, d.translation, d.context, d.reliabilityNote])
  const transcription = render(d.transcription)
  const translation = render(d.translation, { headingOffset: 2 })
  const context = render(d.context, { headingOffset: 2 })
  const reliabilityNote = render(d.reliabilityNote)
  const hidden = transcription.hiddenCount + translation.hiddenCount + context.hiddenCount
  const illustration = await resolveArt(artImage('document', d.slug), viewer)

  return (
    <article>
      <PageHero eyebrow={types.get(d.docType) ?? 'Documento'} title={d.title} crumbs={[{ label: 'Manuscritos', href: paths.documents }, { label: d.title }]} className="archive-hero">
        <EditorialBadges canon={d.canon} spoiler={d.spoiler} status={d.status} preview={viewer.preview} />
      </PageHero>
      <div className="container document-layout">
        <div className="document-sheet parchment">
          {data.image ? (
            <figure className="document-sheet__image">
              <MediaImage image={data.image} sizes="(min-width: 1000px) 800px, 100vw" priority />
              {data.image.caption ? <figcaption>{data.image.caption}</figcaption> : null}
            </figure>
          ) : null}
          <HiddenNotice count={hidden} level={viewer.spoiler} />
          {transcription.html.trim() ? (
            <section aria-labelledby="transcricao">
              <h2 id="transcricao">Transcrição</h2>
              <div className="transcription" dangerouslySetInnerHTML={{ __html: transcription.html }} />
            </section>
          ) : null}
          {translation.html.trim() ? (
            <section aria-labelledby="traducao">
              <h2 id="traducao">Tradução</h2>
              <Prose result={translation} className="prose--parchment" />
            </section>
          ) : null}
          {context.html.trim() ? (
            <section aria-labelledby="contexto">
              <h2 id="contexto">Contexto</h2>
              <Prose result={context} className="prose--parchment" />
            </section>
          ) : null}
        </div>
        <aside className="entry-aside">
          <div className="archive-card">
            <p className="archive-card__head">Ficha arquivística</p>
            <Facts
              items={[
                { label: 'Tipo', value: types.get(d.docType) ?? (d.docType || null) },
                { label: 'Origem conhecida', value: d.origin || <span className="muted">Desconhecida</span> },
                { label: 'Datação', value: d.dateLabel || <span className="muted">Desconhecida</span> },
                { label: 'Idioma', value: d.language || <span className="muted">Não identificado</span> },
                { label: 'Confiabilidade', value: <Reliability value={d.reliability} /> },
                {
                  label: 'Sobre a confiabilidade',
                  value: reliabilityNote.html.trim() ? <span dangerouslySetInnerHTML={{ __html: reliabilityNote.html }} /> : RELIABILITY_INFO[d.reliability as ReliabilityState]?.description,
                },
              ]}
            />
          </div>
          <TagList tags={data.tags} />
          {illustration ? (
            <figure style={{ margin: 0 }}>
              <MediaImage image={illustration} sizes="320px" />
              <figcaption className="art-note">{illustration.caption}</figcaption>
            </figure>
          ) : null}
          <RelatedList title="Reinos" items={data.kingdoms.map((k) => ({ title: k.name, href: paths.kingdom(k.slug) }))} />
          <RelatedList title="Lugares" items={data.locations.map((l) => ({ title: l.name, href: paths.location(l.slug) }))} />
          <RelatedList title="Personagens" items={data.characters.map((c) => ({ title: c.name, href: paths.character(c.slug) }))} />
          <RelatedList title="Acontecimentos" items={data.events.map((e) => ({ title: e.title, href: paths.event(e.slug), meta: <CertaintyBadge certainty={e.certainty} /> }))} />
          <p>
            <Link className="text-link" href={paths.documents}>
              ← Voltar ao arquivo
            </Link>
          </p>
        </aside>
      </div>
      <div className="container">
        <Gallery images={data.gallery} title="Imagens do documento" />
      </div>
    </article>
  )
}
