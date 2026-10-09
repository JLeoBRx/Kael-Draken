import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { COLLECTIONS, isCollectionKey } from '@/lib/admin/collections'
import { listRows } from '@/lib/admin/data'
import { CANON_INFO, CANON_STATES, PUBLICATION_INFO, PUBLICATION_STATES, SPOILER_INFO, type CanonState, type PublicationState, type SpoilerLevel } from '@/lib/editorial'
import { formatShortDate } from '@/lib/format'

export async function generateMetadata({ params }: { params: Promise<{ collection: string }> }): Promise<Metadata> {
  const { collection } = await params
  return { title: isCollectionKey(collection) ? COLLECTIONS[collection].label : 'Coleção' }
}

export default async function CollectionPage({ params, searchParams }: { params: Promise<{ collection: string }>; searchParams: Promise<{ q?: string; status?: string; canon?: string; excluido?: string }> }) {
  const { collection } = await params
  if (!isCollectionKey(collection)) notFound()
  const def = COLLECTIONS[collection]
  const filters = await searchParams
  const rows = await listRows(collection, filters)

  return (
    <>
      <header className="adm-head adm-head--split">
        <div>
          <h1>{def.label}</h1>
          <p className="adm-help">{def.description}</p>
        </div>
        <Link className="adm-btn adm-btn--primary" href={`/admin/${collection}/novo`}>
          Novo {def.singular.toLowerCase()}
        </Link>
      </header>
      {filters.excluido ? <p className="adm-ok">Item excluído.</p> : null}
      <form className="adm-filters" method="get">
        <div className="adm-field">
          <label className="adm-label" htmlFor="q">
            Buscar
          </label>
          <input id="q" name="q" type="search" defaultValue={filters.q ?? ''} />
        </div>
        <div className="adm-field">
          <label className="adm-label" htmlFor="status">
            Publicação
          </label>
          <select id="status" name="status" defaultValue={filters.status ?? ''}>
            <option value="">Todas</option>
            {PUBLICATION_STATES.map((s) => (
              <option key={s} value={s}>
                {PUBLICATION_INFO[s].label}
              </option>
            ))}
          </select>
        </div>
        {def.hasCanon ? (
          <div className="adm-field">
            <label className="adm-label" htmlFor="canon">
              Canon
            </label>
            <select id="canon" name="canon" defaultValue={filters.canon ?? ''}>
              <option value="">Todos</option>
              {CANON_STATES.map((c) => (
                <option key={c} value={c}>
                  {CANON_INFO[c].label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button type="submit" className="adm-btn">
          Filtrar
        </button>
      </form>
      <p className="adm-help" role="status">
        {rows.length === 1 ? '1 item' : `${rows.length} itens`}
      </p>
      {rows.length ? (
        <ul className="adm-list adm-list--table">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/admin/${collection}/${r.id}`} className="adm-row">
                <span className="adm-row__title">
                  {r.title}
                  {r.slug ? <small> /{r.slug}</small> : null}
                </span>
                {r.extra.map((e) => (
                  <span key={e.label} className="adm-row__meta" title={e.label}>
                    {e.value}
                  </span>
                ))}
                {def.hasCanon ? <span className="adm-row__meta">{CANON_INFO[r.canon as CanonState]?.label}</span> : null}
                {r.spoiler ? <span className="adm-pill adm-pill--spoiler">{SPOILER_INFO[r.spoiler as SpoilerLevel].label}</span> : null}
                <span className={`adm-pill adm-pill--${r.status}`}>{PUBLICATION_INFO[r.status as PublicationState]?.label ?? r.status}</span>
                <span className="adm-row__meta">{formatShortDate(r.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="adm-empty">Nenhum item encontrado.</p>
      )}
    </>
  )
}
