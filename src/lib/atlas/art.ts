import type { ImageData } from '../content/media'

/**
 * Registro das artes usadas como imagem de destaque no Arquivo.
 *
 * - Cartas: o mapa ilustrado do manuscrito (Edição Profissional Ilustrada)
 *   e, para cada reino, um detalhe da carta com a região em destaque
 *   (scripts/art/manuscript_map.py).
 * - Ilustrações dos capítulos: referências aos registros do painel, para que
 *   a mesma regra de publicação valha aqui e na galeria
 *   (ver resolveArt em resolve.ts).
 * - Frontispício e cena da capa: artes do manuscrito e da capa oficial.
 * - Selos: pranchas simbólicas em linha dourada para os conceitos abstratos
 *   (scripts/art/sigils.mjs). Não representam a aparência de nada.
 * - Painel heráldico e brasões: propostas vetoriais (scripts/art/emblems.py).
 *
 * Nomes, capitais, fronteiras e brasões dos cinco reinos conhecidos são
 * propostas. Uma imagem enviada pelo painel para a entidade sempre tem
 * prioridade sobre a arte deste registro.
 */

export interface ArtEntry extends ImageData {
  /** Conceito artístico ou ilustração simbólica (não canônico). */
  concept: boolean
}

/** Ilustração de capítulo, resolvida no banco com as regras de publicação da galeria. */
export interface IllustrationRef {
  illustration: string
  /** Enquadramento quando a ilustração vertical é recortada (object-position). */
  focus?: string
}

export type ArtSource = ArtEntry | IllustrationRef

const BASE = '/images/atlas'
const MANUSCRIPT_MAP = 'Mapa do manuscrito — Edição Profissional Ilustrada'
const SIGIL = 'Selo do Arquivo — ilustração simbólica'

function art(src: string, width: number, height: number, alt: string, caption: string, credit: string, concept = true, focus?: string): ArtEntry {
  return { src, width, height, alt, caption, credit, concept, ...(focus ? { focus } : {}) }
}

function sigil(file: string, alt: string, caption: string): ArtEntry {
  return art(`${BASE}/${file}`, 2000, 1250, alt, caption, SIGIL)
}

function mapDetail(slug: string, name: string, width: number, height: number, alt: string, focus = '50% 50%'): ArtEntry {
  return art(`${BASE}/carta/${slug}.webp`, width, height, alt, `${name} na carta do manuscrito — fronteiras e nomes sujeitos a revisão.`, MANUSCRIPT_MAP, true, focus)
}

/** Ilustrações dos capítulos aproveitadas em outros verbetes. */
export const ILLUSTRATION = {
  /** Capítulo I — O lugar que não existia: o sonho de Kael. */
  capitulo1: { illustration: 'capitulo-01-lugar-que-nao-existia', focus: '50% 62%' },
  /** Capítulo III — A casa no fim da estrada. */
  capitulo3: { illustration: 'capitulo-03-casa-fim-da-estrada', focus: '50% 42%' },
  /** Capítulo VII — O arquivo sob a poeira. */
  capitulo7: { illustration: 'capitulo-07-arquivo-sob-poeira', focus: '50% 48%' },
} satisfies Record<string, IllustrationRef>

export const ART = {
  mapaOriginal: art(
    `${BASE}/mapa-mundo-original.webp`,
    1536,
    1024,
    'Carta ilustrada do Atlas dos Seis Reinos: Aurelion, Nácaris, Elyndor, Rhovaryn, Kharveth e, ao centro-sul, Safra, com o Templo da Chama em ruínas; ao norte, as Terras do Norte e as Montanhas Eternas; ao redor, o Mar Velado, o Mar Interior e o Mar da Aurora.',
    'Atlas dos Seis Reinos — carta do manuscrito; nomes, capitais e fronteiras sujeitos a revisão.',
    MANUSCRIPT_MAP,
  ),
  mapaConhecido: art(
    `${BASE}/mapa-mundo-conhecido.webp`,
    1536,
    1024,
    'A mesma carta na versão oficial: o território de Safra aparece em branco, como terra sem registro, e apenas cinco reinos são reconhecidos.',
    'Mundo conhecido — versão oficial da história, com Safra apagada; a partir da carta do manuscrito.',
    MANUSCRIPT_MAP,
  ),
  frontispicio: art(
    '/images/livro-1/frontispicio.webp',
    1120,
    1660,
    'Gravura em preto e branco. De costas, um jovem de manto esfarrapado observa do alto de um penhasco uma cidade de torres pontiagudas, aquedutos e cascatas; no céu revolto, a sombra de um dragão.',
    'Frontispício do Livro I.',
    'Edição Profissional Ilustrada (manuscrito)',
    false,
    '42% 38%',
  ),
  /** A cena da capa oficial, sem o título — fundo decorativo da página inicial. */
  cenaCapa: art('/capa/cena-capa.webp', 907, 620, '', 'Cena da capa oficial do Livro I.', 'Capa oficial', false),
  painelReinos: art(
    `${BASE}/painel-seis-reinos.webp`,
    2400,
    1600,
    'Seis brasões coerentes entre si, um para cada reino: Safra, Aurelion, Nácaris, Kharveth, Elyndor e Rhovaryn.',
    'Brasões dos seis reinos — propostas heráldicas, não aprovadas.',
    'Arte procedural do Arquivo',
  ),
  selo: {
    chama: sigil(
      'selo-chama.webp',
      'Selo em linhas douradas: uma chama acesa no centro de anéis concêntricos e raios, sobre fundo escuro.',
      'A Chama do Dragão — selo simbólico; não representa a aparência da Chama.',
    ),
    caos: sigil(
      'selo-caos.webp',
      'Selo em linhas frias: anéis partidos e deslocados em torno de um vazio irregular, sem chama no centro.',
      'O Caos — selo simbólico; sua natureza integral permanece desconhecida.',
    ),
    templo: sigil(
      'selo-templo.webp',
      'Estudo em linhas douradas da fachada de um templo: escadaria, colunas, frontão e, na passagem central, um altar apagado; a névoa cobre os degraus.',
      'O Templo da Chama — estudo simbólico; arquitetura, localização e destino não definidos.',
    ),
    ressonancia: sigil(
      'selo-ressonancia.webp',
      'Selo em linhas douradas: ondas circulares que partem de três pontos de luz e se cruzam dentro de um medalhão.',
      'A Ressonância — selo abstrato; nenhum elemento aqui tem significado definido.',
    ),
    seculoPerdido: sigil(
      'selo-seculo-perdido.webp',
      'Selo em linhas claras: um mostrador circular com uma lacuna, uma ampulheta vazia ao centro e folhas em branco que escapam pela abertura.',
      'O Século Perdido — cerca de seiscentos anos sem registro; selo simbólico.',
    ),
    skrugheim: sigil(
      'selo-skrugheim.webp',
      'Estudo em linhas frias de uma porta monumental em arco, fechada; uma luz pálida escapa pela fresta entre as folhas.',
      'Skrugheim — representação enigmática; sua natureza permanece desconhecida.',
    ),
  },
  reino: {
    safra: mapDetail('safra', 'Safra', 1326, 884, 'Detalhe da carta: o território de Safra, em tons de lava e rocha, com a indicação "Reino I (desaparecido)" e o Templo da Chama em ruínas ao centro; o restante da carta aparece esmaecido.'),
    aurelion: mapDetail('aurelion', 'Aurelion', 1632, 1088, 'Detalhe da carta: Aurelion, em tons dourados de campos e florestas, com a capital Auréstria; o restante da carta aparece esmaecido.'),
    nacaris: mapDetail('nacaris', 'Nácaris', 1406, 938, 'Detalhe da carta: Nácaris, na costa oeste, com Velária, sede da confederação, e o arquipélago; o restante da carta aparece esmaecido.'),
    kharveth: mapDetail('kharveth', 'Kharveth', 1200, 800, 'Detalhe da carta: Kharveth, entre montanhas nevadas e fortalezas, com a capital Vhaldris; o restante da carta aparece esmaecido.'),
    elyndor: mapDetail('elyndor', 'Elyndor', 1200, 800, 'Detalhe da carta: Elyndor, em tons claros, com a capital Ithária junto a um rio; o restante da carta aparece esmaecido.'),
    rhovaryn: mapDetail('rhovaryn', 'Rhovaryn', 1466, 976, 'Detalhe da carta: Rhovaryn, de florestas e planícies a leste, com a capital Avarra; o restante da carta aparece esmaecido.'),
  } as Record<string, ArtEntry>,
}

/** Brasões conceituais em vetor (um arquivo por reino). */
export function emblemArt(kingdomSlug: string): ImageData | null {
  if (!(kingdomSlug in ART.reino)) return null
  return { src: `${BASE}/brasoes/${kingdomSlug}.svg`, width: 240, height: 280, alt: `Brasão conceitual de ${kingdomSlug}`, caption: 'Proposta heráldica' }
}

type ArtTarget = 'kingdom' | 'location' | 'character' | 'article' | 'document' | 'event' | 'post'

const ENTITY_ART: Record<ArtTarget, Record<string, ArtSource>> = {
  kingdom: ART.reino,
  location: {
    brumafunda: ILLUSTRATION.capitulo3,
    'templo-da-chama': ART.selo.templo,
    'ruinas-de-safra': ART.reino.safra,
  },
  character: {
    'kael-draken': ILLUSTRATION.capitulo1,
  },
  article: {
    'mitologia/a-chama-do-dragao': ART.selo.chama,
    'mitologia/a-ascensao-do-caos': ART.selo.caos,
    'mitologia/o-aparecimento-dos-seis-reinos': ART.painelReinos,
    'mitologia/o-templo-da-chama': ART.selo.templo,
    'mitologia/safra-e-a-noite-das-cinzas': ART.reino.safra,
    'mitologia/o-seculo-perdido': ART.selo.seculoPerdido,
    'mitologia/lendas-e-tradicoes': ILLUSTRATION.capitulo7,
    'mitologia/o-surgimento-do-mundo': ART.mapaOriginal,
    'ressonancia/a-ressonancia': ART.selo.ressonancia,
    'ressonancia/a-natureza-da-chama': ART.selo.chama,
  },
  document: {
    'quando-a-chama-despertar': ART.selo.skrugheim,
  },
  event: {
    'a-chama-cria-o-mundo': ART.selo.chama,
    'a-noite-das-cinzas': ART.reino.safra,
    'os-sonhos-de-kael': ILLUSTRATION.capitulo1,
  },
  post: {},
}

export function artImage(type: ArtTarget, key: string): ArtSource | null {
  return ENTITY_ART[type][key] ?? null
}
