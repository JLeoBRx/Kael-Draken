'use client'

import { useRouter } from 'next/navigation'
import { useRef, type ReactNode } from 'react'

/**
 * Formulário de filtros via GET. Funciona sem JavaScript (botão Filtrar);
 * com JavaScript, aplica automaticamente ao mudar uma seleção.
 */
export function FilterForm({ action, children, resetHref }: { action: string; children: ReactNode; resetHref: string }) {
  const ref = useRef<HTMLFormElement>(null)
  const router = useRouter()
  const submit = () => {
    const form = ref.current
    if (!form) return
    const params = new URLSearchParams()
    for (const [key, value] of new FormData(form)) if (typeof value === 'string' && value.trim()) params.set(key, value.trim())
    const qs = params.toString()
    router.replace(qs ? `${action}?${qs}` : action, { scroll: false })
  }
  return (
    <form
      ref={ref}
      className="filters"
      action={action}
      method="get"
      role="search"
      onChange={(e) => {
        if ((e.target as HTMLElement).tagName === 'SELECT') submit()
      }}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {children}
      <div className="filters__actions">
        <button type="submit" className="btn btn--small">
          Filtrar
        </button>
        <a className="text-link" href={resetHref}>
          Limpar
        </a>
      </div>
    </form>
  )
}
