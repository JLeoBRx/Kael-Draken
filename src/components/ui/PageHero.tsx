import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

export interface Crumb {
  label: string
  href?: string
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Trilha de navegação">
      <ol>
        <li>
          <Link href="/">Início</Link>
        </li>
        {items.map((item, i) => (
          <li key={i}>{item.href ? <Link href={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}</li>
        ))}
      </ol>
    </nav>
  )
}

export function PageHero({
  eyebrow,
  title,
  subtitle,
  lede,
  crumbs,
  children,
  accent,
  className = '',
}: {
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  lede?: ReactNode
  crumbs?: Crumb[]
  children?: ReactNode
  accent?: string
  className?: string
}) {
  const style = accent ? ({ '--page-accent': accent } as CSSProperties) : undefined
  return (
    <header className={`page-hero ${className}`.trim()} style={style}>
      <div className="container page-hero__inner">
        {crumbs ? <Breadcrumbs items={crumbs} /> : null}
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {subtitle ? <p className="page-hero__subtitle">{subtitle}</p> : null}
        {lede ? <div className="page-hero__lede">{lede}</div> : null}
        {children}
      </div>
    </header>
  )
}
