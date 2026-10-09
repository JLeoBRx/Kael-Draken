'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { previewMarkdownAction, uploadMediaAction, type UploadState } from '@/app/admin/actions'
import type { FieldDef } from '@/lib/admin/collections'

export interface Option {
  value: string
  label: string
}

export interface MediaItem {
  id: number
  src: string
  alt: string
  width: number
  height: number
  name: string
}

type Value = string | string[] | boolean | undefined

function Help({ id, text }: { id: string; text?: string }) {
  return text ? (
    <p className="adm-help" id={id}>
      {text}
    </p>
  ) : null
}

export function Field({ field, value, options = [], media = [] }: { field: FieldDef; value: Value; options?: Option[]; media?: MediaItem[] }) {
  const id = `f-${field.name}`
  const helpId = `${id}-help`
  const label = (
    <label htmlFor={id} className="adm-label">
      {field.label}
      {field.required ? <span aria-hidden="true"> *</span> : null}
    </label>
  )
  const describedBy = field.help ? helpId : undefined
  const str = typeof value === 'string' ? value : ''

  switch (field.type) {
    case 'text':
      return (
        <div className="adm-field">
          {label}
          <input id={id} name={field.name} type="text" defaultValue={str} required={field.required} placeholder={field.placeholder} aria-describedby={describedBy} />
          <Help id={helpId} text={field.help} />
        </div>
      )
    case 'textarea':
      return (
        <div className="adm-field">
          {label}
          <textarea id={id} name={field.name} rows={field.rows ?? 3} defaultValue={str} required={field.required} aria-describedby={describedBy} />
          <Help id={helpId} text={field.help} />
        </div>
      )
    case 'markdown':
      return <MarkdownField field={field} value={str} />
    case 'number':
      return (
        <div className="adm-field adm-field--short">
          {label}
          <input id={id} name={field.name} type="number" step="any" defaultValue={str} required={field.required} aria-describedby={describedBy} />
          <Help id={helpId} text={field.help} />
        </div>
      )
    case 'color':
      return (
        <div className="adm-field adm-field--short">
          {label}
          <input id={id} name={field.name} type="color" defaultValue={str || '#b8975a'} aria-describedby={describedBy} />
          <Help id={helpId} text={field.help} />
        </div>
      )
    case 'date':
      return (
        <div className="adm-field adm-field--short">
          {label}
          <input id={id} name={field.name} type="date" defaultValue={str ? str.slice(0, 10) : ''} aria-describedby={describedBy} />
          <Help id={helpId} text={field.help} />
        </div>
      )
    case 'boolean':
      return (
        <div className="adm-field adm-field--check">
          <input id={id} name={field.name} type="checkbox" defaultChecked={value === true || value === 'true' || value === '1'} aria-describedby={describedBy} />
          <label htmlFor={id}>{field.label}</label>
          <Help id={helpId} text={field.help} />
        </div>
      )
    case 'select':
    case 'reference':
      return (
        <div className="adm-field">
          {label}
          <select id={id} name={field.name} defaultValue={str} required={field.required} aria-describedby={describedBy}>
            <option value="">{field.required ? 'Selecione…' : '— Nenhum —'}</option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Help id={helpId} text={field.help} />
        </div>
      )
    case 'links':
    case 'tags':
      return <MultiSelect field={field} value={Array.isArray(value) ? value : []} options={options} />
    case 'media':
      return <MediaField field={field} value={str} media={media} />
    case 'gallery':
      return <GalleryField field={field} value={Array.isArray(value) ? value : []} media={media} />
  }
}

// ── Markdown ───────────────────────────────────────────────────────────

const SNIPPETS: Array<{ label: string; title: string; before: string; after?: string; block?: boolean }> = [
  { label: 'N', title: 'Negrito', before: '**', after: '**' },
  { label: 'I', title: 'Itálico', before: '*', after: '*' },
  { label: 'H', title: 'Título de seção', before: '## ', block: true },
  { label: '•', title: 'Lista', before: '- ', block: true },
  { label: '[[ ]]', title: 'Referência interna: [[tipo/slug|texto]]', before: '[[personagens/', after: '|texto]]' },
  { label: 'Spoiler 1', title: 'Bloco de revelações iniciais', before: '\n:::spoiler 1\n', after: '\n:::\n', block: true },
  { label: 'Spoiler 2', title: 'Bloco de revelações avançadas', before: '\n:::spoiler 2\n', after: '\n:::\n', block: true },
  { label: 'Nota privada', title: 'Nota privada (nunca aparece no site)', before: '%% ', after: ' %%' },
  { label: 'Imagem', title: 'Imagem: ![descrição](/media/… "legenda")', before: '![descrição](', after: ' "legenda")' },
]

export function MarkdownField({ field, value }: { field: FieldDef; value: string }) {
  const id = `f-${field.name}`
  const ref = useRef<HTMLTextAreaElement>(null)
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [html, setHtml] = useState('')
  const [pending, startTransition] = useTransition()

  const insert = (s: (typeof SNIPPETS)[number]) => {
    const el = ref.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b, value: v } = el
    const selected = v.slice(a, b)
    const text = `${s.before}${selected}${s.after ?? ''}`
    el.setRangeText(text, a, b, 'end')
    el.focus()
    if (!selected && s.after) el.setSelectionRange(a + s.before.length, a + s.before.length)
  }

  const showPreview = () => {
    setTab('preview')
    startTransition(async () => setHtml(await previewMarkdownAction(ref.current?.value ?? '')))
  }

  return (
    <div className="adm-field adm-md">
      <div className="adm-md__head">
        <label htmlFor={id} className="adm-label">
          {field.label}
        </label>
        <div className="adm-tabs" role="tablist" aria-label={`Modo de edição de ${field.label}`}>
          <button type="button" role="tab" aria-selected={tab === 'write'} onClick={() => setTab('write')}>
            Escrever
          </button>
          <button type="button" role="tab" aria-selected={tab === 'preview'} onClick={showPreview}>
            Pré-visualizar
          </button>
        </div>
      </div>
      <div className="adm-md__toolbar" role="toolbar" aria-label="Formatação" hidden={tab !== 'write'}>
        {SNIPPETS.map((s) => (
          <button key={s.label} type="button" title={s.title} onClick={() => insert(s)}>
            {s.label}
          </button>
        ))}
      </div>
      <textarea id={id} ref={ref} name={field.name} rows={field.rows ?? 8} defaultValue={value} hidden={tab !== 'write'} aria-describedby={field.help ? `${id}-help` : undefined} spellCheck />
      {tab === 'preview' ? (
        <div className="adm-md__preview prose" aria-busy={pending}>
          {pending ? <p>Gerando pré-visualização…</p> : html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <p className="adm-help">Nada para pré-visualizar.</p>}
        </div>
      ) : null}
      <Help id={`${id}-help`} text={field.help} />
    </div>
  )
}

// ── Seleção múltipla (relações e tags) ────────────────────────────────

export function MultiSelect({ field, value, options }: { field: FieldDef; value: string[]; options: Option[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(value))
  const [query, setQuery] = useState('')
  const id = `f-${field.name}`
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options
    return [...list].sort((a, b) => Number(selected.has(b.value)) - Number(selected.has(a.value)))
  }, [options, query, selected])

  return (
    <fieldset className="adm-field adm-multi">
      <legend className="adm-label">
        {field.label} <span className="adm-count">{selected.size ? `(${selected.size})` : ''}</span>
      </legend>
      {options.length > 8 ? (
        <input type="search" className="adm-multi__search" placeholder="Filtrar…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={`Filtrar ${field.label}`} />
      ) : null}
      {options.length ? (
        <ul className="adm-multi__list">
          {filtered.map((o) => (
            <li key={o.value}>
              <label>
                <input
                  type="checkbox"
                  name={field.name}
                  value={o.value}
                  checked={selected.has(o.value)}
                  onChange={(e) => {
                    const next = new Set(selected)
                    if (e.target.checked) next.add(o.value)
                    else next.delete(o.value)
                    setSelected(next)
                  }}
                />
                {o.label}
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="adm-help">Nenhum item disponível ainda.</p>
      )}
      {/* garante o envio de itens selecionados que estejam ocultos pelo filtro */}
      {[...selected]
        .filter((v) => !filtered.some((o) => o.value === v))
        .map((v) => (
          <input key={v} type="hidden" name={field.name} value={v} />
        ))}
      {field.help ? <p className="adm-help" id={`${id}-help`}>{field.help}</p> : null}
    </fieldset>
  )
}

// ── Mídia ──────────────────────────────────────────────────────────────

function MediaDialog({ open, onClose, media, onPick, multiple = false, selected }: { open: boolean; onClose: () => void; media: MediaItem[]; onPick: (ids: number[]) => void; multiple?: boolean; selected: number[] }) {
  const ref = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [chosen, setChosen] = useState<number[]>(selected)
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadMediaAction, {})
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      setChosen(selected)
    }
    if (!open && d.open) d.close()
  }, [open, selected])
  useEffect(() => {
    if (state.uploaded?.length) {
      router.refresh()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChosen((c) => (multiple ? [...c, ...state.uploaded!] : [state.uploaded![0]]))
    }
  }, [state, router, multiple])

  if (!mounted) return null
  return createPortal(
    <dialog ref={ref} className="adm-dialog" onClose={onClose} aria-label="Biblioteca de imagens">
      <div className="adm-dialog__head">
        <h2>Biblioteca de imagens</h2>
        <button type="button" className="adm-btn adm-btn--ghost" onClick={onClose}>
          Fechar
        </button>
      </div>
      <form action={action} className="adm-upload-inline">
        <label className="adm-label" htmlFor="dlg-upload">
          Enviar novas imagens
        </label>
        <input id="dlg-upload" type="file" name="files" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple />
        <input type="text" name="alt" placeholder="Texto alternativo (opcional)" aria-label="Texto alternativo" />
        <button type="submit" className="adm-btn" disabled={pending}>
          {pending ? 'Enviando…' : 'Enviar'}
        </button>
        {state.message ? <p className="adm-ok">{state.message}</p> : null}
        {state.errors?.map((e) => (
          <p key={e} className="adm-error">
            {e}
          </p>
        ))}
      </form>
      {media.length ? (
        <ul className="adm-media-grid">
          {media.map((m) => {
            const isChosen = chosen.includes(m.id)
            return (
              <li key={m.id}>
                <button
                  type="button"
                  aria-pressed={isChosen}
                  onClick={() => setChosen(multiple ? (isChosen ? chosen.filter((c) => c !== m.id) : [...chosen, m.id]) : [m.id])}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.src} alt={m.alt} loading="lazy" />
                  <span>{m.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="adm-help">Nenhuma imagem enviada ainda.</p>
      )}
      <div className="adm-dialog__foot">
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          onClick={() => {
            onPick(chosen)
            onClose()
          }}
        >
          Usar seleção
        </button>
      </div>
    </dialog>,
    document.body,
  )
}

export function MediaField({ field, value, media }: { field: FieldDef; value: string; media: MediaItem[] }) {
  const [current, setCurrent] = useState<number | null>(value ? Number(value) : null)
  const [open, setOpen] = useState(false)
  const item = media.find((m) => m.id === current)
  return (
    <div className="adm-field adm-media-field">
      <span className="adm-label">{field.label}</span>
      <input type="hidden" name={field.name} value={current ?? ''} />
      <div className="adm-media-field__row">
        {item ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.src} alt={item.alt} className="adm-thumb" />
        ) : (
          <span className="adm-thumb adm-thumb--empty">Sem imagem</span>
        )}
        <div className="adm-media-field__actions">
          <button type="button" className="adm-btn" onClick={() => setOpen(true)}>
            {item ? 'Trocar imagem' : 'Escolher imagem'}
          </button>
          {item ? (
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setCurrent(null)}>
              Remover
            </button>
          ) : null}
        </div>
      </div>
      {field.help ? <p className="adm-help">{field.help}</p> : null}
      <MediaDialog open={open} onClose={() => setOpen(false)} media={media} selected={current ? [current] : []} onPick={(ids) => setCurrent(ids[0] ?? null)} />
    </div>
  )
}

export function GalleryField({ field, value, media }: { field: FieldDef; value: string[]; media: MediaItem[] }) {
  const [items, setItems] = useState<number[]>(value.map(Number))
  const [open, setOpen] = useState(false)
  const move = (i: number, d: number) => {
    const next = [...items]
    const [it] = next.splice(i, 1)
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, it)
    setItems(next)
  }
  return (
    <div className="adm-field">
      <span className="adm-label">{field.label}</span>
      {items.map((id) => (
        <input key={id} type="hidden" name={field.name} value={id} />
      ))}
      {items.length ? (
        <ul className="adm-gallery">
          {items.map((id, i) => {
            const m = media.find((x) => x.id === id)
            return (
              <li key={id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {m ? <img src={m.src} alt={m.alt} /> : <span className="adm-thumb adm-thumb--empty">#{id}</span>}
                <div className="adm-gallery__actions">
                  <button type="button" onClick={() => move(i, -1)} aria-label="Mover para a esquerda" disabled={i === 0}>
                    ←
                  </button>
                  <button type="button" onClick={() => move(i, 1)} aria-label="Mover para a direita" disabled={i === items.length - 1}>
                    →
                  </button>
                  <button type="button" onClick={() => setItems(items.filter((x) => x !== id))} aria-label="Remover da galeria">
                    ✕
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="adm-help">Nenhuma imagem na galeria.</p>
      )}
      <button type="button" className="adm-btn" onClick={() => setOpen(true)}>
        Adicionar imagens
      </button>
      <MediaDialog open={open} onClose={() => setOpen(false)} media={media} multiple selected={items} onPick={(ids) => setItems(ids)} />
    </div>
  )
}
