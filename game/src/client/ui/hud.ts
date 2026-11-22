import { h } from './dom'

/**
 * HUD da Fase 1: mira, bússola, região atual, estado de movimento, conexão,
 * jogadores conectados, ajuda e painel técnico (F3). Vida, escudo, munição,
 * inventário e minimapa entram com os sistemas correspondentes (Fase 2).
 */

export interface HudInfo {
  fps: number
  pingMs: number
  modeLabel: string
  connection: 'ok' | 'warn' | 'bad'
  players: number
  region: string
  mapName: string
  /** Rumo em graus (0 = norte). */
  heading: number
  x: number
  y: number
  z: number
  speed: number
  flags: { grounded: boolean; crouched: boolean; sliding: boolean; sprinting: boolean; aiming: boolean; swimming: boolean }
  /** Abertura da mira em pixels. */
  spread: number
  debug: Record<string, string | number>
}

const CARDINALS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'L', 135: 'SE', 180: 'S', 225: 'SO', 270: 'O', 315: 'NO' }
const TICK_DEG = 5
const TICK_PX = 15

export class Hud {
  readonly el: HTMLElement
  private readonly strip: HTMLElement
  private readonly headingEl: HTMLElement
  private readonly regionEl: HTMLElement
  private readonly mapEl: HTMLElement
  private readonly connEl: HTMLElement
  private readonly playersEl: HTMLElement
  private readonly stanceEls: Record<string, HTMLElement>
  private readonly speedEl: HTMLElement
  private readonly helpEl: HTMLElement
  private readonly debugEl: HTMLElement
  private readonly fpsEl: HTMLElement
  private readonly cross: HTMLElement[]
  private debugVisible = false
  private lastText = 0

  constructor(layer: HTMLElement) {
    const ticks: HTMLElement[] = []
    // três voltas para rolar sem emenda
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
    this.playersEl = h('span', { class: 'chip' })
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
      '<kbd>WASD</kbd> mover · <kbd>Shift</kbd> correr · <kbd>Espaço</kbd> pular',
      '<kbd>C</kbd> agachar (correndo: deslizar) · <kbd>Alt</kbd> caminhar',
      '<kbd>Botão direito</kbd> mirar · <kbd>Esc</kbd> pausa · <kbd>F3</kbd> técnico · <kbd>H</kbd> ocultar',
    ].join('<br>') })
    this.debugEl = h('div', { class: 'debug' })
    this.debugEl.hidden = true
    this.fpsEl = h('div', { class: 'fps' })
    this.fpsEl.hidden = true
    this.cross = ['t', 'b', 'l', 'r', 'dot'].map((c) => h('i', { class: c }))
    this.el = h('div', { class: 'hud', 'data-hud': '' },
      h('div', { class: 'crosshair' }, ...this.cross),
      h('div', { class: 'compass' }, this.strip, h('div', { class: 'needle' })),
      this.headingEl,
      h('div', { class: 'hud-tr' }, this.regionEl, this.mapEl, h('div', { class: 'row', style: 'justify-content:flex-end;gap:6px' }, this.playersEl, this.connEl)),
      h('div', { class: 'hud-bl' }, h('div', { class: 'stance' }, ...Object.values(this.stanceEls)), this.speedEl, this.helpEl),
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

  update(info: HudInfo, showFps: boolean): void {
    // bússola: a cada quadro (barato: só transform)
    const width = this.strip.parentElement!.clientWidth
    const heading = ((info.heading % 360) + 360) % 360
    const px = (360 / TICK_DEG) * TICK_PX + (heading / TICK_DEG) * TICK_PX
    this.strip.style.transform = `translateX(${width / 2 - px - TICK_PX / 2}px)`
    const s = info.spread
    this.cross[0].style.transform = `translateY(${-s - 8}px)`
    this.cross[1].style.transform = `translateY(${s}px)`
    this.cross[2].style.transform = `translateX(${-s - 8}px)`
    this.cross[3].style.transform = `translateX(${s}px)`

    // textos: ~10 vezes por segundo
    const now = performance.now()
    if (now - this.lastText < 100) return
    this.lastText = now
    this.headingEl.textContent = `${Math.round(heading)}°`
    this.regionEl.textContent = info.region
    this.mapEl.textContent = info.mapName
    this.connEl.className = `chip ${info.connection === 'ok' ? '' : info.connection}`
    this.connEl.innerHTML = `<span class="dot"></span>${info.modeLabel}${info.pingMs > 0 ? ` · ${Math.round(info.pingMs)} ms` : ''}`
    this.playersEl.textContent = `${info.players} ${info.players === 1 ? 'jogador' : 'jogadores'}`
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
    if (this.debugVisible) {
      this.debugEl.textContent = Object.entries(info.debug).map(([k, v]) => `${k.padEnd(14)} ${v}`).join('\n')
    }
  }
}
