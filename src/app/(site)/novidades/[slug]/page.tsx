import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { DraftBadge } from '@/components/ui/editorial'
import { HiddenNotice, SpoilerGate, TagList } from '@/components/ui/entry'
import { Figure } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { Prose } from '@/components/ui/Prose'
import { getPost, getTermLabels } from '@/lib/content/queries'
import { prepareRichText } from '@/lib/content/rich'
import { getViewer } from '@/lib/content/viewer'
import { isLocked } from '@/lib/content/visibility'
import { formatDate } from '@/lib/format'
import { entryMetadata, lockedMetadata } from '@/lib/metadata'
import { paths } from '@/lib/routes'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getPost(slug, viewer)
  if (!data) return {}
  if (isLocked(data.post, viewer)) return lockedMetadata
  return entryMetadata({ title: data.post.title, description: data.post.excerpt, path: paths.post(slug), image: data.image })
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getPost(slug, viewer)
  if (!data) notFound()
  const { post: p } = data
  if (isLocked(p, viewer)) return <SpoilerGate level={p.spoiler} />
  const [render, labels] = await Promise.all([prepareRichText(viewer, [p.body]), getTermLabels('post_category')])
  const body = render(p.body)
  const date = p.publishedAt ?? p.createdAt

  return (
    <article>
      <PageHero glyph="novidades" eyebrow={labels.get(p.category) ?? 'Novidade'} title={p.title} crumbs={[{ label: 'Novidades', href: paths.news }, { label: p.title }]}>
        <p className="post-item__meta">
          <time dateTime={date}>{formatDate(date)}</time>
        </p>
        {viewer.preview ? <DraftBadge status={p.status} /> : null}
      </PageHero>
      <div className="container container--narrow" style={{ paddingBlock: 'var(--space-7) var(--space-8)', display: 'grid', gap: 'var(--space-5)' }}>
        {data.image ? <Figure image={data.image} priority /> : null}
        {p.excerpt ? <p className="prose prose--lead">{p.excerpt}</p> : null}
        <HiddenNotice count={body.hiddenCount} level={viewer.spoiler} />
        <Prose result={body} />
        <TagList tags={data.tags} />
        <p>
          <Link className="text-link" href={paths.news}>
            ← Todas as novidades
          </Link>
        </p>
      </div>
    </article>
  )
}
