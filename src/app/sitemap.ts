import type { MetadataRoute } from 'next'
import { getPublicPaths } from '@/lib/content/queries'
import { siteUrl } from '@/lib/site'

export const dynamic = 'force-dynamic'

const STATIC = ['/', '/atlas', '/personagens', '/locais', '/mitologia', '/cronologia', '/ressonancia', '/manuscritos', '/livros', '/novidades', '/misterios', '/sobre']

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl()
  const entries = await getPublicPaths()
  return [
    ...STATIC.map((p) => ({ url: new URL(p, base).toString(), changeFrequency: 'weekly' as const })),
    ...entries.map((e) => ({ url: new URL(e.path, base).toString(), lastModified: e.updated })),
  ]
}
