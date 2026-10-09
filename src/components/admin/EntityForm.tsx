'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { deleteEntityAction, saveEntityAction } from '@/app/admin/actions'
import type { CollectionDef, CollectionKey } from '@/lib/admin/collections'
import type { SaveResult } from '@/lib/admin/data'
import { CANON_INFO, CANON_STATES, PUBLICATION_INFO, SPOILER_INFO, SPOILER_LEVELS, type PublicationState } from '@/lib/editorial'
import { Field, type MediaItem, type Option } from './fields'

interface Props {
  collection: CollectionKey
  def: CollectionDef
  id: number | null
  values: Record<string, string | string[] | boolean>
  options: Record<string, Option[]>
  media: MediaItem[]
  previewPath: string | null
  notice?: string
}

export function EntityForm({ collection, def, id, values, options, media, previewPath, notice }: Props) {
  const save = saveEntityAction.bind(null, collection, id)
  const [state, action, pending] = useActionState<SaveResult, FormData>(save, { ok: true, errors: [], version: 0 })
  const current = state.values ? { ...values, ...state.values } : values
  const status = (String(values.status || 'rascunho') as PublicationState) || 'rascunho'
  const [confirmDelete, setConfirmDelete] = useState(false)
  const str = (k: string) => (typeof current[k] === 'string' ? (current[k] as string) : '')

  return (
    <>
      <form action={action} className="adm-form" noValidate={false}>
        <div className="adm-form__main" key={state.version}>
          {notice ? <p className="adm-ok" role="status">{notice}</p> : null}
          {state.message && state.ok ? (
            <p className="adm-ok" role="status">
              {state.message}
            </p>
          ) : null}
          {state.errors.length ? (
            <div className="adm-error-box" role="alert">
              <p>
                <strong>Não foi possível salvar:</strong>
              </p>
              <ul>
                {state.errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {def.groups.map((group) => (
            <fieldset key={group.title} className="adm-group">
              <legend>{group.title}</legend>
              {group.fields.map((field) => (
                <Field key={field.name} field={field} value={current[field.name]} options={options[field.name]} media={media} />
              ))}
            </fieldset>
          ))}
        </div>

        <aside className="adm-form__side" key={`side-${state.version}`}>
          <div className="adm-card">
            <h2>Publicação</h2>
            <p className="adm-status">
              Estado atual: <span className={`adm-pill adm-pill--${status}`}>{PUBLICATION_INFO[status]?.label ?? status}</span>
            </p>
            <p className="adm-help">{PUBLICATION_INFO[status]?.description}</p>
            <div className="adm-actions">
              <button type="submit" name="intent" value="salvar" className="adm-btn" disabled={pending}>
                {pending ? 'Salvando…' : 'Salvar'}
              </button>
              {status !== 'publicado' ? (
                <button type="submit" name="intent" value="publicar" className="adm-btn adm-btn--primary" disabled={pending}>
                  Salvar e publicar
                </button>
              ) : (
                <button type="submit" name="intent" value="despublicar" className="adm-btn" disabled={pending}>
                  Retirar do site
                </button>
              )}
              {status !== 'arquivado' && id ? (
                <button type="submit" name="intent" value="arquivar" className="adm-btn adm-btn--ghost" disabled={pending}>
                  Arquivar
                </button>
              ) : null}
            </div>
            {previewPath ? (
              <p>
                <a className="adm-link" href={`/api/preview?caminho=${encodeURIComponent(previewPath)}`} target="_blank" rel="noopener">
                  Pré-visualizar no site ↗
                </a>
                <span className="adm-help"> Mostra rascunhos, notas privadas e todos os spoilers.</span>
              </p>
            ) : id ? null : (
              <p className="adm-help">Salve para habilitar a pré-visualização.</p>
            )}
          </div>

          <div className="adm-card">
            <h2>Estado editorial</h2>
            {def.hasSlug ? (
              <div className="adm-field">
                <label className="adm-label" htmlFor="f-slug">
                  Identificador (slug)
                </label>
                <input id="f-slug" name="slug" defaultValue={str('slug')} pattern="[a-z0-9]+(-[a-z0-9]+)*" aria-describedby="f-slug-help" />
                <p className="adm-help" id="f-slug-help">
                  Parte do endereço. Vazio: gerado a partir do título.
                </p>
              </div>
            ) : null}
            {def.hasCanon ? (
              <div className="adm-field">
                <label className="adm-label" htmlFor="f-canon">
                  Estado de canon
                </label>
                <select id="f-canon" name="canon" defaultValue={str('canon') || 'provisorio'}>
                  {CANON_STATES.map((c) => (
                    <option key={c} value={c}>
                      {CANON_INFO[c].label} — {CANON_INFO[c].description}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="adm-field">
              <label className="adm-label" htmlFor="f-spoiler">
                Nível de spoiler
              </label>
              <select id="f-spoiler" name="spoiler" defaultValue={str('spoiler') || '0'}>
                {SPOILER_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {SPOILER_INFO[l].label}
                  </option>
                ))}
              </select>
              <p className="adm-help">O item inteiro só aparece para quem escolheu este nível ou superior.</p>
            </div>
            <div className="adm-field">
              <label className="adm-label" htmlFor="f-notes">
                Anotações privadas
              </label>
              <textarea id="f-notes" name="notes" rows={5} defaultValue={str('notes')} aria-describedby="f-notes-help" />
              <p className="adm-help" id="f-notes-help">
                Nunca aparecem no site público.
              </p>
            </div>
          </div>
        </aside>
      </form>

      {id ? (
        <div className="adm-danger">
          {confirmDelete ? (
            <form action={deleteEntityAction.bind(null, collection, id)} className="adm-danger__confirm">
              <p>
                Excluir <strong>definitivamente</strong> este {def.singular.toLowerCase()} e suas relações? Para retirá-lo do site sem perder o conteúdo, use “Arquivar”.
              </p>
              <button type="submit" className="adm-btn adm-btn--danger">
                Sim, excluir
              </button>
              <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
            </form>
          ) : (
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setConfirmDelete(true)}>
              Excluir…
            </button>
          )}
          <Link className="adm-link" href={`/admin/${collection}`}>
            ← Voltar à lista
          </Link>
        </div>
      ) : null}
    </>
  )
}
