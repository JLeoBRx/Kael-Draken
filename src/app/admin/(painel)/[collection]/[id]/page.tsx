import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { EntityForm } from '@/components/admin/EntityForm'
import { MarkerEditor } from '@/components/admin/MarkerEditor'
import { RelationEditor } from '@/components/admin/RelationEditor'
import { COLLECTIONS, isCollectionKey } from '@/lib/admin/collections'
import { entityOptions, illustrationStatus, loadForm, vocabularyOptions } from '@/lib/admin/data'
import { db, schema as s } from '@/lib/db'
import { effectiveDpi, PRINT_SPEC, ratioDeviation } from '@/lib/illustrations'

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

  let illustrationInfo = null
  if (collection === 'ilustracoes' && data.row) {
    const info = await illustrationStatus(data.row)
    illustrationInfo = (
      <section className="adm-card adm-illustration" aria-labelledby="ilustracao-atual">
        <h2 id="ilustracao-atual">Imagem atual</h2>
        {info.src ? (
          <div className="adm-illustration__body">
            {/* eslint-disable-next-line @next/next/no-img-element -- miniatura do painel, sem otimização */}
            <img src={info.src} alt="" width={info.width} height={info.height} className="adm-illustration__thumb" />
            <dl className="adm-illustration__facts">
              <div>
                <dt>Origem</dt>
                <dd>{info.source === 'painel' ? 'Imagem escolhida no painel' : `Arquivo versionado ${info.src}`}</dd>
              </div>
              <div>
                <dt>Dimensões</dt>
                <dd>
                  {info.width} × {info.height} px · {effectiveDpi(info.width)} DPI em {String(PRINT_SPEC.widthCm).replace('.', ',')} × {PRINT_SPEC.heightCm} cm
                </dd>
              </div>
              <div>
                <dt>Proporção</dt>
                <dd>{ratioDeviation(info.width, info.height) <= 0.02 ? '31:46 (15,5 × 23 cm)' : `${(info.width / info.height).toFixed(3)} — esperado 0,674 (31:46)`}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p className="adm-help">Nenhuma imagem ainda. O site mostra “Arte em produção” para este capítulo.</p>
        )}
        {info.warnings.length ? (
          <ul className="adm-warnings">
            {info.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </section>
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
      {illustrationInfo}
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
