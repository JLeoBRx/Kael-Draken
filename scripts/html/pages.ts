/**
 * Páginas da versão em HTML. Cada função devolve o arquivo e as opções da
 * moldura (kit.ts → shell). O conteúdo vem do mesmo registro usado pelo site
 * (src/lib/seed/content.ts e src/lib/atlas/art.ts), sem trechos de spoiler.
 */

import { ART, ILLUSTRATION, artImage, type ArtSource } from '../../src/lib/atlas/art'
import { ART_INFO, CANON_INFO, CERTAINTY_INFO, RELIABILITY_INFO, type CanonState, type CertaintyState, type ReliabilityState } from '../../src/lib/editorial'
import { toRoman } from '../../src/lib/format'
import {
  OFFICIAL_BOOK_SYNOPSIS,
  SEED_ARTICLES,
  SEED_BOOK,
  SEED_CHARACTERS,
  SEED_DOCUMENTS,
  SEED_ERAS,
  SEED_EVENTS,
  SEED_KINGDOMS,
  SEED_LOCATIONS,
  SEED_MYSTERIES,
  SEED_SETTINGS,
  SEED_TERMS,
  type SeedArticle,
} from '../../src/lib/seed/content'
import {
  ARROW,
  PAGE,
  canonBadge,
  crumbs,
  esc,
  imgTag,
  isPublic,
  pageHero,
  pendingBox,
  section,
  type Img,
  type LinkTable,
  type MarkdownOptions,
  type ShellOptions,
} from './kit'
import { atlasConfig, atlasMarkup, type AtlasAssets } from './atlas'

export interface Illustration {
  slug: string
  chapter: number
  label: string
  title: string
  caption: string
  alt: string
  artState: string
  thumb: Img
  large: Img
}

export interface Ctx {
  /** Cópia otimizada de cada arte do registro, pelo endereço público original. */
  art: Map<string, Img>
  /** Detalhes da carta em tamanho de cartão, por reino. */
  realmCard: Record<string, Img>
  emblem: Record<string, Img>
  cover: Img
  coverFull: Img
  illustrations: Illustration[]
  md: (source: string | undefined, options?: MarkdownOptions) => string
  links: LinkTable
  author: string
  atlas: AtlasAssets
}

export interface PageSpec {
  file: string
  shell: Omit<ShellOptions, 'author'>
}

// ── Dados públicos (sem spoilers) ─────────────────────────────────────────

const kingdoms = SEED_KINGDOMS.filter(isPublic)
const characters = SEED_CHARACTERS.filter(isPublic)
const locations = SEED_LOCATIONS.filter(isPublic)
const eras = SEED_ERAS.filter(isPublic)
const events = SEED_EVENTS.filter(isPublic)
const documents = SEED_DOCUMENTS.filter(isPublic)
const mysteries = SEED_MYSTERIES.filter((m) => (m.spoiler ?? 0) === 0)
const articles = (s: SeedArticle['section']) => SEED_ARTICLES.filter((a) => a.section === s && isPublic(a))

const term = (vocab: keyof typeof SEED_TERMS, slug: string | undefined) => SEED_TERMS[vocab].find(([s]) => s === slug)?.[1] ?? ''

/** Capitais como aparecem na carta do manuscrito (conceituais). */
const CAPITALS: Record<string, string> = {
  safra: 'Templo da Chama (ruínas)',
  aurelion: 'Auréstria',
  nacaris: 'Velária, sede da confederação',
  kharveth: 'Vhaldris',
  elyndor: 'Ithária',
  rhovaryn: 'Avarra',
}

export const SECTION_LABEL = { mitologia: 'Mitologia e história antiga', ressonancia: 'Sistema da Ressonância' } as const

/** Registra no mapa de referências todas as páginas desta versão. */
export function registerLinks(links: LinkTable) {
  links.add('atlas', PAGE.atlas, 'Atlas dos Seis Reinos')
  links.add('livros', PAGE.book, SEED_BOOK.title)
  links.add(`livros/${SEED_BOOK.slug}`, PAGE.book, SEED_BOOK.title)
  links.add('personagens', PAGE.characters, 'Personagens')
  links.add('mitologia', PAGE.mythology, 'Mitologia')
  links.add('ressonancia', PAGE.resonance, 'A Ressonância')
  links.add('cronologia', PAGE.timeline, 'Cronologia')
  links.add('locais', PAGE.locations, 'Locais')
  links.add('manuscritos', PAGE.documents, 'Manuscritos')
  links.add('misterios', PAGE.mysteries, 'Mistérios')
  for (const k of kingdoms) links.add(`reinos/${k.slug}`, PAGE.kingdom(k.slug), k.name)
  for (const c of characters) links.add(`personagens/${c.slug}`, PAGE.character(c.slug), c.name)
  for (const l of locations) links.add(`locais/${l.slug}`, PAGE.location(l.slug), l.name)
  for (const d of documents) links.add(`manuscritos/${d.slug}`, PAGE.document(d.slug), d.title)
  for (const a of SEED_ARTICLES.filter(isPublic)) links.add(`${a.section}/${a.slug}`, PAGE.article(a.section, a.slug), a.title)
}

/** Todos os textos em Markdown publicados nesta versão (para copiar as imagens citadas). */
export function allMarkdown(): string[] {
  return [
    OFFICIAL_BOOK_SYNOPSIS,
    SEED_BOOK.editorialInfo,
    ...kingdoms.flatMap((k) => [k.body, k.resonance, k.history, k.relations, k.mysteries]),
    ...characters.flatMap((c) => [c.personality, c.history, c.family, c.storyRole]),
    ...locations.flatMap((l) => [l.body, l.history]),
    ...events.map((e) => e.body),
    ...SEED_ARTICLES.filter(isPublic).map((a) => a.body),
    ...documents.map((d) => d.context),
  ].filter((s): s is string => !!s)
}

// ── Artes ─────────────────────────────────────────────────────────────────

function asset(ctx: Ctx, src: string): Img {
  const img = ctx.art.get(src)
  if (!img) throw new Error(`Arte sem cópia na versão HTML: ${src}`)
  return img
}

function illustration(ctx: Ctx, slug: string): Illustration | undefined {
  return ctx.illustrations.find((i) => i.slug === slug)
}

/** Prancha de uma ilustração de capítulo, com link para a galeria (que a abre ampliada). */
function plateFigure(ctx: Ctx, slug: string): string {
  const it = illustration(ctx, slug)
  if (!it) return ''
  const state = it.artState === 'final' ? '' : `<span class="plate-figure__note">${esc(ART_INFO[it.artState as keyof typeof ART_INFO].label)}</span>`
  return `<figure class="plate-figure">
      <div class="plate-figure__media">${imgTag(it.thumb, it.alt)}</div>
      <figcaption class="plate-figure__text">
        <span class="plate-figure__kicker">Ilustração do ${esc(it.label.replace('Capítulo', 'capítulo'))}</span>
        <span class="plate-figure__title">${esc(it.title)}</span>
        <span class="plate-figure__caption">${esc(it.caption)}</span>
        ${state}
        <a class="plate-figure__link" href="${PAGE.home}#${it.slug}">Ver na galeria de ilustrações ${ARROW}</a>
      </figcaption>
    </figure>`
}

/** Figura larga (selos, cartas, painel heráldico) com legenda e crédito. */
function artFigure(ctx: Ctx, source: ArtSource | null, className = 'art-figure'): string {
  if (!source) return ''
  if ('illustration' in source) return plateFigure(ctx, source.illustration)
  const img = asset(ctx, source.src)
  return `<figure class="${className}">
      ${imgTag(img, source.alt)}
      <figcaption>${esc(source.caption ?? '')}${source.credit ? ` · Crédito: ${esc(source.credit)}` : ''}</figcaption>
    </figure>`
}

/** Miniatura de cartão para uma arte do registro (ilustrações usam a prancha pequena). */
function cardImage(ctx: Ctx, source: ArtSource): string {
  if ('illustration' in source) {
    const it = illustration(ctx, source.illustration)
    return it ? `<img src="${it.thumb.src}" width="${it.thumb.width}" height="${it.thumb.height}" alt="" loading="lazy" decoding="async" style="object-position: ${source.focus ?? '50% 50%'}">` : ''
  }
  const img = asset(ctx, source.src)
  return `<img src="${img.src}" width="${img.width}" height="${img.height}" alt="" loading="lazy" decoding="async"${source.focus ? ` style="object-position: ${source.focus}"` : ''}>`
}

function mapDetail(ctx: Ctx, slug: string): string {
  const source = ART.reino[slug]
  if (!source) return ''
  return `<figure class="map-detail">
      <div class="map-detail__frame">${imgTag(asset(ctx, source.src), source.alt, { lazy: false })}</div>
      <figcaption class="map-detail__caption"><span>${esc(source.caption ?? '')}</span><a class="map-detail__link" href="${PAGE.atlas}#regiao-${slug}">Ver no Atlas 2D e 3D ${ARROW}</a></figcaption>
    </figure>`
}

function viewerData(ctx: Ctx): string {
  return JSON.stringify(
    ctx.illustrations.map((it) => ({
      slug: it.slug,
      src: it.large.src,
      w: it.large.width,
      h: it.large.height,
      label: it.label,
      title: it.title,
      caption: it.caption,
      alt: it.alt,
      state: it.artState === 'final' ? '' : ART_INFO[it.artState as keyof typeof ART_INFO].label,
    })),
  ).replace(/</g, '\\u003c')
}

function plateGrid(ctx: Ctx): string {
  return ctx.illustrations
    .map(
      (it) => `
      <li class="plate" id="${it.slug}">
        <button type="button" class="plate__frame" data-plate="${it.slug}" aria-label="Ampliar a ilustração do ${esc(it.label.toLowerCase())}: ${esc(it.title)}">
          ${imgTag(it.thumb, '')}
        </button>
        <p class="plate__num">${esc(it.label)}</p>
        <p class="plate__title">${esc(it.title)}</p>
        ${it.artState !== 'final' ? `<p class="plate__state">${esc(ART_INFO[it.artState as keyof typeof ART_INFO].label)}</p>` : ''}
      </li>`,
    )
    .join('')
}

function mapBlock(ctx: Ctx, headingId: string): string {
  const original = asset(ctx, ART.mapaOriginal.src)
  const known = asset(ctx, ART.mapaConhecido.src)
  return `<div class="atlas__switch" role="group" aria-labelledby="${headingId}">
        <button type="button" class="atlas__opt" aria-pressed="true" data-map="original">Mundo original <span>seis reinos</span></button>
        <button type="button" class="atlas__opt" aria-pressed="false" data-map="conhecido">Mundo conhecido <span>versão oficial · cinco reinos</span></button>
      </div>
      <button type="button" class="atlas__map" aria-label="Ampliar a carta">
        <img id="mapa" src="${original.src}" data-original="${original.src}" data-conhecido="${known.src}" width="${original.width}" height="${original.height}" loading="lazy" decoding="async" alt="${esc(ART.mapaOriginal.alt)}">
      </button>
      <p class="atlas__note">Carta do manuscrito. Nomes, capitais, fronteiras e brasões são conceituais e podem mudar.</p>`
}

function realmCards(ctx: Ctx): string {
  return kingdoms
    .map(
      (k, i) => `
        <li class="realm${k.slug === 'safra' ? ' realm--lost' : ''}">
          ${ctx.realmCard[k.slug] ? imgTag(ctx.realmCard[k.slug], `${k.name} na carta do manuscrito`, { className: 'realm__map' }) : ''}
          <p class="realm__num">${toRoman(i + 1)}</p>
          <h3 class="realm__name"><a href="${PAGE.kingdom(k.slug)}">${esc(k.name)}</a></h3>
          <p class="realm__epithet">${esc(k.epithet || k.government || '')}</p>
          <p class="realm__summary">${esc(k.summary)}</p>
          <p class="realm__capital"><span>Na carta</span> ${esc(CAPITALS[k.slug] ?? '')}</p>
          <p class="realm__state">${esc(CANON_INFO[k.canon].label)}</p>
        </li>`,
    )
    .join('')
}

function rows(items: Array<{ href: string; num?: string; eyebrow?: string; title: string; text?: string; badge?: string }>): string {
  return `<ul class="rows">${items
    .map(
      (r) => `<li><a class="row" href="${r.href}">
        ${r.num ? `<span class="row__num">${esc(r.num)}</span>` : ''}
        <span class="row__body">
          ${r.eyebrow ? `<span class="row__eyebrow">${esc(r.eyebrow)}</span>` : ''}
          <span class="row__title">${esc(r.title)}</span>
          ${r.text ? `<span class="row__text">${esc(r.text)}</span>` : ''}
        </span>
        ${r.badge ?? ''}
      </a></li>`,
    )
    .join('')}</ul>`
}

function cards(items: Array<{ href: string; image: string; eyebrow?: string; title: string; text: string }>): string {
  return `<ul class="cards">${items
    .map(
      (c) => `<li><a class="card" href="${c.href}">
        <span class="card__media">${c.image}</span>
        <span class="card__body">
          ${c.eyebrow ? `<span class="card__eyebrow">${esc(c.eyebrow)}</span>` : ''}
          <span class="card__title">${esc(c.title)}</span>
          <span class="card__text">${esc(c.text)}</span>
        </span>
      </a></li>`,
    )
    .join('')}</ul>`
}

function facts(items: Array<{ label: string; value: string | null | undefined }>): string {
  return `<dl class="facts">${items
    .filter((f) => f.value)
    .map((f) => `<div><dt>${esc(f.label)}</dt><dd>${f.value}</dd></div>`)
    .join('')}</dl>`
}

function related(title: string, items: Array<{ href?: string; title: string; meta?: string }>): string {
  if (!items.length) return ''
  return `<div class="related"><p class="related__title">${esc(title)}</p><ul>${items
    .map((i) => `<li>${i.href ? `<a href="${i.href}">${esc(i.title)}</a>` : esc(i.title)}${i.meta ? `<span>${esc(i.meta)}</span>` : ''}</li>`)
    .join('')}</ul></div>`
}

const muted = (s: string) => `<span class="muted">${esc(s)}</span>`

// ── Início ────────────────────────────────────────────────────────────────

const EMBLEM_SVG = `<svg viewBox="0 0 64 64" width="56" height="56" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width=".6" stroke-dasharray="1.5 2.5"/><path d="M32 10c3 7 11 12 11 23a11 11 0 0 1-22 0c0-5 2.5-8.5 5-11 .4 3.6 2 6 4.5 7-1.5-6.5.2-13.4 1.5-19z" fill="currentColor" opacity=".9"/><path d="M32 30c1.8 3 4.5 4.8 4.5 8.5a4.5 4.5 0 0 1-9 0c0-2.4 1.2-3.9 2.3-5 .3 1.4 1 2.3 2 2.8-.3-2.3-.3-4.4.2-6.3z" fill="#f3e5c4"/></svg>`
const DIVIDER_SVG = `<svg viewBox="0 0 240 16" width="240" height="16" aria-hidden="true"><path d="M0 8h96M144 8h96" stroke="currentColor" stroke-width=".8"/><path d="M100 8l4-4 4 4-4 4zM132 8l4-4 4 4-4 4z" fill="currentColor"/><path d="M120 0l3 8-3 8-3-8z" fill="currentColor"/><circle cx="120" cy="8" r="1.4" fill="#f3e5c4"/></svg>`
const SEAL_SVG = (() => {
  const pts = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2
    const r = 30 + Math.sin(i * 2.7) * 1.8 + Math.cos(i * 1.3) * 1.2
    return `${(40 + Math.cos(a) * r).toFixed(1)},${(40 + Math.sin(a) * r).toFixed(1)}`
  }).join(' ')
  return `<svg viewBox="0 0 80 96" width="80" height="96" aria-hidden="true"><defs><radialGradient id="cera" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#c0392b"/><stop offset=".55" stop-color="#8e1b12"/><stop offset="1" stop-color="#4d0b07"/></radialGradient></defs><path d="M30 62l-8 32 10-7 6 9 4-34zM50 62l8 32-10-7-6 9-4-34z" fill="#6e1410"/><polygon points="${pts}" fill="url(#cera)"/><circle cx="40" cy="40" r="21" fill="none" stroke="#e8a28f" stroke-opacity=".35" stroke-width="1.2"/><path d="M40 24c2 5 8 8.5 8 16a8 8 0 0 1-16 0c0-3.6 1.8-6 3.6-7.8.3 2.6 1.4 4.2 3.2 5-1-4.6.2-9.4 1.2-13.2z" fill="#f2b8a6" fill-opacity=".55"/></svg>`
})()

const COVER_ALT = 'Capa de Kael Draken — Livro I: O Sussurro da Chama Antiga. Um jovem de capa vermelha, de costas, olha para uma cidade de torres ao entardecer, sob a sombra de um dragão.'

function prophecyLines(): string[] {
  return (documents.find((d) => d.slug === 'quando-a-chama-despertar')?.transcription ?? '').split('\n').filter(Boolean)
}

function exploreCards(ctx: Ctx): string {
  return cards([
    { href: PAGE.characters, image: cardImage(ctx, ILLUSTRATION.capitulo1), eyebrow: 'Biblioteca', title: 'Personagens', text: 'Kael Draken e quem cruza o seu caminho.' },
    { href: PAGE.mythology, image: cardImage(ctx, ART.selo.chama), eyebrow: 'Crônica', title: 'Mitologia', text: 'Da Chama do Dragão à ascensão do Caos.' },
    { href: PAGE.timeline, image: cardImage(ctx, ART.selo.seculoPerdido), eyebrow: 'Linha do tempo', title: 'Cronologia', text: 'Eras e acontecimentos, com o grau de certeza de cada um.' },
    { href: PAGE.resonance, image: cardImage(ctx, ART.selo.ressonancia), eyebrow: 'Sistema mágico', title: 'A Ressonância', text: 'O que está estabelecido e o que ainda é proposta.' },
    { href: PAGE.locations, image: cardImage(ctx, ILLUSTRATION.capitulo3), eyebrow: 'Geografia', title: 'Locais', text: 'Vilarejos, templos e ruínas.' },
    { href: PAGE.documents, image: cardImage(ctx, ILLUSTRATION.capitulo7), eyebrow: 'Arquivo', title: 'Manuscritos', text: 'Profecias e fragmentos, com sua confiabilidade.' },
    { href: PAGE.mysteries, image: cardImage(ctx, ART.selo.skrugheim), eyebrow: 'Perguntas em aberto', title: 'Mistérios', text: 'O que a própria história ainda vai responder.' },
  ])
}

export function homePage(ctx: Ctx): PageSpec {
  const scene = asset(ctx, ART.cenaCapa.src)
  const announcement = ctx.md(SEED_SETTINGS.announcement_body)
  const genres = ['Fantasia', 'Aventura', 'Mistério', 'Destino']
  const body = `
  <section class="opening" aria-labelledby="anuncio">
    <img class="opening__scene" src="${scene.src}" width="${scene.width}" height="${scene.height}" alt="" decoding="async">
    <div class="scroll">
      <div class="scroll__rod" aria-hidden="true"></div>
      <article class="scroll__sheet">
        <div class="scroll__inner">
          <span class="scroll__emblem">${EMBLEM_SVG}</span>
          <p class="scroll__kicker">${esc(SEED_SETTINGS.announcement_kicker ?? '')}</p>
          <h1 class="scroll__title" id="anuncio">${esc(SEED_SETTINGS.announcement_title ?? 'O livro voltou')}</h1>
          <span class="scroll__divider">${DIVIDER_SVG}</span>
          <div class="scroll__body">${announcement}</div>
          <p class="scroll__actions"><a class="btn btn--ember" href="${PAGE.book}">Conhecer o Livro I</a><a class="btn btn--ink" href="#ilustracoes">Ver as ilustrações</a></p>
        </div>
        <span class="scroll__seal">${SEAL_SVG}</span>
      </article>
      <div class="scroll__rod" aria-hidden="true"></div>
    </div>
  </section>

  <section class="book" id="livro" aria-labelledby="livro-titulo">
    <div class="wrap book__grid">
      <figure class="book__cover">${imgTag(ctx.cover, COVER_ALT, { lazy: false })}</figure>
      <div class="book__text">
        <p class="eyebrow">${esc(SEED_BOOK.subtitle)}</p>
        <h2 class="book__title" id="livro-titulo">${esc(SEED_BOOK.title)}</h2>
        ${ctx.author ? `<p class="book__author">${esc(ctx.author)}</p>` : ''}
        ${SEED_SETTINGS.book_epigraph ? `<blockquote class="book__epigraph">“${esc(SEED_SETTINGS.book_epigraph)}”</blockquote>` : ''}
        <div class="book__synopsis">${ctx.md(OFFICIAL_BOOK_SYNOPSIS)}</div>
        <ul class="genres" aria-label="Gêneros">${genres.map((g) => `<li>${g}</li>`).join('')}</ul>
        <p class="book__actions"><a class="btn btn--line" href="${PAGE.book}">Página do livro ${ARROW}</a></p>
        <p class="book__meta">Edição independente · 2026</p>
      </div>
    </div>
  </section>

  <section class="plates" id="ilustracoes" aria-labelledby="ilustracoes-titulo">
    <div class="wrap">
      <header class="head">
        <p class="eyebrow">Livro I · gravuras dos capítulos</p>
        <h2 id="ilustracoes-titulo">Ilustrações do Livro I</h2>
        <p class="head__lede">Imagens que acompanham os primeiros passos de Kael Draken e os vestígios de uma história que o mundo tentou esquecer. Uma por capítulo, no formato do livro impresso: 15,5 × 23 cm, em preto e branco.</p>
      </header>
      <ol class="plates__grid">${plateGrid(ctx)}
      </ol>
    </div>
  </section>

  <section class="atlas" id="atlas" aria-labelledby="atlas-titulo">
    <div class="wrap">
      <header class="head">
        <p class="eyebrow">Atlas dos Seis Reinos</p>
        <h2 id="atlas-titulo">O mundo, em duas versões</h2>
        <p class="head__lede">Antes da Noite das Cinzas, seis reinos. Depois dela, a história oficial reconhece apenas cinco — e o território de Safra ficou sem registro.</p>
      </header>
      ${mapBlock(ctx, 'atlas-titulo')}
      <ol class="realms">${realmCards(ctx)}
      </ol>
      <p class="section-more"><a class="btn btn--line" href="${PAGE.atlas}#mapas">Explorar o mapa em 2D e 3D ${ARROW}</a></p>
    </div>
  </section>

  <section class="explore" aria-labelledby="explorar-titulo">
    <div class="wrap">
      <header class="head">
        <p class="eyebrow">O arquivo</p>
        <h2 id="explorar-titulo">Explore o universo</h2>
        <p class="head__lede">Cada verbete mostra o seu estado: o que está estabelecido, o que ainda é proposta e o que permanece em aberto.</p>
      </header>
      ${exploreCards(ctx)}
    </div>
  </section>

  <section class="prophecy" aria-label="Profecia">
    <figure class="wrap">
      <blockquote>${prophecyLines()
        .map((l) => `<span>${esc(l)}</span>`)
        .join('')}</blockquote>
      <figcaption>Profecia · <a href="${PAGE.document('quando-a-chama-despertar')}">ver no arquivo</a></figcaption>
    </figure>
  </section>`
  return {
    file: PAGE.home,
    shell: {
      title: 'Kael Draken — O Sussurro da Chama Antiga',
      description: 'O Sussurro da Chama Antiga está de volta. Capa, sinopse oficial, as ilustrações dos dez primeiros capítulos e o Atlas dos Seis Reinos.',
      body,
      viewer: true,
      viewerData: viewerData(ctx),
      ogImage: ctx.cover.src,
    },
  }
}

// ── Livro ─────────────────────────────────────────────────────────────────

export function bookPage(ctx: Ctx): PageSpec {
  const chapters = ctx.illustrations
    .map(
      (it) => `<li class="chapter-row">
        <button type="button" class="chapter-row__thumb" data-plate="${it.slug}" aria-label="Ampliar a ilustração do ${esc(it.label.toLowerCase())}">${imgTag(it.thumb, '')}</button>
        <span class="chapter-row__num">${esc(it.label)}</span>
        <span class="chapter-row__title">${esc(it.title)}</span>
        <span class="chapter-row__caption">${esc(it.caption)}</span>
        ${it.artState !== 'final' ? `<span class="plate__state">${esc(ART_INFO[it.artState as keyof typeof ART_INFO].label)}</span>` : ''}
      </li>`,
    )
    .join('')
  const body = `${pageHero({ eyebrow: 'Livro I', title: SEED_BOOK.title, subtitle: SEED_BOOK.subtitle, crumbs: [{ label: 'Livro I' }], badges: canonBadge('canonico') })}
  <div class="wrap layout layout--book">
    <aside class="layout__aside book-aside">
      <figure class="book__cover">${imgTag(ctx.cover, COVER_ALT, { lazy: false })}</figure>
      ${ctx.author ? `<p class="book-aside__author"><span class="eyebrow">Autor</span>${esc(ctx.author)}</p>` : ''}
      <a class="book-aside__full" href="${ctx.coverFull.src}" target="_blank" rel="noopener">Ver a capa completa <span>contracapa, lombada e capa</span></a>
    </aside>
    <div class="layout__main">
      ${SEED_SETTINGS.book_epigraph ? `<figure class="epigraph"><blockquote><p>“${esc(SEED_SETTINGS.book_epigraph)}”</p></blockquote><figcaption>Epígrafe do Livro I</figcaption></figure>` : ''}
      ${section('sinopse', 'Sinopse oficial', ctx.md(OFFICIAL_BOOK_SYNOPSIS))}
      ${section('informacoes', 'Informações editoriais', ctx.md(`${SEED_BOOK.editorialInfo}\n- **Edição:** independente, 2026`))}
      <section class="entry-section" id="capitulos" aria-labelledby="capitulos-titulo">
        <h2 class="section-title" id="capitulos-titulo">Capítulos e ilustrações</h2>
        <p class="muted-note">O texto dos capítulos não é publicado nesta versão — apenas os títulos e as ilustrações.</p>
        <ol class="chapter-rows">${chapters}</ol>
      </section>
    </div>
  </div>`
  return {
    file: PAGE.book,
    shell: { title: `${SEED_BOOK.title} · Kael Draken`, description: 'Livro I da saga Kael Draken: capa, sinopse oficial, informações editoriais e as ilustrações dos capítulos.', active: 'livro', body, viewer: true, viewerData: viewerData(ctx), ogImage: ctx.cover.src },
  }
}

// ── Atlas ─────────────────────────────────────────────────────────────────

export function atlasPage(ctx: Ctx): PageSpec {
  const frontis = asset(ctx, ART.frontispicio.src)
  const bands = kingdoms
    .map((k, i) => {
      const emblem = ctx.emblem[k.slug]
      return `<article class="band${k.slug === 'safra' ? ' band--lost' : ''}" aria-labelledby="band-${k.slug}">
        ${emblem ? `<div class="band__emblem">${imgTag(emblem, `Brasão conceitual de ${k.name}`)}</div>` : ''}
        <div class="band__text">
          <p class="band__num">Reino ${toRoman(i + 1)}</p>
          <h3 id="band-${k.slug}"><a href="${PAGE.kingdom(k.slug)}">${esc(k.name)}</a></h3>
          ${k.epithet || k.government ? `<p class="band__epithet">${esc(k.epithet || k.government || '')}</p>` : ''}
          <p>${esc(k.summary)}</p>
          <p class="badges">${canonBadge(k.canon)}<span class="band__capital">Na carta: ${esc(CAPITALS[k.slug] ?? '')}</span></p>
        </div>
        <a class="band__map" href="${PAGE.kingdom(k.slug)}" aria-label="Abrir o verbete de ${esc(k.name)}">${ctx.realmCard[k.slug] ? imgTag(ctx.realmCard[k.slug], '') : ''}</a>
      </article>`
    })
    .join('')
  const chapterCards = cards([
    { href: PAGE.article('mitologia', 'a-chama-do-dragao'), image: cardImage(ctx, ART.selo.chama), title: 'A Chama do Dragão e o Caos', text: 'A força que criou o mundo e aquilo que nasceu com ele.' },
    { href: PAGE.article('mitologia', 'safra-e-a-noite-das-cinzas'), image: cardImage(ctx, ART.reino.safra), title: 'Safra e a Noite das Cinzas', text: 'Uma civilização ligada às chamas, sua destruição e seu apagamento.' },
    { href: PAGE.article('mitologia', 'o-templo-da-chama'), image: cardImage(ctx, ART.selo.templo), title: 'O Templo da Chama', text: 'O lugar central ligado à proteção da Chama.' },
    { href: PAGE.resonance, image: cardImage(ctx, ART.selo.ressonancia), title: 'A Ressonância', text: 'O sistema de poder: o que está estabelecido e o que é proposta.' },
    { href: PAGE.character('kael-draken'), image: cardImage(ctx, ILLUSTRATION.capitulo1), title: 'Kael Draken', text: 'Dezesseis anos, uma família adotiva e sonhos impossíveis.' },
    { href: PAGE.article('mitologia', 'o-seculo-perdido'), image: cardImage(ctx, ART.selo.seculoPerdido), title: 'O Século Perdido', text: 'Cerca de seiscentos anos de história perdida.' },
    { href: PAGE.mysteries, image: cardImage(ctx, ART.selo.skrugheim), title: 'Mistérios', text: 'As perguntas em aberto — e a profecia de Skrugheim.' },
  ])
  const body = `<header class="atlas-hero">
    <img class="atlas-hero__art" src="${frontis.src}" width="${frontis.width}" height="${frontis.height}" alt="" decoding="async">
    <div class="wrap atlas-hero__inner">
      ${crumbs([{ label: 'Atlas' }])}
      <p class="eyebrow">Kael Draken — Livro I: O Sussurro da Chama Antiga</p>
      <h1 class="atlas-hero__title">Atlas dos <span>Seis Reinos</span></h1>
      <p class="atlas-hero__lede">A Chama do Dragão criou o mundo. Com a criação surgiu o Caos, contido pela Chama. Seis reinos foram estabelecidos — e um deles, Safra, foi destruído e apagado da história oficial. Este atlas reúne os mapas, os reinos e os capítulos dessa história, distinguindo o que está estabelecido do que ainda é proposta.</p>
      <p class="atlas-hero__nav"><a href="#mapas">Mapas</a><a href="#reinos">Os seis reinos</a><a href="#historia">A história do mundo</a><a href="${PAGE.mysteries}">Mistérios</a></p>
      <p class="art-note">Ao fundo: frontispício do Livro I, da Edição Profissional Ilustrada.</p>
    </div>
  </header>

  <section class="atlas" id="mapas" aria-labelledby="mapas-titulo">
    <div class="wrap">
      <header class="head">
        <p class="eyebrow">Mapas</p>
        <h2 id="mapas-titulo">O mundo, em duas versões</h2>
        <p class="head__lede">O mapa do mundo original mostra os seis reinos. O mapa do mundo conhecido reproduz a versão oficial, em que Safra foi apagada. Selecione uma região para ver seus detalhes, ou abra a exploração em três dimensões.</p>
      </header>
      ${atlasMarkup(ctx.atlas)}
      <script type="application/json" id="atlas-config">${atlasConfig(ctx.atlas)}</script>
    </div>
  </section>

  <section class="section" id="reinos" aria-labelledby="reinos-titulo">
    <div class="wrap">
      <header class="head">
        <p class="eyebrow">Os reinos</p>
        <h2 id="reinos-titulo">Os seis reinos</h2>
        <p class="head__lede">Safra é o reino desaparecido. Os outros cinco são os reinos conhecidos — seus nomes, capitais e características ainda podem mudar. Cada reino aparece recortado da carta do manuscrito; os brasões são propostas visuais.</p>
      </header>
      ${artFigure(ctx, ART.painelReinos, 'art-figure art-figure--panel')}
      <div class="bands">${bands}</div>
    </div>
  </section>

  <section class="section" id="historia" aria-labelledby="historia-titulo">
    <div class="wrap">
      <header class="head">
        <p class="eyebrow">Capítulos</p>
        <h2 id="historia-titulo">A história do mundo</h2>
      </header>
      ${chapterCards}
    </div>
  </section>`
  return {
    file: PAGE.atlas,
    shell: {
      title: 'Atlas dos Seis Reinos · Kael Draken',
      description: 'A carta do manuscrito em 2D e 3D — o mundo original e o mundo conhecido —, os seis reinos e os capítulos da história do mundo.',
      active: 'atlas',
      body,
      ogImage: asset(ctx, ART.mapaOriginal.src).src,
      scripts: ['assets/atlas.js'],
    },
  }
}

// ── Reinos ────────────────────────────────────────────────────────────────

export function kingdomPages(ctx: Ctx): PageSpec[] {
  return kingdoms.map((k) => {
    const sections = [
      { id: 'descricao', title: 'Descrição geral', source: k.body },
      { id: 'geografia', title: 'Geografia e clima', source: undefined },
      { id: 'capital', title: 'Capital e cidades importantes', source: undefined },
      { id: 'cultura', title: 'Cultura e costumes', source: undefined },
      { id: 'economia', title: 'Economia e recursos', source: undefined },
      { id: 'ressonancia', title: 'Relação com a Ressonância', source: k.resonance },
      { id: 'historia', title: 'História conhecida', source: k.history },
      { id: 'relacoes', title: 'Relações com outros reinos', source: k.relations },
      { id: 'misterios', title: 'Mistérios relacionados', source: k.mysteries },
    ].map((s) => ({ ...s, html: ctx.md(s.source, { headingOffset: 1, idPrefix: `${s.id}-` }) }))
    const here = locations.filter((l) => l.kingdom === k.slug)
    const kEvents = events.filter((e) => e.kingdoms?.includes(k.slug))
    const pending = sections.filter((s) => !s.html.trim()).map((s) => s.title)
    pending.push('Personagens associados', 'Galeria de imagens e documentos')
    const emblem = ctx.emblem[k.slug]
    const body = `${pageHero({
      eyebrow: 'Reino',
      title: k.name,
      subtitle: k.epithet || k.government,
      crumbs: [{ label: 'Atlas', href: PAGE.atlas }, { label: k.name }],
      badges: canonBadge(k.canon),
      media: mapDetail(ctx, k.slug),
    })}
  <div class="wrap layout" style="--accent: ${k.accent}">
    <aside class="layout__aside">
      <div class="infobox">
        ${emblem ? `<div class="infobox__media infobox__media--emblem">${imgTag(emblem, `Brasão conceitual de ${k.name}`)}</div>` : ''}
        ${facts([
          { label: 'Forma de governo', value: k.government ? esc(k.government) : muted('Em desenvolvimento') },
          { label: 'Na carta do manuscrito', value: CAPITALS[k.slug] ? `${esc(CAPITALS[k.slug])} ${muted('(conceitual)')}` : null },
          { label: 'Lugares documentados', value: here.length ? here.map((l) => `<a href="${PAGE.location(l.slug)}">${esc(l.name)}</a>`).join(', ') : '0' },
          { label: 'No atlas', value: `<a href="${PAGE.atlas}#regiao-${k.slug}">Ver a zona no mapa 2D e 3D</a>` },
          { label: 'Brasão', value: muted('Proposta heráldica (não aprovada)') },
        ])}
      </div>
    </aside>
    <div class="layout__main">
      <p class="lead">${esc(k.summary)}</p>
      ${k.canon !== 'canonico' ? `<p class="notice"><strong>Verbete provisório.</strong> Nome, capital e características deste reino ainda estão em desenvolvimento e podem mudar.</p>` : ''}
      ${sections.map((s) => section(s.id, s.title, s.html)).join('')}
      ${pendingBox(pending)}
      <section class="entry-section" aria-labelledby="refs-${k.slug}">
        <h2 class="section-title" id="refs-${k.slug}">Referências cruzadas</h2>
        <div class="related-grid">
          ${related(
            'Na cronologia',
            kEvents.map((e) => ({ href: `${PAGE.timeline}#${e.slug}`, title: e.title, meta: CERTAINTY_INFO[e.certainty as CertaintyState]?.label })),
          )}
          ${related(
            'Outros reinos',
            kingdoms.filter((o) => o.slug !== k.slug).map((o) => ({ href: PAGE.kingdom(o.slug), title: o.name })),
          )}
        </div>
      </section>
    </div>
  </div>`
    return {
      file: PAGE.kingdom(k.slug),
      shell: { title: `${k.name} · Kael Draken`, description: k.summary, active: 'atlas', body, ogImage: asset(ctx, ART.reino[k.slug].src).src },
    }
  })
}

// ── Personagens ───────────────────────────────────────────────────────────

export function characterPages(ctx: Ctx): PageSpec[] {
  const list: PageSpec = {
    file: PAGE.characters,
    shell: {
      title: 'Personagens · Kael Draken',
      description: 'Biblioteca de personagens do universo de Kael Draken.',
      active: 'personagens',
      body: `${pageHero({ eyebrow: 'Biblioteca', title: 'Personagens', lede: 'Retratos, origens e relações — nesta versão, apenas o que se pode saber antes de abrir o livro.', crumbs: [{ label: 'Personagens' }] })}
  <section class="section"><div class="wrap">
    ${rows(characters.map((c) => ({ href: PAGE.character(c.slug), eyebrow: [term('character_role', c.role), c.age].filter(Boolean).join(' · '), title: c.name, text: c.summary, badge: canonBadge(c.canon) })))}
  </div></section>`,
    },
  }
  const pages = characters.map((c): PageSpec => {
    const sections = [
      { id: 'personalidade', title: 'Personalidade', source: c.personality },
      { id: 'historia', title: 'História', source: c.history },
      { id: 'familia', title: 'Relações familiares', source: c.family },
      { id: 'participacao', title: 'Participação na história', source: c.storyRole },
    ].map((s) => ({ ...s, html: ctx.md(s.source, { headingOffset: 1, idPrefix: `${s.id}-` }) }))
    const origin = locations.find((l) => l.slug === c.origin)
    const cEvents = events.filter((e) => e.characters?.includes(c.slug) || (c.slug === 'kael-draken' && e.slug === 'os-sonhos-de-kael'))
    const art = artImage('character', c.slug)
    const body = `${pageHero({ eyebrow: 'Personagem', title: c.name, crumbs: [{ label: 'Personagens', href: PAGE.characters }, { label: c.name }], badges: canonBadge(c.canon) })}
  <div class="wrap layout">
    <aside class="layout__aside">
      <div class="infobox">
        <div class="infobox__media"><div class="slot" role="img" aria-label="Retrato ainda não definido"><span>Retrato ainda não definido</span></div></div>
        ${facts([
          { label: 'Idade', value: c.age ? esc(c.age) : muted('Não informada') },
          { label: 'Papel narrativo', value: esc(term('character_role', c.role) || c.role) },
          { label: 'Origem', value: origin ? `<a href="${PAGE.location(origin.slug)}">${esc(origin.name)}</a>` : muted('Não documentada') },
        ])}
      </div>
    </aside>
    <div class="layout__main">
      <p class="lead">${esc(c.summary)}</p>
      ${art ? artFigure(ctx, art) : ''}
      ${sections.map((s) => section(s.id, s.title, s.html)).join('')}
      ${c.secrets?.trim() ? `<section class="entry-section"><h2 class="section-title">Segredos e revelações</h2><p class="notice notice--spoiler">Restritos por nível de spoiler: ficam no site, para quem escolher ler, e não fazem parte desta versão.</p></section>` : ''}
      ${pendingBox(['Capacidades e conhecimentos', 'Amizades, rivalidades e relacionamentos', 'Aparições em capítulos'])}
      <section class="entry-section" aria-labelledby="refs-${c.slug}">
        <h2 class="section-title" id="refs-${c.slug}">Referências cruzadas</h2>
        <div class="related-grid">
          ${related('Lugares', origin ? [{ href: PAGE.location(origin.slug), title: origin.name, meta: origin.summary }] : [])}
          ${related('Na cronologia', cEvents.map((e) => ({ href: `${PAGE.timeline}#${e.slug}`, title: e.title, meta: CERTAINTY_INFO[e.certainty as CertaintyState]?.label })))}
        </div>
      </section>
    </div>
  </div>`
    return { file: PAGE.character(c.slug), shell: { title: `${c.name} · Kael Draken`, description: c.summary, active: 'personagens', body } }
  })
  return [list, ...pages]
}

// ── Mitologia e Ressonância ───────────────────────────────────────────────

function articlePages(ctx: Ctx, sectionKey: SeedArticle['section']): PageSpec[] {
  const list = articles(sectionKey)
  return list.map((a, i): PageSpec => {
    const html = ctx.md(a.body)
    const art = artImage('article', `${sectionKey}/${a.slug}`)
    const prev = list[i - 1]
    const next = list[i + 1]
    const indexHref = sectionKey === 'mitologia' ? PAGE.mythology : PAGE.resonance
    const body = `${pageHero({
      eyebrow: SECTION_LABEL[sectionKey],
      title: a.title,
      subtitle: a.subtitle,
      crumbs: [{ label: sectionKey === 'mitologia' ? 'Mitologia' : 'Ressonância', href: indexHref }, { label: a.title }],
      badges: canonBadge(a.canon),
    })}
  <div class="wrap article">
    <p class="lead">${esc(a.summary)}</p>
    ${art ? artFigure(ctx, art) : ''}
    ${
      html.trim()
        ? `<div class="prose">${html}</div>`
        : `<div class="pending pending--article"><p class="pending__title">Verbete em preparação</p><p class="pending__text">Este verbete faz parte da estrutura do arquivo, mas seu conteúdo ainda não foi escrito ou aprovado. Estado atual: <strong>${esc(CANON_INFO[a.canon as CanonState]?.label ?? '')}</strong>. Nada aqui foi completado com suposições.</p></div>`
    }
    <nav class="pager" aria-label="Verbetes vizinhos">
      ${prev ? `<a href="${PAGE.article(sectionKey, prev.slug)}"><span>← Anterior</span>${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a class="pager__next" href="${PAGE.article(sectionKey, next.slug)}"><span>Próximo →</span>${esc(next.title)}</a>` : '<span></span>'}
    </nav>
  </div>`
    return {
      file: PAGE.article(sectionKey, a.slug),
      shell: { title: `${a.title} · Kael Draken`, description: a.summary, active: sectionKey === 'mitologia' ? 'mitologia' : 'ressonancia', body },
    }
  })
}

export function mythologyPages(ctx: Ctx): PageSpec[] {
  const list = articles('mitologia')
  const myth = mysteries.filter((m) => m.relatedHref.startsWith('/mitologia'))
  const diptych = `<div class="diptych">
      <a class="diptych__item" href="${PAGE.article('mitologia', 'a-chama-do-dragao')}">${cardImage(ctx, ART.selo.chama)}<span class="diptych__caption"><span class="eyebrow">Criação</span><span class="diptych__title">A Chama do Dragão</span></span></a>
      <a class="diptych__item" href="${PAGE.article('mitologia', 'a-ascensao-do-caos')}">${cardImage(ctx, ART.selo.caos)}<span class="diptych__caption"><span class="eyebrow">O que nasceu junto</span><span class="diptych__title">O Caos</span></span></a>
    </div>
    <p class="art-note">Selos simbólicos do Arquivo — não representam a aparência da Chama nem a do Caos, cuja natureza integral não é revelada neste arquivo.</p>`
  const index: PageSpec = {
    file: PAGE.mythology,
    shell: {
      title: 'Mitologia e história antiga · Kael Draken',
      description: 'A história do mundo de Kael Draken contada como um livro de crônicas, da criação ao presente.',
      active: 'mitologia',
      body: `${pageHero({ eyebrow: 'Crônica', title: 'Mitologia e história antiga', lede: 'A história do mundo contada como um livro de crônicas, da criação ao presente. Cada capítulo traz o seu estado editorial: o que está estabelecido, o que é proposta e o que permanece desconhecido — também para quem vive neste mundo.', crumbs: [{ label: 'Mitologia' }] })}
  <section class="section"><div class="wrap">
    <header class="head"><p class="eyebrow">Os fundamentos</p><h2>A Chama e o Caos</h2><p class="head__lede">A Chama do Dragão criou o mundo. Com a criação surgiu o Caos, a princípio contido pela Chama. Quando a Chama desapareceu, durante a catástrofe que destruiu Safra, o equilíbrio se rompeu — e o Caos pôde se tornar uma ameaça.</p></header>
    ${diptych}
  </div></section>
  <section class="section"><div class="wrap narrow">
    <header class="head"><p class="eyebrow">Índice</p><h2>Capítulos da crônica</h2></header>
    ${rows(list.map((a, i) => ({ href: PAGE.article('mitologia', a.slug), num: toRoman(i + 1), title: a.title, text: [a.subtitle, a.summary].filter(Boolean).join('. '), badge: canonBadge(a.canon) })))}
  </div></section>
  ${
    myth.length
      ? `<section class="section"><div class="wrap narrow">
    <header class="head"><p class="eyebrow">Perguntas em aberto</p><h2>Mistérios preservados</h2><p class="head__lede">Lacunas intencionais da história. Elas permanecem mistérios até que sejam resolvidas na própria narrativa.</p></header>
    ${mysteryList(ctx, myth)}
    <p class="section-more"><a class="text-link" href="${PAGE.mysteries}">Ver todos os mistérios ${ARROW}</a></p>
  </div></section>`
      : ''
  }`,
    },
  }
  return [index, ...articlePages(ctx, 'mitologia')]
}

export function resonancePages(ctx: Ctx): PageSpec[] {
  const list = articles('ressonancia')
  const groups = [
    { key: 'fundamentos', title: 'Fundamentos', lede: 'A origem do poder e o nome do sistema.' },
    { key: 'conceitos', title: 'Conceitos fundamentais propostos', lede: 'Nomes e definições ainda em proposta.' },
    { key: 'faces', title: 'As seis faces', lede: 'Nomes provisórios.' },
    { key: 'pratica', title: 'Manifestação, custo e sociedade', lede: 'Como, a que preço e com que consequências o poder se manifesta.' },
  ]
  const index: PageSpec = {
    file: PAGE.resonance,
    shell: {
      title: 'A Ressonância · Kael Draken',
      description: 'O sistema que descreve o poder no mundo de Kael Draken: o que está estabelecido e o que ainda é proposta.',
      active: 'ressonancia',
      body: `${pageHero({ eyebrow: 'Sistema mágico', title: 'A Ressonância', lede: 'O sistema que descreve o poder neste mundo. O que está estabelecido aparece marcado como tal; nomes e definições ainda em proposta são identificados em cada verbete.', crumbs: [{ label: 'Ressonância' }] })}
  <section class="section"><div class="wrap">${artFigure(ctx, ART.selo.ressonancia)}</div></section>
  ${groups
    .map((g) => {
      const items = list.filter((a) => a.group === g.key)
      if (!items.length) return ''
      return `<section class="section"><div class="wrap narrow">
    <header class="head"><h2>${esc(g.title)}</h2><p class="head__lede">${esc(g.lede)}</p></header>
    ${rows(items.map((a) => ({ href: PAGE.article('ressonancia', a.slug), title: a.title, text: [a.subtitle, a.summary].filter(Boolean).join('. '), badge: canonBadge(a.canon) })))}
  </div></section>`
    })
    .join('')}`,
    },
  }
  return [index, ...articlePages(ctx, 'ressonancia')]
}

// ── Cronologia ────────────────────────────────────────────────────────────

export function timelinePage(ctx: Ctx): PageSpec {
  const eventHtml = (e: (typeof events)[number]) => {
    const refs = [
      ...(e.kingdoms ?? []).map((s) => kingdoms.find((k) => k.slug === s)).filter(Boolean).map((k) => `<a href="${PAGE.kingdom(k!.slug)}">${esc(k!.name)}</a>`),
      ...(e.locations ?? []).map((s) => locations.find((l) => l.slug === s)).filter(Boolean).map((l) => `<a href="${PAGE.location(l!.slug)}">${esc(l!.name)}</a>`),
      ...(e.characters ?? []).map((s) => characters.find((c) => c.slug === s)).filter(Boolean).map((c) => `<a href="${PAGE.character(c!.slug)}">${esc(c!.name)}</a>`),
    ]
    const bodyHtml = ctx.md(e.body)
    return `<li class="event" id="${e.slug}">
        <p class="event__meta"><span>${esc(e.dateLabel)}</span><span class="badge badge--certeza">${esc(CERTAINTY_INFO[e.certainty as CertaintyState]?.label ?? '')}</span><span>${esc(term('event_type', e.eventType))}</span></p>
        <h3 class="event__title">${esc(e.title)}</h3>
        <p class="event__summary">${esc(e.summary)}</p>
        ${bodyHtml.trim() ? `<div class="prose prose--small">${bodyHtml}</div>` : ''}
        ${refs.length ? `<p class="event__refs">Relacionado: ${refs.join(' · ')}</p>` : ''}
      </li>`
  }
  const eraBlocks = eras
    .map((era) => {
      const list = events.filter((e) => e.era === era.slug)
      return `<section class="era" id="era-${era.slug}" aria-labelledby="era-${era.slug}-titulo">
      <header class="era__head">
        <p class="era__date">${esc(era.dateLabel)}</p>
        <h2 id="era-${era.slug}-titulo">${esc(era.name)}</h2>
        <p class="era__summary">${esc(era.summary)}</p>
        <p class="badges">${canonBadge(era.canon)}</p>
      </header>
      ${list.length ? `<ol class="events">${list.map(eventHtml).join('')}</ol>` : '<p class="muted-note">Nenhum acontecimento documentado nesta era.</p>'}
    </section>`
    })
    .join('')
  const loose = events.filter((e) => !e.era || !eras.some((x) => x.slug === e.era))
  const body = `${pageHero({ eyebrow: 'Linha do tempo', title: 'Cronologia', lede: 'Eras e acontecimentos do mundo. Cada data traz o seu grau de certeza: confirmada, aproximada, hipótese ou desconhecida.', crumbs: [{ label: 'Cronologia' }] })}
  <div class="wrap narrow timeline">
    ${eraBlocks}
    ${
      loose.length
        ? `<section class="era" aria-labelledby="era-sem-data"><header class="era__head"><p class="era__date">Fora da linha do tempo</p><h2 id="era-sem-data">Sem era definida</h2></header><ol class="events">${loose.map(eventHtml).join('')}</ol></section>`
        : ''
    }
  </div>`
  return { file: PAGE.timeline, shell: { title: 'Cronologia · Kael Draken', description: 'Eras e acontecimentos do mundo de Kael Draken, com o grau de certeza de cada data.', active: 'cronologia', body } }
}

// ── Locais ────────────────────────────────────────────────────────────────

export function locationPages(ctx: Ctx): PageSpec[] {
  const list: PageSpec = {
    file: PAGE.locations,
    shell: {
      title: 'Cidades e locais · Kael Draken',
      description: 'Vilarejos, templos e ruínas do mundo de Kael Draken.',
      active: 'locais',
      body: `${pageHero({ eyebrow: 'Geografia', title: 'Cidades e locais', lede: 'Lugares documentados no arquivo. Localizações ainda não definidas aparecem como tal — nada é preenchido por suposição.', crumbs: [{ label: 'Locais' }] })}
  <section class="section"><div class="wrap narrow">
    ${rows(
      locations.map((l) => {
        const k = kingdoms.find((x) => x.slug === l.kingdom)
        return { href: PAGE.location(l.slug), eyebrow: [term('location_category', l.category), k?.name].filter(Boolean).join(' · '), title: l.name, text: l.summary, badge: canonBadge(l.canon) }
      }),
    )}
  </div></section>`,
    },
  }
  const pages = locations.map((l): PageSpec => {
    const k = kingdoms.find((x) => x.slug === l.kingdom)
    const sections = [
      { id: 'descricao', title: 'Descrição', source: l.body },
      { id: 'importancia', title: 'Importância histórica', source: l.history },
    ].map((s) => ({ ...s, html: ctx.md(s.source, { headingOffset: 1, idPrefix: `${s.id}-` }) }))
    const lEvents = events.filter((e) => e.locations?.includes(l.slug))
    const people = characters.filter((c) => c.origin === l.slug)
    const art = artImage('location', l.slug)
    const body = `${pageHero({ eyebrow: term('location_category', l.category) || 'Local', title: l.name, crumbs: [{ label: 'Locais', href: PAGE.locations }, { label: l.name }], badges: canonBadge(l.canon) })}
  <div class="wrap layout">
    <aside class="layout__aside">
      <div class="infobox">
        ${facts([
          { label: 'Categoria', value: esc(term('location_category', l.category)) },
          { label: 'Reino', value: k ? `<a href="${PAGE.kingdom(k.slug)}">${esc(k.name)}</a>` : muted('Não definido') },
          { label: 'Localização', value: muted('Ainda não definida no mapa') },
        ])}
      </div>
    </aside>
    <div class="layout__main">
      <p class="lead">${esc(l.summary)}</p>
      ${art ? artFigure(ctx, art) : ''}
      ${sections.map((s) => section(s.id, s.title, s.html)).join('')}
      ${pendingBox([...sections.filter((s) => !s.html.trim()).map((s) => s.title), 'Geografia', 'Habitantes e atividades econômicas'])}
      ${
        lEvents.length || people.length
          ? `<section class="entry-section" aria-labelledby="refs-${l.slug}"><h2 class="section-title" id="refs-${l.slug}">Referências cruzadas</h2><div class="related-grid">
        ${related('Personagens', people.map((c) => ({ href: PAGE.character(c.slug), title: c.name, meta: c.summary })))}
        ${related('Na cronologia', lEvents.map((e) => ({ href: `${PAGE.timeline}#${e.slug}`, title: e.title, meta: CERTAINTY_INFO[e.certainty as CertaintyState]?.label })))}
      </div></section>`
          : ''
      }
    </div>
  </div>`
    return { file: PAGE.location(l.slug), shell: { title: `${l.name} · Kael Draken`, description: l.summary, active: 'locais', body } }
  })
  return [list, ...pages]
}

// ── Manuscritos ───────────────────────────────────────────────────────────

export function documentPages(ctx: Ctx): PageSpec[] {
  const list: PageSpec = {
    file: PAGE.documents,
    shell: {
      title: 'Manuscritos e documentos antigos · Kael Draken',
      description: 'Profecias, pergaminhos e fragmentos do universo de Kael Draken, com origem, contexto e grau de confiabilidade.',
      active: 'manuscritos',
      body: `${pageHero({ eyebrow: 'Arquivo', title: 'Manuscritos e documentos antigos', lede: 'Um arquivo recolhido entre ruínas e bibliotecas. Cada documento traz sua transcrição, sua origem conhecida, seu contexto e o grau de confiança que merece — alguns contradizem a história oficial.', crumbs: [{ label: 'Manuscritos' }] })}
  <section class="section"><div class="wrap">
    ${artFigure(ctx, ILLUSTRATION.capitulo7)}
    <div class="narrow-block">
    ${rows(documents.map((d) => ({ href: PAGE.document(d.slug), eyebrow: term('document_type', d.docType), title: d.title, text: `“${d.excerpt}” — Origem: ${d.origin} Confiabilidade: ${RELIABILITY_INFO[d.reliability as ReliabilityState]?.label ?? ''}.`, badge: canonBadge(d.canon) })))}
    </div>
  </div></section>`,
    },
  }
  const pages = documents.map((d): PageSpec => {
    const art = artImage('document', d.slug)
    const reliability = RELIABILITY_INFO[d.reliability as ReliabilityState]
    const body = `${pageHero({ eyebrow: term('document_type', d.docType) || 'Documento', title: d.title, crumbs: [{ label: 'Manuscritos', href: PAGE.documents }, { label: d.title }], badges: canonBadge(d.canon) })}
  <div class="wrap layout layout--doc">
    <div class="layout__main">
      <article class="doc-sheet">
        <h2 class="doc-sheet__label">Transcrição</h2>
        <blockquote class="doc-sheet__text">${d.transcription
          .split('\n')
          .map((line) => `<span>${esc(line)}</span>`)
          .join('')}</blockquote>
        <h2 class="doc-sheet__label">Contexto</h2>
        <div class="prose prose--paper">${ctx.md(d.context)}</div>
      </article>
    </div>
    <aside class="layout__aside">
      <div class="infobox">
        ${facts([
          { label: 'Origem', value: esc(d.origin) },
          { label: 'Data', value: esc(d.dateLabel) },
          { label: 'Confiabilidade', value: reliability ? `${esc(reliability.label)} ${muted(`— ${reliability.description}`)}` : null },
          { label: 'Assuntos', value: (d.tags ?? []).map((t) => esc(term('tag', t) || t)).join(', ') || null },
        ])}
      </div>
      ${art ? artFigure(ctx, art, 'art-figure art-figure--aside') : ''}
    </aside>
  </div>`
    return { file: PAGE.document(d.slug), shell: { title: `${d.title} · Kael Draken`, description: d.excerpt, active: 'manuscritos', body } }
  })
  return [list, ...pages]
}

// ── Mistérios ─────────────────────────────────────────────────────────────

function mysteryList(ctx: Ctx, items: typeof mysteries): string {
  return `<ul class="mysteries">${items
    .map((m) => {
      const page = ctx.links.resolve(m.relatedHref)
      return `<li class="mystery"><span class="mystery__mark" aria-hidden="true">?</span><div><p class="mystery__title">${page ? `<a href="${page.href}">${esc(m.title)}</a>` : esc(m.title)}</p><p class="mystery__text">${esc(m.description)}</p></div></li>`
    })
    .join('')}</ul>`
}

export function mysteriesPage(ctx: Ctx): PageSpec {
  const selo = asset(ctx, ART.selo.skrugheim.src)
  const body = `${pageHero({ eyebrow: 'Perguntas em aberto', title: 'Mistérios', lede: 'Lacunas intencionais da história. Nenhuma delas é respondida neste arquivo: as perguntas permanecem abertas até que a própria narrativa as resolva.', crumbs: [{ label: 'Mistérios' }] })}
  <section class="prophecy prophecy--art" aria-labelledby="profecia-titulo">
    <img class="prophecy__art" src="${selo.src}" width="${selo.width}" height="${selo.height}" alt="" loading="lazy" decoding="async">
    <figure class="wrap">
      <p class="eyebrow" id="profecia-titulo">A profecia</p>
      <blockquote>${prophecyLines()
        .map((l) => `<span>${esc(l)}</span>`)
        .join('')}</blockquote>
      <figcaption>O que é Skrugheim permanece desconhecido. <a href="${PAGE.document('quando-a-chama-despertar')}">Ver o documento no arquivo</a></figcaption>
    </figure>
  </section>
  <section class="section"><div class="wrap narrow">
    <header class="head"><h2>As perguntas</h2></header>
    ${mysteryList(ctx, mysteries)}
  </div></section>`
  return { file: PAGE.mysteries, shell: { title: 'Mistérios · Kael Draken', description: 'As perguntas em aberto do universo de Kael Draken — e a profecia de Skrugheim.', active: 'misterios', body } }
}
