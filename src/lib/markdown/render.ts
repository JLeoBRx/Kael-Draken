import { Marked, type TokenizerExtension, type RendererExtension, type Tokens } from 'marked'
import { SPOILER_INFO, type SpoilerLevel } from '../editorial'
import { slugify } from '../slug'

/**
 * Renderizador de Markdown do arquivo.
 *
 * Extensões editoriais:
 *  - Blocos de spoiler:   :::spoiler 1  …  :::   (nível 0, 1 ou 2)
 *    Trechos acima do nível do visitante são removidos no servidor — o
 *    conteúdo nunca chega ao navegador.
 *  - Notas privadas:      %% texto %%
 *    Removidas do site público; visíveis apenas na pré-visualização do painel.
 *  - Referências internas: [[personagens/kael-draken|Kael]]
 *    Resolvidas contra o banco; verbetes inexistentes ou ocultos viram texto
 *    simples, evitando links quebrados e vazamentos de spoiler.
 *  - HTML bruto é sempre escapado.
 */

export interface ResolvedLink {
  href: string
  title: string
}

export interface RenderOptions {
  spoiler: SpoilerLevel
  preview?: boolean
  /** Mapa alvo → link resolvido (null = inexistente ou oculto). */
  links?: Map<string, ResolvedLink | null>
  /** Soma ao nível dos títulos (ex.: 1 transforma ## em ###). */
  headingOffset?: number
  /** Prefixo dos ids de títulos, para evitar colisões na mesma página. */
  idPrefix?: string
}

export interface RenderResult {
  html: string
  headings: Array<{ id: string; text: string; depth: number }>
  hiddenCount: number
}

const PRIVATE_NOTE = /%%[\s\S]*?%%/g
const WIKI_LINK = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function decodeEntities(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
}

function safeHref(href: string): string | null {
  const value = href.trim()
  if (/^(https?:|mailto:)/i.test(value)) return value
  if (value.startsWith('/') && !value.startsWith('//')) return value
  if (value.startsWith('#')) return value
  return null
}

/** Coleta os alvos das referências internas [[…]] presentes no texto. */
export function collectWikiTargets(source: string): string[] {
  const targets = new Set<string>()
  for (const match of source.replace(PRIVATE_NOTE, '').matchAll(WIKI_LINK)) targets.add(normalizeTarget(match[1]))
  return [...targets]
}

export function normalizeTarget(target: string): string {
  return target.trim().replace(/^\/+|\/+$/g, '').toLowerCase()
}

export function renderMarkdown(source: string, options: RenderOptions): RenderResult {
  const { spoiler, preview = false, links = new Map(), headingOffset = 0, idPrefix = '' } = options
  const headings: RenderResult['headings'] = []
  const usedIds = new Set<string>()
  let hiddenCount = 0

  let text = source ?? ''
  if (!preview) text = text.replace(PRIVATE_NOTE, '')
  else text = text.replace(PRIVATE_NOTE, (m) => m.replace(/\s*\n\s*/g, ' '))

  const spoilerExtension: TokenizerExtension & RendererExtension = {
    name: 'spoiler',
    level: 'block',
    start(src: string) {
      const index = src.search(/^:::[ \t]*spoiler/m)
      return index < 0 ? undefined : index
    },
    tokenizer(src: string) {
      const match = /^:::[ \t]*spoiler[ \t]*([0-2])?[ \t]*\n([\s\S]*?)\n:::[ \t]*(?:\n+|$)/.exec(src)
      if (!match) return undefined
      const token = { type: 'spoiler', raw: match[0], level: Number(match[1] ?? 1), tokens: [] as Tokens.Generic[] }
      this.lexer.blockTokens(match[2], token.tokens)
      return token
    },
    renderer(token) {
      const level = Math.min(2, Math.max(0, Number(token.level))) as SpoilerLevel
      const label = SPOILER_INFO[level].label
      if (level > spoiler && !preview) {
        hiddenCount++
        return `<p class="spoiler-hidden" role="note"><span class="spoiler-hidden__label">Trecho oculto</span> Contém ${escapeHtml(label.toLowerCase())}. Ajuste seu nível de spoiler para ler.</p>\n`
      }
      const inner = this.parser.parse(token.tokens as Tokens.Generic[])
      if (level === 0) return inner
      return `<aside class="spoiler-block" data-level="${level}" aria-label="${escapeHtml(label)}"><p class="spoiler-block__label">${escapeHtml(label)}</p>${inner}</aside>\n`
    },
  }

  const privateNoteExtension: TokenizerExtension & RendererExtension = {
    name: 'privateNote',
    level: 'inline',
    start(src: string) {
      const index = src.indexOf('%%')
      return index < 0 ? undefined : index
    },
    tokenizer(src: string) {
      const match = /^%%([\s\S]*?)%%/.exec(src)
      if (!match) return undefined
      return { type: 'privateNote', raw: match[0], text: match[1].trim() }
    },
    renderer(token) {
      return preview ? `<span class="private-note" title="Nota privada — não aparece no site público">${escapeHtml(String(token.text))}</span>` : ''
    },
  }

  const wikiLinkExtension: TokenizerExtension & RendererExtension = {
    name: 'wikiLink',
    level: 'inline',
    start(src: string) {
      const index = src.indexOf('[[')
      return index < 0 ? undefined : index
    },
    tokenizer(src: string) {
      const match = /^\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/.exec(src)
      if (!match) return undefined
      return { type: 'wikiLink', raw: match[0], target: normalizeTarget(match[1]), label: (match[2] ?? '').trim() }
    },
    renderer(token) {
      const target = String(token.target)
      const resolved = links.get(target) ?? null
      const label = escapeHtml(String(token.label) || resolved?.title || target.split('/').pop() || target)
      if (resolved) return `<a class="wiki-link" href="${escapeHtml(resolved.href)}">${label}</a>`
      if (preview) return `<span class="wiki-missing" title="Referência inexistente ou oculta: ${escapeHtml(target)}">${label}</span>`
      return `<span class="wiki-text">${label}</span>`
    },
  }

  const marked = new Marked({
    gfm: true,
    breaks: false,
    extensions: [spoilerExtension, privateNoteExtension, wikiLinkExtension],
    renderer: {
      html({ text: raw }) {
        return escapeHtml(raw)
      },
      heading({ tokens, depth }) {
        const inner = this.parser.parseInline(tokens)
        const plain = decodeEntities(inner.replace(/<[^>]+>/g, ''))
        const level = Math.min(6, depth + headingOffset)
        let id = `${idPrefix}${slugify(plain) || 'secao'}`
        let n = 2
        while (usedIds.has(id)) id = `${idPrefix}${slugify(plain)}-${n++}`
        usedIds.add(id)
        headings.push({ id, text: plain, depth: level })
        return `<h${level} id="${id}">${inner}</h${level}>\n`
      },
      link({ href, title, tokens }) {
        const inner = this.parser.parseInline(tokens)
        const safe = safeHref(href)
        if (!safe) return inner
        const external = /^https?:/i.test(safe)
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
        const rel = external ? ' rel="noopener noreferrer" target="_blank"' : ''
        return `<a href="${escapeHtml(safe)}"${titleAttr}${rel}>${inner}</a>`
      },
      image({ href, title, text: alt }) {
        const safe = safeHref(href)
        if (!safe || safe.startsWith('#') || safe.startsWith('mailto:')) return escapeHtml(alt)
        const caption = title ? `<figcaption>${escapeHtml(title)}</figcaption>` : ''
        return `<figure class="prose-figure"><img src="${escapeHtml(safe)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async" />${caption}</figure>`
      },
    },
  })

  const html = marked.parse(text, { async: false }) as string
  return { html, headings, hiddenCount }
}

/**
 * Converte Markdown em texto simples para resumos e metadados.
 * Blocos de spoiler e notas privadas são sempre removidos.
 */
export function toPlainText(source: string, maxLength = 0): string {
  let text = (source ?? '')
    .replace(PRIVATE_NOTE, '')
    .replace(/^:::[ \t]*spoiler[^\n]*\n[\s\S]*?\n:::[ \t]*$/gm, '')
    .replace(WIKI_LINK, (_m, target: string, label?: string) => label ?? target.split('/').pop() ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (maxLength && text.length > maxLength) text = `${text.slice(0, maxLength - 1).replace(/\s+\S*$/, '')}…`
  return text
}

/** Indica se o texto possui conteúdo visível (ignorando notas privadas e espaços). */
export function hasContent(source: string | null | undefined): boolean {
  return !!source && source.replace(PRIVATE_NOTE, '').trim().length > 0
}
