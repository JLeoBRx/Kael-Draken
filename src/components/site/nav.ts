import type { NavItem } from './NavLinks'

export function buildNav(bookHref: string): NavItem[] {
  return [
    { href: '/atlas', label: 'Atlas', match: ['/atlas', '/reinos'] },
    { href: '/personagens', label: 'Personagens', match: ['/personagens'] },
    { href: '/mitologia', label: 'Mitologia', match: ['/mitologia'] },
    { href: '/cronologia', label: 'Cronologia', match: ['/cronologia'] },
    { href: '/ressonancia', label: 'Ressonância', match: ['/ressonancia'] },
    { href: '/locais', label: 'Locais', match: ['/locais'] },
    { href: '/manuscritos', label: 'Manuscritos', match: ['/manuscritos'] },
    { href: bookHref, label: 'Livro I', match: ['/livros'] },
    { href: '/novidades', label: 'Novidades', match: ['/novidades'] },
  ]
}
