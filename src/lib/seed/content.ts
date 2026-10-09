/**
 * Conteúdo inicial do arquivo.
 *
 * Tudo aqui deriva exclusivamente das informações fornecidas pelo autor na
 * bíblia narrativa inicial. Nada foi inventado para preencher lacunas: onde a
 * informação ainda não existe, o verbete fica marcado como "em desenvolvimento"
 * ou "desconhecido". Revelações ficam atrás dos níveis de spoiler.
 */

import type { CanonState, CertaintyState, ReliabilityState, Vocabulary } from '../editorial'

export const SEED_TERMS: Record<Vocabulary, Array<[slug: string, label: string]>> = {
  location_category: [
    ['capital', 'Capital'],
    ['cidade', 'Cidade'],
    ['vilarejo', 'Vilarejo'],
    ['ruina', 'Ruína'],
    ['fortaleza', 'Fortaleza'],
    ['templo', 'Templo'],
    ['biblioteca', 'Biblioteca'],
    ['passagem', 'Passagem natural'],
    ['montanhas', 'Cadeia de montanhas'],
    ['rio', 'Rio'],
    ['regiao-inexplorada', 'Região inexplorada'],
  ],
  document_type: [
    ['profecia', 'Profecia'],
    ['pergaminho', 'Pergaminho'],
    ['inscricao', 'Inscrição'],
    ['carta', 'Carta'],
    ['tratado', 'Tratado'],
    ['relato-de-viajante', 'Relato de viajante'],
    ['manuscrito-historico', 'Manuscrito histórico'],
    ['mapa-antigo', 'Mapa antigo'],
    ['fragmento', 'Fragmento'],
    ['contestacao', 'Documento contrário à história oficial'],
  ],
  character_role: [
    ['protagonista', 'Protagonista'],
    ['aliado', 'Aliado'],
    ['antagonista', 'Antagonista'],
    ['mentor', 'Mentor'],
    ['familia', 'Família'],
    ['secundario', 'Personagem secundário'],
    ['figura-historica', 'Figura histórica'],
  ],
  event_type: [
    ['mito', 'Mito e criação'],
    ['fundacao', 'Fundação'],
    ['guerra', 'Guerra e conflito'],
    ['governo', 'Mudança de governo'],
    ['catastrofe', 'Catástrofe'],
    ['personagem', 'Acontecimento de personagem'],
  ],
  post_category: [
    ['atualizacao', 'Atualização do universo'],
    ['diario', 'Diário de desenvolvimento'],
    ['mapa', 'Mapas'],
    ['documento', 'Documentos'],
    ['personagem', 'Personagens'],
    ['reino', 'Reinos'],
  ],
  marker_type: [
    ['capital', 'Capital'],
    ['cidade', 'Cidade'],
    ['fronteira', 'Fronteira'],
    ['ruina', 'Ruína'],
    ['montanhas', 'Cadeia de montanhas'],
    ['rio', 'Rio'],
    ['templo', 'Templo'],
    ['regiao', 'Região'],
  ],
  relation_kind: [
    ['familia', 'Família'],
    ['amizade', 'Amizade'],
    ['rivalidade', 'Rivalidade'],
    ['relacionamento', 'Relacionamento'],
    ['mentoria', 'Mentoria'],
    ['alianca', 'Aliança'],
    ['inimizade', 'Inimizade'],
  ],
  tag: [
    ['chama', 'Chama'],
    ['caos', 'Caos'],
    ['safra', 'Safra'],
    ['profecia', 'Profecia'],
    ['seculo-perdido', 'Século Perdido'],
  ],
}

interface Editorial {
  canon: CanonState
  spoiler?: 0 | 1 | 2
  notes?: string
}

export interface SeedKingdom extends Editorial {
  slug: string
  name: string
  epithet?: string
  government?: string
  summary: string
  body?: string
  resonance?: string
  history?: string
  relations?: string
  mysteries?: string
  accent: string
}

const FIVE_KINGDOMS_RELATION = (name: string) =>
  `:::spoiler 1
${name} está entre os cinco reinos que decidiram exterminar a população de Safra, movidos pela inveja de seu poder. O papel específico de ${name} nesse acontecimento ainda não foi definido.
:::`

const FRAGMENT_RESONANCE =
  'Como os demais reinos, está ligado a fragmentos do poder primordial da Chama. A natureza dessa ligação ainda não foi documentada.'

const PROVISIONAL_KINGDOM_NOTE =
  'Nome, capital e características em desenvolvimento. Não tratar como geografia definitiva até aprovação.'

export const SEED_KINGDOMS: SeedKingdom[] = [
  {
    slug: 'safra',
    name: 'Safra',
    epithet: 'O reino desaparecido',
    summary: 'O reino que possuía uma ligação excepcional com as chamas — e que desapareceu.',
    body: 'Entre os seis reinos estabelecidos depois da criação, **Safra** possuía uma ligação excepcional com as chamas. Hoje é lembrado como o reino desaparecido.',
    resonance: 'Safra possuía uma ligação excepcional com as chamas. A natureza exata dessa ligação ainda não foi documentada.',
    history: `Safra foi destruído.

:::spoiler 1
Os outros cinco reinos decidiram exterminar a população de Safra, movidos pela inveja de seu poder. O reino foi destruído, e um herdeiro sobreviveu após ser enviado por um portal.
:::`,
    mysteries: 'O destino completo de Safra permanece um mistério preservado. Os detalhes definitivos de sua destruição ainda não foram estabelecidos.',
    accent: '#8f2a1d',
    canon: 'canonico',
  },
  {
    slug: 'aurelion',
    name: 'Aurelion',
    government: 'Monarquia consultiva',
    summary: 'Um dos cinco reinos conhecidos, organizado como monarquia consultiva.',
    resonance: FRAGMENT_RESONANCE,
    relations: FIVE_KINGDOMS_RELATION('Aurelion'),
    accent: '#b8975a',
    canon: 'provisorio',
    notes: PROVISIONAL_KINGDOM_NOTE,
  },
  {
    slug: 'nacaris',
    name: 'Nácaris',
    government: 'Confederação de cidades',
    summary: 'Um dos cinco reinos conhecidos, organizado como confederação de cidades.',
    resonance: FRAGMENT_RESONANCE,
    relations: FIVE_KINGDOMS_RELATION('Nácaris'),
    accent: '#5d7486',
    canon: 'provisorio',
    notes: PROVISIONAL_KINGDOM_NOTE,
  },
  {
    slug: 'kharveth',
    name: 'Kharveth',
    government: 'Pacto entre cinco ordens',
    summary: 'Um dos cinco reinos conhecidos, sustentado por um pacto entre cinco ordens.',
    resonance: FRAGMENT_RESONANCE,
    relations: FIVE_KINGDOMS_RELATION('Kharveth'),
    accent: '#8a8379',
    canon: 'provisorio',
    notes: PROVISIONAL_KINGDOM_NOTE,
  },
  {
    slug: 'elyndor',
    name: 'Elyndor',
    government: 'Conselho religioso e civil',
    summary: 'Um dos cinco reinos conhecidos, governado por um conselho religioso e civil.',
    resonance: FRAGMENT_RESONANCE,
    relations: FIVE_KINGDOMS_RELATION('Elyndor'),
    accent: '#cdbf9f',
    canon: 'provisorio',
    notes: PROVISIONAL_KINGDOM_NOTE,
  },
  {
    slug: 'rhovaryn',
    name: 'Rhovaryn',
    government: 'Liga de territórios autônomos',
    summary: 'Um dos cinco reinos conhecidos, formado por uma liga de territórios autônomos.',
    resonance: FRAGMENT_RESONANCE,
    relations: FIVE_KINGDOMS_RELATION('Rhovaryn'),
    accent: '#747d52',
    canon: 'provisorio',
    notes: PROVISIONAL_KINGDOM_NOTE,
  },
]

export interface SeedLocation extends Editorial {
  slug: string
  name: string
  kingdom?: string
  category: string
  summary: string
  body?: string
  history?: string
}

export const SEED_LOCATIONS: SeedLocation[] = [
  {
    slug: 'brumafunda',
    name: 'Brumafunda',
    category: 'vilarejo',
    summary: 'O vilarejo distante onde Kael Draken cresceu. Nome provisório.',
    body: 'Vilarejo distante onde Kael cresceu, criado por uma família humilde e amorosa. O nome **Brumafunda** é provisório, e a localização do vilarejo ainda não foi definida.',
    canon: 'provisorio',
    notes: 'Nome provisório. Reino e localização ainda não definidos.',
  },
  {
    slug: 'templo-da-chama',
    name: 'Templo da Chama',
    category: 'templo',
    summary: 'Sua localização e sua história completa permanecem desconhecidas.',
    history: 'A localização e a história completa do Templo da Chama são um dos mistérios preservados do universo.',
    canon: 'desconhecido',
  },
]

export interface SeedCharacter extends Editorial {
  slug: string
  name: string
  age?: string
  role: string
  origin?: string
  summary: string
  personality?: string
  history?: string
  family?: string
  storyRole?: string
  secrets?: string
}

export const SEED_CHARACTERS: SeedCharacter[] = [
  {
    slug: 'kael-draken',
    name: 'Kael Draken',
    age: '16 anos',
    role: 'protagonista',
    origin: 'brumafunda',
    summary: 'Tem dezesseis anos e cresceu em um vilarejo distante. No início da história, seus sonhos começam a se intensificar.',
    personality:
      'Kael é inteligente, gentil, educado e alegre, mas também pode ser reservado e impulsivo. Sua dificuldade em lidar com a raiva fez com que desenvolvesse máscaras sociais para ser aceito.',
    history: `Kael cresceu em um vilarejo distante — provisoriamente chamado [[locais/brumafunda|Brumafunda]] —, criado por uma família humilde e amorosa.

No início da história, seus sonhos começam a se intensificar, apresentando lugares impossíveis, imagens do passado e acontecimentos que desafiam sua compreensão do mundo.`,
    family: 'Criado por uma família humilde e amorosa. Os membros da família ainda não foram documentados.',
    storyRole: 'Protagonista de [[livros/o-sussurro-da-chama-antiga|Livro I — O Sussurro da Chama Antiga]].',
    secrets: `:::spoiler 1
Seu nome de nascimento permanece desconhecido.
:::

:::spoiler 2
Kael não sabe que sua origem está ligada à linhagem real de [[reinos/safra|Safra]].
:::`,
    canon: 'canonico',
  },
]

export interface SeedEra extends Editorial {
  slug: string
  name: string
  dateLabel: string
  summary: string
}

export const SEED_ERAS: SeedEra[] = [
  { slug: 'antes-da-criacao', name: 'Antes da Criação', dateLabel: 'Antes do tempo', summary: 'O Vazio anterior à criação do mundo.', canon: 'em_desenvolvimento' },
  { slug: 'a-criacao', name: 'A Criação', dateLabel: 'Origem do mundo', summary: 'A Chama do Dragão cria o mundo; junto dela surge o Caos.', canon: 'canonico' },
  {
    slug: 'era-dos-seis-reinos',
    name: 'A Era dos Seis Reinos',
    dateLabel: 'Período não datado',
    summary: 'Seis reinos são estabelecidos, cada um ligado a fragmentos do poder primordial.',
    canon: 'provisorio',
    notes: 'Nome do período é organizacional, não canônico.',
  },
  { slug: 'a-queda-de-safra', name: 'A Queda de Safra', dateLabel: 'Data não estabelecida', summary: 'O reino ligado às chamas é destruído.', canon: 'provisorio', notes: 'Nome do período é organizacional.' },
  {
    slug: 'o-desaparecimento-da-chama',
    name: 'O Desaparecimento da Chama',
    dateLabel: 'Data desconhecida',
    summary: 'A Chama desaparece. A verdadeira causa permanece desconhecida.',
    canon: 'desconhecido',
  },
  {
    slug: 'o-seculo-perdido',
    name: 'O Século Perdido',
    dateLabel: 'Seiscentos anos',
    summary: 'Seiscentos anos cujos acontecimentos permanecem desconhecidos.',
    canon: 'desconhecido',
  },
  { slug: 'a-ascensao-do-caos', name: 'A Ascensão do Caos', dateLabel: 'Data não estabelecida', summary: 'Período em desenvolvimento na bíblia narrativa.', canon: 'em_desenvolvimento' },
  { slug: 'o-tempo-de-kael', name: 'O Tempo de Kael', dateLabel: 'Livro I', summary: 'O presente narrativo de O Sussurro da Chama Antiga.', canon: 'provisorio', notes: 'Nome do período é organizacional.' },
]

export interface SeedEvent extends Editorial {
  slug: string
  title: string
  era?: string
  dateLabel: string
  certainty: CertaintyState
  eventType: string
  summary: string
  body?: string
  kingdoms?: string[]
  locations?: string[]
  characters?: string[]
}

export const SEED_EVENTS: SeedEvent[] = [
  {
    slug: 'o-vazio',
    title: 'O Vazio anterior à criação',
    era: 'antes-da-criacao',
    dateLabel: 'Antes do tempo',
    certainty: 'planejado',
    eventType: 'mito',
    summary: 'Estado anterior à criação do mundo. Sua natureza ainda não foi descrita.',
    canon: 'em_desenvolvimento',
  },
  {
    slug: 'a-chama-cria-o-mundo',
    title: 'A Chama do Dragão cria o mundo',
    era: 'a-criacao',
    dateLabel: 'Origem do mundo',
    certainty: 'confirmado',
    eventType: 'mito',
    summary: 'O mundo é criado pela Chama do Dragão.',
    canon: 'canonico',
  },
  {
    slug: 'o-surgimento-do-caos',
    title: 'O Caos surge junto da Chama',
    era: 'a-criacao',
    dateLabel: 'Origem do mundo',
    certainty: 'confirmado',
    eventType: 'mito',
    summary: 'Junto da Chama do Dragão, surge o Caos. Sua natureza integral permanece desconhecida.',
    canon: 'canonico',
  },
  {
    slug: 'estabelecimento-dos-seis-reinos',
    title: 'O estabelecimento dos seis reinos',
    era: 'era-dos-seis-reinos',
    dateLabel: 'Depois da criação',
    certainty: 'confirmado',
    eventType: 'fundacao',
    summary: 'Seis reinos são estabelecidos, cada um ligado a fragmentos do poder primordial.',
    body: 'Os nomes atualmente propostos são Safra, Aurelion, Nácaris, Kharveth, Elyndor e Rhovaryn. Nomes, capitais e características dos cinco reinos conhecidos ainda estão em desenvolvimento.',
    kingdoms: ['safra', 'aurelion', 'nacaris', 'kharveth', 'elyndor', 'rhovaryn'],
    canon: 'canonico',
  },
  {
    slug: 'a-destruicao-de-safra',
    title: 'A destruição de Safra',
    era: 'a-queda-de-safra',
    dateLabel: 'Data não estabelecida',
    certainty: 'confirmado',
    eventType: 'catastrofe',
    summary: 'Safra, o reino de ligação excepcional com as chamas, é destruído.',
    body: `:::spoiler 1
Os outros cinco reinos decidem exterminar a população de Safra, movidos pela inveja de seu poder.
:::

Os detalhes definitivos da destruição ainda não foram estabelecidos.`,
    kingdoms: ['safra'],
    canon: 'canonico',
  },
  {
    slug: 'o-herdeiro-atravessa-o-portal',
    title: 'Um herdeiro sobrevive',
    era: 'a-queda-de-safra',
    dateLabel: 'Durante a destruição de Safra',
    certainty: 'confirmado',
    eventType: 'catastrofe',
    summary: 'Um herdeiro de Safra sobrevive após ser enviado por um portal.',
    kingdoms: ['safra'],
    canon: 'canonico',
    spoiler: 1,
  },
  {
    slug: 'o-desaparecimento-da-chama',
    title: 'O desaparecimento da Chama',
    era: 'o-desaparecimento-da-chama',
    dateLabel: 'Data desconhecida',
    certainty: 'desconhecido',
    eventType: 'catastrofe',
    summary: 'A Chama desaparece. A verdadeira causa é um dos mistérios preservados.',
    canon: 'desconhecido',
  },
  {
    slug: 'a-ascensao-do-caos',
    title: 'A ascensão do Caos',
    era: 'a-ascensao-do-caos',
    dateLabel: 'Data não estabelecida',
    certainty: 'planejado',
    eventType: 'mito',
    summary: 'Movimento central da mitologia, ainda em desenvolvimento.',
    canon: 'em_desenvolvimento',
  },
  {
    slug: 'os-sonhos-de-kael',
    title: 'Os sonhos de Kael se intensificam',
    era: 'o-tempo-de-kael',
    dateLabel: 'Início do Livro I',
    certainty: 'confirmado',
    eventType: 'personagem',
    summary: 'Os sonhos de Kael passam a apresentar lugares impossíveis, imagens do passado e acontecimentos que desafiam sua compreensão do mundo.',
    characters: ['kael-draken'],
    locations: ['brumafunda'],
    canon: 'canonico',
  },
  {
    slug: 'a-fundacao-do-templo-da-chama',
    title: 'O Templo da Chama',
    dateLabel: 'Data e localização desconhecidas',
    certainty: 'desconhecido',
    eventType: 'fundacao',
    summary: 'A origem, a localização e a história completa do Templo da Chama permanecem desconhecidas.',
    locations: ['templo-da-chama'],
    canon: 'desconhecido',
  },
]

export interface SeedArticle extends Editorial {
  section: 'mitologia' | 'ressonancia'
  group: string
  slug: string
  title: string
  subtitle?: string
  summary: string
  body?: string
}

export const SEED_ARTICLES: SeedArticle[] = [
  // ── Mitologia e história antiga ─────────────────────────────
  {
    section: 'mitologia',
    group: 'origens',
    slug: 'o-vazio',
    title: 'O Vazio',
    subtitle: 'Antes da criação',
    summary: 'O que havia antes que a Chama criasse o mundo. O verbete faz parte da estrutura da mitologia, mas sua natureza ainda não foi descrita.',
    canon: 'em_desenvolvimento',
  },
  {
    section: 'mitologia',
    group: 'origens',
    slug: 'a-chama-do-dragao',
    title: 'A Chama do Dragão',
    subtitle: 'A força que criou o mundo',
    summary: 'A Chama do Dragão criou o mundo. Junto dela surgiu o Caos.',
    body: `A **Chama do Dragão** criou o mundo. Junto dela surgiu o [[mitologia/a-ascensao-do-caos|Caos]].

Posteriormente, [[mitologia/o-aparecimento-dos-seis-reinos|seis reinos]] foram estabelecidos, cada um ligado a fragmentos desse poder primordial.

A natureza do Dragão e da própria Chama ainda está em desenvolvimento.`,
    canon: 'canonico',
  },
  {
    section: 'mitologia',
    group: 'origens',
    slug: 'o-surgimento-do-mundo',
    title: 'O surgimento do mundo',
    subtitle: 'Criação e Caos',
    summary: 'O mundo nasce da Chama do Dragão — e, junto da Chama, surge o Caos.',
    body: `O mundo foi criado pela [[mitologia/a-chama-do-dragao|Chama do Dragão]]. Junto da Chama surgiu o Caos.

A forma do mundo recém-criado, sua geografia original e o intervalo entre a criação e o estabelecimento dos reinos ainda não foram descritos.`,
    canon: 'canonico',
  },
  {
    section: 'mitologia',
    group: 'reinos',
    slug: 'o-aparecimento-dos-seis-reinos',
    title: 'O aparecimento dos seis reinos',
    subtitle: 'Fragmentos do poder primordial',
    summary: 'Depois da criação, seis reinos foram estabelecidos, cada um ligado a fragmentos do poder primordial.',
    body: `Depois da criação, seis reinos foram estabelecidos, cada um ligado a fragmentos do poder primordial da [[mitologia/a-chama-do-dragao|Chama]].

Os nomes atualmente propostos são:

- [[reinos/safra|Safra]] — o reino desaparecido;
- [[reinos/aurelion|Aurelion]] — monarquia consultiva;
- [[reinos/nacaris|Nácaris]] — confederação de cidades;
- [[reinos/kharveth|Kharveth]] — pacto entre cinco ordens;
- [[reinos/elyndor|Elyndor]] — conselho religioso e civil;
- [[reinos/rhovaryn|Rhovaryn]] — liga de territórios autônomos.

Nomes, capitais e características dos cinco reinos conhecidos ainda estão em desenvolvimento.`,
    canon: 'canonico',
  },
  {
    section: 'mitologia',
    group: 'reinos',
    slug: 'o-templo-da-chama',
    title: 'O Templo da Chama',
    subtitle: 'Um lugar sem coordenadas',
    summary: 'A localização e a história completa do Templo da Chama permanecem um mistério preservado.',
    body: `A localização e a história completa do [[locais/templo-da-chama|Templo da Chama]] permanecem um mistério preservado.`,
    canon: 'desconhecido',
  },
  {
    section: 'mitologia',
    group: 'queda',
    slug: 'a-destruicao-de-safra',
    title: 'A destruição de Safra',
    subtitle: 'O reino desaparecido',
    summary: 'Safra, que possuía uma ligação excepcional com as chamas, foi destruído.',
    body: `[[reinos/safra|Safra]] possuía uma ligação excepcional com as chamas. O reino foi destruído.

:::spoiler 1
Os outros cinco reinos decidiram exterminar sua população por inveja de seu poder. Um herdeiro sobreviveu após ser enviado por um portal.
:::

Os detalhes definitivos da destruição e o destino completo de Safra permanecem desconhecidos.`,
    canon: 'canonico',
  },
  {
    section: 'mitologia',
    group: 'queda',
    slug: 'o-desaparecimento-da-chama',
    title: 'O desaparecimento da Chama',
    subtitle: 'Uma ausência sem causa conhecida',
    summary: 'A Chama desapareceu. A verdadeira causa é um dos mistérios preservados do universo.',
    body: 'A [[mitologia/a-chama-do-dragao|Chama]] desapareceu. A verdadeira causa desse desaparecimento é um dos mistérios preservados do universo.',
    canon: 'desconhecido',
  },
  {
    section: 'mitologia',
    group: 'queda',
    slug: 'o-seculo-perdido',
    title: 'O Século Perdido',
    subtitle: 'Seiscentos anos sem registro',
    summary: 'Seiscentos anos conhecidos como Século Perdido. Seus acontecimentos permanecem desconhecidos.',
    body: 'Chamam-se **Século Perdido** os seiscentos anos cujos acontecimentos permanecem desconhecidos.',
    canon: 'desconhecido',
  },
  {
    section: 'mitologia',
    group: 'queda',
    slug: 'a-ascensao-do-caos',
    title: 'A ascensão do Caos',
    subtitle: 'O que nasceu junto da Chama',
    summary: 'O Caos surgiu junto da Chama na criação do mundo. Sua natureza integral não é revelada neste arquivo.',
    body: `O Caos surgiu junto da [[mitologia/a-chama-do-dragao|Chama do Dragão]], na criação do mundo.

A ascensão do Caos é um dos movimentos da mitologia ainda em desenvolvimento. Sua natureza integral permanece desconhecida.`,
    canon: 'em_desenvolvimento',
  },
  {
    section: 'mitologia',
    group: 'tradicoes',
    slug: 'lendas-e-tradicoes',
    title: 'Lendas e tradições',
    subtitle: 'As memórias de cada civilização',
    summary: 'Este verbete reunirá as lendas e tradições de cada civilização à medida que forem escritas.',
    canon: 'em_desenvolvimento',
  },

  // ── Sistema da Ressonância ──────────────────────────────────
  {
    section: 'ressonancia',
    group: 'fundamentos',
    slug: 'a-natureza-da-chama',
    title: 'A natureza da Chama',
    summary: 'A Chama do Dragão é a origem do mundo e do poder primordial.',
    body: `A [[mitologia/a-chama-do-dragao|Chama do Dragão]] criou o mundo. Os seis reinos estão ligados a fragmentos desse poder primordial, e [[reinos/safra|Safra]] possuía uma ligação excepcional com as chamas.

Como a Chama se relaciona com a Ressonância ainda está em desenvolvimento.`,
    canon: 'em_desenvolvimento',
  },
  {
    section: 'ressonancia',
    group: 'fundamentos',
    slug: 'a-ressonancia',
    title: 'A Ressonância',
    summary: 'O sistema mágico do universo de Kael Draken.',
    body: `**Ressonância** é o nome do sistema mágico do universo. Seus conceitos fundamentais propostos são o [[ressonancia/o-lume|Lume]], o [[ressonancia/o-lastro|Lastro]] e o [[ressonancia/o-eco|Eco]], e suas manifestações se organizam em [[ressonancia/as-seis-faces|seis faces]] de nomes provisórios.

O funcionamento do sistema está em desenvolvimento.`,
    canon: 'provisorio',
  },
  {
    section: 'ressonancia',
    group: 'conceitos',
    slug: 'o-lume',
    title: 'O Lume',
    summary: 'Conceito fundamental proposto do sistema da Ressonância. Definição em desenvolvimento.',
    canon: 'em_desenvolvimento',
  },
  {
    section: 'ressonancia',
    group: 'conceitos',
    slug: 'o-lastro',
    title: 'O Lastro',
    summary: 'Conceito fundamental proposto do sistema da Ressonância. Definição em desenvolvimento.',
    canon: 'em_desenvolvimento',
  },
  {
    section: 'ressonancia',
    group: 'conceitos',
    slug: 'o-eco',
    title: 'O Eco',
    summary: 'Conceito fundamental proposto do sistema da Ressonância. Definição em desenvolvimento.',
    canon: 'em_desenvolvimento',
  },
  {
    section: 'ressonancia',
    group: 'faces',
    slug: 'as-seis-faces',
    title: 'As seis faces',
    subtitle: 'Nomes provisórios',
    summary: 'Forja, Vigília, Elo, Eco, Limiar e Ímpeto: as seis faces propostas da Ressonância.',
    body: `As seis faces propostas da Ressonância são:

1. **Forja**
2. **Vigília**
3. **Elo**
4. **Eco**
5. **Limiar**
6. **Ímpeto**

Os nomes são provisórios. Nenhuma face está associada a um reino específico, e a definição de cada uma ainda está em desenvolvimento.

O nome **Eco** também designa um dos [[ressonancia/o-eco|conceitos fundamentais]] do sistema. A relação entre ambos ainda não foi definida.`,
    canon: 'provisorio',
  },
  {
    section: 'ressonancia',
    group: 'pratica',
    slug: 'condicoes-de-manifestacao',
    title: 'Condições de manifestação',
    summary: 'Em que circunstâncias a Ressonância se manifesta. Verbete em desenvolvimento.',
    canon: 'em_desenvolvimento',
  },
  {
    section: 'ressonancia',
    group: 'pratica',
    slug: 'custos-e-limites',
    title: 'Custos e limites',
    summary: 'O preço e os limites do uso da Ressonância. Verbete em desenvolvimento.',
    canon: 'em_desenvolvimento',
  },
  {
    section: 'ressonancia',
    group: 'pratica',
    slug: 'treinamento',
    title: 'Treinamento',
    summary: 'Como a Ressonância é aprendida, praticada e transmitida. Verbete em desenvolvimento.',
    canon: 'em_desenvolvimento',
  },
  {
    section: 'ressonancia',
    group: 'pratica',
    slug: 'magia-sociedade-ciencia-e-politica',
    title: 'Magia, sociedade, ciência e política',
    summary: 'O lugar da Ressonância na sociedade, na ciência e na política dos reinos. Verbete em desenvolvimento.',
    canon: 'em_desenvolvimento',
  },
]

export interface SeedMystery {
  slug: string
  title: string
  description: string
  relatedHref: string
  spoiler?: 0 | 1 | 2
}

export const SEED_MYSTERIES: SeedMystery[] = [
  {
    slug: 'causa-do-desaparecimento-da-chama',
    title: 'A verdadeira causa do desaparecimento da Chama',
    description: 'Por que a Chama desapareceu?',
    relatedHref: '/mitologia/o-desaparecimento-da-chama',
  },
  { slug: 'destino-de-safra', title: 'O destino completo de Safra', description: 'O que realmente aconteceu ao reino desaparecido?', relatedHref: '/reinos/safra' },
  {
    slug: 'nome-de-nascimento-de-kael',
    title: 'O nome de nascimento de Kael',
    description: 'O nome com que Kael nasceu permanece desconhecido.',
    relatedHref: '/personagens/kael-draken',
    spoiler: 1,
  },
  { slug: 'natureza-do-caos', title: 'A natureza integral do Caos', description: 'O que é, por inteiro, aquilo que surgiu junto da Chama?', relatedHref: '/mitologia/a-ascensao-do-caos' },
  {
    slug: 'acontecimentos-do-seculo-perdido',
    title: 'Os acontecimentos do Século Perdido',
    description: 'O que aconteceu durante os seiscentos anos sem registro?',
    relatedHref: '/mitologia/o-seculo-perdido',
  },
  {
    slug: 'templo-da-chama',
    title: 'A localização e a história do Templo da Chama',
    description: 'Onde fica o Templo da Chama, e qual é sua história completa?',
    relatedHref: '/locais/templo-da-chama',
  },
]

export interface SeedDocument extends Editorial {
  slug: string
  title: string
  docType: string
  excerpt: string
  transcription: string
  origin: string
  dateLabel: string
  context: string
  reliability: ReliabilityState
  tags?: string[]
}

export const SEED_DOCUMENTS: SeedDocument[] = [
  {
    slug: 'quando-a-chama-despertar',
    title: 'Quando a Chama despertar',
    docType: 'profecia',
    excerpt: 'Quando a Chama despertar, não o fará sozinha.',
    transcription: `Quando a Chama despertar,
não o fará sozinha.
Skrugheim abrirá suas portas,
e a morte caminhará entre os vivos.`,
    origin: 'Desconhecida.',
    dateLabel: 'Desconhecida',
    context:
      'Frase de referência associada a [[livros/o-sussurro-da-chama-antiga|Livro I — O Sussurro da Chama Antiga]]. Seus significados não são explicados neste arquivo.',
    reliability: 'desconhecido',
    canon: 'canonico',
    tags: ['profecia', 'chama'],
  },
]

export const SEED_MAP = {
  slug: 'mapa-geral',
  title: 'Mapa geral dos Seis Reinos',
  description:
    'Carta geral do mundo. A geografia oficial ainda está em desenvolvimento: enquanto não houver um mapa aprovado, o atlas exibe uma carta-base sem posições geográficas.',
}

export const SEED_BOOK = {
  slug: 'o-sussurro-da-chama-antiga',
  volume: 1,
  title: 'O Sussurro da Chama Antiga',
  subtitle: 'Kael Draken — Livro I',
  synopsis: `Kael tem dezesseis anos e cresceu em um vilarejo distante, criado por uma família humilde e amorosa. É inteligente, gentil e alegre — mas também reservado e impulsivo, e aprendeu a usar máscaras sociais para esconder a dificuldade de lidar com a própria raiva.

Quando seus sonhos começam a se intensificar, eles trazem lugares impossíveis, imagens do passado e acontecimentos que desafiam tudo o que ele entende sobre o mundo.`,
  editorialInfo: `- **Saga:** Kael Draken
- **Volume:** I
- **Situação:** em desenvolvimento`,
}

export const SEED_POST = {
  slug: 'o-arquivo-da-chama-antiga-esta-aberto',
  title: 'O arquivo da Chama Antiga está aberto',
  category: 'atualizacao',
  excerpt: 'Primeira versão do arquivo do universo: atlas, reinos, mitologia, cronologia, Ressonância e manuscritos — com o estado editorial de cada verbete à vista.',
  body: `Este é o arquivo oficial do universo de **Kael Draken — O Sussurro da Chama Antiga**: o lugar onde mapas, reinos, personagens, documentos e a história do mundo serão reunidos à medida que a saga é escrita.

O universo está em construção. Por isso, cada verbete traz seu estado editorial:

- **Canônico** — confirmado para a história;
- **Provisório** — proposta que ainda pode mudar;
- **Em desenvolvimento** — conteúdo sendo escrito;
- **Desconhecido** — mistério intencionalmente não resolvido.

Você também pode escolher o seu nível de spoiler no topo da página. Por padrão, o arquivo não revela nada além do que se pode saber antes de abrir o livro.

Comece pelo [[atlas|Atlas dos Seis Reinos]] ou pela [[mitologia|mitologia]].`,
}

export const SEED_SETTINGS: Record<string, string> = {
  home_intro:
    'Antes dos reinos, antes dos nomes, havia a Chama. Dela nasceu o mundo — e, junto dela, o Caos. Seis reinos ergueram-se sobre fragmentos desse poder primordial. Um deles desapareceu. Num vilarejo distante, um rapaz de dezesseis anos começa a sonhar com lugares que não deveriam existir.',
  home_quote: 'Quando a Chama despertar, não o fará sozinha. Skrugheim abrirá suas portas, e a morte caminhará entre os vivos.',
  home_quote_source: 'O Sussurro da Chama Antiga',
  home_quote_href: '/manuscritos/quando-a-chama-despertar',
  site_description: 'Enciclopédia oficial e arquivo de desenvolvimento do universo de Kael Draken — O Sussurro da Chama Antiga.',
  author_name: '',
  cover_media_id: '',
}
