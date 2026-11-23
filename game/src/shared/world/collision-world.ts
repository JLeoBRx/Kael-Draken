import { Heightfield } from './heightfield'
import { rayVsObb, type Obb, type RayHit } from './obb'
import { SpatialGrid } from './spatial-grid'

/** Tipos de superfície (passos, impactos de bala, partículas). */
export const Surface = {
  Terrain: 0,
  Concrete: 1,
  Wood: 2,
  Metal: 3,
  Brick: 4,
  Rock: 5,
  Foliage: 6,
} as const
export type SurfaceId = (typeof Surface)[keyof typeof Surface]

export interface Collider {
  id: number
  obb: Obb
  surface: SurfaceId
}

export interface WorldHit {
  t: number
  x: number
  y: number
  z: number
  nx: number
  ny: number
  nz: number
  /** -1 quando o impacto é no relevo. */
  colliderId: number
  surface: SurfaceId
}

export function createWorldHit(): WorldHit {
  return { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, colliderId: -1, surface: Surface.Terrain }
}

/**
 * Geometria de colisão de uma partida: relevo + caixas (estáticas do mapa e,
 * nas próximas fases, construções dos jogadores). Mesma implementação no
 * cliente (predição) e no servidor (autoridade).
 */
export class CollisionWorld {
  readonly terrain: Heightfield
  readonly waterLevel: number
  /** Limite jogável em X e Z: [-bound, bound]. */
  readonly bound: number
  private readonly colliders: (Collider | undefined)[] = []
  private readonly freeIds: number[] = []
  private readonly grid: SpatialGrid
  private readonly cellSize: number
  private readonly idScratch: number[] = []
  private readonly rayScratch: RayHit = { t: 0, nx: 0, ny: 0, nz: 0 }
  private readonly normalScratch = { x: 0, y: 1, z: 0 }
  private count = 0

  constructor(terrain: Heightfield, waterLevel: number, cellSize = 8) {
    this.terrain = terrain
    this.waterLevel = waterLevel
    this.bound = terrain.size / 2 - 1
    this.cellSize = cellSize
    this.grid = new SpatialGrid(terrain.min, terrain.min, terrain.size, cellSize)
  }

  get colliderCount(): number {
    return this.count
  }

  add(obb: Obb, surface: SurfaceId): number {
    const id = this.freeIds.length > 0 ? this.freeIds.pop()! : this.colliders.length
    this.colliders[id] = { id, obb, surface }
    this.grid.insert(id, obb.minX, obb.minZ, obb.maxX, obb.maxZ)
    this.count++
    return id
  }

  remove(id: number): void {
    const c = this.colliders[id]
    if (!c) return
    this.grid.remove(id, c.obb.minX, c.obb.minZ, c.obb.maxX, c.obb.maxZ)
    this.colliders[id] = undefined
    this.freeIds.push(id)
    this.count--
  }

  get(id: number): Collider | undefined {
    return this.colliders[id]
  }

  /** Visita todos os colisores existentes. */
  forEach(fn: (c: Collider) => void): void {
    for (const c of this.colliders) if (c) fn(c)
  }

  /** Colisores cuja caixa envolvente cruza a AABB dada. Limpa e preenche `out`. */
  queryAabb(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: Collider[]): Collider[] {
    out.length = 0
    const ids = this.idScratch
    ids.length = 0
    this.grid.query(minX, minZ, maxX, maxZ, ids)
    for (let k = 0; k < ids.length; k++) {
      const c = this.colliders[ids[k]]
      if (!c) continue
      const o = c.obb
      if (o.maxX < minX || o.minX > maxX || o.maxY < minY || o.minY > maxY || o.maxZ < minZ || o.minZ > maxZ) continue
      out.push(c)
    }
    return out
  }

  /** Raio contra relevo e caixas; `dir` deve ser unitário. Preenche `out` com o impacto mais próximo. */
  raycast(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxDist: number, out: WorldHit, includeTerrain = true,
  ): boolean {
    let best = maxDist
    let found = false
    if (includeTerrain) {
      const t = this.terrain.raycast(ox, oy, oz, dx, dy, dz, maxDist)
      if (t >= 0 && t <= best) {
        best = t
        found = true
        const n = this.terrain.normalAt(ox + dx * t, oz + dz * t, this.normalScratch)
        out.nx = n.x; out.ny = n.y; out.nz = n.z
        out.colliderId = -1
        out.surface = Surface.Terrain
      }
    }
    const seg = this.cellSize * 2
    const tested = maxDist > seg ? new Set<number>() : null
    const ids = this.idScratch
    const hit = this.rayScratch
    for (let t0 = 0; t0 < best; t0 += seg) {
      const t1 = Math.min(t0 + seg, best)
      const ax = ox + dx * t0, az = oz + dz * t0
      const bx = ox + dx * t1, bz = oz + dz * t1
      ids.length = 0
      this.grid.query(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), ids)
      for (let k = 0; k < ids.length; k++) {
        const id = ids[k]
        if (tested) {
          if (tested.has(id)) continue
          tested.add(id)
        }
        const c = this.colliders[id]
        if (!c) continue
        if (rayVsObb(ox, oy, oz, dx, dy, dz, c.obb, best, hit) && hit.t <= best) {
          best = hit.t
          found = true
          out.nx = hit.nx; out.ny = hit.ny; out.nz = hit.nz
          out.colliderId = id
          out.surface = c.surface
        }
      }
      if (best <= t1) break
    }
    if (found) {
      out.t = best
      out.x = ox + dx * best
      out.y = oy + dy * best
      out.z = oz + dz * best
    }
    return found
  }
}
