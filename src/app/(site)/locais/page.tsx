import type { Metadata } from 'next'
import Link from 'next/link'
import { CanonBadge, SpoilerBadge } from '@/components/ui/editorial'
import { EmptyState } from '@/components/ui/entry'
import { FilterForm } from '@/components/ui/FilterForm'
import { PageHero } from '@/components/ui/PageHero'
import { getTerms, listKingdoms, listLocations } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { CANON_INFO, CANON_STATES } from '@/lib/editorial'
import { paths } from '@/lib/routes'

export const metadata: Metadata = {
  title: 'Cidades e locais',
  description: 'Enciclopédia geográfica do universo de Kael Draken: cidades, vilarejos, ruínas, templos, passagens e regiões inexploradas.',
  alternates: { canonical: '/locais' },
}

type Search = { q?: string; reino?: string; categoria?: string; estado?: string }

export default async function LocationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await getViewer()
  const filters = await searchParams
  const [locations, kingdoms, categories] = await Promise.all([listLocations(viewer, filters), listKingdoms(viewer), getTerms('location_category')])
  const categoryLabels = new Map(categories.map((c) => [c.slug, c.label]))

  return (
    <>
      <PageHero
        eyebrow="Enciclopédia geográfica"
        title="Cidades e locais"
        lede="Cidades, vilarejos, ruínas, fortalezas, templos, bibliotecas, passagens naturais e regiões ainda inexploradas. Cada verbete indica o estado de desenvolvimento do seu conteúdo."
        crumbs={[{ label: 'Locais' }]}
      />
      <section className="section" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="container">
          <FilterForm action={paths.locations} resetHref={paths.locations}>
            <div className="field field--search">
              <label htmlFor="l-q">Buscar</label>
              <input id="l-q" type="search" name="q" defaultValue={filters.q ?? ''} placeholder="Nome ou descrição" />
            </div>
            <div className="field">
              <label htmlFor="l-reino">Reino</label>
              <select id="l-reino" name="reino" defaultValue={filters.reino ?? ''}>
                <option value="">Todos</option>
                {kingdoms.map((k) => (
                  <option key={k.slug} value={k.slug}>
                    {k.name}
                  </option>
                ))}
                <option value="sem-reino">Sem reino definido</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="l-cat">Categoria</label>
              <select id="l-cat" name="categoria" defaultValue={filters.categoria ?? ''}>
                <option value="">Todas</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="l-estado">Estado do conteúdo</label>
              <select id="l-estado" name="estado" defaultValue={filters.estado ?? ''}>
                <option value="">Todos</option>
                {CANON_STATES.filter((c) => c !== 'arquivado').map((c) => (
                  <option key={c} value={c}>
                    {CANON_INFO[c].label}
                  </option>
                ))}
              </select>
            </div>
          </FilterForm>

          <p className="results-count" role="status">
            {locations.length === 1 ? '1 local' : `${locations.length} locais`}
          </p>

          {locations.length ? (
            <ul className="entry-list">
              {locations.map((l) => (
                <li key={l.id}>
                  <Link className="entry-row" href={paths.location(l.slug)}>
                    <span className="entry-row__kicker">
                      {l.isCapital ? 'Capital' : (categoryLabels.get(l.category) ?? 'Local')}
                      {l.kingdom ? ` · ${l.kingdom.name}` : ''}
                    </span>
                    <span>
                      <span className="entry-row__title">{l.name}</span>
                      {l.summary ? <span className="entry-row__summary">{l.summary}</span> : null}
                    </span>
                    <span className="badges">
                      <CanonBadge canon={l.canon} short />
                      <SpoilerBadge level={l.spoiler} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhum local encontrado">
              <p>Tente outros filtros.</p>
            </EmptyState>
          )}
        </div>
      </section>
    </>
  )
}
