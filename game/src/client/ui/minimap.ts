import * as THREE from 'three'
import { smoothstep } from '../../shared/math/scalar'
import type { GameMap } from '../../shared/maps/types'
import type { AirshipRoute, ZoneCircle } from '../../shared/match/zone'
import { h } from './dom'

/**
 * Imagem do mapa (gerada uma vez a partir do relevo e das construções),
 * minimapa no HUD e mapa completo (tecla M) com grade e nomes das regiões.
 */

const GRID = 8
const LETTERS = 'ABCDEFGH'

/** Referência de grade "C5" para uma posição (8 × 8 quadrantes). */
export function gridRef(map: GameMap, x: number, z: number): string {
  const n = (v: number) => Math.max(0, Math.min(GRID - 1, Math.floor(((v - map.terrain.min) / map.terrain.size) * GRID)))
  return `${LETTERS[n(x)]}${n(z) + 1}`
}

export function renderMapImage(map: GameMap, size = 512): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  const t = map.terrain
  const b = map.def.biome
  const col = (hex: number) => new THREE.Color(hex)
  const sand = col(b.sand)
  const grass = col(b.grass)
  const forest = col(b.forest)
  const rock = col(b.rock)
  const snow = col(b.snow)
  const deep = new THREE.Color(0x1c4f6e)
  const shallow = new THREE.Color(0x3f8fb0)
  const out = new THREE.Color()
  const n = { x: 0, y: 1, z: 0 }
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = t.min + ((i + 0.5) / size) * t.size
      const z = t.min + ((j + 0.5) / size) * t.size
      const hgt = t.heightAt(x, z)
      t.normalAt(x, z, n)
      if (hgt < map.def.waterLevel) {
        out.copy(shallow).lerp(deep, smoothstep(0, 8, map.def.waterLevel - hgt))
      } else {
        out.copy(grass).lerp(forest, smoothstep(0.3, 0.9, Math.sin(x * 0.01) * Math.cos(z * 0.012) * 0.5 + 0.5) * 0.4)
        out.lerp(sand, 1 - smoothstep(b.sandLevel - 0.3, b.sandLevel + 0.8, hgt))
        out.lerp(rock, smoothstep(0.2, 0.45, 1 - n.y))
        out.lerp(snow, smoothstep(b.snowLevel - 4, b.snowLevel + 4, hgt))
        const shade = 0.72 + 0.4 * Math.max(0, -n.x * 0.6 - n.z * 0.6 + n.y * 0.5)
        out.multiplyScalar(shade)
      }
      const k = (j * size + i) * 4
      img.data[k] = Math.min(255, out.r * 255)
      img.data[k + 1] = Math.min(255, out.g * 255)
      img.data[k + 2] = Math.min(255, out.b * 255)
      img.data[k + 3] = 255
    }
  }
  // cores já em sRGB aproximado (lineares do Color convertidas de volta)
  for (let k = 0; k < img.data.length; k += 4) {
    for (let ch = 0; ch < 3; ch++) img.data[k + ch] = Math.round(255 * Math.pow(img.data[k + ch] / 255, 1 / 2.2))
  }
  ctx.putImageData(img, 0, 0)
  const scale = size / t.size
  const px = (v: number) => (v - t.min) * scale
  // vegetação
  ctx.fillStyle = 'rgba(30,70,30,0.55)'
  for (const p of map.props) if (p.kind === 'pine' || p.kind === 'broadleaf') ctx.fillRect(px(p.x) - 0.6, px(p.z) - 0.6, 1.3, 1.3)
  // ruas, depois construções (vistas de cima)
  const drawBox = (o: GameMap['boxes'][number]['obb'], fill: string) => {
    ctx.save()
    ctx.translate(px(o.cx), px(o.cz))
    ctx.rotate(-o.yaw)
    ctx.fillStyle = fill
    ctx.fillRect(-o.hx * scale, -o.hz * Math.cos(o.pitch) * scale, o.hx * 2 * scale, o.hz * 2 * Math.cos(o.pitch) * scale)
    ctx.restore()
  }
  for (const bx of map.boxes) if (bx.material === 'asphalt') drawBox(bx.obb, '#4b4f55')
  for (const bx of map.boxes) {
    const o = bx.obb
    if (bx.material === 'asphalt') continue
    const ground = t.heightAt(o.cx, o.cz)
    if (o.maxY - ground < 1.2 && o.hx * o.hz < 30) continue
    drawBox(o, o.maxY - ground > 4 ? '#6c7077' : '#8a8d92')
  }
  return c
}

/** Zona atual, próxima zona e rota do dirigível (para desenhar nos mapas). */
export interface BattleOverlay {
  zone: ZoneCircle | null
  next: ZoneCircle | null
  route: AirshipRoute | null
}

/**
 * Desenha a nuvem (fora da zona) escurecida, a borda da zona atual, a
 * próxima tracejada e a rota do dirigível. `toPx` converte metros em pixels.
 */
function drawBattle(ctx: CanvasRenderingContext2D, W: number, o: BattleOverlay | null, toPx: (x: number, z: number) => [number, number], scale: number): void {
  if (!o) return
  if (o.route) {
    const [ax, az] = toPx(o.route.x0, o.route.z0)
    const [bx, bz] = toPx(o.route.x1, o.route.z1)
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 6])
    ctx.beginPath()
    ctx.moveTo(ax, az)
    ctx.lineTo(bx, bz)
    ctx.stroke()
    ctx.restore()
  }
  if (o.zone) {
    const [cx, cz] = toPx(o.zone.x, o.zone.z)
    ctx.save()
    ctx.fillStyle = 'rgba(110,50,120,0.38)'
    ctx.beginPath()
    ctx.rect(0, 0, W, W)
    ctx.arc(cx, cz, Math.max(0.5, o.zone.r * scale), 0, Math.PI * 2, true)
    ctx.fill('evenodd')
    ctx.strokeStyle = '#d79cff'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.arc(cx, cz, Math.max(0.5, o.zone.r * scale), 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
  if (o.next && (!o.zone || Math.abs(o.next.r - o.zone.r) > 0.5)) {
    const [nx, nz] = toPx(o.next.x, o.next.z)
    ctx.save()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.5
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.arc(nx, nz, Math.max(0.5, o.next.r * scale), 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

function drawMates(ctx: CanvasRenderingContext2D, mates: readonly { x: number; z: number }[], toPx: (x: number, z: number) => [number, number]): void {
  ctx.save()
  ctx.fillStyle = '#5cf08a'
  ctx.strokeStyle = '#0b3318'
  ctx.lineWidth = 2
  for (const m of mates) {
    const [px, pz] = toPx(m.x, m.z)
    ctx.beginPath()
    ctx.arc(px, pz, 5, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
  ctx.restore()
}

export class MinimapView {
  battle: BattleOverlay | null = null
  /** Colegas de equipe (posições no mundo). */
  mates: readonly { x: number; z: number }[] = []
  readonly el: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly label: HTMLElement
  /** Metros visíveis do centro até a borda. */
  private readonly range = 110

  constructor(private readonly image: HTMLCanvasElement, private readonly map: GameMap) {
    this.canvas = h('canvas', { width: 180, height: 180, class: 'minimap-canvas', 'aria-label': 'Minimapa' })
    this.ctx = this.canvas.getContext('2d')!
    this.label = h('div', { class: 'minimap-label' })
    this.el = h('div', { class: 'minimap' }, this.canvas, this.label)
  }

  update(x: number, z: number, heading: number, label: string): void {
    const t = this.map.terrain
    const s = this.image.width / t.size
    const ctx = this.ctx
    const W = this.canvas.width
    ctx.fillStyle = '#1c4f6e'
    ctx.fillRect(0, 0, W, W)
    ctx.drawImage(this.image, (x - this.range - t.min) * s, (z - this.range - t.min) * s, this.range * 2 * s, this.range * 2 * s, 0, 0, W, W)
    const k = W / (this.range * 2)
    drawBattle(ctx, W, this.battle, (wx, wz) => [(wx - x + this.range) * k, (wz - z + this.range) * k], k)
    drawMates(ctx, this.mates, (wx, wz) => [Math.max(4, Math.min(W - 4, (wx - x + this.range) * k)), Math.max(4, Math.min(W - 4, (wz - z + this.range) * k))])
    // marcador do jogador
    ctx.save()
    ctx.translate(W / 2, W / 2)
    ctx.rotate((heading * Math.PI) / 180)
    ctx.fillStyle = '#ffb34a'
    ctx.strokeStyle = '#1b0d05'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, -9)
    ctx.lineTo(6, 7)
    ctx.lineTo(0, 3)
    ctx.lineTo(-6, 7)
    ctx.closePath()
    ctx.stroke()
    ctx.fill()
    ctx.restore()
    this.label.textContent = label
  }
}

export class FullMapView {
  battle: BattleOverlay | null = null
  mates: readonly { x: number; z: number }[] = []
  readonly el: HTMLElement
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D

  constructor(private readonly image: HTMLCanvasElement, private readonly map: GameMap) {
    this.canvas = h('canvas', { width: 720, height: 720, class: 'fullmap-canvas', 'aria-label': 'Mapa' })
    this.ctx = this.canvas.getContext('2d')!
    this.el = h('div', { class: 'fullmap', 'data-screen': 'map' }, h('div', { class: 'fullmap-panel' }, h('div', { class: 'fullmap-title' }, map.def.name, h('small', {}, ' · M para fechar')), this.canvas))
    this.el.hidden = true
  }

  get visible(): boolean {
    return !this.el.hidden
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden
  }

  update(x: number, z: number, heading: number): void {
    if (this.el.hidden) return
    const ctx = this.ctx
    const W = this.canvas.width
    const t = this.map.terrain
    const s = W / t.size
    ctx.drawImage(this.image, 0, 0, W, W)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.font = '600 13px system-ui, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    for (let k = 0; k <= GRID; k++) {
      const p = (k / GRID) * W
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, W); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke()
      if (k < GRID) {
        ctx.fillText(LETTERS[k], p + 6, 16)
        ctx.fillText(String(k + 1), 6, p + 20)
      }
    }
    ctx.textAlign = 'center'
    for (const r of this.map.regions) {
      const rx = (r.x - t.min) * s
      const rz = (r.z - t.min) * s
      ctx.font = '800 italic 14px system-ui, sans-serif'
      ctx.lineWidth = 4
      ctx.strokeStyle = 'rgba(0,0,0,0.75)'
      ctx.strokeText(r.name.toUpperCase(), rx, rz)
      ctx.fillStyle = '#fff'
      ctx.fillText(r.name.toUpperCase(), rx, rz)
    }
    ctx.textAlign = 'start'
    drawBattle(ctx, W, this.battle, (wx, wz) => [(wx - t.min) * s, (wz - t.min) * s], s)
    drawMates(ctx, this.mates, (wx, wz) => [(wx - t.min) * s, (wz - t.min) * s])
    ctx.save()
    ctx.translate((x - t.min) * s, (z - t.min) * s)
    ctx.rotate((heading * Math.PI) / 180)
    ctx.fillStyle = '#ffb34a'
    ctx.strokeStyle = '#1b0d05'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(0, -12)
    ctx.lineTo(8, 9)
    ctx.lineTo(0, 4)
    ctx.lineTo(-8, 9)
    ctx.closePath()
    ctx.stroke()
    ctx.fill()
    ctx.restore()
  }
}
