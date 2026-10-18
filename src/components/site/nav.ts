import type { NavItem } from './NavLinks'

export function buildNav(bookHref: string): NavItem[] {
  return [
    { href: '/atlas', label: 'Atlas', match: ['/atlas', '/reinos'], glyph: 'atlas' },
    { href: '/personagens', label: 'Personagens', match: ['/personagens'], glyph: 'personagens' },
    { href: '/mitologia', label: 'Mitologia', match: ['/mitologia'], glyph: 'mitologia' },
    { href: '/cronologia', label: 'Cronologia', match: ['/cronologia'], glyph: 'cronologia' },
    { href: '/ressonancia', label: 'Ressonância', match: ['/ressonancia'], glyph: 'ressonancia' },
    { href: '/locais', label: 'Locais', match: ['/locais'], glyph: 'locais' },
    { href: '/manuscritos', label: 'Manuscritos', match: ['/manuscritos'], glyph: 'manuscritos' },
    { href: '/misterios', label: 'Mistérios', match: ['/misterios'], glyph: 'misterios' },
    { href: bookHref, label: 'Livro I', match: ['/livros'], glyph: 'livro' },
    { href: '/novidades', label: 'Novidades', match: ['/novidades'], glyph: 'novidades' },
  ]
}
