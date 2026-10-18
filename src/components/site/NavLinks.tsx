'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Glyph, type GlyphName } from '@/components/ui/glyphs'

export interface NavItem {
  href: string
  label: string
  match: string[]
  glyph?: GlyphName
}

function isActive(pathname: string, item: NavItem) {
  return item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`))
}

export function NavLinks({ items, className, glyphs = false }: { items: NavItem[]; className?: string; glyphs?: boolean }) {
  const pathname = usePathname()
  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} aria-current={isActive(pathname, item) ? 'page' : undefined}>
            {glyphs && item.glyph ? <Glyph name={item.glyph} className="nav-glyph" /> : null}
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
