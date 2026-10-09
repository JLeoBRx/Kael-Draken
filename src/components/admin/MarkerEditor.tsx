'use client'

import { useActionState, useState, useTransition } from 'react'
import { deleteMarkerAction, saveMarkerAction, type FormState } from '@/app/admin/actions'
import { MapViewer } from '@/components/atlas/MapViewer'
import { PUBLICATION_INFO, PUBLICATION_STATES, SPOILER_INFO, SPOILER_LEVELS } from '@/lib/editorial'
import type { Option } from './fields'

interface Marker {
  id: number
  label: string
  markerType: string
  x: number
  y: number
  description: string
  locationId: number | null
  kingdomId: number | null
  provisional: boolean
  spoiler: number
  status: string
}

const EMPTY = { id: 0, label: '', markerType: 'cidade', x: 50, y: 50, description: '', locationId: null, kingdomId: null, provisional: true, spoiler: 0, status: 'rascunho' }

export function MarkerEditor({ mapId, title, image, markers, types, locations, kingdoms }: {
  mapId: number
  title: string
  image: { src: string; width: number; height: number; alt: string } | null
  markers: Marker[]
  types: Option[]
  locations: Option[]
  kingdoms: Option[]
}) {
  const [editing, setEditing] = useState<Marker>({ ...EMPTY })
  const [version, setVersion] = useState(0)
  const [state, action, pending] = useActionState<FormState, FormData>(async (prev, form) => {
    const result = await saveMarkerAction(prev, form)
    if (!result.error) {
      setEditing({ ...EMPTY })
      setVersion((v) => v + 1)
    }
    return result
  }, {})
  const [, startTransition] = useTransition()
  const typeLabels = Object.fromEntries(types.map((t) => [t.value, t.label]))

  return (
    <section className="adm-card adm-markers" aria-labelledby="marcadores">
      <h2 id="marcadores">Marcadores do mapa</h2>
      <p className="adm-help">
        Clique no mapa para posicionar o marcador e preencha os dados. Marque como provisório tudo o que ainda não foi aprovado. Marcadores em rascunho só aparecem na pré-visualização.
      </p>
      <MapViewer
        title={title}
        image={image}
        markers={[...markers.filter((m) => m.id !== editing.id), { ...editing, id: -1, label: editing.label || 'Novo marcador', href: null }].map((m) => ({ ...m, href: null }))}
        provisional
        typeLabels={typeLabels}
        onPick={(x, y) => setEditing((e) => ({ ...e, x, y }))}
        pickLabel="Clique para posicionar o marcador"
      />
      <form action={action} className="adm-subform" key={`${editing.id}-${version}`}>
        <input type="hidden" name="mapId" value={mapId} />
        <input type="hidden" name="id" value={editing.id || ''} />
        <div className="adm-grid">
          <div className="adm-field">
            <label className="adm-label" htmlFor="m-label">
              Nome
            </label>
            <input id="m-label" name="label" defaultValue={editing.label} required />
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="m-type">
              Tipo
            </label>
            <select id="m-type" name="markerType" defaultValue={editing.markerType}>
              {types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="adm-field adm-field--short">
            <label className="adm-label" htmlFor="m-x">
              Posição X (%)
            </label>
            <input id="m-x" name="x" type="number" step="0.01" min="0" max="100" value={editing.x} onChange={(e) => setEditing({ ...editing, x: Number(e.target.value) })} />
          </div>
          <div className="adm-field adm-field--short">
            <label className="adm-label" htmlFor="m-y">
              Posição Y (%)
            </label>
            <input id="m-y" name="y" type="number" step="0.01" min="0" max="100" value={editing.y} onChange={(e) => setEditing({ ...editing, y: Number(e.target.value) })} />
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="m-loc">
              Local vinculado
            </label>
            <select id="m-loc" name="locationId" defaultValue={editing.locationId ?? ''}>
              <option value="">— Nenhum —</option>
              {locations.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="m-king">
              Reino vinculado
            </label>
            <select id="m-king" name="kingdomId" defaultValue={editing.kingdomId ?? ''}>
              <option value="">— Nenhum —</option>
              {kingdoms.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="m-spoiler">
              Spoiler
            </label>
            <select id="m-spoiler" name="spoiler" defaultValue={editing.spoiler}>
              {SPOILER_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {SPOILER_INFO[l].label}
                </option>
              ))}
            </select>
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="m-status">
              Publicação
            </label>
            <select id="m-status" name="status" defaultValue={editing.status}>
              {PUBLICATION_STATES.map((s) => (
                <option key={s} value={s}>
                  {PUBLICATION_INFO[s].label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="adm-field">
          <label className="adm-label" htmlFor="m-desc">
            Descrição breve
          </label>
          <textarea id="m-desc" name="description" rows={2} defaultValue={editing.description} />
        </div>
        <div className="adm-field adm-field--check">
          <input id="m-prov" name="provisional" type="checkbox" defaultChecked={editing.provisional} />
          <label htmlFor="m-prov">Posição provisória</label>
        </div>
        {state.error ? <p className="adm-error">{state.error}</p> : null}
        {state.message ? <p className="adm-ok">{state.message}</p> : null}
        <div className="adm-actions">
          <button type="submit" className="adm-btn adm-btn--primary" disabled={pending}>
            {editing.id ? 'Salvar marcador' : 'Adicionar marcador'}
          </button>
          {editing.id ? (
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setEditing({ ...EMPTY })}>
              Cancelar edição
            </button>
          ) : null}
        </div>
      </form>
      {markers.length ? (
        <ul className="adm-list">
          {markers.map((m) => (
            <li key={m.id} className="adm-row">
              <span className="adm-row__title">{m.label}</span>
              <span className="adm-row__meta">{typeLabels[m.markerType] ?? m.markerType}</span>
              <span className="adm-row__meta">
                {m.x.toFixed(1)}%, {m.y.toFixed(1)}%
              </span>
              <span className={`adm-pill adm-pill--${m.status}`}>{PUBLICATION_INFO[m.status as 'rascunho']?.label}</span>
              <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setEditing(m)}>
                Editar
              </button>
              <button type="button" className="adm-btn adm-btn--ghost" onClick={() => startTransition(() => deleteMarkerAction(m.id))}>
                Excluir
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
