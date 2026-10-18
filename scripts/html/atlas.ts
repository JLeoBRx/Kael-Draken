/**
 * Atlas interativo da versão em HTML: a marcação (carta, regiões, painel,
 * lista e legenda) e a configuração lida por assets/atlas.js. Reproduz o
 * Atlas do site (src/components/atlas/WorldAtlas.tsx) sem React.
 */

import { ART } from '../../src/lib/atlas/art'
import { MAP_VERSIONS, WORLD, WORLD_ASPECT, polygonPath, type MapVersionId } from '../../src/lib/atlas/world'
import { CANON_INFO } from '../../src/lib/editorial'
import { SEED_KINGDOMS } from '../../src/lib/seed/content'
import { PAGE, esc, isPublic, type Img } from './kit'

export interface AtlasAssets {
  maps: Record<MapVersionId, Img>
  /** Máscara de terra embutida (data URI): serve ao recorte e ao clique mesmo aberta do disco. */
  maskDataUri: string
  heightmap: Img
  realmCard: Record<string, Img>
  /** Scripts carregados sob demanda pelo modo 3D. */
  bundle: string
  embedded: string
}

const ERASED_LABEL = 'Terras sem registro'
const VB_W = 1500

export function atlasConfig(a: AtlasAssets): string {
  const kingdoms = new Map(SEED_KINGDOMS.filter(isPublic).map((k) => [k.slug, k]))
  const regions = WORLD.regioes
    .map((r) => {
      const k = kingdoms.get(r.reino)
      if (!k) return null
      const card = a.realmCard[r.reino]
      const art = ART.reino[r.reino]
      return {
        id: r.id,
        name: k.name,
        accent: k.accent,
        polygon: r.poligono,
        label: r.rotulo,
        kicker: k.epithet || k.government || 'Reino',
        summary: k.summary,
        canon: k.canon,
        canonLabel: CANON_INFO[k.canon].label,
        href: PAGE.kingdom(k.slug),
        image: card && art ? { src: card.src, width: card.width, height: card.height, alt: art.alt, caption: art.caption } : null,
      }
    })
    .filter(Boolean)
  const versions = Object.fromEntries(
    (Object.keys(MAP_VERSIONS) as MapVersionId[]).map((id) => [
      id,
      {
        label: MAP_VERSIONS[id].label,
        sublabel: MAP_VERSIONS[id].sublabel,
        description: MAP_VERSIONS[id].description,
        erased: MAP_VERSIONS[id].erased,
        src: a.maps[id].src,
        texture: a.maps[id].src,
        alt: id === 'original' ? ART.mapaOriginal.alt : ART.mapaConhecido.alt,
      },
    ]),
  )
  return JSON.stringify({
    aspect: WORLD_ASPECT,
    erasedLabel: ERASED_LABEL,
    mask: a.maskDataUri,
    heightmap: { src: a.heightmap.src, width: WORLD.relevo.largura, height: WORLD.relevo.altura, seaLevel: WORLD.relevo.nivelDoMar },
    bundle: a.bundle,
    embedded: a.embedded,
    versions,
    regions,
  }).replace(/</g, '\\u003c')
}

export function atlasMarkup(a: AtlasAssets): string {
  const VB_H = Math.round(VB_W / WORLD_ASPECT)
  const kingdoms = new Map(SEED_KINGDOMS.filter(isPublic).map((k) => [k.slug, k]))
  const regions = WORLD.regioes.filter((r) => kingdoms.has(r.reino))
  const original = a.maps.original
  const versionButtons = (Object.keys(MAP_VERSIONS) as MapVersionId[])
    .map(
      (id) =>
        `<button type="button" data-version-btn="${id}" aria-pressed="${id === 'original'}"><span class="segmented__label">${esc(MAP_VERSIONS[id].label)}</span><span class="segmented__sub">${esc(MAP_VERSIONS[id].sublabel)}</span></button>`,
    )
    .join('')
  const paths = regions
    .map((r) => {
      const k = kingdoms.get(r.reino)!
      return `<path class="atlas-region" data-region="${r.id}" d="${polygonPath(r.poligono, VB_W, VB_H)}" style="--region-color: ${k.accent}" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(k.name)} — zona conceitual"></path>`
    })
    .join('')
  const list = regions
    .map((r) => {
      const k = kingdoms.get(r.reino)!
      return `<li><button type="button" id="regiao-${r.id}" data-region="${r.id}" aria-pressed="false" style="--region-color: ${k.accent}"><span class="region-list__swatch" aria-hidden="true"></span><span class="region-list__name">${esc(k.name)}</span><span class="region-list__meta">${esc(CANON_INFO[k.canon].label.toLowerCase())}</span></button></li>`
    })
    .join('')
  return `<section class="world-atlas" data-atlas data-mode="2d" aria-label="Mapa interativo do mundo" style="--atlas-ratio: ${(VB_W / VB_H).toFixed(4)}">
      <div class="world-atlas__bar">
        <div class="segmented" role="group" aria-label="Versão do mapa">${versionButtons}</div>
        <button type="button" class="btn btn--ember" data-atlas-enter aria-describedby="atlas-3d-desc">Explorar em 3D</button>
        <button type="button" class="btn btn--line" data-atlas-exit hidden>Voltar ao mapa 2D</button>
      </div>
      <p class="world-atlas__version-note" id="atlas-3d-desc">${esc(MAP_VERSIONS.original.description)}</p>
      <div class="world-atlas__viewport">
        <div class="world-atlas__stage">
          <div class="world-atlas__map2d">
            <img class="world-atlas__image" src="${original.src}" width="${original.width}" height="${original.height}" alt="${esc(ART.mapaOriginal.alt)}" decoding="async">
            <svg class="world-atlas__overlay" viewBox="0 0 ${VB_W} ${VB_H}" preserveAspectRatio="none">
              <defs>
                <mask id="atlas-land" maskUnits="userSpaceOnUse" x="0" y="0" width="${VB_W}" height="${VB_H}">
                  <image href="${a.maskDataUri}" x="0" y="0" width="${VB_W}" height="${VB_H}" preserveAspectRatio="none"></image>
                </mask>
              </defs>
              <g mask="url(#atlas-land)">${paths}</g>
            </svg>
            <div class="world-atlas__labels" aria-hidden="true"></div>
          </div>
          <div class="world-atlas__gl"></div>
          <div class="world-atlas__labels3d"></div>
          <p class="world-atlas__ribbon">Carta do manuscrito · nomes e fronteiras sujeitos a revisão</p>
          <p class="world-atlas__loading" role="status" hidden>Preparando o relevo…</p>
          <div class="world-atlas__controls" role="toolbar" aria-label="Controles da câmera 3D" hidden>
            <button type="button" data-cam="zoom-in" aria-label="Aproximar">+</button>
            <button type="button" data-cam="zoom-out" aria-label="Afastar">−</button>
            <button type="button" data-cam="left" aria-label="Girar para a esquerda">⟲</button>
            <button type="button" data-cam="right" aria-label="Girar para a direita">⟳</button>
            <button type="button" data-cam="up" aria-label="Inclinar para cima">⤒</button>
            <button type="button" data-cam="down" aria-label="Inclinar para baixo">⤓</button>
            <button type="button" data-cam="reset" aria-label="Reposicionar a câmera">↺</button>
          </div>
          <p class="world-atlas__hint world-atlas__hint--3d" hidden>Arraste para girar · pinça ou roda para aproximar · dois dedos para mover · toque em uma região</p>
          <p class="world-atlas__hint world-atlas__hint--2d">Toque ou clique em uma região · use “Explorar em 3D” para ver o relevo</p>
        </div>
        <aside class="atlas-panel" aria-live="polite" aria-labelledby="atlas-painel-titulo" hidden></aside>
      </div>
      <p class="world-atlas__note">Carta do manuscrito. Nomes, capitais, fronteiras e brasões são conceituais e podem mudar; o relevo 3D é uma interpretação da carta.</p>
      <p class="notice world-atlas__message" role="alert" hidden><span></span><button type="button" class="atlas-panel__close" aria-label="Fechar aviso">×</button></p>
      <div class="world-atlas__legend">
        <nav aria-label="Regiões do mapa">
          <h3 class="eyebrow">Regiões</h3>
          <ul class="region-list">${list}</ul>
        </nav>
        <div>
          <h3 class="eyebrow">Legenda</h3>
          <ul class="map-key">
            <li><span class="map-key__zone" aria-hidden="true"></span> Zona conceitual de um reino</li>
            <li><span class="map-key__border" aria-hidden="true"></span> Fronteira conceitual (não aprovada)</li>
            <li><span class="map-key__erased" aria-hidden="true"></span> Região apagada na versão oficial</li>
            <li><span class="map-key__relief" aria-hidden="true"></span> Relevo, rios e costas ilustrativos</li>
          </ul>
          <p class="atlas-panel__note world-atlas__no3d" hidden>O modo 3D não está disponível neste dispositivo; o mapa 2D oferece as mesmas regiões.</p>
        </div>
      </div>
      <noscript><p class="atlas-panel__note">Ative o JavaScript para selecionar as regiões e abrir o modo 3D. A carta acima continua visível.</p></noscript>
    </section>`
}
