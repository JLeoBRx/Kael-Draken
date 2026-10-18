/**
 * Gera a versão em HTML do Arquivo da Chama Antiga: páginas estáticas, em
 * HTML, CSS e JavaScript puros, que abrem em qualquer navegador sem servidor
 * (duplo clique em html/index.html) e podem ser hospedadas de graça (GitHub
 * Pages, Netlify, qualquer servidor de arquivos).
 *
 *   npm run html
 *
 * Usa os mesmos dados e as mesmas artes do site (src/lib/seed/content.ts e
 * src/lib/atlas/art.ts). Como uma página estática não tem como esconder texto
 * de quem abre o código, os trechos e verbetes marcados como spoiler NÃO
 * entram nesta versão — o script confere isso e para se algo vazar.
 *
 * Saída:
 *   html/*.html               início, livro, atlas, reinos, personagens,
 *                             mitologia, ressonância, cronologia, locais,
 *                             manuscritos e mistérios
 *   html/assets/…             imagens otimizadas (WebP), site.css e site.js
 *   <destino>/artefato.html   (com --artefato <destino>) a página inicial sem
 *                             o envelope <html>/<head>, para publicação como
 *                             Artifact (as demais páginas vão como arquivos)
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { build } from 'esbuild'
import sharp from 'sharp'
import { ART } from '../../src/lib/atlas/art'
import { chapterLabel } from '../../src/lib/illustrations'
import {
  SEED_ARTICLES,
  SEED_CHAPTERS,
  SEED_CHARACTERS,
  SEED_EVENTS,
  SEED_ILLUSTRATIONS,
  SEED_KINGDOMS,
  SEED_MYSTERIES,
  SEED_SETTINGS,
} from '../../src/lib/seed/content'
import type { AtlasAssets } from './atlas'
import { LinkTable, createMarkdown, fragment, imageRefs, shell, type Img } from './kit'
import {
  allMarkdown,
  atlasPage,
  bookPage,
  characterPages,
  documentPages,
  homePage,
  kingdomPages,
  locationPages,
  mysteriesPage,
  mythologyPages,
  registerLinks,
  resonancePages,
  timelinePage,
  type Ctx,
  type Illustration,
  type PageSpec,
} from './pages'

const ROOT = path.resolve(__dirname, '..', '..')
const OUT = path.join(ROOT, 'html')
const ASSETS = path.join(OUT, 'assets')
const PUBLIC = path.join(ROOT, 'public')

const publicFile = (src: string) => path.join(PUBLIC, src.replace(/^\//, ''))

async function webp(src: string, dest: string, width: number, quality = 80): Promise<Img> {
  const out = path.join(ASSETS, dest)
  mkdirSync(path.dirname(out), { recursive: true })
  const info = await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 6 }).toFile(out)
  return { src: `assets/${dest}`, width: info.width, height: info.height }
}

function copy(src: string, dest: string) {
  const out = path.join(ASSETS, dest)
  mkdirSync(path.dirname(out), { recursive: true })
  copyFileSync(src, out)
  return `assets/${dest}`
}

function findIllustration(slug: string): string {
  for (const ext of ['png', 'webp', 'jpg', 'jpeg']) {
    const file = path.join(PUBLIC, 'images', 'livro-1', 'ilustracoes', `${slug}.${ext}`)
    if (existsSync(file)) return file
  }
  throw new Error(`Ilustração não encontrada: ${slug}`)
}

async function buildAssets() {
  const art = new Map<string, Img>()
  const add = async (src: string, dest: string, width: number, quality?: number) => art.set(src, await webp(publicFile(src), dest, width, quality))

  await add(ART.mapaOriginal.src, 'mapa-original.webp', 1536, 82)
  await add(ART.mapaConhecido.src, 'mapa-conhecido.webp', 1536, 82)
  await add(ART.frontispicio.src, 'frontispicio.webp', 900, 80)
  await add(ART.cenaCapa.src, 'cena.webp', 907, 80)
  await add(ART.painelReinos.src, 'painel-seis-reinos.webp', 1600, 80)
  for (const selo of Object.values(ART.selo)) await add(selo.src, `selos/${path.basename(selo.src)}`, 1200, 82)

  const realmCard: Record<string, Img> = {}
  const emblem: Record<string, Img> = {}
  for (const [slug, entry] of Object.entries(ART.reino)) {
    await add(entry.src, `carta/${slug}.webp`, 1100, 82)
    realmCard[slug] = await webp(publicFile(entry.src), `carta/${slug}-cartao.webp`, 640, 78)
    const svg = path.join(PUBLIC, 'images', 'atlas', 'brasoes', `${slug}.svg`)
    if (existsSync(svg)) emblem[slug] = { src: copy(svg, `brasoes/${slug}.svg`), width: 240, height: 280 }
  }

  // imagens citadas nos textos ([…](/images/…))
  const contentImages = new Map<string, Img>()
  for (const ref of new Set(allMarkdown().flatMap(imageRefs))) {
    contentImages.set(ref, art.get(ref) ?? (await webp(publicFile(ref), `conteudo/${path.basename(ref).replace(/\.\w+$/, '')}.webp`, 1400, 80)))
  }

  const cover = await webp(path.join(PUBLIC, 'capa', 'capa-oficial.webp'), 'capa.webp', 720, 84)
  const coverFull = await webp(path.join(PUBLIC, 'capa', 'capa-completa.webp'), 'capa-completa.webp', 1600, 82)

  const illustrations: Illustration[] = []
  for (const ill of SEED_ILLUSTRATIONS) {
    const file = findIllustration(ill.slug)
    const thumb = await webp(file, `ilustracoes/${ill.slug}-p.webp`, 560, 78)
    const large = await webp(file, `ilustracoes/${ill.slug}.webp`, 1400, 82)
    const chapter = SEED_CHAPTERS.find((c) => c.number === ill.chapter)!
    illustrations.push({ slug: ill.slug, chapter: ill.chapter, label: chapterLabel(ill.chapter), title: chapter.title, caption: ill.caption, alt: ill.alt, artState: ill.artState, thumb, large })
  }

  copy(path.join(ROOT, 'src', 'app', 'icon.svg'), 'icone.svg')
  copy(path.join(__dirname, 'standalone.css'), 'site.css')
  copy(path.join(__dirname, 'site.js'), 'site.js')
  const atlas = await buildAtlas(art, realmCard)
  return { art, realmCard, emblem, contentImages, cover, coverFull, illustrations, atlas }
}

const dataUri = (file: string, type: string) => `data:${type};base64,${readFileSync(file).toString('base64')}`

/**
 * Atlas interativo: o 3D do site empacotado num script clássico, a máscara de
 * terra embutida na página e, para quem abre as páginas direto do disco (onde
 * o WebGL não pode ler imagens de arquivos), a carta e o relevo embutidos em
 * assets/atlas-dados.js — carregado só quando o 3D é aberto.
 */
async function buildAtlas(art: Map<string, Img>, realmCard: Record<string, Img>): Promise<AtlasAssets> {
  const maps = { original: art.get(ART.mapaOriginal.src)!, conhecido: art.get(ART.mapaConhecido.src)! }
  const relevoSrc = path.join(PUBLIC, 'images', 'atlas', 'relevo-mundo.png')
  const heightmap = { src: copy(relevoSrc, 'relevo-mundo.png'), width: 600, height: 400 }
  const maskDataUri = dataUri(path.join(PUBLIC, 'images', 'atlas', 'mascara-terra.png'), 'image/png')

  await build({
    entryPoints: [path.join(__dirname, 'atlas3d-entry.ts')],
    bundle: true,
    format: 'iife',
    minify: true,
    target: ['es2020'],
    platform: 'browser',
    tsconfig: path.join(ROOT, 'tsconfig.json'),
    legalComments: 'eof',
    outfile: path.join(ASSETS, 'atlas3d.js'),
    logLevel: 'warning',
  })
  copy(path.join(__dirname, 'atlas-pagina.js'), 'atlas.js')

  const embedded = {
    original: dataUri(path.join(OUT, maps.original.src), 'image/webp'),
    conhecido: dataUri(path.join(OUT, maps.conhecido.src), 'image/webp'),
    relevo: dataUri(relevoSrc, 'image/png'),
  }
  writeFileSync(
    path.join(ASSETS, 'atlas-dados.js'),
    `// Carta e relevo embutidos para o modo 3D quando as páginas são abertas direto do disco (file://).\nwindow.KAEL_ATLAS_DADOS = ${JSON.stringify(embedded)};\n`,
  )
  return { maps, maskDataUri, heightmap, realmCard, bundle: 'assets/atlas3d.js', embedded: 'assets/atlas-dados.js' }
}

// ── Conferências ──────────────────────────────────────────────────────────

/** Todo link e toda imagem relativos precisam existir (e as âncoras, na página de destino). */
function checkLinks(files: string[]) {
  const problems: string[] = []
  const ids = new Map<string, Set<string>>()
  const idsOf = (file: string) => {
    if (!ids.has(file)) ids.set(file, new Set([...readFileSync(path.join(OUT, file), 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])))
    return ids.get(file)!
  }
  for (const file of files) {
    const html = readFileSync(path.join(OUT, file), 'utf8')
    const refs = [
      ...html.matchAll(/\s(?:href|src|data-original|data-conhecido)="([^"]+)"/g),
      ...html.matchAll(/url\('([^']+)'\)/g),
      // caminhos citados em dados JSON (configuração do Atlas)
      ...html.matchAll(/"(assets\/[^"#?]+)"/g),
    ].map((m) => m[1])
    for (const ref of refs) {
      if (/^(https?:|mailto:|data:)/.test(ref)) continue
      const [target, hash] = ref.split('#')
      const dest = target || file
      if (target && !existsSync(path.join(OUT, target))) problems.push(`${file}: ${ref} não existe`)
      else if (hash && dest.endsWith('.html') && !idsOf(dest).has(decodeURIComponent(hash))) problems.push(`${file}: âncora #${hash} não existe em ${dest}`)
    }
  }
  if (problems.length) throw new Error(`Links quebrados na versão HTML:\n  ${problems.join('\n  ')}`)
}

/** Nenhum trecho ou verbete de spoiler pode aparecer nas páginas geradas. */
function checkSpoilers(files: string[]) {
  const sources = [
    ...allMarkdown(),
    SEED_SETTINGS.announcement_body ?? '',
    ...SEED_KINGDOMS.map((k) => k.history ?? ''),
    ...SEED_CHARACTERS.map((c) => c.secrets ?? ''),
    ...SEED_ARTICLES.map((a) => a.body ?? ''),
  ]
  const secrets = new Set<string>()
  for (const src of sources) {
    for (const m of src.matchAll(/^:::[ \t]*spoiler[^\n]*\n([\s\S]*?)\n:::[ \t]*$/gm)) {
      for (const line of m[1].split('\n')) {
        const plain = line.replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, '$1').replace(/[*_>`]/g, '').trim()
        if (plain.length > 12) secrets.add(plain.slice(0, 48))
      }
    }
  }
  for (const e of SEED_EVENTS.filter((x) => (x.spoiler ?? 0) > 0)) secrets.add(e.title).add(e.summary.slice(0, 48))
  for (const m of SEED_MYSTERIES.filter((x) => (x.spoiler ?? 0) > 0)) secrets.add(m.description.slice(0, 48))
  const leaks: string[] = []
  for (const file of files) {
    const html = readFileSync(path.join(OUT, file), 'utf8')
    for (const s of secrets) if (html.includes(s.replace(/&/g, '&amp;').replace(/"/g, '&quot;'))) leaks.push(`${file}: “${s}”`)
  }
  if (leaks.length) throw new Error(`Trechos de spoiler na versão HTML:\n  ${leaks.join('\n  ')}`)
  return secrets.size
}

// ── Geração ───────────────────────────────────────────────────────────────

async function main() {
  const artifactIdx = process.argv.indexOf('--artefato')
  const artifactDir = artifactIdx > 0 ? process.argv[artifactIdx + 1] : null

  // limpa a saída anterior (mantém o LEIA-ME)
  rmSync(ASSETS, { recursive: true, force: true })
  mkdirSync(ASSETS, { recursive: true })
  for (const f of readdirSync(OUT)) if (f.endsWith('.html')) rmSync(path.join(OUT, f))

  console.log('Imagens…')
  const a = await buildAssets()

  const links = new LinkTable()
  registerLinks(links)
  const ctx: Ctx = {
    art: a.art,
    realmCard: a.realmCard,
    emblem: a.emblem,
    cover: a.cover,
    coverFull: a.coverFull,
    illustrations: a.illustrations,
    md: createMarkdown(links, a.contentImages),
    links,
    author: SEED_SETTINGS.author_name ?? '',
    atlas: a.atlas,
  }

  console.log('Páginas…')
  const pages: PageSpec[] = [
    homePage(ctx),
    bookPage(ctx),
    atlasPage(ctx),
    ...kingdomPages(ctx),
    ...characterPages(ctx),
    ...mythologyPages(ctx),
    ...resonancePages(ctx),
    timelinePage(ctx),
    ...locationPages(ctx),
    ...documentPages(ctx),
    mysteriesPage(ctx),
  ]
  for (const p of pages) writeFileSync(path.join(OUT, p.file), shell({ ...p.shell, author: ctx.author }))

  const files = pages.map((p) => p.file)
  checkLinks(files)
  const checked = checkSpoilers(files)
  console.log(`  ${files.length} páginas · links conferidos · ${checked} trechos de spoiler confirmados como ausentes`)

  if (artifactDir) {
    mkdirSync(artifactDir, { recursive: true })
    const home = pages.find((p) => p.file === 'index.html')!
    // título estável do Artifact publicado (o nome do livro)
    writeFileSync(path.join(artifactDir, 'artefato.html'), fragment({ ...home.shell, title: 'O Sussurro da Chama Antiga', author: ctx.author }))
  }
  console.log(`Pronto: ${path.relative(ROOT, OUT)}/index.html`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
