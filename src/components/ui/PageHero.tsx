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
  media,
  className = '',
}: {
  eyebrow?: string
  title: ReactNode
  subtitle?: ReactNode
  lede?: ReactNode
  crumbs?: Crumb[]
  children?: ReactNode
  accent?: string
  /** Imagem ao lado do título (abaixo dele, em telas estreitas). */
  media?: ReactNode
  className?: string
}) {
  const style = accent ? ({ '--page-accent': accent } as CSSProperties) : undefined
  const text = (
    <>
      {crumbs ? <Breadcrumbs items={crumbs} /> : null}
      {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
      <h1>{title}</h1>
      {subtitle ? <p className="page-hero__subtitle">{subtitle}</p> : null}
      {lede ? <div className="page-hero__lede">{lede}</div> : null}
      {children}
    </>
  )
  return (
    <header className={`page-hero ${media ? 'page-hero--media' : ''} ${className}`.replace(/\s+/g, ' ').trim()} style={style}>
      <div className="container page-hero__inner">
        {media ? (
          <>
            <div className="page-hero__text">{text}</div>
            <div className="page-hero__media">{media}</div>
          </>
        ) : (
          text
        )}
      </div>
    </header>
  )
}
