/**
 * Vocabulário editorial do arquivo: estados de canon, níveis de spoiler,
 * estados de publicação e graus de certeza. Compartilhado entre o site
 * público, o painel e o banco de dados.
 */

export const CANON_STATES = ['canonico', 'provisorio', 'em_desenvolvimento', 'desconhecido', 'arquivado'] as const
export type CanonState = (typeof CANON_STATES)[number]

export const CANON_INFO: Record<CanonState, { label: string; short: string; description: string }> = {
  canonico: {
    label: 'Estabelecido',
    short: 'Estabelecido',
    description: 'Confirmado pelo autor para a história (canônico).',
  },
  provisorio: {
    label: 'Proposta',
    short: 'Proposta',
    description: 'Proposta de trabalho que ainda pode mudar (provisório).',
  },
  em_desenvolvimento: {
    label: 'Em aberto',
    short: 'Em aberto',
    description: 'Ainda não decidido; conteúdo em desenvolvimento.',
  },
  desconhecido: {
    label: 'Desconhecido no mundo',
    short: 'Mistério',
    description: 'Mistério intencionalmente não resolvido — também desconhecido dentro do mundo.',
  },
  arquivado: {
    label: 'Arquivado',
    short: 'Arquivado',
    description: 'Ideia antiga que não faz mais parte do planejamento atual. Nunca aparece no site público.',
  },
}

export const SPOILER_LEVELS = [0, 1, 2] as const
export type SpoilerLevel = (typeof SPOILER_LEVELS)[number]

export const SPOILER_INFO: Record<SpoilerLevel, { label: string; description: string }> = {
  0: { label: 'Sem spoilers', description: 'Apenas o que se pode saber antes de abrir o livro.' },
  1: { label: 'Revelações iniciais', description: 'Inclui revelações dos primeiros movimentos da história.' },
  2: { label: 'Revelações avançadas', description: 'Inclui revelações profundas já publicadas no arquivo.' },
}

export const SPOILER_COOKIE = 'kd_spoiler'

export function parseSpoilerLevel(value: unknown): SpoilerLevel {
  const n = Number(value)
  return n === 1 || n === 2 ? n : 0
}

export const PUBLICATION_STATES = ['rascunho', 'publicado', 'arquivado'] as const
export type PublicationState = (typeof PUBLICATION_STATES)[number]

export const PUBLICATION_INFO: Record<PublicationState, { label: string; description: string }> = {
  rascunho: { label: 'Rascunho', description: 'Visível apenas no painel e na pré-visualização.' },
  publicado: { label: 'Publicado', description: 'Visível no site público, respeitando o nível de spoiler.' },
  arquivado: { label: 'Arquivado', description: 'Retirado do site público, mantido no painel.' },
}

/** Grau de certeza de um acontecimento da cronologia. */
export const CERTAINTY_STATES = ['confirmado', 'aproximado', 'hipotese', 'desconhecido', 'planejado'] as const
export type CertaintyState = (typeof CERTAINTY_STATES)[number]

export const CERTAINTY_INFO: Record<CertaintyState, { label: string; description: string }> = {
  confirmado: { label: 'Confirmado', description: 'Acontecimento confirmado na bíblia narrativa.' },
  aproximado: { label: 'Data aproximada', description: 'Data ou período aproximado.' },
  hipotese: { label: 'Hipótese', description: 'Hipótese histórica, ainda não confirmada.' },
  desconhecido: { label: 'Desconhecido', description: 'Informação desconhecida.' },
  planejado: { label: 'Planejado', description: 'Evento planejado, mas ainda não definido.' },
}

/** Grau de confiabilidade de um documento do arquivo. */
export const RELIABILITY_STATES = ['confiavel', 'parcial', 'duvidoso', 'contraditorio', 'desconhecido'] as const
export type ReliabilityState = (typeof RELIABILITY_STATES)[number]

export const RELIABILITY_INFO: Record<ReliabilityState, { label: string; description: string }> = {
  confiavel: { label: 'Confiável', description: 'Fonte considerada fidedigna.' },
  parcial: { label: 'Parcialmente confiável', description: 'Contém trechos verificáveis e trechos incertos.' },
  duvidoso: { label: 'Duvidoso', description: 'Origem ou conteúdo questionável.' },
  contraditorio: { label: 'Contradiz a história oficial', description: 'Diverge das versões aceitas dos acontecimentos.' },
  desconhecido: { label: 'Não avaliado', description: 'Confiabilidade ainda desconhecida.' },
}

/** Estado da arte de uma ilustração de capítulo. */
export const ART_STATES = ['pendente', 'estudo', 'final'] as const
export type ArtState = (typeof ART_STATES)[number]

export const ART_INFO: Record<ArtState, { label: string; description: string }> = {
  pendente: { label: 'Arte em produção', description: 'A ilustração deste capítulo ainda precisa ser produzida.' },
  estudo: { label: 'Versão provisória', description: 'Imagem provisória, ainda não pronta para a impressão; será substituída pela arte final.' },
  final: { label: 'Arte final', description: 'Ilustração do livro no formato de impressão (15,5 × 23 cm, preto e branco).' },
}

/** Tipos de entidade que podem ser relacionados entre si. */
export const ENTITY_TYPES = [
  'kingdom',
  'location',
  'character',
  'era',
  'event',
  'article',
  'mystery',
  'document',
  'map',
  'book',
  'chapter',
  'post',
  'illustration',
] as const
export type EntityType = (typeof ENTITY_TYPES)[number]

export const ENTITY_LABELS: Record<EntityType, { singular: string; plural: string }> = {
  kingdom: { singular: 'Reino', plural: 'Reinos' },
  location: { singular: 'Local', plural: 'Locais' },
  character: { singular: 'Personagem', plural: 'Personagens' },
  era: { singular: 'Era', plural: 'Eras' },
  event: { singular: 'Acontecimento', plural: 'Acontecimentos' },
  article: { singular: 'Verbete', plural: 'Verbetes' },
  mystery: { singular: 'Mistério', plural: 'Mistérios' },
  document: { singular: 'Documento', plural: 'Documentos' },
  map: { singular: 'Mapa', plural: 'Mapas' },
  book: { singular: 'Livro', plural: 'Livros' },
  chapter: { singular: 'Capítulo', plural: 'Capítulos' },
  post: { singular: 'Publicação', plural: 'Publicações' },
  illustration: { singular: 'Ilustração', plural: 'Ilustrações' },
}

export const ARTICLE_SECTIONS = ['mitologia', 'ressonancia'] as const
export type ArticleSection = (typeof ARTICLE_SECTIONS)[number]

/** Vocabulários controlados, editáveis no painel (Categorias e tags). */
export const VOCABULARIES = {
  location_category: 'Categorias de locais',
  document_type: 'Tipos de documento',
  character_role: 'Papéis narrativos',
  event_type: 'Tipos de acontecimento',
  post_category: 'Categorias de publicação',
  marker_type: 'Tipos de marcador do atlas',
  relation_kind: 'Tipos de relação entre personagens',
  tag: 'Tags',
} as const
export type Vocabulary = keyof typeof VOCABULARIES
