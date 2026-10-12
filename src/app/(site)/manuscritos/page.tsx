import type { Metadata } from 'next'
import Link from 'next/link'
import { CanonBadge, Reliability, SpoilerBadge } from '@/components/ui/editorial'
import { EmptyState } from '@/components/ui/entry'
import { FilterForm } from '@/components/ui/FilterForm'
import { Figure, MediaImage } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { ILLUSTRATION } from '@/lib/atlas/art'
import { resolveArt } from '@/lib/atlas/resolve'
import { getTerms, listDocuments } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { RELIABILITY_INFO, RELIABILITY_STATES } from '@/lib/editorial'
import { paths } from '@/lib/routes'

export const metadata: Metadata = {
  title: 'Manuscritos e documentos antigos',
  description: 'Profecias, pergaminhos, inscrições, cartas, tratados e fragmentos do universo de Kael Draken, com origem, contexto e grau de confiabilidade.',
  alternates: { canonical: '/manuscritos' },
}

type Search = { q?: string; tipo?: string; confiabilidade?: string }

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const viewer = await getViewer()
  const filters = await searchParams
  const [documents, types, archive] = await Promise.all([listDocuments(viewer, filters), getTerms('document_type'), resolveArt(ILLUSTRATION.capitulo7, viewer)])
  const typeLabels = new Map(types.map((t) => [t.slug, t.label]))

  return (
    <>
      <PageHero
        eyebrow="Arquivo"
        title="Manuscritos e documentos antigos"
        lede="Um arquivo recolhido entre ruínas e bibliotecas. Cada documento traz sua transcrição, sua origem conhecida, seu contexto e o grau de confiança que merece — alguns contradizem a história oficial."
        crumbs={[{ label: 'Manuscritos' }]}
        className="archive-hero"
      />
      <section className="section" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="container">
          {archive ? (
            <div className="section-plate">
              <Figure image={archive} />
            </div>
          ) : null}
          <FilterForm action={paths.documents} resetHref={paths.documents}>
            <div className="field field--search">
              <label htmlFor="d-q">Buscar</label>
              <input id="d-q" type="search" name="q" defaultValue={filters.q ?? ''} placeholder="Título ou trecho" />
            </div>
            <div className="field">
              <label htmlFor="d-tipo">Tipo</label>
              <select id="d-tipo" name="tipo" defaultValue={filters.tipo ?? ''}>
                <option value="">Todos</option>
                {types.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="d-conf">Confiabilidade</label>
              <select id="d-conf" name="confiabilidade" defaultValue={filters.confiabilidade ?? ''}>
                <option value="">Todas</option>
                {RELIABILITY_STATES.map((r) => (
                  <option key={r} value={r}>
                    {RELIABILITY_INFO[r].label}
                  </option>
                ))}
              </select>
            </div>
          </FilterForm>
          <p className="results-count" role="status">
            {documents.length === 1 ? '1 documento' : `${documents.length} documentos`}
          </p>
          {documents.length ? (
            <ul className="archive-grid">
              {documents.map((d) => (
                <li key={d.id}>
                  <Link className="doc-slip parchment" href={paths.document(d.slug)}>
                    {d.image ? (
                      <span className="doc-slip__image">
                        <MediaImage image={d.image} sizes="320px" alt="" />
                      </span>
                    ) : null}
                    <span className="doc-slip__type">{typeLabels.get(d.docType) ?? 'Documento'}</span>
                    <span className="doc-slip__title">{d.title}</span>
                    {d.excerpt ? <span className="doc-slip__excerpt">“{d.excerpt}”</span> : null}
                    <span className="doc-slip__meta">
                      <span>Origem: {d.origin || 'desconhecida'}</span>
                      <Reliability value={d.reliability} />
                    </span>
                    <span className="badges" style={{ marginTop: 'var(--space-2)' }}>
                      <CanonBadge canon={d.canon} short />
                      <SpoilerBadge level={d.spoiler} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhum documento encontrado" />
          )}
        </div>
      </section>
    </>
  )
}
