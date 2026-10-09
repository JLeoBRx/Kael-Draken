import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { MapViewer } from '@/components/atlas/MapViewer'
import { EditorialBadges } from '@/components/ui/editorial'
import { PageHero } from '@/components/ui/PageHero'
import { getMap, getTermLabels } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { entryMetadata } from '@/lib/metadata'
import { paths } from '@/lib/routes'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const data = await getMap(slug, await getViewer())
  if (!data) return {}
  return entryMetadata({ title: data.map.title, description: data.map.description, path: paths.map(slug), image: data.image })
}

export default async function MapPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ marcador?: string }> }) {
  const { slug } = await params
  const { marcador } = await searchParams
  const viewer = await getViewer()
  const [data, typeLabels] = await Promise.all([getMap(slug, viewer), getTermLabels('marker_type')])
  if (!data) notFound()
  if (data.map.isPrimary) redirect(paths.atlas)

  return (
    <>
      <PageHero eyebrow="Mapa" title={data.map.title} crumbs={[{ label: 'Atlas', href: paths.atlas }, { label: data.map.title }]}>
        <EditorialBadges canon={data.map.canon} spoiler={data.map.spoiler} status={data.map.status} preview={viewer.preview} />
      </PageHero>
      <section className="section" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="container container--wide">
          <MapViewer
            title={data.map.title}
            image={data.image}
            markers={data.markers}
            provisional={data.map.provisional}
            typeLabels={Object.fromEntries(typeLabels)}
            initialMarkerId={marcador ? Number(marcador) : null}
          />
          {data.map.description ? (
            <div className="map-meta" style={{ borderTop: 0, paddingInline: 0 }}>
              <p>{data.map.description}</p>
            </div>
          ) : null}
        </div>
      </section>
    </>
  )
}
