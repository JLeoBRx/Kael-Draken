import type { Metadata } from 'next'
import Link from 'next/link'
import { CanonBadge } from '@/components/ui/editorial'
import { EmptyState } from '@/components/ui/entry'
import { BookCover } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { getOfficialCover } from '@/lib/content/media'
import { listBooks } from '@/lib/content/queries'
import { getSettings } from '@/lib/content/settings'
import { getViewer } from '@/lib/content/viewer'
import { toRoman } from '@/lib/format'
import { paths } from '@/lib/routes'

export const metadata: Metadata = { title: 'Livros', description: 'Os volumes da saga Kael Draken.', alternates: { canonical: '/livros' } }

export default async function BooksPage() {
  const viewer = await getViewer()
  const [books, settings] = await Promise.all([listBooks(viewer), getSettings()])
  const officialCover = await getOfficialCover(settings.cover_media_id, 'Capa oficial')
  return (
    <>
      <PageHero glyph="livro" eyebrow="A saga" title="Livros" crumbs={[{ label: 'Livros' }]} />
      <section className="section" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="container">
          {books.length ? (
            <ul className="card-grid">
              {books.map((b) => (
                <li key={b.id}>
                  <Link className="char-card" href={paths.book(b.slug)} style={{ gridTemplateColumns: '120px 1fr' }}>
                    <BookCover cover={b.cover ?? (b.volume === 1 ? officialCover : null)} title={b.title} note="Capa em breve" />
                    <span className="char-card__body">
                      <span className="eyebrow">Livro {toRoman(b.volume)}</span>
                      <span className="char-card__name">{b.title}</span>
                      {b.subtitle ? <span className="char-card__titles">{b.subtitle}</span> : null}
                      <span className="badges">
                        <CanonBadge canon={b.canon} short />
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState glyph="livro" title="Nenhum livro publicado" />
          )}
        </div>
      </section>
    </>
  )
}
