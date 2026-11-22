import { AMMO_INFO, MATERIAL_INFO, NO_ITEM, RARITIES, itemDef } from '../../shared/config/items'
import { MAX_HEALTH, MAX_SHIELD, type Slot } from '../../shared/player/player'
import { h } from './dom'
import { itemIconSvg } from './icons'

/**
 * HUD da partida: vida e escudo, espaços do inventário com munição, recursos,
 * minimapa (montado pela partida), tempo, jogadores vivos, eliminações,
 * posição, bússola, mira dinâmica, marcador de acerto, indicador de dano,
 * feed de eliminações, avisos de interação, barra de progresso, mira de
 * sniper, tela de eliminado e painel técnico (F3).
 */

export interface HudInfo {
  fps: number
  pingMs: number
  modeLabel: string
  connection: 'ok' | 'warn' | 'bad'
  players: number
  aliveCount: number
  kills: number
  matchTime: number
  region: string
  mapName: string
  grid: string
  heading: number
  speed: number
  flags: { grounded: boolean; crouched: boolean; sliding: boolean; sprinting: boolean; aiming: boolean; swimming: boolean }
  spread: number
  health: number
  shield: number
  slots: Slot[]
  selected: number
  /** Reserva da munição da arma selecionada (-1 = não é arma). */
  reserve: number
  materials: number[]
  progress: { label: string; value: number } | null
  prompt: string | null
  scoped: boolean
  debug: Record<string, string | number>
}

const CARDINALS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' }
const TICK_DEG = 5
const TICK_PX = 15

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  const r = Math.floor(s % 60)
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export class Hud {
  readonly el: HTMLElement
  /** Camada para números de dano (posicionados pela partida). */
  readonly fx: HTMLElement
  /** Onde a partida encaixa o minimapa. */
  readonly minimapSlot: HTMLElement
  private readonly strip: HTMLElement
  private readonly headingEl: HTMLElement
  private readonly regionEl: HTMLElement
  private readonly mapEl: HTMLElement
  private readonly connEl: HTMLElement
  private readonly matchEl: HTMLElement
  private readonly stanceEls: Record<string, HTMLElement>
  private readonly speedEl: HTMLElement
  private readonly helpEl: HTMLElement
  private readonly debugEl: HTMLElement
  private readonly fpsEl: HTMLElement
  private readonly cross: HTMLElement[]
  private readonly crossEl: HTMLElement
  private readonly shieldFill: HTMLElement
  private readonly shieldText: HTMLElement
  private readonly healthFill: HTMLElement
  private readonly healthText: HTMLElement
  private readonly slotEls: HTMLElement[]
  private readonly ammoEl: HTMLElement
  private readonly matEls: HTMLElement[]
  private readonly promptEl: HTMLElement
  private readonly progressEl: HTMLElement
  private readonly progressFill: HTMLElement
  private readonly progressLabel: HTMLElement
  private readonly hitEl: HTMLElement
  private readonly dirLayer: HTMLElement
  private readonly feedEl: HTMLElement
  private readonly toastsEl: HTMLElement
  private readonly bannerEl: HTMLElement
  private readonly scopeEl: HTMLElement
  private readonly vignetteEl: HTMLElement
  private readonly deathEl: HTMLElement
  private readonly deathText: HTMLElement
  private readonly deathCount: HTMLElement
  private debugVisible = false
  private lastText = 0
  private lastSlotsKey = ''
  private hitTimer: ReturnType<typeof setTimeout> | null = null
  private bannerTimer: ReturnType<typeof setTimeout> | null = null

  constructor(layer: HTMLElement) {
    const ticks: HTMLElement[] = []
    for (let lap = 0; lap < 3; lap++) {
      for (let d = 0; d < 360; d += TICK_DEG) {
        const label = CARDINALS[d] ?? (d % 15 === 0 ? String(d) : '')
        const t = h('div', { class: `tick${d % 15 === 0 ? ' major' : ''}` })
        if (label && d % 45 === 0) t.append(h('b', { class: 'card' }, label))
        else if (label) t.append(h('b', { style: 'font-size:10px;font-weight:600;opacity:.75' }, label))
        ticks.push(t)
      }
    }
    this.strip = h('div', { class: 'strip' }, ...ticks)
    this.headingEl = h('div', { class: 'heading' })
    this.regionEl = h('div', { class: 'region' })
    this.mapEl = h('div', { class: 'mapname' })
    this.connEl = h('span', { class: 'chip' })
    this.matchEl = h('div', { class: 'match-info', 'data-hud': 'match' })
    this.minimapSlot = h('div', { class: 'minimap-slot' })
    this.stanceEls = {
      sprinting: h('span', {}, 'Sprint'),
      crouched: h('span', {}, 'Agachado'),
      sliding: h('span', {}, 'Deslize'),
      aiming: h('span', {}, 'Mira'),
      swimming: h('span', {}, 'Nado'),
      air: h('span', {}, 'No ar'),
    }
    this.speedEl = h('div', { class: 'speed' })
    this.helpEl = h('div', { class: 'help', html: [
      '<kbd>WASD</kbd> mover · <kbd>Shift</kbd> correr · <kbd>Espaço</kbd> pular · <kbd>C</kbd> agachar/deslizar',
      '<kbd>Botão esq.</kbd> atirar/usar · <kbd>Botão dir.</kbd> mirar · <kbd>R</kbd> recarregar · <kbd>E</kbd> pegar/abrir',
      '<kbd>1–5</kbd> / roda: espaços · <kbd>Tab</kbd> inventário · <kbd>M</kbd> mapa · <kbd>H</kbd> ocultar',
    ].join('<br>') })
    this.debugEl = h('div', { class: 'debug' })
    this.debugEl.hidden = true
    this.fpsEl = h('div', { class: 'fps' })
    this.fpsEl.hidden = true
    this.cross = ['t', 'b', 'l', 'r', 'dot'].map((c) => h('i', { class: c }))
    this.crossEl = h('div', { class: 'crosshair' }, ...this.cross)
    this.hitEl = h('div', { class: 'hitmarker', 'data-hud': 'hitmarker' }, h('i'), h('i'), h('i'), h('i'))
    this.dirLayer = h('div', { class: 'damage-dirs' })

    this.shieldFill = h('span', { class: 'fill' })
    this.shieldText = h('b')
    this.healthFill = h('span', { class: 'fill' })
    this.healthText = h('b')
    const vitals = h('div', { class: 'vitals', 'data-hud': 'vitals' },
      h('div', { class: 'bar shield' }, this.shieldFill, this.shieldText),
      h('div', { class: 'bar health' }, this.healthFill, this.healthText))
    this.progressFill = h('span')
    this.progressLabel = h('label')
    this.progressEl = h('div', { class: 'progress' }, this.progressLabel, h('div', { class: 'track' }, this.progressFill))
    this.progressEl.hidden = true
    this.promptEl = h('div', { class: 'prompt', 'data-hud': 'prompt' })
    this.promptEl.hidden = true

    this.slotEls = Array.from({ length: 5 }, (_, k) => h('div', { class: 'slot', 'data-slot': k }))
    this.ammoEl = h('div', { class: 'ammo', 'data-hud': 'ammo' })
    this.matEls = MATERIAL_INFO.map((m) => h('span', { class: 'mat', title: m.name }))
    const loadout = h('div', { class: 'loadout' },
      this.ammoEl,
      h('div', { class: 'slots' }, ...this.slotEls),
      h('div', { class: 'mats', 'data-hud': 'materials' }, ...this.matEls))

    this.feedEl = h('div', { class: 'killfeed', 'data-hud': 'killfeed' })
    this.toastsEl = h('div', { class: 'pickups' })
    this.bannerEl = h('div', { class: 'banner' })
    this.scopeEl = h('div', { class: 'scope' })
    this.scopeEl.hidden = true
    this.vignetteEl = h('div', { class: 'hurt-vignette' })
    this.deathText = h('div', { class: 'death-text' })
    this.deathCount = h('div', { class: 'death-count' })
    this.deathEl = h('div', { class: 'death', 'data-hud': 'death' }, h('div', { class: 'death-title' }, 'Eliminado'), this.deathText, this.deathCount)
    this.deathEl.hidden = true
    this.fx = h('div', { class: 'hud-fx' })

    this.el = h('div', { class: 'hud', 'data-hud': '' },
      this.scopeEl,
      this.vignetteEl,
      this.fx,
      this.crossEl,
      this.hitEl,
      this.dirLayer,
      h('div', { class: 'compass' }, this.strip, h('div', { class: 'needle' })),
      this.headingEl,
      h('div', { class: 'hud-tr' }, this.minimapSlot, this.regionEl, this.matchEl, this.mapEl, h('div', { class: 'row', style: 'justify-content:flex-end;gap:6px' }, this.connEl), this.feedEl),
      h('div', { class: 'hud-bl' }, h('div', { class: 'stance' }, ...Object.values(this.stanceEls)), this.speedEl, this.helpEl),
      h('div', { class: 'hud-bc' }, this.promptEl, this.progressEl, vitals),
      h('div', { class: 'hud-br' }, this.toastsEl, loadout),
      this.bannerEl,
      this.deathEl,
      this.debugEl,
      this.fpsEl)
    this.el.hidden = true
    layer.append(this.el)
  }

  show(): void {
    this.el.hidden = false
  }

  hide(): void {
    this.el.hidden = true
  }

  toggleDebug(): void {
    this.debugVisible = !this.debugVisible
    this.debugEl.hidden = !this.debugVisible
  }

  toggleHelp(): void {
    this.helpEl.hidden = !this.helpEl.hidden
  }

  hitMarker(head: boolean, eliminated: boolean): void {
    this.hitEl.className = `hitmarker on${head ? ' head' : ''}${eliminated ? ' kill' : ''}`
    if (this.hitTimer) clearTimeout(this.hitTimer)
    this.hitTimer = setTimeout(() => { this.hitEl.className = 'hitmarker' }, eliminated ? 320 : 150)
  }

  /** Indicador de dano vindo de `angle` (rad, relativo à frente da câmera; 0 = frente). */
  damageFrom(angle: number): void {
    const el = h('div', { class: 'dmg-dir' })
    el.style.transform = `rotate(${(angle * 180) / Math.PI}deg)`
    this.dirLayer.append(el)
    setTimeout(() => el.remove(), 1100)
    this.vignetteEl.classList.remove('on')
    void this.vignetteEl.offsetWidth
    this.vignetteEl.classList.add('on')
  }

  killFeed(html: string, mine: boolean): void {
    const el = h('div', { class: `feed-line${mine ? ' mine' : ''}`, html })
    this.feedEl.prepend(el)
    while (this.feedEl.children.length > 5) this.feedEl.lastElementChild?.remove()
    setTimeout(() => el.remove(), 7000)
  }

  pickupToast(text: string, rarity: number): void {
    const el = h('div', { class: 'pickup-line' }, text)
    el.style.borderLeftColor = `#${(RARITIES[rarity]?.color ?? 0xffffff).toString(16).padStart(6, '0')}`
    this.toastsEl.append(el)
    while (this.toastsEl.children.length > 4) this.toastsEl.firstElementChild?.remove()
    setTimeout(() => el.remove(), 2600)
  }

  banner(text: string, kind = ''): void {
    this.bannerEl.textContent = text
    this.bannerEl.className = `banner on ${kind}`
    if (this.bannerTimer) clearTimeout(this.bannerTimer)
    this.bannerTimer = setTimeout(() => { this.bannerEl.className = 'banner' }, 2200)
  }

  setDeath(info: { text: string; respawnAt: number | null; spectating: string | null } | null): void {
    this.deathEl.hidden = !info
    this.crossEl.hidden = !!info
    if (!info) return
    this.deathText.innerHTML = info.text + (info.spectating ? `<br><small>Assistindo: ${info.spectating}</small>` : '')
    this.deathEl.dataset.respawnAt = info.respawnAt ? String(info.respawnAt) : ''
  }

  private renderSlots(slots: Slot[], selected: number): void {
    const key = JSON.stringify(slots) + selected
    if (key === this.lastSlotsKey) return
    this.lastSlotsKey = key
    slots.forEach((s, k) => {
      const el = this.slotEls[k]
      const def = itemDef(s.item)
      el.className = `slot${k === selected ? ' selected' : ''}${s.item === NO_ITEM ? ' empty' : ''}`
      const color = s.item === NO_ITEM ? '' : `#${(RARITIES[def?.kind === 'consumable' ? def.rarity : s.rarity]?.color ?? 0x888888).toString(16).padStart(6, '0')}`
      el.style.setProperty('--rarity', color || 'transparent')
      el.innerHTML = s.item === NO_ITEM ? `<i>${k + 1}</i>` : `<i>${k + 1}</i>${itemIconSvg(s.item)}<small>${def?.kind === 'weapon' ? s.ammo : `×${s.count}`}</small>`
      el.title = def ? def.name : 'Vazio'
    })
  }

  update(info: HudInfo, showFps: boolean): void {
    const width = this.strip.parentElement!.clientWidth
    const heading = ((info.heading % 360) + 360) % 360
    const px = (360 / TICK_DEG) * TICK_PX + (heading / TICK_DEG) * TICK_PX
    this.strip.style.transform = `translateX(${width / 2 - px - TICK_PX / 2}px)`
    const s = info.spread
    this.cross[0].style.transform = `translateY(${-s - 8}px)`
    this.cross[1].style.transform = `translateY(${s}px)`
    this.cross[2].style.transform = `translateX(${-s - 8}px)`
    this.cross[3].style.transform = `translateX(${s}px)`
    this.scopeEl.hidden = !info.scoped
    this.crossEl.classList.toggle('scoped', info.scoped)

    // Barras e espaços: baratos, a cada quadro
    this.shieldFill.style.width = `${(info.shield / MAX_SHIELD) * 100}%`
    this.healthFill.style.width = `${(info.health / MAX_HEALTH) * 100}%`
    this.renderSlots(info.slots, info.selected)
    if (info.progress) {
      this.progressEl.hidden = false
      this.progressLabel.textContent = info.progress.label
      this.progressFill.style.width = `${Math.round(info.progress.value * 100)}%`
    } else this.progressEl.hidden = true
    this.promptEl.hidden = !info.prompt
    if (info.prompt) this.promptEl.innerHTML = info.prompt

    const now = performance.now()
    const respawnAt = Number(this.deathEl.dataset.respawnAt || 0)
    if (!this.deathEl.hidden) this.deathCount.textContent = respawnAt ? `Renascendo em ${Math.max(0, Math.ceil((respawnAt - now) / 1000))} s` : 'Fim de jogo para você nesta partida'

    if (now - this.lastText < 100) return
    this.lastText = now
    this.shieldText.textContent = String(Math.ceil(info.shield))
    this.healthText.textContent = String(Math.ceil(info.health))
    const sel = info.slots[info.selected]
    const def = itemDef(sel?.item ?? NO_ITEM)
    if (def?.kind === 'weapon') this.ammoEl.innerHTML = `<b>${sel.ammo}</b><span>/ ${info.reserve}</span><em>${AMMO_INFO[def.ammoType].short}</em>`
    else if (def) this.ammoEl.innerHTML = `<b>${sel.count}</b><em>${def.name}</em>`
    else this.ammoEl.innerHTML = '<em>Mãos vazias</em>'
    info.materials.forEach((n, k) => { this.matEls[k].innerHTML = `<i class="m${k}"></i>${n}` })
    this.headingEl.textContent = `${Math.round(heading)}°`
    this.regionEl.textContent = info.region
    this.mapEl.textContent = info.mapName
    this.matchEl.innerHTML = `<span>⏱ ${fmtTime(info.matchTime)}</span><span>Vivos <b>${info.aliveCount}</b></span><span>Eliminações <b>${info.kills}</b></span><span>Posição <b>${info.grid}</b></span>`
    this.connEl.className = `chip ${info.connection === 'ok' ? '' : info.connection}`
    this.connEl.innerHTML = `<span class="dot"></span>${info.modeLabel}${info.pingMs > 0 ? ` · ${Math.round(info.pingMs)} ms` : ''} · ${info.players} ${info.players === 1 ? 'jogador' : 'jogadores'}`
    const f = info.flags
    this.stanceEls.sprinting.classList.toggle('on', f.sprinting)
    this.stanceEls.crouched.classList.toggle('on', f.crouched && !f.sliding)
    this.stanceEls.sliding.classList.toggle('on', f.sliding)
    this.stanceEls.aiming.classList.toggle('on', f.aiming)
    this.stanceEls.swimming.classList.toggle('on', f.swimming)
    this.stanceEls.air.classList.toggle('on', !f.grounded && !f.swimming)
    this.speedEl.textContent = `${info.speed.toFixed(1).replace('.', ',')} m/s`
    this.fpsEl.hidden = !showFps || this.debugVisible
    this.fpsEl.textContent = `${Math.round(info.fps)} FPS`
    if (this.debugVisible) this.debugEl.textContent = Object.entries(info.debug).map(([k, v]) => `${k.padEnd(14)} ${v}`).join('\n')
  }
}
