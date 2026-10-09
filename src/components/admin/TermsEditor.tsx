'use client'

import { useActionState, useTransition } from 'react'
import { deleteTermAction, saveTermAction, type FormState } from '@/app/admin/actions'

interface Term {
  id: number
  slug: string
  label: string
  sortOrder: number
}

function TermRow({ vocabulary, term }: { vocabulary: string; term: Term }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTermAction, {})
  const [, startTransition] = useTransition()
  return (
    <li>
      <form action={action} className="adm-term">
        <input type="hidden" name="vocabulary" value={vocabulary} />
        <input type="hidden" name="id" value={term.id} />
        <input name="label" defaultValue={term.label} aria-label="Nome" required />
        <input name="slug" defaultValue={term.slug} aria-label="Identificador" />
        <input name="sortOrder" type="number" defaultValue={term.sortOrder} aria-label="Ordem" className="adm-term__order" />
        <button type="submit" className="adm-btn" disabled={pending}>
          Salvar
        </button>
        <button type="button" className="adm-btn adm-btn--ghost" onClick={() => startTransition(() => deleteTermAction(term.id))}>
          Excluir
        </button>
        {state.error ? <span className="adm-error">{state.error}</span> : null}
      </form>
    </li>
  )
}

export function TermsEditor({ vocabulary, title, terms }: { vocabulary: string; title: string; terms: Term[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveTermAction, {})
  return (
    <section className="adm-card" aria-labelledby={`v-${vocabulary}`}>
      <h2 id={`v-${vocabulary}`}>{title}</h2>
      <ul className="adm-terms">
        {terms.map((t) => (
          <TermRow key={`${t.id}-${t.label}-${t.slug}`} vocabulary={vocabulary} term={t} />
        ))}
      </ul>
      <form action={action} className="adm-term adm-term--new">
        <input type="hidden" name="vocabulary" value={vocabulary} />
        <input name="label" placeholder="Novo termo" aria-label={`Novo termo em ${title}`} required />
        <input name="slug" placeholder="identificador (opcional)" aria-label="Identificador" />
        <button type="submit" className="adm-btn" disabled={pending}>
          Adicionar
        </button>
        {state.error ? <span className="adm-error">{state.error}</span> : null}
        {state.message ? <span className="adm-ok">{state.message}</span> : null}
      </form>
    </section>
  )
}
