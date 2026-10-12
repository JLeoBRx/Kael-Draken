import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CertaintyBadge, EditorialBadges } from '@/components/ui/editorial'
import { EntrySection, Facts, Gallery, HiddenNotice, PendingSections, RelatedList, SpoilerGate, TagList, Toc } from '@/components/ui/entry'
import { Figure } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { artImage } from '@/lib/atlas/art'
import { resolveArt } from '@/lib/atlas/resolve'
import { getLocation, getTermLabels } from '@/lib/content/queries'
import { prepareRichText } from '@/lib/content/rich'
import { getViewer } from '@/lib/content/viewer'
import { isLocked } from '@/lib/content/visibility'
import { entryMetadata, lockedMetadata } from '@/lib/metadata'
import { paths } from '@/lib/routes'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getLocation(slug, viewer)
  if (!data) return {}
  if (isLocked(data.location, viewer)) return lockedMetadata
  return entryMetadata({ title: data.location.name, description: data.location.summary, path: paths.location(slug), image: data.image ?? (await resolveArt(artImage('location', slug), viewer)) })
}

export default async function LocationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getLocation(slug, viewer)
  if (!data) notFound()
  const { location: l } = data
  if (isLocked(l, viewer)) return <SpoilerGate level={l.spoiler} />

  const [categories, roles] = await Promise.all([getTermLabels('location_category'), getTermLabels('character_role')])
  const render = await prepareRichText(viewer, [l.body, l.history, l.geography, l.inhabitants])
  const image = data.image ?? (await resolveArt(artImage('location', l.slug), viewer))
  const sections = [
    { id: 'descricao', title: 'Descrição', source: l.body },
    { id: 'importancia', title: 'Importância histórica', source: l.history },
    { id: 'geografia', title: 'Geografia', source: l.geography },
    { id: 'habitantes', title: 'Habitantes e atividades econômicas', source: l.inhabitants },
  ].map((s) => ({ ...s, result: render(s.source, { headingOffset: 1, idPrefix: `${s.id}-` }) }))
  const filled = sections.filter((s) => s.result.html.trim())
  const pending = sections.filter((s) => !s.result.html.trim()).map((s) => s.title)
  if (!data.characters.length) pending.push('Personagens associados')
  if (!data.events.length) pending.push('Eventos relacionados')
  const hidden = sections.reduce((n, s) => n + s.result.hiddenCount, 0)
  const marker = data.markers[0]

  return (
    <article>
      <PageHero
        eyebrow={l.isCapital ? 'Capital' : (categories.get(l.category) ?? 'Local')}
        title={l.name}
        crumbs={[{ label: 'Locais', href: paths.locations }, { label: l.name }]}
      >
        <EditorialBadges canon={l.canon} spoiler={l.spoiler} status={l.status} preview={viewer.preview} />
      </PageHero>
      <div className="container entry-layout">
        <aside className="entry-aside">
          <div className="infobox">
            <div className="infobox__body">
              <Facts
                items={[
                  { label: 'Categoria', value: categories.get(l.category) ?? (l.category || null) },
                  { label: 'Reino', value: data.kingdom ? <Link href={paths.kingdom(data.kingdom.slug)}>{data.kingdom.name}</Link> : <span className="muted">Não definido</span> },
                  {
                    label: 'No mapa',
                    value: marker ? (
                      <Link href={marker.isPrimary ? `${paths.atlas}?marcador=${marker.id}` : `${paths.map(marker.mapSlug)}?marcador=${marker.id}`}>Ver em {marker.mapTitle}</Link>
                    ) : (
                      <span className="muted">Posição ainda não definida</span>
                    ),
                  },
                ]}
              />
              <TagList tags={data.tags} />
            </div>
          </div>
          <Toc items={filled.map((s) => ({ id: s.id, title: s.title }))} />
        </aside>
        <div className="entry-main">
          {l.summary ? <p className="prose prose--lead">{l.summary}</p> : null}
          <HiddenNotice count={hidden} level={viewer.spoiler} />
          {image ? <Figure image={image} priority /> : null}
          {filled.map((s) => (
            <EntrySection key={s.id} id={s.id} title={s.title} result={s.result} />
          ))}
          <PendingSections titles={pending} />
          {data.characters.length || data.events.length || data.documents.length ? (
            <section className="entry-section" id="relacionados" aria-labelledby="relacionados-titulo">
              <h2 className="entry-section__title" id="relacionados-titulo">
                Referências cruzadas
              </h2>
              <div className="related-grid">
                <RelatedList title="Personagens associados" items={data.characters.map((c) => ({ title: c.name, href: paths.character(c.slug), meta: roles.get(c.role) }))} />
                <RelatedList title="Eventos relacionados" items={data.events.map((e) => ({ title: e.title, href: paths.event(e.slug), meta: <CertaintyBadge certainty={e.certainty} /> }))} />
                <RelatedList title="Documentos" items={data.documents.map((d) => ({ title: d.title, href: paths.document(d.slug), meta: d.excerpt }))} />
              </div>
            </section>
          ) : null}
          <Gallery images={data.gallery} title="Imagens e mapas" />
        </div>
      </div>
    </article>
  )
}
