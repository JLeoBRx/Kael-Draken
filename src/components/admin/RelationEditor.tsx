'use client'

import { useActionState, useTransition } from 'react'
import { deleteRelationAction, saveRelationAction, type FormState } from '@/app/admin/actions'
import { PUBLICATION_INFO, PUBLICATION_STATES, SPOILER_INFO, SPOILER_LEVELS } from '@/lib/editorial'
import type { Option } from './fields'

interface Relation {
  id: number
  relatedId: number
  relatedName: string
  kind: string
  description: string
  spoiler: number
  status: string
}

export function RelationEditor({ characterId, relations, characters, kinds }: { characterId: number; relations: Relation[]; characters: Option[]; kinds: Option[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveRelationAction, {})
  const [, startTransition] = useTransition()
  const kindLabel = Object.fromEntries(kinds.map((k) => [k.value, k.label]))
  return (
    <section className="adm-card" aria-labelledby="relacoes">
      <h2 id="relacoes">Amizades, rivalidades e relacionamentos</h2>
      <p className="adm-help">Relações aparecem nas páginas dos dois personagens. Use o nível de spoiler quando a própria relação for uma revelação.</p>
      {relations.length ? (
        <ul className="adm-list">
          {relations.map((r) => (
            <li key={r.id} className="adm-row">
              <span className="adm-row__title">{r.relatedName}</span>
              <span className="adm-row__meta">{kindLabel[r.kind] ?? r.kind}</span>
              {r.spoiler ? <span className="adm-pill adm-pill--spoiler">{SPOILER_INFO[r.spoiler as 0].label}</span> : null}
              <span className={`adm-pill adm-pill--${r.status}`}>{PUBLICATION_INFO[r.status as 'rascunho']?.label}</span>
              <button type="button" className="adm-btn adm-btn--ghost" onClick={() => startTransition(() => deleteRelationAction(r.id))}>
                Remover
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="adm-empty">Nenhuma relação cadastrada.</p>
      )}
      {characters.length ? (
        <form action={action} className="adm-subform">
          <input type="hidden" name="characterId" value={characterId} />
          <div className="adm-grid">
            <div className="adm-field">
              <label className="adm-label" htmlFor="r-related">
                Personagem
              </label>
              <select id="r-related" name="relatedId" required>
                <option value="">Selecione…</option>
                {characters.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="r-kind">
                Tipo de relação
              </label>
              <select id="r-kind" name="kind">
                {kinds.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="r-spoiler">
                Spoiler
              </label>
              <select id="r-spoiler" name="spoiler" defaultValue="0">
                {SPOILER_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {SPOILER_INFO[l].label}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="r-status">
                Publicação
              </label>
              <select id="r-status" name="status" defaultValue="publicado">
                {PUBLICATION_STATES.map((s) => (
                  <option key={s} value={s}>
                    {PUBLICATION_INFO[s].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="r-desc">
              Descrição
            </label>
            <textarea id="r-desc" name="description" rows={2} />
          </div>
          {state.error ? <p className="adm-error">{state.error}</p> : null}
          {state.message ? <p className="adm-ok">{state.message}</p> : null}
          <button type="submit" className="adm-btn" disabled={pending}>
            Adicionar relação
          </button>
        </form>
      ) : (
        <p className="adm-help">Cadastre outros personagens para criar relações.</p>
      )}
    </section>
  )
}
