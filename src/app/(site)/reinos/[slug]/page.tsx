import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
import { MapDetail } from '@/components/atlas/MapDetail'
import { CertaintyBadge, EditorialBadges } from '@/components/ui/editorial'
import { EntrySection, Facts, Gallery, HiddenNotice, PendingSections, RelatedList, SpoilerGate, TagList, Toc } from '@/components/ui/entry'
import { Emblem, MediaImage } from '@/components/ui/media'
import { ART, emblemArt } from '@/lib/atlas/art'
import { PageHero } from '@/components/ui/PageHero'
import { getKingdom, getTermLabels } from '@/lib/content/queries'
import { prepareRichText } from '@/lib/content/rich'
import { getViewer } from '@/lib/content/viewer'
import { isLocked } from '@/lib/content/visibility'
import { entryMetadata, lockedMetadata } from '@/lib/metadata'
import { paths } from '@/lib/routes'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getKingdom(slug, viewer)
  if (!data) return {}
  if (isLocked(data.kingdom, viewer)) return lockedMetadata
  return entryMetadata({ title: data.kingdom.name, description: data.kingdom.summary, path: paths.kingdom(slug), image: data.image ?? ART.reino[slug] ?? data.emblem })
}

export default async function KingdomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getKingdom(slug, viewer)
  if (!data) notFound()
  const { kingdom: k } = data
  if (isLocked(k, viewer)) return <SpoilerGate level={k.spoiler} />

  const [roles, categories] = await Promise.all([getTermLabels('character_role'), getTermLabels('location_category')])
  const render = await prepareRichText(viewer, [k.body, k.geography, k.capital, k.culture, k.economy, k.resonance, k.history, k.relations, k.mysteries])

  const sections = [
    { id: 'descricao', title: 'Descrição geral', source: k.body },
    { id: 'geografia', title: 'Geografia e clima', source: k.geography },
    { id: 'capital', title: 'Capital e cidades importantes', source: k.capital, extra: data.locations.length > 0 },
    { id: 'cultura', title: 'Cultura e costumes', source: k.culture },
    { id: 'economia', title: 'Economia e recursos', source: k.economy },
    { id: 'ressonancia', title: 'Relação com a Ressonância', source: k.resonance },
    { id: 'historia', title: 'História conhecida', source: k.history },
    { id: 'relacoes', title: 'Relações com outros reinos', source: k.relations },
    { id: 'misterios', title: 'Mistérios relacionados', source: k.mysteries },
  ].map((s) => ({ ...s, result: render(s.source, { headingOffset: 1, idPrefix: `${s.id}-` }) }))

  const filled = sections.filter((s) => s.result.html.trim() || s.extra)
  const pending = sections.filter((s) => !s.result.html.trim() && !s.extra).map((s) => s.title)
  if (!data.characters.length) pending.push('Personagens associados')
  if (!data.gallery.length) pending.push('Galeria de imagens e documentos')
  const hidden = sections.reduce((n, s) => n + s.result.hiddenCount, 0)
  const capital = data.locations.find((l) => l.isCapital)
  const emblem = data.emblem ?? emblemArt(k.slug)
  // Imagem enviada pelo painel: faixa larga sob o título. Sem ela, o detalhe da carta ao lado do título.
  const panorama = data.image
  const mapDetail = panorama ? null : (ART.reino[k.slug] ?? null)
  const atlasHref = `${paths.atlas}?regiao=${k.slug}#mapas`

  const tocItems = [
    ...filled.map((s) => ({ id: s.id, title: s.title })),
    ...(data.characters.length || data.events.length || data.documents.length ? [{ id: 'relacionados', title: 'Referências cruzadas' }] : []),
    ...(data.gallery.length ? [{ id: 'galeria', title: 'Galeria' }] : []),
  ]

  return (
    <article style={{ '--k-accent': k.accent } as CSSProperties}>
      <PageHero
        eyebrow="Reino"
        title={k.name}
        subtitle={k.epithet || k.government || undefined}
        crumbs={[{ label: 'Atlas', href: paths.atlas }, { label: k.name }]}
        accent={k.accent}
        media={mapDetail ? <MapDetail image={mapDetail} href={atlasHref} priority /> : undefined}
      >
        <EditorialBadges canon={k.canon} spoiler={k.spoiler} status={k.status} preview={viewer.preview} />
      </PageHero>
      {panorama ? (
        <figure className="kingdom-panorama">
          <MediaImage image={panorama} sizes="100vw" priority />
          {panorama.caption ? <figcaption>{panorama.caption}</figcaption> : null}
        </figure>
      ) : null}

      <div className="container entry-layout">
        <aside className="entry-aside">
          <div className="infobox">
            <div className="infobox__media">
              <Emblem image={emblem} name={k.name} accent={k.accent} />
            </div>
            <div className="infobox__body">
              <Facts
                items={[
                  { label: 'Forma de governo', value: k.government || <span className="muted">Em desenvolvimento</span> },
                  { label: 'Capital', value: capital ? <Link href={paths.location(capital.slug)}>{capital.name}</Link> : <span className="muted">Não definida</span> },
                  { label: 'Lugares documentados', value: String(data.locations.length) },
                  { label: 'Personagens associados', value: String(data.characters.length) },
                  {
                    label: 'No atlas',
                    value: <Link href={atlasHref}>Ver a zona conceitual no mapa</Link>,
                  },
                  { label: 'Brasão', value: data.emblem ? null : <span className="muted">Proposta heráldica (não aprovada)</span> },
                ]}
              />
              <TagList tags={data.tags} />
            </div>
          </div>
          <Toc items={tocItems} />
        </aside>

        <div className="entry-main">
          {k.summary ? <p className="prose prose--lead">{k.summary}</p> : null}
          {k.canon !== 'canonico' ? (
            <p className="notice" role="note">
              <span>
                <strong>Verbete provisório.</strong> Nome, capital e características deste reino ainda estão em desenvolvimento e podem mudar.
              </span>
            </p>
          ) : null}
          <HiddenNotice count={hidden} level={viewer.spoiler} />

          {filled.map((s) => (
            <EntrySection key={s.id} id={s.id} title={s.title} result={s.result}>
              {s.id === 'capital' && data.locations.length ? (
                <RelatedList
                  title="Lugares neste reino"
                  items={data.locations.map((l) => ({
                    title: l.name,
                    href: paths.location(l.slug),
                    meta: [l.isCapital ? 'Capital' : categories.get(l.category), l.summary].filter(Boolean).join(' · '),
                  }))}
                />
              ) : null}
            </EntrySection>
          ))}

          <PendingSections titles={pending} />

          {data.characters.length || data.events.length || data.documents.length || data.articles.length ? (
            <section className="entry-section" id="relacionados" aria-labelledby="relacionados-titulo">
              <h2 className="entry-section__title" id="relacionados-titulo">
                Referências cruzadas
              </h2>
              <div className="related-grid">
                <RelatedList
                  title="Personagens associados"
                  items={data.characters.map((c) => ({ title: c.name, href: paths.character(c.slug), meta: [roles.get(c.role), c.titles].filter(Boolean).join(' · ') }))}
                />
                <RelatedList
                  title="Na cronologia"
                  items={data.events.map((e) => ({ title: e.title, href: paths.event(e.slug), meta: <CertaintyBadge certainty={e.certainty} /> }))}
                />
                <RelatedList title="Documentos" items={data.documents.map((d) => ({ title: d.title, href: paths.document(d.slug), meta: d.excerpt }))} />
                <RelatedList title="Na mitologia" items={data.articles.map((a) => ({ title: a.title, href: paths.article(a.section, a.slug), meta: a.subtitle }))} />
              </div>
            </section>
          ) : null}

          <Gallery images={data.gallery} title="Galeria de imagens e documentos" />

          {data.siblings.length > 1 ? (
            <nav aria-label="Outros reinos">
              <p className="eyebrow" style={{ marginBottom: 'var(--space-3)' }}>
                Outros reinos
              </p>
              <ul className="inline-links">
                {data.siblings
                  .filter((s) => s.slug !== k.slug)
                  .map((s) => (
                    <li key={s.slug}>
                      <Link href={paths.kingdom(s.slug)}>{s.name}</Link>
                    </li>
                  ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </div>
    </article>
  )
}
