import { Rng } from '../math/rng'
import { smoothstep } from '../math/scalar'
import { CollisionWorld, Surface, type SurfaceId } from '../world/collision-world'
import { Heightfield } from '../world/heightfield'
import { makeObb, rampObb, type Obb } from '../world/obb'
import type { Chest, FixedLoot, GameMap, LootSpot, MapDefinition, MapLabel, MaterialId, Prop, PropKind, Region, SpawnPoint, StaticBox, TargetDummy } from './types'

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
  'metal-blue': Surface.Metal,
  'metal-green': Surface.Metal,
  asphalt: Surface.Concrete,
}

/** Abertura em uma parede: distância ao longo da parede a partir do início, largura, base e topo. */
export interface Opening {
  at: number
  width: number
  bottom: number
  top: number
}

export interface BuildingOptions {
  yaw?: number
  /** Andares (1–8). */
  floors?: number
  floorHeight?: number
  wall?: MaterialId
  trim?: MaterialId
  floor?: MaterialId
  /** Altura da base; padrão: maior altura do relevo sob a planta. */
  baseY?: number
  windows?: boolean
  /** Escada até a laje do telhado. */
  roofAccess?: boolean
  /** Nível de loot (null = sem loot). */
  loot?: number | null
  /** Chance de baú por andar. */
  chestChance?: number
  /** 0–1: ruína (paredes do último andar quebradas, telhado faltando). */
  ruin?: number
}

/** Compatibilidade com a Fase 1. */
export type HouseOptions = BuildingOptions

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
  readonly chests: Chest[] = []
  readonly lootSpots: LootSpot[] = []
  readonly targets: TargetDummy[] = []
  readonly propColliders = new Map<number, number>()
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
    return this.addObb(makeObb(cx, cy, cz, sx / 2, sy / 2, sz / 2, yaw, pitch), material)
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
    return this.addObb(rampObb(x, baseY, z, width, rise, angle, yaw, thickness), material)
  }

  private addObb(obb: Obb, material: MaterialId): StaticBox {
    const colliderId = this.ensureWorld().add(obb, SURFACE_OF[material])
    const b = { obb, material, colliderId }
    this.boxes.push(b)
    return b
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
   * Prédio de N andares com porta na frente (lado +Z local), janelas em todos
   * os andares, escada em "vai e volta" ao longo da parede esquerda (duas
   * faixas: os lances alternam de faixa e o vão da laje alterna junto),
   * laje de cobertura com platibanda e, opcionalmente, acesso ao telhado.
   * Cria pontos de loot e baús por andar.
   */
  building(cx: number, cz: number, width: number, depth: number, opts: BuildingOptions = {}): { floorY: number; roofY: number } {
    const yaw = opts.yaw ?? 0
    const floors = Math.max(1, Math.min(8, Math.round(opts.floors ?? 1)))
    const fh = opts.floorHeight ?? 3.2
    const wallMat = opts.wall ?? 'plaster'
    const trim = opts.trim ?? 'concrete'
    const floorMat = opts.floor ?? 'wood'
    const windows = opts.windows ?? true
    const roofAccess = opts.roofAccess ?? floors >= 2
    const lootTier = opts.loot === undefined ? 0 : opts.loot
    const chestChance = opts.chestChance ?? 0.3
    const ruin = opts.ruin ?? 0
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    const wx = (lx: number, lz: number) => cx + c * lx + s * lz
    const wz = (lx: number, lz: number) => cz - s * lx + c * lz
    const base = opts.baseY ?? this.maxHeightIn(cx, cz, width / 2 + 0.5, depth / 2 + 0.5)
    const hw = width / 2
    const hd = depth / 2
    const t = WALL_T
    const totalH = fh * floors
    const slabT = 0.25

    // Fundação e piso térreo
    this.block(cx, cz, base, width + 0.4, 0.15, depth + 0.4, trim, yaw, 1.5)
    const floorY = base + 0.15

    // Paredes com porta e janelas por andar
    const win = (at: number, f: number): Opening => ({ at, width: 1.2, bottom: f * fh + 1.0, top: f * fh + 2.2 })
    const frontOpen: Opening[] = [{ at: width / 2 - 0.7, width: 1.4, bottom: 0, top: 2.4 }]
    const backOpen: Opening[] = []
    const sideOpen: Opening[] = []
    for (let f = 0; f < floors; f++) {
      if (windows && width >= 7) {
        frontOpen.push(win(1.0, f), win(width - 2.2, f))
        if (f > 0) frontOpen.push({ at: width / 2 - 0.6, width: 1.2, bottom: f * fh + 1.0, top: f * fh + 2.2 })
        backOpen.push(win(width / 2 + 0.8, f))
      }
      if (windows && depth >= 6) sideOpen.push(win(depth / 2 - 0.6, f))
    }
    const fix = (list: Opening[], wallLen: number) => list.filter((o) => o.at >= 0.3 && o.at + o.width <= wallLen - 0.3)
    const wallH = (k: number) => (ruin > 0 ? totalH - this.rng.range(0, ruin * fh * 1.3) * (k % 2 === 0 ? 1 : 0.6) : totalH)
    this.wall(wx(-hw, hd - t / 2), wz(-hw, hd - t / 2), wx(hw, hd - t / 2), wz(hw, hd - t / 2), floorY, wallH(0), wallMat, fix(frontOpen, width))
    this.wall(wx(hw, -hd + t / 2), wz(hw, -hd + t / 2), wx(-hw, -hd + t / 2), wz(-hw, -hd + t / 2), floorY, wallH(1), wallMat, fix(backOpen, width))
    const side = fix(sideOpen.map((o) => ({ ...o, at: o.at - t })), depth - 2 * t)
    this.wall(wx(-hw + t / 2, -hd + t), wz(-hw + t / 2, -hd + t), wx(-hw + t / 2, hd - t), wz(-hw + t / 2, hd - t), floorY, wallH(2), wallMat, side)
    this.wall(wx(hw - t / 2, hd - t), wz(hw - t / 2, hd - t), wx(hw - t / 2, -hd + t), wz(hw - t / 2, -hd + t), floorY, wallH(3), wallMat, side)

    // Escada em vai e volta: faixa A sobe para os fundos (-Z), faixa B volta para a frente (+Z)
    const flights = floors - 1 + (roofAccess ? 1 : 0)
    const stripW = 1.2
    const steps = Math.round(fh / 0.32)
    const stepH = fh / steps
    const tread = 0.3
    const run = steps * tread
    // patamar nos fundos: os lances viram ali (A chega, B parte)
    const landing = 1.2
    const back = -hd + t
    const turn = back + landing
    const front = turn + run
    const stripX = [-hw + t + stripW / 2, -hw + t + stripW * 1.5]
    const canStairs = width >= 7 && depth >= run + landing + 2
    for (let L = 0; L < flights && canStairs; L++) {
      const a = L % 2
      const sx = stripX[a]
      const sz = a === 0 ? front : turn
      this.stairs(wx(sx, sz), wz(sx, sz), floorY + L * fh, stripW, stepH, tread, steps, a === 0 ? yaw : yaw + Math.PI, floorMat)
    }
    // Lajes: inteiras, menos o vão sobre o lance que chega a este nível
    const innerL = -hw + t
    const innerR = hw - t
    const rect = (x0: number, x1: number, z0: number, z1: number, top: number, mat: MaterialId) => {
      if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return
      this.box(wx((x0 + x1) / 2, (z0 + z1) / 2), top - slabT / 2, wz((x0 + x1) / 2, (z0 + z1) / 2), x1 - x0, slabT, z1 - z0, mat, yaw)
    }
    const slabWithHole = (level: number, top: number, mat: MaterialId, x0: number, x1: number, z0: number, z1: number) => {
      const holeStrip = (level - 1) % 2
      if (!canStairs || level - 1 >= flights) {
        rect(x0, x1, z0, z1, top, mat)
        return
      }
      const stripL = innerL + holeStrip * stripW
      const stripR = stripL + stripW
      rect(x0, x1, front, z1, top, mat) // frente
      rect(x0, x1, z0, turn, top, mat) // fundos + patamar
      rect(x0, stripL, turn, front, top, mat) // à esquerda do vão
      rect(stripR, x1, turn, front, top, mat) // à direita do vão
    }
    for (let L = 1; L < floors; L++) {
      if (ruin > 0.6 && L === floors - 1 && this.rng.chance(0.5)) continue
      slabWithHole(L, floorY + L * fh, floorMat, innerL, innerR, back, hd - t)
    }
    const roofY = floorY + totalH
    if (ruin < 0.5) {
      slabWithHole(floors, roofY + slabT, trim, -hw - 0.15, hw + 0.15, -hd - 0.15, hd + 0.15)
      const ph = 0.6
      const py = roofY + slabT
      this.wall(wx(-hw - 0.15, hd + 0.05), wz(-hw - 0.15, hd + 0.05), wx(hw + 0.15, hd + 0.05), wz(hw + 0.15, hd + 0.05), py, ph, trim, [], 0.2)
      this.wall(wx(hw + 0.15, -hd - 0.05), wz(hw + 0.15, -hd - 0.05), wx(-hw - 0.15, -hd - 0.05), wz(-hw - 0.15, -hd - 0.05), py, ph, trim, [], 0.2)
      this.wall(wx(-hw - 0.05, -hd + 0.05), wz(-hw - 0.05, -hd + 0.05), wx(-hw - 0.05, hd - 0.05), wz(-hw - 0.05, hd - 0.05), py, ph, trim, [], 0.2)
      this.wall(wx(hw + 0.05, hd - 0.05), wz(hw + 0.05, hd - 0.05), wx(hw + 0.05, -hd + 0.05), wz(hw + 0.05, -hd + 0.05), py, ph, trim, [], 0.2)
    }

    // Loot: um ponto por andar (fora da escada) e baús nos fundos à direita
    if (lootTier !== null) {
      for (let f = 0; f < floors; f++) {
        const y = floorY + f * fh
        const lx = hw * 0.35
        const lz = hd * 0.25
        this.lootSpot(wx(lx, lz), wz(lx, lz), lootTier, y)
        if (this.rng.chance(chestChance)) {
          const kx = hw - t - 0.7
          const kz = -hd + t + 0.6
          this.chest(wx(kx, kz), wz(kx, kz), yaw, lootTier + 1, y)
        }
      }
      if (roofAccess && ruin < 0.5 && this.rng.chance(chestChance)) {
        const kx = hw * 0.5
        const kz = hd * 0.3
        this.chest(wx(kx, kz), wz(kx, kz), yaw, lootTier + 1, roofY + slabT)
      }
    }
    return { floorY, roofY }
  }

  /** Casa simples (sem acesso ao telhado por padrão). */
  house(cx: number, cz: number, width: number, depth: number, opts: BuildingOptions = {}): { floorY: number; roofY: number } {
    return this.building(cx, cz, width, depth, { roofAccess: false, ...opts })
  }

  // ---- adereços e metadados ----------------------------------------------

  prop(kind: PropKind, x: number, z: number, yaw: number, scale: number): void {
    const y = this.heightAt(x, z)
    const index = this.props.length
    this.props.push({ kind, x, y, z, yaw, scale })
    const world = this.ensureWorld()
    // Colisão aproximada: tronco das árvores, volume das rochas e caixotes.
    let id = -1
    if (kind === 'pine' || kind === 'broadleaf') {
      const r = (kind === 'pine' ? 0.22 : 0.3) * scale
      id = world.add(makeObb(x, y + 2 * scale, z, r, 2 * scale + 0.5, r, yaw), Surface.Wood)
    } else if (kind === 'rock') {
      id = world.add(makeObb(x, y + 0.35 * scale, z, 0.75 * scale, 0.65 * scale, 0.6 * scale, yaw), Surface.Rock)
    } else if (kind === 'crate') {
      id = world.add(makeObb(x, y + 0.5 * scale, z, 0.5 * scale, 0.5 * scale, 0.5 * scale, yaw), Surface.Wood)
    }
    if (id >= 0) this.propColliders.set(id, index)
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

  /** Altura da primeira superfície abaixo de (x, fromY, z). */
  surfaceAt(x: number, z: number, fromY = 300): number {
    const world = this.ensureWorld()
    const hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, colliderId: -1, surface: 0 as SurfaceId }
    return world.raycast(x, fromY, z, 0, -1, 0, fromY + 100, hit) ? hit.y : this.heightAt(x, z)
  }

  /** Baú apoiado em `y` (ou na superfície abaixo). Tem colisão. */
  chest(x: number, z: number, yaw: number, tier: number, y?: number): void {
    const baseY = y ?? this.surfaceAt(x, z)
    this.ensureWorld().add(makeObb(x, baseY + 0.3, z, 0.45, 0.3, 0.3, yaw), Surface.Wood)
    this.chests.push({ x, y: baseY, z, yaw, tier })
  }

  lootSpot(x: number, z: number, tier: number, y?: number, fixed?: FixedLoot, refill = 0): void {
    this.lootSpots.push({ x, y: y ?? this.surfaceAt(x, z), z, tier, fixed, refill })
  }

  target(x: number, z: number, yaw: number): void {
    this.targets.push({ x, y: this.surfaceAt(x, z), z, yaw })
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
      chests: this.chests,
      lootSpots: this.lootSpots,
      targets: this.targets,
      propColliders: this.propColliders,
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
