import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EditorialBadges } from '@/components/ui/editorial'
import { HiddenNotice, SpoilerGate } from '@/components/ui/entry'
import { PageHero } from '@/components/ui/PageHero'
import { Prose } from '@/components/ui/Prose'
import { getChapter } from '@/lib/content/queries'
import { prepareRichText } from '@/lib/content/rich'
import { getViewer } from '@/lib/content/viewer'
import { isLocked } from '@/lib/content/visibility'
import { lockedMetadata } from '@/lib/metadata'
import { paths } from '@/lib/routes'

type Params = Promise<{ slug: string; numero: string }>

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, numero } = await params
  const viewer = await getViewer()
  const data = await getChapter(slug, Number(numero), viewer)
  if (!data) return {}
  if (isLocked(data.chapter, viewer)) return lockedMetadata
  return { title: `${data.chapter.title} — ${data.book.title}`, alternates: { canonical: paths.chapter(slug, data.chapter.number) } }
}

export default async function ChapterPage({ params }: { params: Params }) {
  const { slug, numero } = await params
  const n = Number(numero)
  if (!Number.isInteger(n)) notFound()
  const viewer = await getViewer()
  const data = await getChapter(slug, n, viewer)
  if (!data) notFound()
  if (isLocked(data.chapter, viewer)) return <SpoilerGate level={data.chapter.spoiler} />
  const render = await prepareRichText(viewer, [data.chapter.body])
  const body = render(data.chapter.body)

  return (
    <article>
      <PageHero
        eyebrow={`Capítulo ${data.chapter.number}`}
        title={data.chapter.title}
        subtitle={data.book.title}
        crumbs={[
          { label: 'Livros', href: paths.books },
          { label: data.book.title, href: paths.book(data.book.slug) },
          { label: `Capítulo ${data.chapter.number}` },
        ]}
      >
        <EditorialBadges canon={data.chapter.canon} spoiler={data.chapter.spoiler} status={data.chapter.status} preview={viewer.preview} />
      </PageHero>
      <div className="container container--narrow reading">
        <HiddenNotice count={body.hiddenCount} level={viewer.spoiler} />
        <Prose result={body} />
        <nav className="pager" aria-label="Capítulos" style={{ marginTop: 'var(--space-8)' }}>
          {data.previous ? (
            <Link href={paths.chapter(data.book.slug, data.previous.number)}>
              <span className="pager__dir">← Capítulo {data.previous.number}</span>
              <span className="pager__title">{data.previous.title}</span>
            </Link>
          ) : (
            <span />
          )}
          {data.next ? (
            <Link className="pager__next" href={paths.chapter(data.book.slug, data.next.number)}>
              <span className="pager__dir">Capítulo {data.next.number} →</span>
              <span className="pager__title">{data.next.title}</span>
            </Link>
          ) : null}
        </nav>
      </div>
    </article>
  )
}
