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
  `${name} está entre os cinco reinos que decidiram destruir a população de [[reinos/safra|Safra]], movidos pela inveja de seu poder. O papel específico de ${name} nessa decisão ainda não foi definido.

Depois da [[mitologia/safra-e-a-noite-das-cinzas|Noite das Cinzas]], Safra foi apagada da história oficial: a versão reconhecida pelos reinos admite apenas cinco.`

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
    body: 'Entre os seis reinos estabelecidos depois da criação, **Safra** possuía uma ligação excepcional com as chamas. Destruída na [[mitologia/safra-e-a-noite-das-cinzas|Noite das Cinzas]], foi apagada da história oficial — os mapas reconhecidos mostram apenas cinco reinos.',
    resonance: 'Safra possuía uma ligação excepcional com as chamas. A natureza exata dessa ligação ainda não foi documentada.',
    history: `Os outros cinco reinos decidiram destruir a população de Safra, movidos pela inveja de seu poder. Na catástrofe conhecida como **Noite das Cinzas**, Safra foi destruída, e a linhagem real se perdeu. Durante esse mesmo período, a Chama desapareceu.

:::spoiler 1
Um herdeiro sobreviveu após ser enviado por um portal.
:::

Depois da destruição, Safra foi apagada da história oficial.`,
    mysteries: 'O destino completo de Safra e de sua linhagem real permanece um mistério preservado. Os detalhes definitivos da destruição ainda não foram estabelecidos.',
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
    body: 'Vilarejo distante onde Kael cresceu, criado por uma família adotiva, humilde e amorosa. O nome **Brumafunda** é provisório, e a localização do vilarejo ainda não foi definida.',
    canon: 'provisorio',
    notes: 'Nome provisório. Reino e localização ainda não definidos.',
  },
  {
    slug: 'templo-da-chama',
    name: 'Templo da Chama',
    category: 'templo',
    summary: 'Lugar central à história dos reinos, ligado à proteção da Chama. Localização e destino atual desconhecidos.',
    body: 'O Templo da Chama era um lugar central relacionado à proteção da [[mitologia/a-chama-do-dragao|Chama]].',
    history: 'Sua localização exata, sua história completa e seu destino atual são mistérios preservados do universo.',
    canon: 'canonico',
  },
  {
    slug: 'ruinas-de-safra',
    name: 'Ruínas de Safra',
    kingdom: 'safra',
    category: 'ruina',
    summary: 'O que restou do reino destruído na Noite das Cinzas. Localização ainda não definida.',
    body: 'Restos do reino de [[reinos/safra|Safra]], destruído na [[mitologia/safra-e-a-noite-das-cinzas|Noite das Cinzas]] e apagado da história oficial.',
    history: 'A localização, a extensão e o estado atual das ruínas ainda não foram definidos.',
    canon: 'provisorio',
    notes: 'Existência implícita na bíblia narrativa; detalhes a definir.',
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
    history: `Kael cresceu em um vilarejo distante — provisoriamente chamado [[locais/brumafunda|Brumafunda]] —, criado por uma família adotiva, humilde e amorosa.

No início da história, seus sonhos começam a se intensificar, apresentando lugares impossíveis, imagens do passado e acontecimentos que desafiam sua compreensão do mundo.`,
    family: 'Criado por uma família adotiva, humilde e amorosa. Os membros da família ainda não foram documentados.',
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
  {
    slug: 'a-noite-das-cinzas',
    name: 'A Noite das Cinzas',
    dateLabel: 'Data não estabelecida',
    summary: 'Safra é destruída pelos outros cinco reinos; durante esse período, a Chama desaparece.',
    canon: 'canonico',
  },
  {
    slug: 'o-seculo-perdido',
    name: 'O Século Perdido',
    dateLabel: 'Cerca de seiscentos anos',
    summary: 'Aproximadamente seiscentos anos de história perdida.',
    canon: 'canonico',
    notes: 'Apesar do nome, o período abrange cerca de 600 anos. Manter assim.',
  },
  {
    slug: 'a-ascensao-do-caos',
    name: 'A Ascensão do Caos',
    dateLabel: 'Data não estabelecida',
    summary: 'Sem a Chama, o equilíbrio se rompe e o Caos se torna uma ameaça.',
    canon: 'canonico',
  },
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
    title: 'O Caos surge com a criação',
    era: 'a-criacao',
    dateLabel: 'Origem do mundo',
    certainty: 'confirmado',
    eventType: 'mito',
    summary: 'Com a criação surge o Caos, a princípio contido — mantido sob controle — pela Chama. Sua natureza integral permanece desconhecida.',
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
    slug: 'a-decisao-dos-cinco-reinos',
    title: 'A decisão dos cinco reinos',
    era: 'a-noite-das-cinzas',
    dateLabel: 'Antes da Noite das Cinzas',
    certainty: 'confirmado',
    eventType: 'guerra',
    summary: 'Movidos pela inveja do poder de Safra, os outros cinco reinos decidem destruir sua população.',
    kingdoms: ['safra', 'aurelion', 'nacaris', 'kharveth', 'elyndor', 'rhovaryn'],
    canon: 'canonico',
  },
  {
    slug: 'a-noite-das-cinzas',
    title: 'A Noite das Cinzas',
    era: 'a-noite-das-cinzas',
    dateLabel: 'Data não estabelecida',
    certainty: 'confirmado',
    eventType: 'catastrofe',
    summary: 'Safra, o reino de ligação excepcional com as chamas, é destruída, e sua linhagem real se perde.',
    body: 'Os detalhes definitivos da destruição ainda não foram estabelecidos.',
    kingdoms: ['safra'],
    locations: ['ruinas-de-safra'],
    canon: 'canonico',
  },
  {
    slug: 'o-herdeiro-atravessa-o-portal',
    title: 'Um herdeiro sobrevive',
    era: 'a-noite-das-cinzas',
    dateLabel: 'Durante a Noite das Cinzas',
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
    era: 'a-noite-das-cinzas',
    dateLabel: 'Durante o período da catástrofe',
    certainty: 'confirmado',
    eventType: 'catastrofe',
    summary: 'A Chama desaparece durante o período da catástrofe. A verdadeira causa é um dos mistérios preservados.',
    canon: 'canonico',
  },
  {
    slug: 'o-apagamento-de-safra',
    title: 'Safra é apagada da história oficial',
    era: 'a-noite-das-cinzas',
    dateLabel: 'Depois da catástrofe — período não estabelecido',
    certainty: 'confirmado',
    eventType: 'governo',
    summary: 'A história oficial passa a reconhecer apenas cinco reinos.',
    kingdoms: ['safra'],
    canon: 'canonico',
  },
  {
    slug: 'o-caos-se-torna-ameaca',
    title: 'O Caos se torna uma ameaça',
    era: 'a-ascensao-do-caos',
    dateLabel: 'Depois do desaparecimento da Chama',
    certainty: 'confirmado',
    eventType: 'mito',
    summary: 'O desaparecimento da Chama perturba o equilíbrio e permite que o Caos se torne uma ameaça.',
    canon: 'canonico',
  },
  {
    slug: 'os-sonhos-de-kael',
    title: 'Os sonhos de Kael se intensificam',
    era: 'o-tempo-de-kael',
    dateLabel: 'Início do Livro I',
    certainty: 'confirmado',
    eventType: 'personagem',
    summary: 'Aos dezesseis anos, os sonhos de Kael passam a apresentar lugares impossíveis, imagens do passado e acontecimentos que desafiam sua compreensão do mundo.',
    characters: ['kael-draken'],
    locations: ['brumafunda'],
    canon: 'canonico',
  },
  {
    slug: 'o-templo-da-chama',
    title: 'O Templo da Chama',
    dateLabel: 'Fundação e localização desconhecidas',
    certainty: 'desconhecido',
    eventType: 'fundacao',
    summary: 'Lugar central ligado à proteção da Chama. Quando foi erguido, onde fica e qual é seu destino atual permanece desconhecido.',
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
    summary: 'A Chama do Dragão criou o mundo. Com a criação surgiu o Caos, que a Chama a princípio manteve contido.',
    body: `A **Chama do Dragão** criou o mundo. Com a criação surgiu o [[mitologia/a-ascensao-do-caos|Caos]], que a Chama inicialmente conteve — manteve sob controle.

Posteriormente, [[mitologia/o-aparecimento-dos-seis-reinos|seis reinos]] foram estabelecidos, cada um ligado a fragmentos desse poder primordial. O [[mitologia/o-templo-da-chama|Templo da Chama]] era um lugar central relacionado à proteção da Chama.

Durante o período da catástrofe que destruiu [[reinos/safra|Safra]], a Chama [[mitologia/o-desaparecimento-da-chama|desapareceu]]. Sem ela, o equilíbrio se rompeu.

A natureza do Dragão e da própria Chama ainda está em desenvolvimento.`,
    canon: 'canonico',
  },
  {
    section: 'mitologia',
    group: 'origens',
    slug: 'o-surgimento-do-mundo',
    title: 'O surgimento do mundo',
    subtitle: 'Criação e Caos',
    summary: 'O mundo nasce da Chama do Dragão — e, com a criação, surge o Caos.',
    body: `O mundo foi criado pela [[mitologia/a-chama-do-dragao|Chama do Dragão]]. Com a criação surgiu o Caos, contido pela Chama.

A forma do mundo recém-criado, sua geografia original e o intervalo entre a criação e o estabelecimento dos reinos ainda não foram descritos. Os mapas do [[atlas|Atlas]] são composições conceituais.`,
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

Nomes, capitais e características dos cinco reinos conhecidos ainda estão em desenvolvimento. Os brasões exibidos no arquivo são propostas heráldicas.`,
    canon: 'canonico',
  },
  {
    section: 'mitologia',
    group: 'reinos',
    slug: 'o-templo-da-chama',
    title: 'O Templo da Chama',
    subtitle: 'O lugar que guardava a Chama',
    summary: 'Lugar central à história dos reinos, relacionado à proteção da Chama. Sua localização exata e seu destino atual não são definidos.',
    body: `O [[locais/templo-da-chama|Templo da Chama]] era um lugar central relacionado à proteção da [[mitologia/a-chama-do-dragao|Chama]], e por isso ocupa um lugar central também na história dos reinos.

Onde ele fica, como era sua história completa e o que lhe aconteceu depois do [[mitologia/o-desaparecimento-da-chama|desaparecimento da Chama]] permanecem mistérios preservados.`,
    canon: 'canonico',
  },
  {
    section: 'mitologia',
    group: 'queda',
    slug: 'safra-e-a-noite-das-cinzas',
    title: 'Safra e a Noite das Cinzas',
    subtitle: 'A ferida da história',
    summary: 'A vida de uma civilização ligada às chamas, a decisão dos cinco reinos, a catástrofe, a linhagem perdida, as ruínas e o apagamento.',
    body: `## Uma civilização viva

[[reinos/safra|Safra]] era um dos seis reinos, e possuía uma ligação excepcional com as chamas. Era um povo com suas cidades, suas ruas, sua arquitetura e sua cultura — uma civilização que existiu de verdade.

![Uma cidade de Safra ao entardecer, com terraços, cúpulas e ruas iluminadas.](/images/atlas/safra-antes.webp "Safra antes da destruição — conceito artístico.")

Os detalhes de sua cultura, de suas cidades e de seus costumes ainda estão em desenvolvimento.

## A decisão dos cinco reinos

Os outros cinco reinos decidiram destruir a população de Safra, movidos pela inveja de seu poder.

## A Noite das Cinzas

Safra foi destruída. A catástrofe é lembrada como a **Noite das Cinzas**. Durante esse mesmo período, a [[mitologia/o-desaparecimento-da-chama|Chama desapareceu]].

![A cidade em chamas sob uma coluna de fumaça; silhuetas distantes observam.](/images/atlas/queda-safra.webp "A Noite das Cinzas — conceito artístico.")

Os detalhes definitivos da destruição não foram estabelecidos.

## A linhagem perdida

Com Safra, perdeu-se a sua linhagem real.

:::spoiler 1
Um herdeiro sobreviveu após ser enviado por um portal.
:::

## As ruínas

Restaram [[locais/ruinas-de-safra|ruínas]]. Sua localização e seu estado atual ainda não foram definidos.

![Arcos partidos cobertos de cinza sob a luz fria da aurora.](/images/atlas/ruinas-safra.webp "Ruínas de Safra — conceito artístico.")

## O apagamento

Depois da destruição, Safra foi apagada da história oficial. A versão reconhecida pelos reinos admite apenas cinco — como mostra o mapa do mundo conhecido no [[atlas|Atlas]].

O destino completo de Safra permanece um mistério preservado.`,
    canon: 'canonico',
  },
  {
    section: 'mitologia',
    group: 'queda',
    slug: 'o-desaparecimento-da-chama',
    title: 'O desaparecimento da Chama',
    subtitle: 'Uma ausência sem causa conhecida',
    summary: 'A Chama desapareceu durante o período da catástrofe. Sua ausência rompeu o equilíbrio e permitiu que o Caos se tornasse uma ameaça.',
    body: `A [[mitologia/a-chama-do-dragao|Chama]] desapareceu durante o período da catástrofe que destruiu Safra — a [[mitologia/safra-e-a-noite-das-cinzas|Noite das Cinzas]].

O desaparecimento perturbou o equilíbrio do mundo e permitiu que o [[mitologia/a-ascensao-do-caos|Caos]] se tornasse uma ameaça.

A verdadeira causa desse desaparecimento é um dos mistérios preservados do universo.`,
    canon: 'canonico',
  },
  {
    section: 'mitologia',
    group: 'queda',
    slug: 'o-seculo-perdido',
    title: 'O Século Perdido',
    subtitle: 'Cerca de seiscentos anos sem registro',
    summary: 'Aproximadamente seiscentos anos de história perdida. Seus acontecimentos permanecem desconhecidos.',
    body: `Chama-se **Século Perdido** um período de aproximadamente seiscentos anos de história perdida. Apesar do nome, ele não corresponde a um único século.

O que aconteceu durante esses anos permanece desconhecido.`,
    canon: 'canonico',
  },
  {
    section: 'mitologia',
    group: 'queda',
    slug: 'a-ascensao-do-caos',
    title: 'A ascensão do Caos',
    subtitle: 'O que nasceu com a criação',
    summary: 'O Caos surgiu com a criação e foi contido pela Chama. Sem ela, tornou-se uma ameaça. Sua natureza integral não é revelada neste arquivo.',
    body: `O Caos surgiu com a criação do mundo e foi inicialmente contido — mantido sob controle — pela [[mitologia/a-chama-do-dragao|Chama do Dragão]].

Quando a Chama [[mitologia/o-desaparecimento-da-chama|desapareceu]], o equilíbrio se rompeu, e o Caos pôde se tornar uma ameaça.

O que o Caos é, por inteiro, permanece desconhecido.`,
    canon: 'canonico',
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
    body: `A [[mitologia/a-chama-do-dragao|Chama do Dragão]] criou o mundo e conteve o Caos que surgiu com a criação. Os seis reinos estão ligados a fragmentos desse poder primordial, e [[reinos/safra|Safra]] possuía uma ligação excepcional com as chamas.

A Chama desapareceu durante o período da catástrofe que destruiu Safra. Como ela se relaciona com a Ressonância ainda está em desenvolvimento.`,
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
    title: 'Por que a Chama desapareceu?',
    description: 'Ela desapareceu durante o período da catástrofe. A verdadeira causa permanece desconhecida.',
    relatedHref: '/mitologia/o-desaparecimento-da-chama',
  },
  {
    slug: 'linhagem-de-safra',
    title: 'O destino da linhagem real de Safra',
    description: 'Com a destruição de Safra, sua linhagem real se perdeu. O que aconteceu a ela?',
    relatedHref: '/mitologia/safra-e-a-noite-das-cinzas',
  },
  {
    slug: 'o-portal',
    title: 'O portal',
    description: 'Que portal levou o herdeiro de Safra — e para onde?',
    relatedHref: '/mitologia/safra-e-a-noite-das-cinzas',
    spoiler: 1,
  },
  {
    slug: 'natureza-do-caos',
    title: 'A natureza integral do Caos',
    description: 'O que é, por inteiro, aquilo que surgiu com a criação e foi contido pela Chama?',
    relatedHref: '/mitologia/a-ascensao-do-caos',
  },
  {
    slug: 'acontecimentos-do-seculo-perdido',
    title: 'O que aconteceu no Século Perdido?',
    description: 'Cerca de seiscentos anos de história perdida.',
    relatedHref: '/mitologia/o-seculo-perdido',
  },
  {
    slug: 'templo-da-chama',
    title: 'Onde está o Templo da Chama?',
    description: 'Sua localização exata, sua história completa e seu destino atual não são conhecidos.',
    relatedHref: '/locais/templo-da-chama',
  },
  {
    slug: 'skrugheim',
    title: 'O que é Skrugheim?',
    description: 'A profecia diz que Skrugheim abrirá suas portas. Sua natureza permanece desconhecida.',
    relatedHref: '/manuscritos/quando-a-chama-despertar',
  },
  {
    slug: 'destino-de-safra',
    title: 'O destino completo de Safra',
    description: 'O que realmente aconteceu ao reino apagado da história oficial?',
    relatedHref: '/reinos/safra',
  },
  {
    slug: 'nome-de-nascimento-de-kael',
    title: 'O nome de nascimento de Kael',
    description: 'O nome com que Kael nasceu permanece desconhecido.',
    relatedHref: '/personagens/kael-draken',
    spoiler: 1,
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
      'Frase de referência associada a [[livros/o-sussurro-da-chama-antiga|Livro I — O Sussurro da Chama Antiga]]. Seus significados não são explicados neste arquivo, e a natureza de Skrugheim permanece desconhecida.',
    reliability: 'desconhecido',
    canon: 'canonico',
    tags: ['profecia', 'chama'],
  },
]

/** Apresentação provisória usada antes da sinopse oficial (para atualizar bancos antigos sem tocar em textos editados). */
export const LEGACY_BOOK_SYNOPSIS = `Kael tem dezesseis anos e cresceu em um vilarejo distante, criado por uma família adotiva, humilde e amorosa. É inteligente, gentil e alegre — mas também reservado e impulsivo, e aprendeu a usar máscaras sociais para esconder a dificuldade de lidar com a própria raiva.

Quando seus sonhos começam a se intensificar, eles trazem lugares impossíveis, imagens do passado e acontecimentos que desafiam tudo o que ele entende sobre o mundo.`

/** Sinopse oficial: texto da contracapa do Livro I. */
export const OFFICIAL_BOOK_SYNOPSIS = `**Quando a Chama desperta, o mundo nunca mais será o mesmo.**

Em um mundo marcado por guerras, segredos e reinos em ruínas, Kael Draken, um jovem de 16 anos, leva uma vida tranquila em um vilarejo distante, sem saber que carrega um destino capaz de mudar o rumo da história.

Quando uma antiga chama desperta, forças adormecidas voltam a se mover nas sombras, revelando verdades esquecidas, símbolos antigos e um passado que muitos preferem manter oculto.

Entre alianças inesperadas, perigos mortais e escolhas que podem consumir sua alma, Kael precisará descobrir quem realmente é, antes que o mundo seja tomado novamente pelo Caos.

> *“O fogo não escolhe, ele consome. Mas também revela aquilo que estava oculto.”*`

export const SEED_BOOK = {
  slug: 'o-sussurro-da-chama-antiga',
  volume: 1,
  title: 'O Sussurro da Chama Antiga',
  subtitle: 'Kael Draken — Livro I',
  synopsis: OFFICIAL_BOOK_SYNOPSIS,
  editorialInfo: `- **Saga:** Kael Draken
- **Volume:** I
- **Gêneros:** fantasia, aventura, mistério e destino`,
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

Comece pelo [[atlas|Atlas dos Seis Reinos]] — que pode ser explorado em três dimensões — ou pela [[mitologia|mitologia]].`,
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
  announcement_enabled: '1',
  announcement_kicker: 'Kael Draken · O Sussurro da Chama Antiga',
  announcement_title: 'O livro voltou',
  announcement_body: `O Sussurro da Chama Antiga está de volta — e o Arquivo da Chama Antiga abre suas portas para quem quiser atravessá-las.

Antes que o céu e a terra existissem, havia a Chama do Dragão. Dela nasceu tudo: os céus, as terras, a vida e os seis reinos.

Cada reino recebeu um fragmento da Chama, mas Safra conseguiu dominá-la como nenhum outro. Com ela, seu povo alcançou força, conhecimento e habilidades extraordinárias.

Movidas pela inveja, as outras cinco grandes nações se uniram para destruir Safra e exterminar seu povo. Durante a catástrofe, a Chama desapareceu; os registros sobre o sexto reino foram apagados, e um Século Perdido de cerca de seiscentos anos esconde a verdade da história. Sem a Chama, o Caos voltou a ameaçar o mundo.

:::spoiler 2
Apenas Kael, o herdeiro real de Safra, sobreviveu, graças a um sacrifício que abriu um portal e o enviou para outro lugar. Cresceu em um vilarejo distante, sob um novo nome — Kael Draken —, sem saber sobre sua verdadeira origem, seu reino ou sua ligação com a Chama.
:::

A história acompanha Kael, um jovem de dezesseis anos, inteligente e gentil, mas marcado por uma raiva que tenta controlar, enquanto sonhos misteriosos começam a se intensificar — sonhos com lugares, tempos e acontecimentos que não existem no mundo conhecido.

Entre ruínas do passado, o renascimento do Caos e segredos antigos, Kael embarca em uma jornada que poderá revelar a verdade sobre suas origens e definir o destino de todos os reinos.`,
}

/**
 * Livro I — capítulos I a X, com os títulos do manuscrito (Edição Profissional
 * Ilustrada). Só os títulos: os textos não são publicados automaticamente (os
 * capítulos entram como rascunho, sem trecho).
 */
export const SEED_CHAPTERS: Array<{ number: number; title: string }> = [
  { number: 1, title: 'O lugar que não existia' },
  { number: 2, title: 'O peso do despertar' },
  { number: 3, title: 'A casa no fim da estrada' },
  { number: 4, title: 'O caminho do bosque' },
  { number: 5, title: 'Aquilo que ficou à porta' },
  { number: 6, title: 'O que pode ser provado' },
  { number: 7, title: 'O arquivo sob a poeira' },
  { number: 8, title: 'A versão oficial' },
  { number: 9, title: 'O homem dos estábulos' },
  { number: 10, title: 'A chave de ferro' },
]

export interface SeedIllustration {
  chapter: number
  /** Identificador e nome do arquivo em public/images/livro-1/ilustracoes/. */
  slug: string
  artState: 'final' | 'estudo' | 'pendente'
  alt: string
  caption: string
  /** Direção de arte (privada): orientação para o ilustrador. */
  direction: string
  /** Anotação privada sobre a origem e o estado do arquivo. */
  notes: string
}

const FROM_MANUSCRIPT =
  'Imagem extraída do manuscrito "Kael_Draken_Edicao_Profissional_Ilustrada_1.docx" — versão de impressão, 1831 × 2717 px, 300 DPI, tons de cinza. Ilustrador não identificado no arquivo: preencha o campo Créditos.'

export const SEED_ILLUSTRATIONS: SeedIllustration[] = [
  {
    chapter: 1,
    slug: 'capitulo-01-lugar-que-nao-existia',
    artState: 'final',
    caption: 'Um céu sem estrelas e uma cidade que Kael não reconhece.',
    alt: 'Gravura em preto e branco. De costas, um rapaz está num terraço de pedra entre dois braseiros acesos e contempla uma cidade imensa de torres e pináculos góticos, pontes em arcos e cascatas. No alto, um templo monumental se ergue sob um halo de luz circular, contra um céu escuro e revolto.',
    direction:
      'Uma cidade sem estrelas, torres monumentais, lanternas cujas chamas permanecem imóveis e cinzas que sobem em vez de cair. Ao fundo, um templo gigantesco. Em primeiro plano, uma fonte contendo uma chama incomum. Incluir discretamente um mapa ou uma superfície gravada com cinco linhas convergindo e uma sexta linha incompleta. Uma figura encapuzada pode aparecer distante, sem revelar sua identidade.',
    notes: `${FROM_MANUSCRIPT} No pedido de ilustração este capítulo aparecia como "O sonho impossível"; o manuscrito o intitula "O lugar que não existia".`,
  },
  {
    chapter: 2,
    slug: 'capitulo-02-peso-do-despertar',
    artState: 'estudo',
    caption: 'O vale visto do alto, na manhã depois do sonho.',
    alt: 'Imagem em preto e branco, em baixa resolução. Uma figura de manto e capuz, apoiada num cajado, observa do alto de uma rocha um vale coberto de mata, com montanhas ao longe sob um céu nublado.',
    direction:
      'O interior de uma casa humilde, com móveis de madeira, mesa simples e luz entrando por uma janela. Kael tenta retomar sua rotina depois do sonho perturbador. Incluir um pequeno vestígio de cinza e um desenho ou folha incompleta. A imagem deve contrastar o cotidiano acolhedor com a inquietação que começa a acompanhá-lo.',
    notes:
      'Única versão no manuscrito: 1240 × 1820 px (cerca de 200 DPI em 15,5 × 23 cm), ampliada e sem nitidez, com uma linha branca no canto superior direito. Não serve para impressão: refazer em 1831 × 2717 px e, ao enviar a nova imagem, mudar o estado para "Arte final".',
  },
  {
    chapter: 3,
    slug: 'capitulo-03-casa-fim-da-estrada',
    artState: 'final',
    caption: 'A casa de pedra, junto ao muro e à grande árvore.',
    alt: 'Gravura em preto e branco. Uma casa de pedra com telhado de colmo, chaminé, janelas iluminadas e um alpendre, ao lado de uma grande árvore. Um caminho de terra passa junto a um muro de pedras soltas; ao fundo, montanhas.',
    direction:
      'Uma casa simples no final de uma estrada de aldeia, cercada por uma paisagem rural e árvores que conduzem visualmente até um bosque distante. Kael aparece como um jovem de dezesseis anos, com roupas práticas e comuns. A composição deve transmitir pertencimento, simplicidade e um mistério que ainda está longe de ser compreendido.',
    notes: FROM_MANUSCRIPT,
  },
  {
    chapter: 4,
    slug: 'capitulo-04-caminho-do-bosque',
    artState: 'final',
    caption: 'Um arco de pedra esquecido no bosque.',
    alt: 'Gravura em preto e branco. Num bosque denso, um rapaz de manto com capuz, visto de costas, observa um antigo arco de pedra coberto de entalhes; através do arco, a trilha segue para uma claridade enevoada.',
    direction:
      'Um arco de pedra antigo, coberto por musgo, escondido em um bosque envolto em névoa. Na pedra está gravado o símbolo incompleto das seis linhas. Kael observa o arco com cautela. Uma figura encapuzada pode surgir ao fundo da trilha. Não acrescentar monstros, combates ou poderes que não estejam presentes na narrativa.',
    notes: `${FROM_MANUSCRIPT} É a imagem que o manuscrito usa no capítulo IV. Há no arquivo outra cena de arco no bosque (um rapaz com bolsa a tiracolo), usada no prólogo.`,
  },
  {
    chapter: 5,
    slug: 'capitulo-05-aquilo-ficou-porta',
    artState: 'final',
    caption: 'Um disco de metal escuro, à luz da lamparina.',
    alt: 'Gravura em preto e branco. Sobre uma mesa de madeira, um disco de metal escuro com um emblema ramificado em relevo, semelhante a uma chama, e uma borda de marcas gravadas; um cordão está preso a ele. Ao fundo, livros antigos e uma lamparina acesa.',
    direction:
      'Uma cena noturna no interior da casa. Sobre uma mesa está um pequeno disco de metal escuro com o símbolo incompleto. Kael e sua mãe adotiva observam o objeto à luz de uma lamparina. A porta fechada deve sugerir que algo desconhecido aconteceu do lado de fora. Não mostrar explicitamente quem deixou o objeto.',
    notes: FROM_MANUSCRIPT,
  },
  {
    chapter: 6,
    slug: 'capitulo-06-o-que-pode-ser-provado',
    artState: 'final',
    caption: 'Um caderno antigo, entre desenhos e anotações.',
    alt: 'Gravura em preto e branco. Um caderno antigo aberto sobre a mesa, à luz de uma lamparina: numa página, o esboço de uma cidade de torres e alguns diagramas; na outra, um emblema ramificado dentro de um círculo, cercado de anotações manuscritas ilegíveis.',
    direction:
      'Um caderno antigo aberto sobre uma mesa, cercado por papéis envelhecidos, páginas arrancadas e anotações parcialmente apagadas. O símbolo das seis linhas aparece discretamente em uma das margens. A imagem deve representar investigação, memória e a tentativa de provar algo que foi escondido. Não inventar inscrições legíveis ou nomes que ainda não tenham sido estabelecidos.',
    notes: `${FROM_MANUSCRIPT} O manuscrito reutiliza esta mesma imagem no capítulo XXI.`,
  },
  {
    chapter: 7,
    slug: 'capitulo-07-arquivo-sob-poeira',
    artState: 'final',
    caption: 'O arquivo e os registros esquecidos.',
    alt: 'Gravura em preto e branco. Uma sala de arquivo com estantes altas de livros e um janelão por onde entram feixes de luz. Sobre as mesas, livros de registro empilhados, pergaminhos enrolados, documentos espalhados e uma esfera armilar.',
    direction:
      'Um arquivo antigo com estantes, caixas de madeira, livros de registro e documentos cobertos de poeira. Kael examina cuidadosamente uma página, enquanto o ambiente sugere que alguém esteve ali recentemente. Incluir uma rasura ou um registro incompleto. A cena deve parecer parte de uma instituição da aldeia, sem transformar o local em uma biblioteca monumental ou mágica.',
    notes: FROM_MANUSCRIPT,
  },
  {
    chapter: 8,
    slug: 'capitulo-08-versao-oficial',
    artState: 'final',
    caption: 'O responsável pelos registros da aldeia.',
    alt: 'Gravura em preto e branco. Um homem de cabelos grisalhos e barba, de casaco escuro e medalhão ao peito, lê um documento sentado à mesa de registros, entre papéis, livros e um tinteiro. Atrás dele, na parede de madeira, pende um estandarte com brasão.',
    direction:
      'Uma mesa de registros com documentos antigos, datas divergentes e páginas parcialmente apagadas. Kael e sua mãe adotiva estão diante de Orven, o responsável pelos registros da aldeia. A composição deve transmitir a tensão entre os documentos oficiais e as lembranças de quem conheceu o passado. Não retratar Orven automaticamente como vilão.',
    notes: FROM_MANUSCRIPT,
  },
  {
    chapter: 9,
    slug: 'capitulo-09-homem-dos-estabulos',
    artState: 'final',
    caption: 'Os antigos estábulos de Darel.',
    alt: 'Gravura em preto e branco. No estábulo, um homem mais velho, de cabelos grisalhos e barba, de camisa com as mangas arregaçadas e avental de couro, está sentado com as mãos marcadas pelo trabalho apoiadas nos joelhos e a expressão cansada. Atrás dele, um cavalo de cabresto; ao lado, uma lanterna e arreios pendurados.',
    direction:
      'Os antigos estábulos de Darel, com arreios, ferramentas, tábuas envelhecidas e um cavalo ao fundo. Darel aparece como um homem mais velho, de cabelos grisalhos, expressão cansada e mãos marcadas pelo trabalho. A imagem pode sugerir, de modo discreto, a lembrança de uma mulher ferida chegando à noite com uma criança envolta em uma manta. Não revele identidades ainda desconhecidas.',
    notes: FROM_MANUSCRIPT,
  },
  {
    chapter: 10,
    slug: 'capitulo-10-chave-de-ferro',
    artState: 'final',
    caption: 'Uma porta de ferro sob a pedra.',
    alt: 'Gravura em preto e branco. Num salão subterrâneo de pedra, uma porta de ferro em arco, de dois batentes, com ferragens e um grande emblema ramificado, em forma de chama, no centro. Velas ardem dos dois lados, e o chão de lajes molhadas reflete a luz.',
    direction:
      'Uma porta de ferro antiga, localizada em um espaço subterrâneo de pedra. Na porta, há uma fechadura estreita e a marca de uma chama atravessada por uma linha. Ao redor, mostrar vestígios de um arquivo antigo, caixas e sombras profundas. Não revelar o que está atrás da porta. A ilustração deve preparar o leitor para os próximos acontecimentos sem antecipar as respostas.',
    notes: FROM_MANUSCRIPT,
  },
]
