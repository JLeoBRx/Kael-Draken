import type { Metadata } from 'next'
import Link from 'next/link'
import { CanonBadge, SpoilerBadge } from '@/components/ui/editorial'
import { EmptyState } from '@/components/ui/entry'
import { FilterForm } from '@/components/ui/FilterForm'
import { ImageSlot, MediaImage } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { getTerms, listCharacters, listKingdoms } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { CANON_INFO, CANON_STATES } from '@/lib/editorial'
import { paths } from '@/lib/routes'

export const metadata: Metadata = {
  title: 'Biblioteca de personagens',
  description: 'Enciclopédia de personagens do universo de Kael Draken, com busca e filtros por reino e papel narrativo.',
  alternates: { canonical: '/personagens' },
}

type Search = { q?: string; reino?: string; papel?: string; estado?: string }

export default async function CharactersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await getViewer()
  const filters = await searchParams
  const [characters, kingdoms, roles] = await Promise.all([listCharacters(viewer, filters), listKingdoms(viewer), getTerms('character_role')])
  const roleLabels = new Map(roles.map((r) => [r.slug, r.label]))
  const filtered = !!(filters.q || filters.reino || filters.papel || filters.estado)

  return (
    <>
      <PageHero
        eyebrow="Biblioteca"
        title="Personagens"
        lede="Quem vive, lembra e sonha neste mundo. Cada verbete revela apenas o que o seu nível de spoiler permite; segredos e revelações ficam guardados até que você escolha vê-los."
        crumbs={[{ label: 'Personagens' }]}
      />
      <section className="section" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="container">
          <FilterForm action={paths.characters} resetHref={paths.characters}>
            <div className="field field--search">
              <label htmlFor="f-q">Buscar por nome</label>
              <input id="f-q" type="search" name="q" defaultValue={filters.q ?? ''} placeholder="Ex.: Kael" />
            </div>
            <div className="field">
              <label htmlFor="f-reino">Reino</label>
              <select id="f-reino" name="reino" defaultValue={filters.reino ?? ''}>
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
              <label htmlFor="f-papel">Papel narrativo</label>
              <select id="f-papel" name="papel" defaultValue={filters.papel ?? ''}>
                <option value="">Todos</option>
                {roles.map((r) => (
                  <option key={r.slug} value={r.slug}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-estado">Estado editorial</label>
              <select id="f-estado" name="estado" defaultValue={filters.estado ?? ''}>
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
            {characters.length === 1 ? '1 personagem' : `${characters.length} personagens`}
            {filtered ? ' encontrados com os filtros atuais' : ' na biblioteca'}
          </p>

          {characters.length ? (
            <ul className="card-grid">
              {characters.map((c) => (
                <li key={c.id}>
                  <Link className="char-card" href={paths.character(c.slug)}>
                    <span className="char-card__portrait">
                      {c.portrait ? <MediaImage image={c.portrait} sizes="76px" alt="" /> : <ImageSlot kind="portrait" label="Retrato" ratio="3 / 4" />}
                    </span>
                    <span className="char-card__body">
                      <span className="char-card__name">{c.name}</span>
                      {c.titles ? <span className="char-card__titles">{c.titles}</span> : null}
                      <span className="char-card__meta">{[roleLabels.get(c.role), c.kingdom?.name, c.age].filter(Boolean).join(' · ')}</span>
                      {c.summary ? <span className="char-card__summary">{c.summary}</span> : null}
                      <span className="badges">
                        <CanonBadge canon={c.canon} short />
                        <SpoilerBadge level={c.spoiler} />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhum personagem encontrado">
              <p>Tente outros filtros ou ajuste seu nível de spoiler.</p>
            </EmptyState>
          )}

          {!filtered ? (
            <p className="notice" style={{ marginTop: 'var(--space-7)' }}>
              <span>A biblioteca cresce à medida que a narrativa é escrita. Personagens ainda não aprovados não aparecem aqui.</span>
            </p>
          ) : null}
        </div>
      </section>
    </>
  )
}
