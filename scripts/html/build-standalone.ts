/**
 * Gera a versão em HTML puro do lançamento do Livro I — uma página só, que
 * abre em qualquer navegador sem servidor (duplo clique em html/index.html)
 * e pode ser hospedada de graça (GitHub Pages, Netlify, qualquer servidor
 * de arquivos).
 *
 *   npm run html
 *
 * Usa os mesmos dados do site (src/lib/seed/content.ts) e as mesmas imagens.
 * Como uma página estática não tem como esconder texto de quem abre o código,
 * os trechos marcados como spoiler NÃO entram nesta versão.
 *
 * Saída:
 *   html/index.html          página completa
 *   html/assets/…            imagens otimizadas (WebP)
 *   <destino>/artefato.html  (com --artefato <destino>) a mesma página sem o
 *                            envelope <html>/<head>, para publicação como Artifact
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { renderMarkdown } from '../../src/lib/markdown/render'
import { ART_INFO } from '../../src/lib/editorial'
import { chapterLabel } from '../../src/lib/illustrations'
import { toRoman } from '../../src/lib/format'
import {
  OFFICIAL_BOOK_SYNOPSIS,
  SEED_BOOK,
  SEED_CHAPTERS,
  SEED_DOCUMENTS,
  SEED_ILLUSTRATIONS,
  SEED_KINGDOMS,
  SEED_SETTINGS,
} from '../../src/lib/seed/content'

const ROOT = path.resolve(__dirname, '..', '..')
const OUT = path.join(ROOT, 'html')
const ASSETS = path.join(OUT, 'assets')
const PUBLIC = path.join(ROOT, 'public')

/** Capitais como aparecem na carta do manuscrito (conceituais). */
const CAPITALS: Record<string, string> = {
  safra: 'Templo da Chama (ruínas)',
  aurelion: 'Auréstria',
  nacaris: 'Velária, sede da confederação',
  kharveth: 'Vhaldris',
  elyndor: 'Ithária',
  rhovaryn: 'Avarra',
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Remove blocos de spoiler (qualquer nível) e renderiza como o site faz para quem não escolheu spoilers. */
function md(source: string): string {
  const withoutSpoilers = source.replace(/^:::[ \t]*spoiler[^\n]*\n[\s\S]*?\n:::[ \t]*$/gm, '')
  return renderMarkdown(withoutSpoilers, { spoiler: 0 }).html
}

function findIllustration(slug: string): string {
  for (const ext of ['png', 'webp', 'jpg', 'jpeg']) {
    const file = path.join(PUBLIC, 'images', 'livro-1', 'ilustracoes', `${slug}.${ext}`)
    if (existsSync(file)) return file
  }
  throw new Error(`Ilustração não encontrada: ${slug}`)
}

async function webp(src: string, dest: string, width: number, quality = 80) {
  const out = path.join(ASSETS, dest)
  mkdirSync(path.dirname(out), { recursive: true })
  const info = await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality, effort: 6 }).toFile(out)
  return { src: `assets/${dest}`, width: info.width, height: info.height }
}

async function main() {
  const artifactIdx = process.argv.indexOf('--artefato')
  const artifactDir = artifactIdx > 0 ? process.argv[artifactIdx + 1] : null
  rmSync(ASSETS, { recursive: true, force: true })
  mkdirSync(ASSETS, { recursive: true })

  console.log('Imagens…')
  const cover = await webp(path.join(PUBLIC, 'capa', 'capa-oficial.webp'), 'capa.webp', 720, 84)
  const mapOriginal = await webp(path.join(PUBLIC, 'images', 'atlas', 'mapa-mundo-original.webp'), 'mapa-original.webp', 1536, 82)
  const mapKnown = await webp(path.join(PUBLIC, 'images', 'atlas', 'mapa-mundo-conhecido.webp'), 'mapa-conhecido.webp', 1536, 82)
  const scene = await webp(path.join(PUBLIC, 'capa', 'cena-capa.webp'), 'cena.webp', 907, 80)
  const realmMaps: Record<string, Img> = {}
  for (const k of SEED_KINGDOMS) {
    realmMaps[k.slug] = await webp(path.join(PUBLIC, 'images', 'atlas', 'carta', `${k.slug}.webp`), `carta/${k.slug}.webp`, 640, 78)
  }
  const illustrations = []
  for (const ill of SEED_ILLUSTRATIONS) {
    const file = findIllustration(ill.slug)
    const thumb = await webp(file, `ilustracoes/${ill.slug}-p.webp`, 560, 78)
    const large = await webp(file, `ilustracoes/${ill.slug}.webp`, 1400, 82)
    const chapter = SEED_CHAPTERS.find((c) => c.number === ill.chapter)!
    illustrations.push({ ...ill, thumb, large, title: chapter.title, label: chapterLabel(ill.chapter) })
  }

  const prophecy = SEED_DOCUMENTS.find((d) => d.slug === 'quando-a-chama-despertar')!
  const announcement = md(SEED_SETTINGS.announcement_body ?? '')
  const synopsis = md(OFFICIAL_BOOK_SYNOPSIS)
  const siteUrl = process.env.SITE_URL && !/localhost|127\.0\.0\.1/.test(process.env.SITE_URL) ? process.env.SITE_URL : null

  const body = page({ cover, scene, realmMaps, mapOriginal, mapKnown, illustrations, prophecy: prophecy.transcription, announcement, synopsis, siteUrl })
  const head = `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${esc('O Sussurro da Chama Antiga está de volta. Capa, sinopse oficial, as ilustrações dos dez primeiros capítulos e o Atlas dos Seis Reinos.')}">
<meta property="og:title" content="Kael Draken — O Sussurro da Chama Antiga">
<meta property="og:description" content="O livro voltou.">
<meta property="og:image" content="${cover.src}">`

  writeFileSync(path.join(OUT, 'index.html'), `<!doctype html>\n<html lang="pt-BR">\n<head>\n${head}\n${body.head}\n</head>\n<body>\n${body.content}\n</body>\n</html>\n`)
  if (artifactDir) {
    mkdirSync(artifactDir, { recursive: true })
    writeFileSync(path.join(artifactDir, 'artefato.html'), `${body.head}\n${body.content}\n`)
  }
  console.log(`Pronto: ${path.relative(ROOT, path.join(OUT, 'index.html'))}`)
}

interface Img {
  src: string
  width: number
  height: number
}

function page(d: {
  cover: Img
  scene: Img
  realmMaps: Record<string, Img>
  mapOriginal: Img
  mapKnown: Img
  illustrations: Array<{ slug: string; chapter: number; label: string; title: string; caption: string; alt: string; artState: string; thumb: Img; large: Img }>
  prophecy: string
  announcement: string
  synopsis: string
  siteUrl: string | null
}) {
  const genres = ['Fantasia', 'Aventura', 'Mistério', 'Destino']
  const cards = d.illustrations
    .map(
      (it, i) => `
      <li class="plate" id="${it.slug}">
        <button type="button" class="plate__frame" data-index="${i}" aria-label="Ampliar a ilustração do ${esc(it.label.toLowerCase())}: ${esc(it.title)}">
          <img src="${it.thumb.src}" width="${it.thumb.width}" height="${it.thumb.height}" alt="" loading="lazy" decoding="async">
        </button>
        <p class="plate__num">${esc(it.label)}</p>
        <p class="plate__title">${esc(it.title)}</p>
        ${it.artState !== 'final' ? `<p class="plate__state">${esc(ART_INFO[it.artState as keyof typeof ART_INFO].label)}</p>` : ''}
      </li>`,
    )
    .join('')
  const viewerData = JSON.stringify(
    d.illustrations.map((it) => ({
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
  const kingdoms = SEED_KINGDOMS.map(
    (k, i) => `
        <li class="realm${k.slug === 'safra' ? ' realm--lost' : ''}">
          ${d.realmMaps[k.slug] ? `<img class="realm__map" src="${d.realmMaps[k.slug].src}" width="${d.realmMaps[k.slug].width}" height="${d.realmMaps[k.slug].height}" alt="${esc(`${k.name} na carta do manuscrito`)}" loading="lazy" decoding="async">` : ''}
          <p class="realm__num">${toRoman(i + 1)}</p>
          <h3 class="realm__name">${esc(k.name)}</h3>
          <p class="realm__epithet">${esc(k.epithet || k.government || '')}</p>
          <p class="realm__summary">${esc(k.summary)}</p>
          <p class="realm__capital"><span>Na carta</span> ${esc(CAPITALS[k.slug] ?? '')}</p>
          <p class="realm__state">${k.canon === 'canonico' ? 'Estabelecido' : 'Proposta'}</p>
        </li>`,
  ).join('')

  const head = `<title>O Sussurro da Chama Antiga</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,500&family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;1,7..72,400&display=swap">
<style>${CSS}</style>`

  const content = `
<header class="mast">
  <p class="mast__brand"><span class="mast__mark" aria-hidden="true">${FLAME_SVG}</span>Kael Draken <span class="mast__sub">Arquivo da Chama Antiga</span></p>
  <nav class="mast__nav" aria-label="Seções">
    <a href="#livro">O livro</a><a href="#ilustracoes">Ilustrações</a><a href="#atlas">Atlas</a>
  </nav>
</header>

<main>
  <section class="opening" aria-labelledby="anuncio" style="--scene: url('${d.scene.src}')">
    <div class="scroll">
      <div class="scroll__rod" aria-hidden="true"></div>
      <article class="scroll__sheet">
        <div class="scroll__inner">
          <span class="scroll__emblem" aria-hidden="true">${EMBLEM_SVG}</span>
          <p class="scroll__kicker">${esc(SEED_SETTINGS.announcement_kicker ?? '')}</p>
          <h1 class="scroll__title" id="anuncio">${esc(SEED_SETTINGS.announcement_title ?? 'O livro voltou')}</h1>
          <span class="scroll__divider" aria-hidden="true">${DIVIDER_SVG}</span>
          <div class="scroll__body">${d.announcement}</div>
          <p class="scroll__actions"><a class="btn btn--ember" href="#livro">Conhecer o Livro I</a><a class="btn btn--ink" href="#ilustracoes">Ver as ilustrações</a></p>
        </div>
        <span class="scroll__seal" aria-hidden="true">${SEAL_SVG}</span>
      </article>
      <div class="scroll__rod" aria-hidden="true"></div>
    </div>
  </section>

  <section class="book" id="livro" aria-labelledby="livro-titulo">
    <div class="wrap book__grid">
      <figure class="book__cover">
        <img src="${d.cover.src}" width="${d.cover.width}" height="${d.cover.height}" alt="Capa de Kael Draken — Livro I: O Sussurro da Chama Antiga. Um jovem de capa vermelha, de costas, olha para uma cidade de torres ao entardecer, sob a sombra de um dragão.">
      </figure>
      <div class="book__text">
        <p class="eyebrow">${esc(SEED_BOOK.subtitle)}</p>
        <h2 class="book__title" id="livro-titulo">${esc(SEED_BOOK.title)}</h2>
        <p class="book__author">${esc(SEED_SETTINGS.author_name ?? '')}</p>
        ${SEED_SETTINGS.book_epigraph ? `<blockquote class="book__epigraph">“${esc(SEED_SETTINGS.book_epigraph)}”</blockquote>` : ''}
        <div class="book__synopsis">${d.synopsis}</div>
        <ul class="genres" aria-label="Gêneros">${genres.map((g) => `<li>${g}</li>`).join('')}</ul>
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
      <ol class="plates__grid">${cards}
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
      <div class="atlas__switch" role="group" aria-label="Versão do mapa">
        <button type="button" class="atlas__opt" aria-pressed="true" data-map="original">Mundo original <span>seis reinos</span></button>
        <button type="button" class="atlas__opt" aria-pressed="false" data-map="conhecido">Mundo conhecido <span>versão oficial · cinco reinos</span></button>
      </div>
      <button type="button" class="atlas__map" aria-label="Ampliar o mapa">
        <img id="mapa" src="${d.mapOriginal.src}" data-original="${d.mapOriginal.src}" data-conhecido="${d.mapKnown.src}" width="${d.mapOriginal.width}" height="${d.mapOriginal.height}" loading="lazy" decoding="async"
          alt="Carta ilustrada do Atlas dos Seis Reinos: Aurelion, Nácaris, Elyndor, Rhovaryn, Kharveth e, ao centro-sul, Safra, com o Templo da Chama em ruínas.">
      </button>
      <p class="atlas__note">Carta do manuscrito. Nomes, capitais, fronteiras e brasões são conceituais e podem mudar.</p>
      <ol class="realms">${kingdoms}
      </ol>
    </div>
  </section>

  <section class="prophecy" aria-label="Profecia">
    <figure class="wrap">
      <blockquote>${d.prophecy
        .split('\n')
        .map((l) => `<span>${esc(l)}</span>`)
        .join('')}</blockquote>
      <figcaption>Profecia · O Sussurro da Chama Antiga</figcaption>
    </figure>
  </section>
</main>

<footer class="foot">
  <div class="wrap foot__grid">
    <p class="foot__brand">Kael Draken <em>O Sussurro da Chama Antiga</em></p>
    ${d.siteUrl ? `<p><a class="foot__link" href="${esc(d.siteUrl)}">Visitar o Arquivo da Chama Antiga</a></p>` : ''}
    <p class="foot__copy">© 2026 ${SEED_SETTINGS.author_name ? `${esc(SEED_SETTINGS.author_name)} · ` : ''}Kael Draken. Todos os direitos reservados.</p>
  </div>
</footer>

<dialog class="viewer" id="viewer" aria-labelledby="viewer-title">
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
</dialog>

<script>
(() => {
  const items = ${viewerData};
  const dialog = document.getElementById('viewer');
  const img = document.getElementById('viewer-img');
  const nav = document.getElementById('viewer-nav');
  let current = -1;
  let opener = null;
  const set = (id, text) => { const el = document.getElementById(id); el.textContent = text; el.hidden = !text; };
  function show(i) {
    current = (i + items.length) % items.length;
    const it = items[current];
    img.src = it.src; img.width = it.w; img.height = it.h; img.alt = it.alt;
    set('viewer-label', it.label + ' · ' + (current + 1) + ' de ' + items.length);
    set('viewer-title', it.title);
    set('viewer-state', it.state);
    set('viewer-caption', it.caption);
    document.getElementById('viewer-alt').textContent = it.alt;
    nav.hidden = false;
    dialog.querySelector('.viewer__alt').hidden = false;
  }
  function open(fn, from) {
    opener = from || document.activeElement;
    fn();
    if (!dialog.open) dialog.showModal();
  }
  document.querySelectorAll('.plate__frame').forEach((b) => b.addEventListener('click', () => open(() => show(Number(b.dataset.index)), b)));
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
    const step = e.target.closest('[data-step]');
    if (step && current >= 0) show(current + Number(step.dataset.step));
  });
  dialog.addEventListener('keydown', (e) => {
    if (current < 0) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); show(current + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(current - 1); }
  });
  let touch = null;
  dialog.addEventListener('touchstart', (e) => { touch = e.touches[0]; }, { passive: true });
  dialog.addEventListener('touchend', (e) => {
    if (!touch || current < 0) return;
    const dx = e.changedTouches[0].clientX - touch.clientX;
    const dy = e.changedTouches[0].clientY - touch.clientY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) show(current + (dx < 0 ? 1 : -1));
    touch = null;
  });
  dialog.addEventListener('close', () => { current = -1; img.removeAttribute('src'); if (opener) opener.focus({ preventScroll: true }); });

  // Mapa: alternância entre as versões e visualização ampliada
  const map = document.getElementById('mapa');
  let version = 'original';
  document.querySelectorAll('.atlas__opt').forEach((b) => b.addEventListener('click', () => {
    version = b.dataset.map;
    document.querySelectorAll('.atlas__opt').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    map.src = map.dataset[version];
  }));
  document.querySelector('.atlas__map').addEventListener('click', (e) => open(() => {
    current = -1;
    img.src = map.src; img.width = map.width; img.height = map.height; img.alt = map.alt;
    set('viewer-label', 'Atlas dos Seis Reinos');
    set('viewer-title', version === 'original' ? 'Mundo original' : 'Mundo conhecido');
    set('viewer-state', '');
    set('viewer-caption', version === 'original' ? 'Os seis reinos, antes da Noite das Cinzas.' : 'A versão oficial: Safra apagada, cinco reinos.');
    nav.hidden = true;
    dialog.querySelector('.viewer__alt').hidden = true;
  }, e.currentTarget));
})();
</script>`

  return { head, content }
}

const FLAME_SVG = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2c1.2 3 4.5 5 4.5 9.5a4.5 4.5 0 0 1-9 0c0-2 1-3.5 2-4.5.2 1.5.8 2.5 1.8 2.9-.6-2.7.1-5.5.7-7.9z" fill="currentColor"/></svg>`
const EMBLEM_SVG = `<svg viewBox="0 0 64 64" width="56" height="56"><circle cx="32" cy="32" r="29" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" stroke-width=".6" stroke-dasharray="1.5 2.5"/><path d="M32 10c3 7 11 12 11 23a11 11 0 0 1-22 0c0-5 2.5-8.5 5-11 .4 3.6 2 6 4.5 7-1.5-6.5.2-13.4 1.5-19z" fill="currentColor" opacity=".9"/><path d="M32 30c1.8 3 4.5 4.8 4.5 8.5a4.5 4.5 0 0 1-9 0c0-2.4 1.2-3.9 2.3-5 .3 1.4 1 2.3 2 2.8-.3-2.3-.3-4.4.2-6.3z" fill="#f3e5c4"/></svg>`
const DIVIDER_SVG = `<svg viewBox="0 0 240 16" width="240" height="16"><path d="M0 8h96M144 8h96" stroke="currentColor" stroke-width=".8"/><path d="M100 8l4-4 4 4-4 4zM132 8l4-4 4 4-4 4z" fill="currentColor"/><path d="M120 0l3 8-3 8-3-8z" fill="currentColor"/><circle cx="120" cy="8" r="1.4" fill="#f3e5c4"/></svg>`
const CLOSE_SVG = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`
const SEAL_SVG = (() => {
  const pts = Array.from({ length: 36 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2
    const r = 30 + Math.sin(i * 2.7) * 1.8 + Math.cos(i * 1.3) * 1.2
    return `${(40 + Math.cos(a) * r).toFixed(1)},${(40 + Math.sin(a) * r).toFixed(1)}`
  }).join(' ')
  return `<svg viewBox="0 0 80 96" width="80" height="96"><defs><radialGradient id="cera" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#c0392b"/><stop offset=".55" stop-color="#8e1b12"/><stop offset="1" stop-color="#4d0b07"/></radialGradient></defs><path d="M30 62l-8 32 10-7 6 9 4-34zM50 62l8 32-10-7-6 9-4-34z" fill="#6e1410"/><polygon points="${pts}" fill="url(#cera)"/><circle cx="40" cy="40" r="21" fill="none" stroke="#e8a28f" stroke-opacity=".35" stroke-width="1.2"/><path d="M40 24c2 5 8 8.5 8 16a8 8 0 0 1-16 0c0-3.6 1.8-6 3.6-7.8.3 2.6 1.4 4.2 3.2 5-1-4.6.2-9.4 1.2-13.2z" fill="#f2b8a6" fill-opacity=".55"/></svg>`
})()

const CSS = readFileSync(path.join(__dirname, 'standalone.css'), 'utf8')

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
