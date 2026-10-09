import Link from 'next/link'
import type { SpoilerLevel } from '@/lib/editorial'
import { BrandMark, SearchIcon } from '@/components/ui/icons'
import { MobileNav } from './MobileNav'
import { NavLinks, type NavItem } from './NavLinks'
import { SpoilerControl } from './SpoilerControl'

export function SiteHeader({ nav, spoiler }: { nav: NavItem[]; spoiler: SpoilerLevel }) {
  return (
    <header className="site-header">
      <div className="container container--wide site-header__inner">
        <Link href="/" className="brand" aria-label="Kael Draken — Arquivo da Chama Antiga, página inicial">
          <BrandMark className="brand__mark" />
          <span className="brand__text">
            <span className="brand__name">Kael Draken</span>
            <span className="brand__sub">Arquivo da Chama Antiga</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Principal">
          <NavLinks items={nav} />
        </nav>
        <div className="site-header__tools">
          <Link href="/busca" className="icon-button" aria-label="Buscar no arquivo">
            <SearchIcon />
          </Link>
          <SpoilerControl current={spoiler} />
          <MobileNav items={nav} />
        </div>
      </div>
    </header>
  )
}
