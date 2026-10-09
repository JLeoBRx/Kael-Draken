import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { EntityForm } from '@/components/admin/EntityForm'
import { MarkerEditor } from '@/components/admin/MarkerEditor'
import { RelationEditor } from '@/components/admin/RelationEditor'
import { COLLECTIONS, isCollectionKey } from '@/lib/admin/collections'
import { entityOptions, loadForm, vocabularyOptions } from '@/lib/admin/data'
import { db, schema as s } from '@/lib/db'

export const metadata: Metadata = { title: 'Editar' }

export default async function EditEntityPage({ params, searchParams }: { params: Promise<{ collection: string; id: string }>; searchParams: Promise<{ criado?: string }> }) {
  const { collection, id: rawId } = await params
  const { criado } = await searchParams
  if (!isCollectionKey(collection)) notFound()
  const id = Number(rawId)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const data = await loadForm(collection, id)
  if (!data) notFound()
  const def = COLLECTIONS[collection]
  const title = String(data.values[def.titleField] ?? '')

  let markerEditor = null
  if (collection === 'mapas') {
    const markers = await db.select().from(s.mapMarkers).where(eq(s.mapMarkers.mapId, id)).orderBy(asc(s.mapMarkers.label))
    const image = data.row?.imageId ? (await db.select().from(s.media).where(eq(s.media.id, data.row.imageId)))[0] : null
    markerEditor = (
      <MarkerEditor
        mapId={id}
        title={title}
        image={image ? { src: `/media/${image.path}`, width: image.width, height: image.height, alt: image.alt } : null}
        markers={markers.map((m) => ({ ...m, locationId: m.locationId ?? null, kingdomId: m.kingdomId ?? null }))}
        types={await vocabularyOptions('marker_type')}
        locations={await entityOptions('location')}
        kingdoms={await entityOptions('kingdom')}
      />
    )
  }

  let relationEditor = null
  if (collection === 'personagens') {
    const relations = await db
      .select({ relation: s.characterRelations, name: s.characters.name })
      .from(s.characterRelations)
      .innerJoin(s.characters, eq(s.characters.id, s.characterRelations.relatedId))
      .where(eq(s.characterRelations.characterId, id))
    relationEditor = (
      <RelationEditor
        characterId={id}
        relations={relations.map((r) => ({ ...r.relation, relatedName: r.name }))}
        characters={(await entityOptions('character')).filter((o) => o.value !== String(id))}
        kinds={await vocabularyOptions('relation_kind')}
      />
    )
  }

  return (
    <>
      <header className="adm-head">
        <p className="adm-crumbs">
          <Link href={`/admin/${collection}`}>{def.label}</Link> / Editar
        </p>
        <h1>{title || def.singular}</h1>
      </header>
      <EntityForm
        collection={collection}
        def={data.def}
        id={id}
        values={data.values}
        options={data.options}
        media={data.media}
        previewPath={data.previewPath}
        notice={criado ? 'Item criado. Ele continua como rascunho até ser publicado.' : undefined}
      />
      {markerEditor}
      {relationEditor}
    </>
  )
}
