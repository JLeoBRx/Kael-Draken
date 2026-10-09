import type { ImageData } from '../content/media'

/**
 * Registro das artes do Atlas (public/images/atlas).
 *
 * As imagens foram produzidas proceduralmente pelos scripts em scripts/art
 * (ruído, geometria e vetores) — não por um modelo de geração de imagens.
 * Representam conceitos artísticos, não confirmação de fatos: a geografia,
 * a arquitetura e os brasões dos cinco reinos conhecidos são propostas.
 *
 * Uma imagem enviada pelo painel para a entidade sempre tem prioridade sobre
 * a arte deste registro.
 */

export interface ArtEntry extends ImageData {
  /** Conceito artístico (não canônico). */
  concept: boolean
}

const BASE = '/images/atlas'

function art(file: string, width: number, height: number, alt: string, caption: string, concept = true): ArtEntry {
  return { src: `${BASE}/${file}`, width, height, alt, caption, credit: 'Arte procedural do Arquivo', concept }
}

export const ART = {
  capa: art('capa-atlas.webp', 1200, 1800, 'Um dragão ancestral envolve uma chama misteriosa sobre uma cidade monumental mergulhada na névoa.', 'Capa do Atlas — conceito artístico.'),
  mapaOriginal: art(
    'mapa-mundo-original.webp',
    2400,
    1500,
    'Carta conceitual do mundo original, com relevo, rios e as zonas provisórias dos seis reinos.',
    'Mapa do mundo original — composição conceitual; fronteiras e posições não aprovadas.',
  ),
  mapaConhecido: art(
    'mapa-mundo-conhecido.webp',
    2400,
    1500,
    'Carta conceitual do mundo conhecido, na versão oficial em que a região de Safra aparece apagada e apenas cinco reinos são reconhecidos.',
    'Mapa do mundo conhecido — versão oficial da história; composição conceitual.',
  ),
  origemChama: art('origem-chama.webp', 2000, 1250, 'A Chama do Dragão surge no vazio e ilumina um mundo que começa a nascer.', 'A Chama do Dragão e o nascimento do mundo — conceito artístico.'),
  caos: art('caos.webp', 2000, 1250, 'Sombras, distorções e espaços impossíveis sugerem a presença do Caos, sem revelar sua forma.', 'O Caos — representação atmosférica; sua natureza permanece desconhecida.'),
  safraAntes: art('safra-antes.webp', 2000, 1250, 'Uma cidade viva de Safra ao entardecer: terraços, cúpulas, ruas iluminadas por braseiros e lanternas.', 'Safra antes da destruição — conceito artístico.'),
  quedaSafra: art('queda-safra.webp', 2000, 1250, 'A cidade de Safra em chamas sob uma coluna de fumaça; silhuetas distantes observam a perda.', 'A queda de Safra, a Noite das Cinzas — conceito artístico.'),
  ruinasSafra: art('ruinas-safra.webp', 2000, 1250, 'Arcos partidos e pedras cobertas de cinza, séculos depois, sob uma luz fria de aurora.', 'Ruínas de Safra — conceito artístico; localização não definida.'),
  painelReinos: art('painel-seis-reinos.webp', 2400, 1600, 'Seis brasões coerentes entre si, um para cada reino: Safra, Aurelion, Nácaris, Kharveth, Elyndor e Rhovaryn.', 'Brasões dos seis reinos — propostas heráldicas, não aprovadas.'),
  templo: art('templo-chama.webp', 2000, 1250, 'Um templo monumental surge da névoa no alto de uma escadaria; seu altar está escuro.', 'O Templo da Chama — conceito artístico; localização e destino desconhecidos.'),
  ressonancia: art('ressonancia.webp', 2000, 1250, 'Ondas concêntricas de luz dourada se cruzam e formam padrões de interferência sobre a escuridão.', 'A Ressonância — ilustração abstrata; nenhum símbolo aqui tem significado definido.'),
  sonhosKael: art('sonhos-kael.webp', 2000, 1250, 'Uma pequena figura vista de costas diante de ilhas suspensas, escadarias que sobem ao céu e lugares impossíveis.', 'Os sonhos de Kael — conceito artístico; a figura não representa um rosto canônico.'),
  seculoPerdido: art('seculo-perdido.webp', 2000, 1250, 'Monólitos partidos se perdem na névoa enquanto folhas em branco atravessam o ar.', 'O Século Perdido — cerca de seiscentos anos sem registro; conceito artístico.'),
  manuscritos: art('manuscritos-antigos.webp', 2000, 1250, 'Pergaminhos, um selo de cera e fragmentos de mapas espalhados sobre couro escuro; a escrita é ilegível.', 'Manuscritos e documentos antigos — ilustração; não reproduz documentos reais do arquivo.'),
  skrugheim: art('skrugheim.webp', 2000, 1250, 'Um portal colossal e fechado na escuridão; uma luz fria escapa pela fresta.', 'Skrugheim — representação enigmática; sua natureza permanece desconhecida.'),
  brumafunda: art('brumafunda.webp', 2000, 1250, 'Um pequeno vilarejo de casas baixas envolto em névoa ao amanhecer.', 'Brumafunda — conceito artístico; nome e localização provisórios.'),
  terrasIncognitas: art('terras-incognitas.webp', 2000, 1250, 'Planaltos e vales desconhecidos se estendem sob nuvens baixas, sem sinais de ocupação.', 'Terras inexploradas — paisagem conceitual reservada a lugares ainda não documentados.'),
  reino: {
    safra: art('reino-safra.webp', 2400, 1000, 'Planaltos vulcânicos com terraços e braseiros acesos ao entardecer.', 'Safra — conceito artístico de um reino ligado de modo excepcional às chamas.'),
    aurelion: art('reino-aurelion.webp', 2400, 1000, 'Vales férteis em luz dourada e uma cidade de colunatas monumentais sobre a colina.', 'Aurelion — direção visual proposta: arquitetura monumental e vales férteis.'),
    nacaris: art('reino-nacaris.webp', 2400, 1000, 'Cidades costeiras sobre falésias, um farol e embarcações a vela.', 'Nácaris — direção visual proposta: cidades costeiras e navegação.'),
    kharveth: art('reino-kharveth.webp', 2400, 1000, 'Montanhas escarpadas e nevadas com uma fortaleza sobre o penhasco.', 'Kharveth — direção visual proposta: montanhas e fortalezas.'),
    elyndor: art('reino-elyndor.webp', 2400, 1000, 'Um lago sereno, jardins em terraços, ciprestes e uma biblioteca de cúpula na névoa.', 'Elyndor — direção visual proposta: espaços contemplativos, jardins e bibliotecas.'),
    rhovaryn: art('reino-rhovaryn.webp', 2400, 1000, 'Um rio largo serpenteia por planícies e florestas até colinas distantes.', 'Rhovaryn — direção visual proposta: planícies, florestas e rios.'),
  } as Record<string, ArtEntry>,
}

/** Brasões conceituais em vetor (um arquivo por reino). */
export function emblemArt(kingdomSlug: string): ImageData | null {
  if (!(kingdomSlug in ART.reino)) return null
  return { src: `${BASE}/brasoes/${kingdomSlug}.svg`, width: 240, height: 280, alt: `Brasão conceitual de ${kingdomSlug}`, caption: 'Proposta heráldica' }
}

type ArtTarget = 'kingdom' | 'location' | 'character' | 'article' | 'document' | 'event' | 'post'

const ENTITY_ART: Record<ArtTarget, Record<string, ArtEntry>> = {
  kingdom: ART.reino,
  location: {
    brumafunda: ART.brumafunda,
    'templo-da-chama': ART.templo,
    'ruinas-de-safra': ART.ruinasSafra,
  },
  character: {
    'kael-draken': ART.sonhosKael,
  },
  article: {
    'mitologia/a-chama-do-dragao': ART.origemChama,
    'mitologia/a-ascensao-do-caos': ART.caos,
    'mitologia/o-aparecimento-dos-seis-reinos': ART.painelReinos,
    'mitologia/o-templo-da-chama': ART.templo,
    'mitologia/safra-e-a-noite-das-cinzas': ART.reino.safra,
    'mitologia/o-seculo-perdido': ART.seculoPerdido,
    'mitologia/lendas-e-tradicoes': ART.manuscritos,
    'mitologia/o-surgimento-do-mundo': ART.terrasIncognitas,
    'ressonancia/a-ressonancia': ART.ressonancia,
    'ressonancia/a-natureza-da-chama': ART.origemChama,
  },
  document: {
    'quando-a-chama-despertar': ART.skrugheim,
  },
  event: {
    'a-chama-cria-o-mundo': ART.origemChama,
    'a-noite-das-cinzas': ART.quedaSafra,
    'os-sonhos-de-kael': ART.sonhosKael,
  },
  post: {},
}

export function artImage(type: ArtTarget, key: string): ArtEntry | null {
  return ENTITY_ART[type][key] ?? null
}
