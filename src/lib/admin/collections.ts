/**
 * Definição declarativa das coleções do painel. Os formulários, listagens e
 * a gravação genérica são construídos a partir destas definições — para
 * adicionar um campo, inclua-o no esquema (src/lib/db/schema.ts) e aqui.
 *
 * Este arquivo é serializável (sem funções) para ser usado também no cliente.
 */

import { ART_INFO, ART_STATES, CERTAINTY_INFO, CERTAINTY_STATES, RELIABILITY_INFO, RELIABILITY_STATES, type EntityType, type Vocabulary } from '../editorial'

export type FieldType = 'text' | 'textarea' | 'markdown' | 'number' | 'select' | 'boolean' | 'media' | 'gallery' | 'reference' | 'links' | 'tags' | 'color' | 'date'

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  help?: string
  required?: boolean
  rows?: number
  placeholder?: string
  options?: Array<{ value: string; label: string }>
  vocabulary?: Vocabulary
  /** Coleção de destino de uma referência (chave estrangeira). */
  collection?: CollectionKey
  /** Tipo de entidade de destino de uma relação cruzada. */
  entity?: EntityType
}

export interface FieldGroup {
  title: string
  fields: FieldDef[]
}

export type CollectionKey =
  | 'reinos'
  | 'locais'
  | 'personagens'
  | 'eras'
  | 'acontecimentos'
  | 'verbetes'
  | 'misterios'
  | 'manuscritos'
  | 'mapas'
  | 'livros'
  | 'capitulos'
  | 'ilustracoes'
  | 'publicacoes'

export interface CollectionDef {
  key: CollectionKey
  entity: EntityType
  label: string
  singular: string
  description: string
  titleField: 'name' | 'title'
  hasSlug: boolean
  hasCanon: boolean
  groups: FieldGroup[]
  /** Colunas extras na listagem. */
  listFields: string[]
}

const md = (name: string, label: string, help?: string, rows = 8): FieldDef => ({ name, label, type: 'markdown', help, rows })
const text = (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: 'text', ...extra })
const area = (name: string, label: string, extra: Partial<FieldDef> = {}): FieldDef => ({ name, label, type: 'textarea', rows: 3, ...extra })
const links = (name: string, label: string, entity: EntityType, help?: string): FieldDef => ({ name, label, type: 'links', entity, help })
const order: FieldDef = { name: 'sortOrder', label: 'Ordem de exibição', type: 'number', help: 'Números menores aparecem primeiro.' }
const gallery: FieldDef = { name: '__gallery', label: 'Galeria de imagens e documentos', type: 'gallery' }
const tags: FieldDef = { name: '__tags', label: 'Tags', type: 'tags', vocabulary: 'tag' }

export const COLLECTIONS: Record<CollectionKey, CollectionDef> = {
  reinos: {
    key: 'reinos',
    entity: 'kingdom',
    label: 'Reinos',
    singular: 'Reino',
    description: 'Os seis reinos e suas páginas no Atlas.',
    titleField: 'name',
    hasSlug: true,
    hasCanon: true,
    listFields: ['government'],
    groups: [
      {
        title: 'Identificação',
        fields: [
          text('name', 'Nome', { required: true }),
          text('epithet', 'Epíteto', { placeholder: 'Ex.: O reino desaparecido' }),
          text('government', 'Forma de governo'),
          area('summary', 'Resumo', { help: 'Aparece em listagens e metadados. Evite spoilers aqui.' }),
          { name: 'accent', label: 'Cor de identidade', type: 'color', help: 'Escolha de design; não é canônica.' },
          order,
        ],
      },
      {
        title: 'Conteúdo do verbete',
        fields: [
          md('body', 'Descrição geral'),
          md('geography', 'Geografia e clima'),
          md('capital', 'Capital e cidades importantes', 'Os locais vinculados a este reino são listados automaticamente.'),
          md('culture', 'Cultura e costumes'),
          md('economy', 'Economia e recursos'),
          md('resonance', 'Relação com a Ressonância'),
          md('history', 'História conhecida'),
          md('relations', 'Relações com outros reinos'),
          md('mysteries', 'Mistérios relacionados'),
        ],
      },
      {
        title: 'Imagens',
        fields: [
          { name: 'emblemId', label: 'Emblema', type: 'media', help: 'Sem emblema enviado, o site usa o brasão conceitual do Atlas.' },
          { name: 'imageId', label: 'Imagem principal (panorama)', type: 'media', help: 'Sem imagem enviada, o site usa o panorama conceitual do Atlas.' },
          gallery,
        ],
      },
      {
        title: 'Relações',
        fields: [
          links('__characters', 'Personagens associados', 'character', 'Além dos personagens cujo reino de origem é este.'),
          links('__events', 'Acontecimentos', 'event'),
          links('__documents', 'Documentos', 'document'),
          links('__articles', 'Verbetes de mitologia e Ressonância', 'article'),
          tags,
        ],
      },
    ],
  },
  locais: {
    key: 'locais',
    entity: 'location',
    label: 'Cidades e locais',
    singular: 'Local',
    description: 'Cidades, vilarejos, ruínas, templos, passagens e regiões.',
    titleField: 'name',
    hasSlug: true,
    hasCanon: true,
    listFields: ['category', 'kingdomId'],
    groups: [
      {
        title: 'Identificação',
        fields: [
          text('name', 'Nome', { required: true }),
          { name: 'kingdomId', label: 'Reino', type: 'reference', collection: 'reinos' },
          { name: 'category', label: 'Categoria', type: 'select', vocabulary: 'location_category' },
          { name: 'isCapital', label: 'É a capital do reino', type: 'boolean' },
          area('summary', 'Resumo'),
          order,
        ],
      },
      {
        title: 'Conteúdo',
        fields: [
          md('body', 'Descrição'),
          md('history', 'Importância histórica'),
          md('geography', 'Geografia'),
          md('inhabitants', 'Habitantes e atividades econômicas'),
        ],
      },
      { title: 'Imagens', fields: [{ name: 'imageId', label: 'Imagem principal', type: 'media' }, gallery] },
      {
        title: 'Relações',
        fields: [links('__characters', 'Personagens associados', 'character'), links('__events', 'Eventos relacionados', 'event'), links('__documents', 'Documentos', 'document'), tags],
      },
    ],
  },
  personagens: {
    key: 'personagens',
    entity: 'character',
    label: 'Personagens',
    singular: 'Personagem',
    description: 'A biblioteca de personagens.',
    titleField: 'name',
    hasSlug: true,
    hasCanon: true,
    listFields: ['role', 'kingdomId'],
    groups: [
      {
        title: 'Identificação',
        fields: [
          text('name', 'Nome', { required: true }),
          text('titles', 'Títulos'),
          text('age', 'Idade', { placeholder: 'Ex.: 16 anos' }),
          { name: 'role', label: 'Papel narrativo', type: 'select', vocabulary: 'character_role' },
          { name: 'kingdomId', label: 'Reino de origem', type: 'reference', collection: 'reinos', help: 'Atenção: a origem de um personagem pode ser um spoiler — ela aparece no site.' },
          { name: 'originLocationId', label: 'Lugar de origem', type: 'reference', collection: 'locais' },
          area('summary', 'Resumo', { help: 'Aparece no cartão da biblioteca. Sem spoilers.' }),
          order,
        ],
      },
      {
        title: 'Conteúdo',
        fields: [
          md('personality', 'Personalidade'),
          md('history', 'História'),
          md('family', 'Relações familiares'),
          md('abilities', 'Capacidades e conhecimentos'),
          md('storyRole', 'Participação na história'),
          md('secrets', 'Segredos e revelações', 'A seção inteira só aparece a partir de “Revelações iniciais”. Use blocos :::spoiler 2 para o que exige revelações avançadas.'),
        ],
      },
      { title: 'Imagens', fields: [{ name: 'portraitId', label: 'Retrato', type: 'media', help: 'Sem referência aprovada, deixe vazio: o site exibe um espaço neutro.' }, gallery] },
      {
        title: 'Relações',
        fields: [
          links('__locations', 'Lugares associados', 'location'),
          links('__events', 'Acontecimentos', 'event'),
          links('__chapters', 'Aparições em capítulos', 'chapter'),
          links('__documents', 'Documentos', 'document'),
          tags,
        ],
      },
    ],
  },
  eras: {
    key: 'eras',
    entity: 'era',
    label: 'Eras e períodos',
    singular: 'Era',
    description: 'Os períodos da cronologia.',
    titleField: 'name',
    hasSlug: true,
    hasCanon: true,
    listFields: ['dateLabel'],
    groups: [
      {
        title: 'Período',
        fields: [
          text('name', 'Nome', { required: true }),
          text('dateLabel', 'Datação exibida', { help: 'Texto livre. Não atribua datas exatas antes de serem estabelecidas.' }),
          area('summary', 'Resumo'),
          md('body', 'Descrição'),
          order,
        ],
      },
    ],
  },
  acontecimentos: {
    key: 'acontecimentos',
    entity: 'event',
    label: 'Acontecimentos',
    singular: 'Acontecimento',
    description: 'Os acontecimentos da linha do tempo.',
    titleField: 'title',
    hasSlug: true,
    hasCanon: true,
    listFields: ['eraId', 'certainty'],
    groups: [
      {
        title: 'Acontecimento',
        fields: [
          text('title', 'Título', { required: true }),
          { name: 'eraId', label: 'Período', type: 'reference', collection: 'eras' },
          text('dateLabel', 'Datação exibida', { help: 'Ex.: “Durante a Noite das Cinzas”, “Data desconhecida”.' }),
          {
            name: 'certainty',
            label: 'Grau de certeza',
            type: 'select',
            options: CERTAINTY_STATES.map((c) => ({ value: c, label: `${CERTAINTY_INFO[c].label} — ${CERTAINTY_INFO[c].description}` })),
          },
          { name: 'eventType', label: 'Tipo', type: 'select', vocabulary: 'event_type' },
          { name: 'sortOrder', label: 'Ordem dentro do período', type: 'number', help: 'Apenas ordenação; não é uma data.' },
          area('summary', 'Resumo'),
          md('body', 'Detalhes'),
        ],
      },
      {
        title: 'Relações',
        fields: [links('__kingdoms', 'Reinos', 'kingdom'), links('__locations', 'Lugares', 'location'), links('__characters', 'Personagens', 'character'), links('__documents', 'Documentos', 'document'), tags],
      },
    ],
  },
  verbetes: {
    key: 'verbetes',
    entity: 'article',
    label: 'Mitologia e Ressonância',
    singular: 'Verbete',
    description: 'Capítulos da mitologia e verbetes do sistema da Ressonância.',
    titleField: 'title',
    hasSlug: true,
    hasCanon: true,
    listFields: ['section', 'group'],
    groups: [
      {
        title: 'Verbete',
        fields: [
          {
            name: 'section',
            label: 'Seção',
            type: 'select',
            required: true,
            options: [
              { value: 'mitologia', label: 'Mitologia e história antiga' },
              { value: 'ressonancia', label: 'Sistema da Ressonância' },
            ],
          },
          text('group', 'Grupo', { help: 'Ressonância: fundamentos, conceitos, faces ou pratica. Mitologia: origens, reinos, queda ou tradicoes.' }),
          text('title', 'Título', { required: true }),
          text('subtitle', 'Subtítulo'),
          area('summary', 'Resumo'),
          md('body', 'Texto', 'Use ## para seções, [[tipo/slug|texto]] para referências internas e :::spoiler 1 … ::: para trechos protegidos.', 16),
          order,
        ],
      },
      { title: 'Imagens', fields: [{ name: 'imageId', label: 'Ilustração principal', type: 'media' }, gallery] },
      {
        title: 'Relações',
        fields: [
          links('__kingdoms', 'Reinos', 'kingdom'),
          links('__locations', 'Lugares', 'location'),
          links('__characters', 'Personagens', 'character'),
          links('__events', 'Acontecimentos', 'event'),
          links('__documents', 'Documentos', 'document'),
          tags,
        ],
      },
    ],
  },
  misterios: {
    key: 'misterios',
    entity: 'mystery',
    label: 'Mistérios',
    singular: 'Mistério',
    description: 'As perguntas em aberto exibidas na página de mistérios.',
    titleField: 'title',
    hasSlug: true,
    hasCanon: true,
    listFields: ['relatedHref'],
    groups: [
      {
        title: 'Pergunta',
        fields: [
          text('title', 'Pergunta', { required: true }),
          area('description', 'Descrição'),
          text('relatedHref', 'Verbete relacionado', { placeholder: '/mitologia/o-seculo-perdido', help: 'Endereço interno começando com /.' }),
          order,
        ],
      },
    ],
  },
  manuscritos: {
    key: 'manuscritos',
    entity: 'document',
    label: 'Manuscritos',
    singular: 'Documento',
    description: 'Profecias, cartas, tratados, inscrições e fragmentos.',
    titleField: 'title',
    hasSlug: true,
    hasCanon: true,
    listFields: ['docType', 'reliability'],
    groups: [
      {
        title: 'Documento',
        fields: [
          text('title', 'Título', { required: true }),
          { name: 'docType', label: 'Tipo', type: 'select', vocabulary: 'document_type' },
          area('excerpt', 'Trecho de destaque'),
          md('transcription', 'Transcrição', undefined, 10),
          md('translation', 'Tradução'),
          md('context', 'Contexto'),
        ],
      },
      {
        title: 'Ficha arquivística',
        fields: [
          text('origin', 'Origem conhecida'),
          text('dateLabel', 'Datação'),
          text('language', 'Idioma'),
          { name: 'reliability', label: 'Confiabilidade', type: 'select', options: RELIABILITY_STATES.map((r) => ({ value: r, label: RELIABILITY_INFO[r].label })) },
          area('reliabilityNote', 'Notas sobre a confiabilidade'),
          order,
        ],
      },
      { title: 'Imagens', fields: [{ name: 'imageId', label: 'Imagem do documento', type: 'media' }, gallery] },
      {
        title: 'Relações',
        fields: [links('__kingdoms', 'Reinos', 'kingdom'), links('__locations', 'Lugares', 'location'), links('__characters', 'Personagens', 'character'), links('__events', 'Acontecimentos', 'event'), tags],
      },
    ],
  },
  mapas: {
    key: 'mapas',
    entity: 'map',
    label: 'Mapas do arquivo',
    singular: 'Mapa',
    description: 'Mapas adicionais com marcadores (o mapa-múndi 2D/3D usa src/data/atlas/world.json).',
    titleField: 'title',
    hasSlug: true,
    hasCanon: true,
    listFields: ['provisional'],
    groups: [
      {
        title: 'Mapa',
        fields: [
          text('title', 'Título', { required: true }),
          area('description', 'Descrição'),
          { name: 'imageId', label: 'Imagem do mapa', type: 'media', help: 'Sem imagem, o mapa usa uma carta-base sem geografia.' },
          { name: 'provisional', label: 'Mapa provisório (exibe o aviso)', type: 'boolean' },
          { name: 'isPrimary', label: 'Destacar como mapa principal desta lista', type: 'boolean' },
          order,
        ],
      },
    ],
  },
  livros: {
    key: 'livros',
    entity: 'book',
    label: 'Livros',
    singular: 'Livro',
    description: 'Os volumes da saga.',
    titleField: 'title',
    hasSlug: true,
    hasCanon: true,
    listFields: ['volume'],
    groups: [
      {
        title: 'Livro',
        fields: [
          text('title', 'Título', { required: true }),
          text('subtitle', 'Subtítulo'),
          { name: 'volume', label: 'Volume', type: 'number', required: true },
          { name: 'coverId', label: 'Capa', type: 'media', help: 'Para o Livro I, a capa oficial também pode ser definida em Configurações.' },
          md('synopsis', 'Sinopse'),
          { name: 'synopsisOfficial', label: 'Esta é a sinopse oficial', type: 'boolean', help: 'Desmarcado, o site a apresenta como texto provisório.' },
          md('editorialInfo', 'Informações editoriais', 'Inclua apenas informações confirmadas (sem ISBN ou datas fictícias).'),
          md('materials', 'Materiais de divulgação'),
          order,
        ],
      },
      { title: 'Imagens', fields: [gallery] },
      { title: 'Relações', fields: [links('__characters', 'Personagens', 'character'), links('__locations', 'Lugares', 'location'), tags] },
    ],
  },
  capitulos: {
    key: 'capitulos',
    entity: 'chapter',
    label: 'Capítulos e trechos',
    singular: 'Capítulo',
    description: 'Capítulos ou trechos autorizados. Ficam como rascunho até serem publicados.',
    titleField: 'title',
    hasSlug: false,
    hasCanon: true,
    listFields: ['bookId', 'number'],
    groups: [
      {
        title: 'Capítulo',
        fields: [
          { name: 'bookId', label: 'Livro', type: 'reference', collection: 'livros', required: true },
          { name: 'number', label: 'Número', type: 'number', required: true },
          text('title', 'Título', { required: true }),
          area('summary', 'Resumo'),
          md('body', 'Trecho autorizado', 'Publique apenas trechos completos e autorizados.', 20),
        ],
      },
      { title: 'Relações', fields: [links('__characters', 'Personagens que aparecem', 'character'), links('__locations', 'Lugares', 'location')] },
    ],
  },
  ilustracoes: {
    key: 'ilustracoes',
    entity: 'illustration',
    label: 'Ilustrações',
    singular: 'Ilustração',
    description:
      'Uma ilustração por capítulo, exibida em ordem na galeria do livro e na página do capítulo publicado. Formato: vertical, 15,5 × 23 cm (31:46), preto e branco; para impressão a 300 DPI, 1831 × 2717 px.',
    titleField: 'title',
    hasSlug: true,
    hasCanon: false,
    listFields: ['chapterId', 'artState'],
    groups: [
      {
        title: 'Ilustração',
        fields: [
          { name: 'chapterId', label: 'Capítulo', type: 'reference', collection: 'capitulos', required: true, help: 'O capítulo pode continuar como rascunho: a galeria mostra apenas número e título.' },
          {
            name: 'artState',
            label: 'Estado da arte',
            type: 'select',
            required: true,
            options: ART_STATES.map((v) => ({ value: v, label: `${ART_INFO[v].label} — ${ART_INFO[v].description}` })),
          },
          {
            name: 'imageId',
            label: 'Imagem',
            type: 'media',
            help: 'Vertical, 31:46, preto e branco; 1831 × 2717 px para 300 DPI. Vazio: o site usa o arquivo public/images/livro-N/ilustracoes/<identificador>.webp, se existir.',
          },
          area('alt', 'Texto alternativo', { help: 'Descreva o que a imagem mostra, para leitores de tela — sem revelar o que a história ainda guarda.', rows: 4 }),
          text('caption', 'Legenda'),
          text('credit', 'Créditos', { help: 'Ilustrador ou origem da imagem.' }),
        ],
      },
      {
        title: 'Direção de arte (privada)',
        fields: [area('direction', 'Orientação para o ilustrador', { help: 'Nunca aparece no site público.', rows: 8 })],
      },
    ],
  },
  publicacoes: {
    key: 'publicacoes',
    entity: 'post',
    label: 'Novidades',
    singular: 'Publicação',
    description: 'Diário de desenvolvimento: a página inicial mostra as mais recentes automaticamente.',
    titleField: 'title',
    hasSlug: true,
    hasCanon: false,
    listFields: ['category', 'publishedAt'],
    groups: [
      {
        title: 'Publicação',
        fields: [
          text('title', 'Título', { required: true }),
          { name: 'category', label: 'Categoria', type: 'select', vocabulary: 'post_category' },
          { name: 'publishedAt', label: 'Data da publicação', type: 'date', help: 'Preenchida automaticamente ao publicar, se vazia.' },
          { name: 'imageId', label: 'Imagem (opcional)', type: 'media' },
          area('excerpt', 'Resumo'),
          md('body', 'Conteúdo', undefined, 16),
        ],
      },
      { title: 'Relações', fields: [tags] },
    ],
  },
}

export const COLLECTION_KEYS = Object.keys(COLLECTIONS) as CollectionKey[]

export function isCollectionKey(value: string): value is CollectionKey {
  return value in COLLECTIONS
}

export function collectionForEntity(entity: EntityType): CollectionDef {
  return Object.values(COLLECTIONS).find((c) => c.entity === entity)!
}

export function allFields(def: CollectionDef): FieldDef[] {
  return def.groups.flatMap((g) => g.fields)
}
