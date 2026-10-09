import type { EntityType } from './editorial'

/** Caminhos públicos de cada tipo de entidade. */
export const paths = {
  home: '/',
  atlas: '/atlas',
  map: (slug: string) => `/atlas/mapas/${slug}`,
  kingdom: (slug: string) => `/reinos/${slug}`,
  characters: '/personagens',
  character: (slug: string) => `/personagens/${slug}`,
  locations: '/locais',
  location: (slug: string) => `/locais/${slug}`,
  mythology: '/mitologia',
  resonance: '/ressonancia',
  article: (section: 'mitologia' | 'ressonancia', slug: string) => `/${section}/${slug}`,
  timeline: '/cronologia',
  event: (slug: string) => `/cronologia#evento-${slug}`,
  era: (slug: string) => `/cronologia#era-${slug}`,
  documents: '/manuscritos',
  document: (slug: string) => `/manuscritos/${slug}`,
  books: '/livros',
  book: (slug: string) => `/livros/${slug}`,
  chapter: (bookSlug: string, number: number) => `/livros/${bookSlug}/capitulos/${number}`,
  news: '/novidades',
  post: (slug: string) => `/novidades/${slug}`,
  search: '/busca',
  about: '/sobre',
}

export const ADMIN_COLLECTION_FOR: Record<EntityType, string> = {
  kingdom: 'reinos',
  location: 'locais',
  character: 'personagens',
  era: 'eras',
  event: 'acontecimentos',
  article: 'verbetes',
  mystery: 'misterios',
  document: 'manuscritos',
  map: 'mapas',
  book: 'livros',
  chapter: 'capitulos',
  post: 'publicacoes',
}
