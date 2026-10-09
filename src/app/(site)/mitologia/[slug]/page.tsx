import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArticleView } from '@/components/content/ArticleView'
import { SpoilerGate } from '@/components/ui/entry'
import { artImage } from '@/lib/atlas/art'
import { getArticle } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { isLocked } from '@/lib/content/visibility'
import { entryMetadata, lockedMetadata } from '@/lib/metadata'
import { paths } from '@/lib/routes'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getArticle('mitologia', slug, viewer)
  if (!data) return {}
  if (isLocked(data.article, viewer)) return lockedMetadata
  return entryMetadata({ title: data.article.title, description: data.article.summary, path: paths.article('mitologia', slug), image: data.image ?? artImage('article', `mitologia/${slug}`) })
}

export default async function MythArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getArticle('mitologia', slug, viewer)
  if (!data) notFound()
  if (isLocked(data.article, viewer)) return <SpoilerGate level={data.article.spoiler} />
  return <ArticleView data={data} viewer={viewer} />
}
