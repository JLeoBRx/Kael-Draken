'use client'

import { useEffect } from 'react'

/** Abre o <details> do item indicado no endereço (#evento-…), para links vindos de outras páginas. */
export function HashOpener() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (!id) return
      const target = document.getElementById(id)
      const details = target?.querySelector('details')
      if (details) details.open = true
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [])
  return null
}
