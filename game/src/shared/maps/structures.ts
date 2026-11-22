import { DEG } from '../math/scalar'
import type { Rng } from '../math/rng'
import type { MapBuilder } from './builder'
import type { MaterialId, PropKind } from './types'

/**
 * Estruturas reutilizáveis dos mapas: carros, contêineres, galpões, torres de
 * vigia, cercas e espalhamento de vegetação. Tudo vira caixas de colisão e
 * geometria desenhada pelo cliente.
 */

/** Carcaça de carro (cobertura baixa). */
export function car(b: MapBuilder, x: number, z: number, yaw: number, paint: MaterialId, baseY?: number): void {
  const y = baseY ?? b.surfaceAt(x, z)
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  b.box(x, y + 0.55, z, 1.9, 0.8, 4.3, paint, yaw)
  b.box(x + s * 0.2, y + 1.25, z + c * 0.2, 1.7, 0.6, 2.2, 'metal', yaw)
}

/** Contêiner de 6 m; `stack` empilhados. */
export function container(b: MapBuilder, x: number, z: number, yaw: number, mat: MaterialId, baseY?: number, stack = 1): void {
  const y = baseY ?? b.surfaceAt(x, z)
  for (let k = 0; k < stack; k++) b.box(x, y + 1.3 + k * 2.6, z, 2.45, 2.6, 6.1, mat, yaw)
}

export interface WarehouseOptions {
  yaw?: number
  height?: number
  wall?: MaterialId
  roof?: MaterialId
  baseY?: number
  loot?: number
}

/** Galpão: portão largo na frente, mezanino nos fundos com escada, contêineres dentro e loot. */
export function warehouse(b: MapBuilder, cx: number, cz: number, w: number, d: number, o: WarehouseOptions = {}): void {
  const yaw = o.yaw ?? 0
  const H = o.height ?? 8
  const wall = o.wall ?? 'metal-red'
  const roof = o.roof ?? 'metal'
  const tier = o.loot ?? 0
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const wx = (lx: number, lz: number) => cx + c * lx + s * lz
  const wz = (lx: number, lz: number) => cz - s * lx + c * lz
  const base = o.baseY ?? b.maxHeightIn(cx, cz, w / 2 + 0.5, d / 2 + 0.5)
  const hw = w / 2
  const hd = d / 2
  b.block(cx, cz, base, w + 0.4, 0.15, d + 0.4, 'concrete', yaw, 1.5)
  const y = base + 0.15
  const gate = Math.min(8, w - 4)
  b.wall(wx(-hw, hd), wz(-hw, hd), wx(hw, hd), wz(hw, hd), y, H, wall, [{ at: hw - gate / 2, width: gate, bottom: 0, top: 5 }])
  b.wall(wx(hw, -hd), wz(hw, -hd), wx(-hw, -hd), wz(-hw, -hd), y, H, wall, [{ at: 2, width: 1.4, bottom: 0, top: 2.4 }, { at: w - 6, width: 4, bottom: H - 2.2, top: H - 0.8 }])
  b.wall(wx(-hw, -hd + 0.15), wz(-hw, -hd + 0.15), wx(-hw, hd - 0.15), wz(-hw, hd - 0.15), y, H, wall, [{ at: d / 2 - 0.7, width: 1.4, bottom: 0, top: 2.4 }])
  b.wall(wx(hw, hd - 0.15), wz(hw, hd - 0.15), wx(hw, -hd + 0.15), wz(hw, -hd + 0.15), y, H, wall, [{ at: 3, width: 5, bottom: H - 2.2, top: H - 0.8 }])
  b.box(cx, y + H + 0.12, cz, w + 0.6, 0.25, d + 0.6, roof, yaw)
  // Mezanino nos fundos (4 m) com escada lateral
  const mezD = Math.min(7, d * 0.35)
  const mezY = y + 4
  const mzc = -hd + mezD / 2 + 0.15
  b.box(wx(0, mzc), mezY - 0.12, wz(0, mzc), w - 0.4, 0.25, mezD, 'wood-dark', yaw)
  const steps = 12
  b.stairs(wx(hw - 1.2, -hd + mezD + 0.15 + steps * 0.34), wz(hw - 1.2, -hd + mezD + 0.15 + steps * 0.34), y, 1.4, 4 / steps, 0.34, steps, yaw, 'wood-dark')
  // Contêineres internos
  container(b, wx(-hw + 3, 2), wz(-hw + 3, 2), yaw, 'metal-blue', y)
  container(b, wx(-hw + 6, 3), wz(-hw + 6, 3), yaw + 0.05, 'metal-green', y)
  // Loot: chão e mezanino
  b.lootSpot(wx(hw * 0.3, hd * 0.3), wz(hw * 0.3, hd * 0.3), tier, y)
  b.lootSpot(wx(-hw * 0.2, mzc), wz(-hw * 0.2, mzc), tier, mezY)
  if (b.rng.chance(0.6)) b.chest(wx(hw * 0.4, mzc), wz(hw * 0.4, mzc), yaw, tier + 1, mezY)
}

/** Torre de vigia: pilares, plataforma com mureta e escada reta. Baú no alto. */
export function watchtower(b: MapBuilder, x: number, z: number, yaw: number, baseY: number, h = 8, tier = 2): void {
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const wx = (lx: number, lz: number) => x + c * lx + s * lz
  const wz = (lx: number, lz: number) => z - s * lx + c * lz
  for (const [px, pz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) b.block(wx(px, pz), wz(px, pz), baseY, 0.3, h, 0.3, 'concrete', yaw, 0.3)
  b.box(x, baseY + h - 0.12, z, 3.4, 0.25, 3.4, 'wood', yaw)
  const top = baseY + h
  b.wall(wx(-1.7, -1.7), wz(-1.7, -1.7), wx(1.7, -1.7), wz(1.7, -1.7), top, 1.1, 'wood', [], 0.15)
  b.wall(wx(-1.7, -1.7), wz(-1.7, -1.7), wx(-1.7, 1.7), wz(-1.7, 1.7), top, 1.1, 'wood', [], 0.15)
  b.wall(wx(1.7, 1.7), wz(1.7, 1.7), wx(1.7, -1.7), wz(1.7, -1.7), top, 1.1, 'wood', [], 0.15)
  b.wall(wx(-1.7, 1.7), wz(-1.7, 1.7), wx(1.7, 1.7), wz(1.7, 1.7), top, 1.1, 'wood', [{ at: 1.0, width: 1.4, bottom: 0, top: 1.1 }], 0.15)
  b.box(x, top + 2.5, z, 3.8, 0.15, 3.8, 'metal', yaw)
  for (const [px, pz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) b.box(wx(px, pz), top + 1.8, wz(px, pz), 0.12, 1.4, 0.12, 'wood-dark', yaw)
  // Escada subindo em direção à abertura (lado +Z local)
  const steps = Math.round(h / 0.4)
  const run = steps * 0.42
  b.stairs(wx(-0.0, 1.7 + run), wz(-0.0, 1.7 + run), baseY, 1.2, h / steps, 0.42, steps, yaw, 'wood-dark')
  b.chest(wx(0, -0.6), wz(0, -0.6), yaw, tier, top)
}

/** Cerca/mureta reta com portão opcional (distância ao longo da cerca). */
export function fence(b: MapBuilder, x0: number, z0: number, x1: number, z1: number, mat: MaterialId, height = 1.1, gateAt = -1, gateWidth = 3): void {
  const y = Math.min(b.heightAt(x0, z0), b.heightAt(x1, z1), b.heightAt((x0 + x1) / 2, (z0 + z1) / 2))
  const openings = gateAt >= 0 ? [{ at: gateAt, width: gateWidth, bottom: 0, top: height + 1 }] : []
  b.wall(x0, z0, x1, z1, y - 0.5, height + 0.5, mat, openings, 0.2)
}

export interface ScatterOptions {
  count: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  minDist: number
  /** Probabilidade de aceitar um ponto (0–1). */
  density: (x: number, z: number, h: number) => number
  blocked: (x: number, z: number) => boolean
  kind: (x: number, z: number, h: number, rng: Rng) => PropKind
  scale: [number, number]
  minHeight?: number
  maxSlope?: number
}

/** Espalha adereços com distância mínima (grade de aceleração simples). */
export function scatter(b: MapBuilder, rng: Rng, o: ScatterOptions): number {
  const cell = Math.max(2, o.minDist)
  const grid = new Map<number, [number, number][]>()
  const key = (i: number, j: number) => i * 100003 + j
  const n = { x: 0, y: 1, z: 0 }
  const minNy = Math.cos((o.maxSlope ?? 35) * DEG)
  let placed = 0
  for (let attempt = 0; attempt < o.count * 12 && placed < o.count; attempt++) {
    const x = rng.range(o.minX, o.maxX)
    const z = rng.range(o.minZ, o.maxZ)
    if (o.blocked(x, z)) continue
    const h = b.heightAt(x, z)
    if (h < (o.minHeight ?? 2)) continue
    if (b.terrain.normalAt(x, z, n).y < minNy) continue
    if (!rng.chance(o.density(x, z, h))) continue
    const i = Math.floor(x / cell)
    const j = Math.floor(z / cell)
    let ok = true
    for (let di = -1; di <= 1 && ok; di++) {
      for (let dj = -1; dj <= 1 && ok; dj++) {
        for (const [px, pz] of grid.get(key(i + di, j + dj)) ?? []) {
          if ((px - x) ** 2 + (pz - z) ** 2 < o.minDist * o.minDist) {
            ok = false
            break
          }
        }
      }
    }
    if (!ok) continue
    const k = key(i, j)
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k)!.push([x, z])
    b.prop(o.kind(x, z, h, rng), x, z, rng.range(0, Math.PI * 2), rng.range(o.scale[0], o.scale[1]))
    placed++
  }
  return placed
}
