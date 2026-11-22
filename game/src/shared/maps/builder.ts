import { Rng } from '../math/rng'
import { smoothstep } from '../math/scalar'
import { CollisionWorld, Surface, type SurfaceId } from '../world/collision-world'
import { Heightfield } from '../world/heightfield'
import { makeObb } from '../world/obb'
import type { GameMap, MapDefinition, MapLabel, MaterialId, Prop, PropKind, Region, SpawnPoint, StaticBox } from './types'

const SURFACE_OF: Record<MaterialId, SurfaceId> = {
  'grid-orange': Surface.Concrete,
  'grid-gray': Surface.Concrete,
  'grid-blue': Surface.Concrete,
  'grid-dark': Surface.Concrete,
  concrete: Surface.Concrete,
  plaster: Surface.Concrete,
  'plaster-warm': Surface.Concrete,
  brick: Surface.Brick,
  wood: Surface.Wood,
  'wood-dark': Surface.Wood,
  metal: Surface.Metal,
  'metal-red': Surface.Metal,
}

/** Abertura em uma parede: distância ao longo da parede a partir do início, largura, base e topo. */
export interface Opening {
  at: number
  width: number
  bottom: number
  top: number
}

export interface HouseOptions {
  yaw?: number
  floors?: 1 | 2
  floorHeight?: number
  wall?: MaterialId
  trim?: MaterialId
  floor?: MaterialId
  /** Altura da base; padrão: maior altura do relevo sob a planta. */
  baseY?: number
  windows?: boolean
}

const WALL_T = 0.25

/**
 * Ferramentas de construção de mapas. Tudo o que é criado aqui vira colisão
 * no `CollisionWorld` e, no cliente, geometria desenhada.
 */
export class MapBuilder {
  readonly def: MapDefinition
  readonly terrain: Heightfield
  readonly rng: Rng
  readonly boxes: StaticBox[] = []
  readonly props: Prop[] = []
  readonly labels: MapLabel[] = []
  readonly regions: Region[] = []
  readonly spawns: SpawnPoint[] = []
  private world: CollisionWorld | null = null

  constructor(def: MapDefinition) {
    this.def = def
    this.terrain = new Heightfield(def.samples, def.cell)
    this.rng = new Rng(def.seed)
  }

  // ---- relevo -------------------------------------------------------------

  /** Define a altura de todas as amostras a partir de uma função de (x, z). */
  shapeTerrain(fn: (x: number, z: number) => number): void {
    const t = this.terrain
    for (let j = 0; j < t.n; j++) for (let i = 0; i < t.n; i++) t.set(i, j, fn(t.worldX(i), t.worldZ(j)))
  }

  /** Nivela um círculo em `height`, misturando suavemente numa faixa `blend`. */
  flatten(cx: number, cz: number, radius: number, height: number, blend: number): void {
    const t = this.terrain
    for (let j = 0; j < t.n; j++) {
      for (let i = 0; i < t.n; i++) {
        const d = Math.hypot(t.worldX(i) - cx, t.worldZ(j) - cz)
        if (d > radius + blend) continue
        const w = 1 - smoothstep(radius, radius + blend, d)
        t.set(i, j, t.get(i, j) * (1 - w) + height * w)
      }
    }
  }

  heightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z)
  }

  /** Maior altura do relevo dentro de um retângulo (para assentar construções). */
  maxHeightIn(cx: number, cz: number, hw: number, hd: number): number {
    let max = -Infinity
    for (let dz = -hd; dz <= hd + 1e-6; dz += Math.max(0.5, hd / 4)) {
      for (let dx = -hw; dx <= hw + 1e-6; dx += Math.max(0.5, hw / 4)) max = Math.max(max, this.heightAt(cx + dx, cz + dz))
    }
    return max
  }

  private ensureWorld(): CollisionWorld {
    if (!this.world) {
      this.terrain.finalize()
      this.world = new CollisionWorld(this.terrain, this.def.waterLevel)
    }
    return this.world
  }

  // ---- caixas -------------------------------------------------------------

  /** Caixa com centro e dimensões completas. Fecha a edição do relevo. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, material: MaterialId, yaw = 0, pitch = 0): StaticBox {
    const world = this.ensureWorld()
    const obb = makeObb(cx, cy, cz, sx / 2, sy / 2, sz / 2, yaw, pitch)
    const colliderId = world.add(obb, SURFACE_OF[material])
    const b = { obb, material, colliderId }
    this.boxes.push(b)
    return b
  }

  /** Caixa apoiada em `baseY` (base) — afunda `sink` metros para não deixar fresta no relevo. */
  block(cx: number, cz: number, baseY: number, sx: number, sy: number, sz: number, material: MaterialId, yaw = 0, sink = 0): StaticBox {
    return this.box(cx, baseY - sink + (sy + sink) / 2, cz, sx, sy + sink, sz, material, yaw)
  }

  /**
   * Rampa cuja borda inferior está centrada em (x, baseY, z) e que sobe na
   * direção "frente" do yaw (yaw 0 sobe em direção a -Z).
   */
  ramp(x: number, z: number, baseY: number, width: number, rise: number, angle: number, yaw: number, material: MaterialId, thickness = 0.3): StaticBox {
    const len = rise / Math.sin(angle)
    const run = rise / Math.tan(angle)
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    const nx = Math.sin(yaw) * Math.sin(angle)
    const ny = Math.cos(angle)
    const nz = Math.cos(yaw) * Math.sin(angle)
    const sx = x + fx * (run / 2)
    const sy = baseY + rise / 2
    const sz = z + fz * (run / 2)
    return this.box(sx - nx * (thickness / 2), sy - ny * (thickness / 2), sz - nz * (thickness / 2), width, thickness, len, material, yaw, angle)
  }

  /** Escada maciça subindo na direção "frente" do yaw a partir de (x, baseY, z). */
  stairs(x: number, z: number, baseY: number, width: number, stepH: number, tread: number, count: number, yaw: number, material: MaterialId): void {
    const fx = -Math.sin(yaw)
    const fz = -Math.cos(yaw)
    for (let k = 0; k < count; k++) {
      const d = tread * (k + 0.5)
      const h = stepH * (k + 1)
      this.block(x + fx * d, z + fz * d, baseY, width, h, tread, material, yaw, 0.3)
    }
  }

  /**
   * Parede reta de (x0,z0) a (x1,z1) com aberturas opcionais (portas, janelas),
   * inclusive empilhadas (janelas de andares diferentes). A parede é fatiada
   * em colunas nos limites das aberturas; colunas vizinhas com o mesmo perfil
   * vertical viram uma só caixa.
   */
  wall(x0: number, z0: number, x1: number, z1: number, baseY: number, height: number, material: MaterialId, openings: Opening[] = [], thickness = WALL_T): void {
    const len = Math.hypot(x1 - x0, z1 - z0)
    if (len < 1e-3) return
    const dx = (x1 - x0) / len
    const dz = (z1 - z0) / len
    const yaw = Math.atan2(-dz, dx)
    const cuts = new Set<number>([0, len])
    for (const o of openings) {
      cuts.add(Math.max(0, Math.min(len, o.at)))
      cuts.add(Math.max(0, Math.min(len, o.at + o.width)))
    }
    const xs = [...cuts].sort((a, b) => a - b)
    const profileAt = (mid: number): [number, number][] => {
      const holes = openings
        .filter((o) => o.at <= mid && mid <= o.at + o.width)
        .map((o) => [Math.max(0, o.bottom), Math.min(height, o.top)] as [number, number])
        .sort((a, b) => a[0] - b[0])
      const solids: [number, number][] = []
      let y = 0
      for (const [b, t] of holes) {
        if (b > y) solids.push([y, b])
        y = Math.max(y, t)
      }
      if (y < height) solids.push([y, height])
      return solids
    }
    const emit = (a: number, b: number, solids: [number, number][]) => {
      const m = (a + b) / 2
      for (const [bottom, top] of solids) {
        if (b - a < 1e-3 || top - bottom < 1e-3) continue
        this.box(x0 + dx * m, baseY + (bottom + top) / 2, z0 + dz * m, b - a, top - bottom, thickness, material, yaw)
      }
    }
    let runStart = xs[0]
    let runProfile: [number, number][] | null = null
    for (let k = 0; k < xs.length - 1; k++) {
      const a = xs[k]
      const b = xs[k + 1]
      if (b - a < 1e-4) continue
      const profile = profileAt((a + b) / 2)
      if (runProfile && JSON.stringify(profile) !== JSON.stringify(runProfile)) {
        emit(runStart, a, runProfile)
        runStart = a
      }
      if (!runProfile || runStart === a) runProfile = profile
    }
    if (runProfile) emit(runStart, len, runProfile)
  }

  /**
   * Casa de um ou dois andares com porta na frente (lado +Z local), janelas,
   * laje de cobertura com platibanda e, no sobrado, escada interna.
   */
  house(cx: number, cz: number, width: number, depth: number, opts: HouseOptions = {}): void {
    const yaw = opts.yaw ?? 0
    const floors = opts.floors ?? 1
    const fh = opts.floorHeight ?? 3.2
    const wallMat = opts.wall ?? 'plaster'
    const trim = opts.trim ?? 'concrete'
    const floorMat = opts.floor ?? 'wood'
    const windows = opts.windows ?? true
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    // local (lx, lz) → mundo, com a mesma rotação de makeObb (Ry)
    const wx = (lx: number, lz: number) => cx + c * lx + s * lz
    const wz = (lx: number, lz: number) => cz - s * lx + c * lz
    const base = opts.baseY ?? this.maxHeightIn(cx, cz, width / 2 + 0.5, depth / 2 + 0.5)
    const hw = width / 2
    const hd = depth / 2
    const t = WALL_T
    const totalH = fh * floors

    // Fundação e piso térreo
    this.block(cx, cz, base, width + 0.4, 0.15, depth + 0.4, trim, yaw, 1.5)
    const floorY = base + 0.15

    const win = (at: number, floorIndex: number): Opening => ({ at, width: 1.2, bottom: floorIndex * fh + 1.0, top: floorIndex * fh + 2.2 })
    const door: Opening = { at: width / 2 - 0.7, width: 1.4, bottom: 0, top: 2.4 }
    const frontOpen: Opening[] = [door]
    const backOpen: Opening[] = []
    const sideOpen: Opening[] = []
    for (let f = 0; f < floors; f++) {
      if (windows && width >= 7) {
        frontOpen.push(win(1.0, f), win(width - 2.2, f))
        backOpen.push(win(width / 2 - 0.6, f))
      }
      if (windows && depth >= 6) sideOpen.push(win(depth / 2 - 0.6, f))
    }
    if (floors === 2 && windows && width >= 7) {
      // janela central do andar de cima, acima da porta
      frontOpen.push({ at: width / 2 - 0.6, width: 1.2, bottom: fh + 1.0, top: fh + 2.2 })
    }
    const fix = (list: Opening[], wallLen: number) => list.map((o) => ({ ...o, bottom: Math.max(o.bottom, 0) })).filter((o) => o.at >= 0.3 && o.at + o.width <= wallLen - 0.3)
    // Frente (+Z local), da esquerda para a direita
    this.wall(wx(-hw, hd - t / 2), wz(-hw, hd - t / 2), wx(hw, hd - t / 2), wz(hw, hd - t / 2), floorY, totalH, wallMat, fix(frontOpen, width))
    // Fundos
    this.wall(wx(hw, -hd + t / 2), wz(hw, -hd + t / 2), wx(-hw, -hd + t / 2), wz(-hw, -hd + t / 2), floorY, totalH, wallMat, fix(backOpen, width))
    // Laterais (entre frente e fundos)
    this.wall(wx(-hw + t / 2, -hd + t), wz(-hw + t / 2, -hd + t), wx(-hw + t / 2, hd - t), wz(-hw + t / 2, hd - t), floorY, totalH, wallMat, fix(sideOpen.map((o) => ({ ...o, at: o.at - t })), depth - 2 * t))
    this.wall(wx(hw - t / 2, hd - t), wz(hw - t / 2, hd - t), wx(hw - t / 2, -hd + t), wz(hw - t / 2, -hd + t), floorY, totalH, wallMat, fix(sideOpen.map((o) => ({ ...o, at: o.at - t })), depth - 2 * t))

    const slabT = 0.25
    if (floors === 2) {
      // Escada ao longo da parede esquerda, subindo da frente para os fundos.
      const steps = Math.round(fh / 0.32)
      const stepH = fh / steps
      const tread = 0.3
      const run = steps * tread
      const stairW = 1.2
      const sx = -hw + t + stairW / 2
      const zStart = -hd + t + run
      this.stairs(wx(sx, zStart), wz(sx, zStart), floorY, stairW, stepH, tread, steps, yaw, floorMat)
      // Laje do 2º andar com o vão da escada
      const slabY = floorY + fh - slabT / 2
      const innerW = width - 2 * t
      const innerD = depth - 2 * t
      const restW = innerW - stairW - 0.1
      const mainX = -hw + t + stairW + 0.1 + restW / 2
      this.box(wx(mainX, 0), slabY, wz(mainX, 0), restW, slabT, innerD, floorMat, yaw)
      const frontD = innerD - run - 1.0
      if (frontD > 0.3) {
        const fzc = hd - t - frontD / 2
        this.box(wx(sx, fzc), slabY, wz(sx, fzc), stairW + 0.1, slabT, frontD, floorMat, yaw)
      }
    }
    // Laje de cobertura e platibanda
    const roofY = floorY + totalH
    this.box(cx, roofY + slabT / 2, cz, width + 0.3, slabT, depth + 0.3, trim, yaw)
    const ph = 0.6
    const py = roofY + slabT
    this.wall(wx(-hw - 0.15, hd + 0.05), wz(-hw - 0.15, hd + 0.05), wx(hw + 0.15, hd + 0.05), wz(hw + 0.15, hd + 0.05), py, ph, trim, [], 0.2)
    this.wall(wx(hw + 0.15, -hd - 0.05), wz(hw + 0.15, -hd - 0.05), wx(-hw - 0.15, -hd - 0.05), wz(-hw - 0.15, -hd - 0.05), py, ph, trim, [], 0.2)
    this.wall(wx(-hw - 0.05, -hd + 0.05), wz(-hw - 0.05, -hd + 0.05), wx(-hw - 0.05, hd - 0.05), wz(-hw - 0.05, hd - 0.05), py, ph, trim, [], 0.2)
    this.wall(wx(hw + 0.05, hd - 0.05), wz(hw + 0.05, hd - 0.05), wx(hw + 0.05, -hd + 0.05), wz(hw + 0.05, -hd + 0.05), py, ph, trim, [], 0.2)
  }

  // ---- adereços e metadados ----------------------------------------------

  prop(kind: PropKind, x: number, z: number, yaw: number, scale: number): void {
    const y = this.heightAt(x, z)
    this.props.push({ kind, x, y, z, yaw, scale })
    const world = this.ensureWorld()
    // Colisão aproximada: tronco das árvores, volume das rochas e caixotes.
    if (kind === 'pine' || kind === 'broadleaf') {
      const r = (kind === 'pine' ? 0.22 : 0.3) * scale
      world.add(makeObb(x, y + 2 * scale, z, r, 2 * scale + 0.5, r, yaw), Surface.Wood)
    } else if (kind === 'rock') {
      world.add(makeObb(x, y + 0.35 * scale, z, 0.75 * scale, 0.65 * scale, 0.6 * scale, yaw), Surface.Rock)
    } else if (kind === 'crate') {
      world.add(makeObb(x, y + 0.5 * scale, z, 0.5 * scale, 0.5 * scale, 0.5 * scale, yaw), Surface.Wood)
    }
  }

  label(text: string, x: number, y: number, z: number, yaw = 0, size = 0.8): void {
    this.labels.push({ text, x, y, z, yaw, size })
  }

  region(id: string, name: string, x: number, z: number, radius: number): void {
    this.regions.push({ id, name, x, z, radius })
  }

  spawn(x: number, z: number, yaw = 0): void {
    this.spawns.push({ x, z, yaw })
  }

  finish(): GameMap {
    const world = this.ensureWorld()
    if (this.spawns.length === 0) this.spawns.push({ x: 0, z: 0, yaw: 0 })
    return {
      def: this.def,
      terrain: this.terrain,
      world,
      boxes: this.boxes,
      props: this.props,
      labels: this.labels,
      regions: this.regions,
      spawns: this.spawns,
    }
  }
}

/** Constrói um mapa completo (relevo, colisão e conteúdo) a partir da definição. */
export function buildMap(def: MapDefinition): GameMap {
  const b = new MapBuilder(def)
  def.build(b)
  return b.finish()
}

/** Região que contém o ponto (a de menor raio, se houver sobreposição). */
export function regionAt(map: GameMap, x: number, z: number): Region | null {
  let best: Region | null = null
  for (const r of map.regions) {
    if (Math.hypot(x - r.x, z - r.z) <= r.radius && (!best || r.radius < best.radius)) best = r
  }
  return best
}
