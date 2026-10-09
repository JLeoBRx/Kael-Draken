import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EntityForm } from '@/components/admin/EntityForm'
import { COLLECTIONS, isCollectionKey } from '@/lib/admin/collections'
import { loadForm } from '@/lib/admin/data'

export const metadata: Metadata = { title: 'Novo item' }

export default async function NewEntityPage({ params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params
  if (!isCollectionKey(collection)) notFound()
  const data = await loadForm(collection, null)
  if (!data) notFound()
  return (
    <>
      <header className="adm-head">
        <p className="adm-crumbs">
          <Link href={`/admin/${collection}`}>{COLLECTIONS[collection].label}</Link> / Novo
        </p>
        <h1>Novo {COLLECTIONS[collection].singular.toLowerCase()}</h1>
      </header>
      <EntityForm collection={collection} def={data.def} id={null} values={data.values} options={data.options} media={data.media} previewPath={null} />
    </>
  )
}
