'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { MenuIcon, SearchIcon } from '@/components/ui/icons'
import { NavLinks, type NavItem } from './NavLinks'

export function MobileNav({ items }: { items: NavItem[] }) {
  const ref = useRef<HTMLDetailsElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    if (ref.current) ref.current.open = false
    document.body.style.overflow = ''
  }, [pathname])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onToggle = () => {
      document.body.style.overflow = el.open ? 'hidden' : ''
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && el.open) {
        el.open = false
        el.querySelector('summary')?.focus()
      }
    }
    el.addEventListener('toggle', onToggle)
    document.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('toggle', onToggle)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <details className="mobile-nav" ref={ref}>
      <summary className="icon-button" aria-label="Abrir menu de navegação">
        <MenuIcon />
        <span aria-hidden="true">Menu</span>
      </summary>
      <nav className="mobile-nav__panel" aria-label="Navegação principal">
        <NavLinks items={items} className="mobile-nav__list" />
        <Link className="btn" href="/busca">
          <SearchIcon width={18} height={18} /> Buscar no arquivo
        </Link>
      </nav>
    </details>
  )
}
