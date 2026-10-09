import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/ui/entry'
import { MediaImage } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { countPosts, getTerms, listPosts } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { formatDate } from '@/lib/format'
import { paths } from '@/lib/routes'

export const metadata: Metadata = {
  title: 'Novidades e diário de desenvolvimento',
  description: 'Novos mapas, documentos, personagens, reinos e atualizações do universo de Kael Draken.',
  alternates: { canonical: '/novidades' },
}

const PER_PAGE = 10

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ categoria?: string; pagina?: string }> }) {
  const viewer = await getViewer()
  const { categoria, pagina } = await searchParams
  const page = Math.max(1, Number(pagina) || 1)
  const [posts, total, categories] = await Promise.all([
    listPosts(viewer, { categoria, limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
    countPosts(viewer, categoria),
    getTerms('post_category'),
  ])
  const labels = new Map(categories.map((c) => [c.slug, c.label]))
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))
  const query = (p: number) => {
    const params = new URLSearchParams()
    if (categoria) params.set('categoria', categoria)
    if (p > 1) params.set('pagina', String(p))
    const qs = params.toString()
    return qs ? `${paths.news}?${qs}` : paths.news
  }

  return (
    <>
      <PageHero
        eyebrow="Diário de desenvolvimento"
        title="Novidades"
        lede="Anúncios de novos mapas, documentos, personagens e reinos, e notas sobre a construção do universo."
        crumbs={[{ label: 'Novidades' }]}
      />
      <section className="section" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="container container--narrow">
          <nav aria-label="Categorias" style={{ marginBottom: 'var(--space-6)' }}>
            <ul className="inline-links">
              <li>
                <Link href={paths.news} aria-current={!categoria ? 'page' : undefined}>
                  Todas
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={`${paths.news}?categoria=${c.slug}`} aria-current={categoria === c.slug ? 'page' : undefined}>
                    {c.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {posts.length ? (
            <ul className="post-list">
              {posts.map((p) => (
                <li key={p.id} className={`post-item${p.image ? ' post-item--with-image' : ''}`}>
                  {p.image ? (
                    <div className="post-item__image">
                      <MediaImage image={p.image} sizes="180px" />
                    </div>
                  ) : null}
                  <div>
                    <p className="post-item__meta">
                      <time dateTime={p.publishedAt ?? p.createdAt}>{formatDate(p.publishedAt ?? p.createdAt)}</time>
                      {p.category ? <span className="post-item__category">{labels.get(p.category) ?? p.category}</span> : null}
                    </p>
                    <h2 style={{ fontSize: '1.7rem', margin: 'var(--space-2) 0' }}>
                      <Link href={paths.post(p.slug)} style={{ textDecoration: 'none' }}>
                        {p.title}
                      </Link>
                    </h2>
                    {p.excerpt ? <p>{p.excerpt}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nenhuma publicação nesta categoria" />
          )}
          {pages > 1 ? (
            <nav className="pager" aria-label="Paginação" style={{ marginTop: 'var(--space-6)' }}>
              {page > 1 ? (
                <Link href={query(page - 1)}>
                  <span className="pager__dir">← Mais recentes</span>
                </Link>
              ) : (
                <span />
              )}
              {page < pages ? (
                <Link className="pager__next" href={query(page + 1)}>
                  <span className="pager__dir">Anteriores →</span>
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </section>
    </>
  )
}
