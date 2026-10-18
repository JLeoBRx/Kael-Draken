import type { Metadata } from 'next'
import Link from 'next/link'
import { CanonBadge } from '@/components/ui/editorial'
import { EmptyState } from '@/components/ui/entry'
import { PageHero } from '@/components/ui/PageHero'
import { getTerms, search } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { ENTITY_LABELS } from '@/lib/editorial'

export const metadata: Metadata = { title: 'Buscar no arquivo', robots: { index: false } }

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string }> }) {
  const viewer = await getViewer()
  const { q = '', tag } = await searchParams
  const [results, tags] = await Promise.all([search(viewer, q.slice(0, 120), tag), getTerms('tag')])
  const activeTag = tags.find((t) => t.slug === tag)

  return (
    <>
      <PageHero glyph="busca" eyebrow="Arquivo" title="Buscar" crumbs={[{ label: 'Busca' }]} />
      <section className="section" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="container container--narrow">
          <form className="search-form" action="/busca" method="get" role="search">
            <label htmlFor="busca-q" className="visually-hidden">
              Termo de busca
            </label>
            <input id="busca-q" type="search" name="q" defaultValue={q} placeholder="Reinos, personagens, lugares, documentos…" />
            {tag ? <input type="hidden" name="tag" value={tag} /> : null}
            <button className="btn btn--primary" type="submit">
              Buscar
            </button>
          </form>
          {tags.length ? (
            <nav aria-label="Tags" style={{ marginBottom: 'var(--space-6)' }}>
              <ul className="tag-list">
                {tags.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/busca?tag=${t.slug}`} aria-current={t.slug === tag ? 'page' : undefined}>
                      {t.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          {q || tag ? (
            <p className="results-count" role="status">
              {results.length === 1 ? '1 resultado' : `${results.length} resultados`}
              {q ? ` para “${q}”` : ''}
              {activeTag ? ` com a tag “${activeTag.label}”` : ''}
            </p>
          ) : null}
          {results.length ? (
            <ul className="entry-list">
              {results.map((r) => (
                <li key={`${r.type}-${r.href}`}>
                  <Link className="entry-row" href={r.href}>
                    <span className="entry-row__kicker">{ENTITY_LABELS[r.type].singular}</span>
                    <span>
                      <span className="entry-row__title">{r.title}</span>
                      {r.summary ? <span className="entry-row__summary">{r.summary}</span> : null}
                    </span>
                    <span className="badges">
                      <CanonBadge canon={r.canon} short />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : q || tag ? (
            <EmptyState title="Nada encontrado">
              <p>A busca considera títulos e resumos dos verbetes visíveis no seu nível de spoiler.</p>
            </EmptyState>
          ) : null}
        </div>
      </section>
    </>
  )
}
