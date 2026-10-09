'use client'

import { useActionState, useState, useTransition } from 'react'
import { deleteMediaAction, updateMediaAction, uploadMediaAction, type UploadState } from '@/app/admin/actions'

interface Item {
  id: number
  src: string
  alt: string
  caption: string
  credit: string
  width: number
  height: number
  size: number
  name: string
}

export function MediaLibrary({ items, maxMb }: { items: Item[]; maxMb: number }) {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadMediaAction, {})
  const [error, setError] = useState<string | null>(null)
  const [saving, startTransition] = useTransition()
  return (
    <>
      <form action={action} className="adm-card adm-upload">
        <h2>Enviar imagens</h2>
        <p className="adm-help">JPG, PNG, WebP, AVIF ou GIF, até {maxMb} MB cada. O conteúdo do arquivo é verificado no servidor; SVG não é aceito.</p>
        <div className="adm-grid">
          <div className="adm-field">
            <label className="adm-label" htmlFor="files">
              Arquivos
            </label>
            <input id="files" name="files" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,image/gif" required />
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="alt">
              Texto alternativo (para todas)
            </label>
            <input id="alt" name="alt" placeholder="Descreva a imagem para leitores de tela" />
          </div>
        </div>
        <button type="submit" className="adm-btn adm-btn--primary" disabled={pending}>
          {pending ? 'Enviando…' : 'Enviar'}
        </button>
        {state.message ? <p className="adm-ok">{state.message}</p> : null}
        {state.errors?.map((e) => (
          <p key={e} className="adm-error">
            {e}
          </p>
        ))}
      </form>
      {error ? (
        <p className="adm-error" role="alert">
          {error}
        </p>
      ) : null}
      {items.length ? (
        <ul className="adm-library">
          {items.map((m) => (
            <li key={m.id} className="adm-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.src} alt={m.alt} loading="lazy" />
              <p className="adm-help">
                #{m.id} · {m.width}×{m.height} · {(m.size / 1024).toFixed(0)} KB · {m.name}
              </p>
              <form action={(form) => startTransition(() => updateMediaAction(form))}>
                <input type="hidden" name="id" value={m.id} />
                <div className="adm-field">
                  <label className="adm-label" htmlFor={`alt-${m.id}`}>
                    Texto alternativo
                  </label>
                  <input id={`alt-${m.id}`} name="alt" defaultValue={m.alt} />
                </div>
                <div className="adm-field">
                  <label className="adm-label" htmlFor={`cap-${m.id}`}>
                    Legenda
                  </label>
                  <input id={`cap-${m.id}`} name="caption" defaultValue={m.caption} />
                </div>
                <div className="adm-field">
                  <label className="adm-label" htmlFor={`cred-${m.id}`}>
                    Crédito
                  </label>
                  <input id={`cred-${m.id}`} name="credit" defaultValue={m.credit} />
                </div>
                <div className="adm-actions">
                  <button type="submit" className="adm-btn" disabled={saving}>
                    Salvar
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--ghost"
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteMediaAction(m.id)
                        setError(result.error ?? null)
                      })
                    }
                  >
                    Excluir
                  </button>
                </div>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="adm-empty">Nenhuma imagem enviada ainda.</p>
      )}
    </>
  )
}
