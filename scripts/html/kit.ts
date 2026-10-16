/**
 * Peças comuns da versão em HTML: endereços das páginas, resolução de
 * referências internas, Markdown sem spoilers, selos editoriais e a moldura
 * (cabeçalho, rodapé e visualizador) de cada página.
 */

import { renderMarkdown, type ResolvedLink } from '../../src/lib/markdown/render'
import { CANON_INFO, type CanonState } from '../../src/lib/editorial'

export interface Img {
  src: string
  width: number
  height: number
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Todas as páginas ficam na raiz: funcionam abertas do disco, em qualquer hospedagem e como Artifact. */
export const PAGE = {
  home: 'index.html',
  book: 'livro.html',
  atlas: 'atlas.html',
  kingdom: (slug: string) => `reino-${slug}.html`,
  characters: 'personagens.html',
  character: (slug: string) => `personagem-${slug}.html`,
  mythology: 'mitologia.html',
  resonance: 'ressonancia.html',
  article: (section: 'mitologia' | 'ressonancia', slug: string) => `${section}-${slug}.html`,
  timeline: 'cronologia.html',
  locations: 'locais.html',
  location: (slug: string) => `local-${slug}.html`,
  documents: 'manuscritos.html',
  document: (slug: string) => `manuscrito-${slug}.html`,
  mysteries: 'misterios.html',
}

export type NavKey = 'livro' | 'atlas' | 'personagens' | 'mitologia' | 'cronologia' | 'ressonancia' | 'locais' | 'manuscritos' | 'misterios'

export const NAV: Array<{ key: NavKey; label: string; href: string }> = [
  { key: 'livro', label: 'Livro I', href: PAGE.book },
  { key: 'atlas', label: 'Atlas', href: PAGE.atlas },
  { key: 'personagens', label: 'Personagens', href: PAGE.characters },
  { key: 'mitologia', label: 'Mitologia', href: PAGE.mythology },
  { key: 'cronologia', label: 'Cronologia', href: PAGE.timeline },
  { key: 'ressonancia', label: 'Ressonância', href: PAGE.resonance },
  { key: 'locais', label: 'Locais', href: PAGE.locations },
  { key: 'manuscritos', label: 'Manuscritos', href: PAGE.documents },
  { key: 'misterios', label: 'Mistérios', href: PAGE.mysteries },
]

/** Verbetes que entram nesta versão: só o que o site mostra a quem não escolheu spoilers. */
export function isPublic(row: { spoiler?: number; canon?: string }): boolean {
  return (row.spoiler ?? 0) === 0 && row.canon !== 'arquivado'
}

// ── Referências internas ──────────────────────────────────────────────────

/** Mapa alvo ([[reinos/safra]], /reinos/safra…) → página gerada. */
export class LinkTable {
  private targets = new Map<string, ResolvedLink>()

  add(target: string, href: string, title: string) {
    this.targets.set(target.replace(/^\/+|\/+$/g, '').toLowerCase(), { href, title })
  }

  /** Página correspondente a um alvo do site, ou null se não estiver nesta versão. */
  resolve(target: string): ResolvedLink | null {
    const key = target.replace(/^\/+|\/+$/g, '').toLowerCase()
    return this.targets.get(key) ?? null
  }

  /** O mapa no formato do renderizador (alvos ausentes viram texto simples). */
  forRenderer(): Map<string, ResolvedLink | null> {
    return this.targets
  }
}

export interface MarkdownOptions {
  headingOffset?: number
  idPrefix?: string
}

/**
 * Markdown como o site o mostra para quem não escolheu spoilers — mas sem o
 * aviso de "trecho oculto": numa página estática, todo texto enviado pode
 * ser lido no código-fonte, então os blocos de spoiler simplesmente não entram.
 */
export function createMarkdown(links: LinkTable, images: Map<string, Img>) {
  return function md(source: string | undefined, options: MarkdownOptions = {}): string {
    const text = (source ?? '').replace(/^:::[ \t]*spoiler[^\n]*\n[\s\S]*?\n:::[ \t]*$/gm, '')
    let html = renderMarkdown(text, { spoiler: 0, links: links.forRenderer(), ...options }).html
    // imagens do site → cópias otimizadas em assets/
    html = html.replace(/<img src="(\/images\/[^"]+)"/g, (_m, src: string) => {
      const img = images.get(src)
      if (!img) throw new Error(`Imagem citada no texto sem cópia na versão HTML: ${src}`)
      return `<img src="${img.src}" width="${img.width}" height="${img.height}"`
    })
    // links do site (/reinos/safra) → páginas desta versão; os que não existem aqui viram texto
    html = html.replace(/<a href="\/([^"#]*)"[^>]*>([\s\S]*?)<\/a>/g, (_m, target: string, inner: string) => {
      const page = links.resolve(target)
      return page ? `<a href="${page.href}">${inner}</a>` : inner
    })
    return html
  }
}

/** Alvos de imagens do site citados em textos ([…](/images/…)). */
export function imageRefs(source: string | undefined): string[] {
  return [...(source ?? '').matchAll(/\]\((\/images\/[^)\s]+)/g)].map((m) => m[1])
}

// ── Peças de interface ────────────────────────────────────────────────────

export function canonBadge(canon: string): string {
  const info = CANON_INFO[canon as CanonState]
  if (!info) return ''
  return `<span class="badge badge--${esc(canon)}" title="${esc(info.description)}">${esc(info.label)}</span>`
}

export function crumbs(items: Array<{ label: string; href?: string }>): string {
  const all = [{ label: 'Início', href: PAGE.home }, ...items]
  return `<nav class="crumbs" aria-label="Trilha de navegação"><ol>${all
    .map((c) => (c.href ? `<li><a href="${c.href}">${esc(c.label)}</a></li>` : `<li><span aria-current="page">${esc(c.label)}</span></li>`))
    .join('')}</ol></nav>`
}

export function pageHero(o: { eyebrow: string; title: string; subtitle?: string; lede?: string; crumbs: Array<{ label: string; href?: string }>; badges?: string; media?: string; className?: string }): string {
  const text = `${crumbs(o.crumbs)}
      <p class="eyebrow">${esc(o.eyebrow)}</p>
      <h1 class="page-hero__title">${esc(o.title)}</h1>
      ${o.subtitle ? `<p class="page-hero__subtitle">${esc(o.subtitle)}</p>` : ''}
      ${o.lede ? `<p class="page-hero__lede">${o.lede}</p>` : ''}
      ${o.badges ? `<p class="badges">${o.badges}</p>` : ''}`
  return `<header class="page-hero${o.media ? ' page-hero--media' : ''}${o.className ? ` ${o.className}` : ''}">
    <div class="wrap page-hero__inner">
      ${o.media ? `<div class="page-hero__text">${text}</div><div class="page-hero__media">${o.media}</div>` : text}
    </div>
  </header>`
}

export function imgTag(img: Img, alt: string, o: { lazy?: boolean; className?: string; sizes?: string } = {}): string {
  return `<img${o.className ? ` class="${o.className}"` : ''} src="${img.src}" width="${img.width}" height="${img.height}" alt="${esc(alt)}"${o.lazy === false ? '' : ' loading="lazy"'} decoding="async">`
}

/** Seções ainda não escritas, listadas sem inventar conteúdo. */
export function pendingBox(titles: string[]): string {
  if (!titles.length) return ''
  return `<aside class="pending" aria-label="Ainda não documentado">
      <p class="pending__title">Ainda não documentado</p>
      <p class="pending__text">Estas seções fazem parte do verbete, mas ainda não foram escritas ou aprovadas.</p>
      <ul class="chips">${titles.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    </aside>`
}

export function section(id: string, title: string, html: string): string {
  if (!html.trim()) return ''
  return `<section class="entry-section" id="${id}" aria-labelledby="${id}-titulo">
      <h2 class="section-title" id="${id}-titulo">${esc(title)}</h2>
      <div class="prose">${html}</div>
    </section>`
}

// ── Moldura das páginas ───────────────────────────────────────────────────

export const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;1,7..72,400&display=swap">`

export const FLAME_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 2c1.2 3 4.5 5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2 1-3.5 2-4.5.2 1.5.8 2.5 1.8 2.9-.6-2.7.1-5.5.7-7.9z" fill="currentColor"/></svg>`
export const CLOSE_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`
export const ARROW = '<span aria-hidden="true">→</span>'

function header(active?: NavKey): string {
  const links = NAV.map((n) => `<a href="${n.href}"${n.key === active ? ' aria-current="page"' : ''}>${esc(n.label)}</a>`).join('')
  return `<header class="mast">
  <a class="mast__brand" href="${PAGE.home}"><span class="mast__mark">${FLAME_SVG}</span><span>Kael Draken <span class="mast__sub">Arquivo da Chama Antiga</span></span></a>
  <nav class="mast__nav" aria-label="Seções do arquivo">${links}</nav>
  <details class="mast__menu">
    <summary>Menu</summary>
    <nav aria-label="Seções do arquivo">${links}</nav>
  </details>
</header>`
}

function footer(author: string): string {
  return `<footer class="foot">
  <div class="wrap foot__grid">
    <div class="foot__about">
      <p class="foot__brand">Kael Draken <em>O Sussurro da Chama Antiga</em></p>
      <p class="foot__note">Versão em HTML do Arquivo da Chama Antiga, gerada a partir do conteúdo do site. Trechos com spoilers não entram nesta versão. Nomes, capitais, fronteiras e brasões dos cinco reinos conhecidos são propostas.</p>
    </div>
    <nav class="foot__nav" aria-label="Arquivo">
      <a href="${PAGE.home}">Início</a>${NAV.map((n) => `<a href="${n.href}">${esc(n.label)}</a>`).join('')}
    </nav>
    <p class="foot__copy">© 2026 ${author ? `${esc(author)} · ` : ''}Kael Draken. Todos os direitos reservados.</p>
  </div>
</footer>`
}

const VIEWER = `<dialog class="viewer" id="viewer" aria-labelledby="viewer-title">
  <div class="viewer__inner">
    <button type="button" class="viewer__close" data-close aria-label="Fechar">${CLOSE_SVG}</button>
    <div class="viewer__stage"><img id="viewer-img" alt=""></div>
    <div class="viewer__info">
      <p class="eyebrow" id="viewer-label"></p>
      <h2 class="viewer__title" id="viewer-title"></h2>
      <p class="viewer__state" id="viewer-state" hidden></p>
      <p class="viewer__caption" id="viewer-caption"></p>
      <details class="viewer__alt"><summary>Descrição da imagem</summary><p id="viewer-alt"></p></details>
      <p class="viewer__nav" id="viewer-nav"><button type="button" class="btn btn--line" data-step="-1">← Anterior</button><button type="button" class="btn btn--line" data-step="1">Próxima →</button></p>
    </div>
  </div>
</dialog>`

export interface ShellOptions {
  title: string
  description: string
  active?: NavKey
  body: string
  author: string
  /** Inclui o visualizador ampliado (ilustrações e carta). */
  viewer?: boolean
  /** Dados das ilustrações para o visualizador (JSON). */
  viewerData?: string
  ogImage?: string
}

/** Página completa, pronta para gravar em disco. */
export function shell(o: ShellOptions): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
${headTags(o)}
</head>
<body>
${bodyContent(o)}
</body>
</html>
`
}

/** Só o conteúdo (sem <html>/<head>), para a página principal do Artifact, que recebe o envelope na publicação. */
export function fragment(o: ShellOptions): string {
  return `<title>${esc(o.title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="icon" href="assets/icone.svg" type="image/svg+xml">
${FONTS}
<link rel="stylesheet" href="assets/site.css">
${bodyContent(o)}
`
}

function headTags(o: ShellOptions): string {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="claude:viewport-fit-sides" content="cover">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
${o.ogImage ? `<meta property="og:image" content="${o.ogImage}">` : ''}
<meta name="theme-color" content="#0d0b09">
<link rel="icon" href="assets/icone.svg" type="image/svg+xml">
${FONTS}
<link rel="stylesheet" href="assets/site.css">`
}

function bodyContent(o: ShellOptions): string {
  return `<a class="skip" href="#conteudo">Pular para o conteúdo</a>
${header(o.active)}
<main id="conteudo">
${o.body}
</main>
${footer(o.author)}
${o.viewer ? VIEWER : ''}
${o.viewerData ? `<script type="application/json" id="ilustracoes-dados">${o.viewerData}</script>` : ''}
<script src="assets/site.js" defer></script>`
}
