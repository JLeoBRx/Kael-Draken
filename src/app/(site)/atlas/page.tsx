import type { Metadata } from 'next'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { MapViewer } from '@/components/atlas/MapViewer'
import { CanonBadge } from '@/components/ui/editorial'
import { Emblem, MediaImage } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { getPrimaryMap, getTermLabels, listKingdoms, listMaps } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { toRoman } from '@/lib/format'
import { paths } from '@/lib/routes'

export const metadata: Metadata = {
  title: 'Atlas dos Seis Reinos',
  description: 'O mapa do mundo de Kael Draken e os seis reinos estabelecidos sobre fragmentos do poder primordial da Chama.',
  alternates: { canonical: '/atlas' },
}

export default async function AtlasPage({ searchParams }: { searchParams: Promise<{ marcador?: string }> }) {
  const viewer = await getViewer()
  const { marcador } = await searchParams
  const [map, maps, kingdoms, typeLabels] = await Promise.all([getPrimaryMap(viewer), listMaps(viewer), listKingdoms(viewer), getTermLabels('marker_type')])
  const otherMaps = maps.filter((m) => m.id !== map?.map.id)

  return (
    <>
      <PageHero
        eyebrow="Atlas"
        title="Atlas dos Seis Reinos"
        lede="Seis reinos foram estabelecidos depois da criação, cada um ligado a fragmentos do poder primordial da Chama. Nomes, capitais e fronteiras ainda estão sendo definidos — o que aparece aqui é marcado conforme seu estado editorial."
        crumbs={[{ label: 'Atlas' }]}
      />

      <section className="section" style={{ paddingTop: 'var(--space-7)' }} aria-labelledby="mapa-titulo">
        <div className="container container--wide">
          {map ? (
            <>
              <div className="section-head section-head--split" style={{ marginBottom: 'var(--space-5)' }}>
                <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  <h2 id="mapa-titulo">{map.map.title}</h2>
                  <div className="badges">
                    <CanonBadge canon={map.map.canon} />
                  </div>
                </div>
              </div>
              <MapViewer
                title={map.map.title}
                image={map.image}
                markers={map.markers}
                provisional={map.map.provisional}
                typeLabels={Object.fromEntries(typeLabels)}
                initialMarkerId={marcador ? Number(marcador) : null}
              />
              <div className="map-meta" style={{ borderTop: 0, paddingInline: 0 }}>
                <p>{map.map.description}</p>
              </div>
              {!map.markers.length ? (
                <p className="notice" role="note">
                  <span>
                    <strong>Nenhum marcador publicado.</strong> Capitais, cidades, ruínas, montanhas, rios e o Templo da Chama serão marcados quando suas posições forem aprovadas.
                  </span>
                </p>
              ) : null}
            </>
          ) : (
            <p className="notice">Nenhum mapa publicado ainda.</p>
          )}

          {otherMaps.length ? (
            <div style={{ marginTop: 'var(--space-7)' }}>
              <h2 className="eyebrow" style={{ marginBottom: 'var(--space-4)' }}>
                Outros mapas
              </h2>
              <ul className="card-grid">
                {otherMaps.map((m) => (
                  <li key={m.id}>
                    <Link className="char-card" href={paths.map(m.slug)} style={{ gridTemplateColumns: m.image ? '120px 1fr' : '1fr' }}>
                      {m.image ? <MediaImage image={m.image} sizes="120px" /> : null}
                      <span className="char-card__body">
                        <span className="char-card__name">{m.title}</span>
                        <span className="char-card__summary">{m.description}</span>
                        <span className="badges">
                          <CanonBadge canon={m.canon} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="reinos-titulo">
        <div className="container">
          <header className="section-head">
            <p className="eyebrow">Os reinos</p>
            <h2 id="reinos-titulo">Os seis reinos propostos</h2>
            <p className="section-head__lede">Safra é o reino desaparecido. Os outros cinco são os reinos conhecidos — seus nomes e características ainda podem mudar.</p>
          </header>
          <div className="kingdom-sections">
            {kingdoms.map((k, i) => (
              <article key={k.id} className="kingdom-band" style={{ '--k-accent': k.accent } as CSSProperties} aria-labelledby={`reino-${k.slug}`}>
                <div className="kingdom-band__emblem">
                  <Emblem image={k.emblem} name={k.name} accent={k.accent} />
                </div>
                <div>
                  <p className="kingdom-band__num">Reino {toRoman(i + 1)}</p>
                  <h3 id={`reino-${k.slug}`}>
                    <Link href={paths.kingdom(k.slug)}>{k.name}</Link>
                  </h3>
                  {k.epithet ? <p className="kingdom-band__epithet">{k.epithet}</p> : null}
                  {k.government ? <p className="kingdom-band__epithet">{k.government}</p> : null}
                  <p style={{ marginTop: 'var(--space-3)' }}>{k.summary}</p>
                  <div className="badges" style={{ marginTop: 'var(--space-3)' }}>
                    <CanonBadge canon={k.canon} />
                  </div>
                </div>
                <Link className="btn btn--small" href={paths.kingdom(k.slug)}>
                  Abrir verbete
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
