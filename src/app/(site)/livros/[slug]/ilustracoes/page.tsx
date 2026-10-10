import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IllustrationGallery } from '@/components/book/IllustrationGallery'
import { EditorialBadges } from '@/components/ui/editorial'
import { EmptyState, SpoilerGate } from '@/components/ui/entry'
import { PageHero } from '@/components/ui/PageHero'
import { listBookIllustrations, toIllustrationItems } from '@/lib/content/illustrations'
import { getBookSummary } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { isLocked } from '@/lib/content/visibility'
import { toRoman } from '@/lib/format'
import { lockedMetadata, entryMetadata } from '@/lib/metadata'
import { paths } from '@/lib/routes'

type Params = Promise<{ slug: string }>

const INTRO = 'Imagens que acompanham os primeiros passos de Kael Draken e os vestígios de uma história que o mundo tentou esquecer.'


export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const viewer = await getViewer()
  const book = await getBookSummary(slug, viewer)
  if (!book) return {}
  if (isLocked(book, viewer)) return lockedMetadata
  const items = await listBookIllustrations(book, viewer)
  return entryMetadata({
    title: `Ilustrações do Livro ${toRoman(book.volume)} — ${book.title}`,
    description: INTRO,
    path: paths.bookIllustrations(slug),
    image: items.find((i) => i.image)?.image ?? null,
  })
}

export default async function BookIllustrationsPage({ params }: { params: Params }) {
  const { slug } = await params
  const viewer = await getViewer()
  const book = await getBookSummary(slug, viewer)
  if (!book) notFound()
  if (isLocked(book, viewer)) return <SpoilerGate level={book.spoiler} />
  const views = await listBookIllustrations(book, viewer)
  const counts = { final: 0, estudo: 0, pendente: 0 }
  for (const v of views) counts[v.artState]++
  const volume = toRoman(book.volume)

  return (
    <article>
      <PageHero
        eyebrow={`Livro ${volume} · ${book.title}`}
        title={`Ilustrações do Livro ${volume}`}
        lede={<em>“{INTRO}”</em>}
        crumbs={[{ label: 'Livros', href: paths.books }, { label: book.title, href: paths.book(book.slug) }, { label: 'Ilustrações' }]}
      >
        <EditorialBadges canon={book.canon} status={book.status} preview={viewer.preview} />
      </PageHero>
      <div className="container illus-page">
        {views.length ? (
          <>
            <div className="illus-intro">
              <p>
                Uma ilustração para cada capítulo, em ordem, no formato pensado para o livro impresso: vertical, 15,5 × 23 cm, em preto e branco. Selecione uma
                imagem para vê-la ampliada.
              </p>
              <ul className="illus-intro__counts" aria-label="Situação das ilustrações">
                <li>
                  <strong>{counts.final}</strong> {counts.final === 1 ? 'arte final' : 'artes finais'}
                </li>
                <li>
                  <strong>{counts.estudo}</strong> {counts.estudo === 1 ? 'versão provisória' : 'versões provisórias'}
                </li>
                <li>
                  <strong>{counts.pendente}</strong> em produção
                </li>
              </ul>
            </div>
            {counts.estudo ? (
              <p className="notice" role="note">
                <span>
                  <strong>Versões provisórias.</strong> As imagens marcadas assim ainda não estão prontas para a impressão e serão substituídas pela arte final.
                </span>
              </p>
            ) : null}
            <IllustrationGallery items={toIllustrationItems(views)} />
          </>
        ) : (
          <EmptyState title="Nenhuma ilustração publicada">
            <p>As ilustrações deste livro ainda não foram publicadas.</p>
          </EmptyState>
        )}
        <p className="illus-page__back">
          <Link className="btn btn--gold" href={paths.book(book.slug)}>
            ← Voltar ao Livro {volume}
          </Link>
        </p>
      </div>
    </article>
  )
}
