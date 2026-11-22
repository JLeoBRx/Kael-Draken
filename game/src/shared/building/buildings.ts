import { BUILD, BUILD_MATERIALS, BUILD_START_FRACTION, BuildKind } from '../config/building'
import { Surface, type Collider, type CollisionWorld } from '../world/collision-world'
import { pieceKey, pieceObbs, type PieceSpec } from './grid'

/**
 * Construções de uma partida sobre o CollisionWorld. O servidor tem a cópia
 * oficial; o cliente tem a sua (peças confirmadas + peças previstas, com id
 * negativo = −seq do comando que as criou) para prever o movimento e mostrar
 * o fantasma.
 *
 * Integridade estrutural: uma peça precisa tocar o chão (relevo ou geometria
 * fixa do mapa) ou outra peça. Quando peças somem, os grupos que ficaram sem
 * ligação com o chão desabam.
 */

export interface Piece {
  id: number
  spec: PieceSpec
  key: string
  material: number
  colliders: number[]
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
  /** Tick em que foi colocada. */
  builtAt: number
  /** Dano acumulado. */
  damage: number
  builder: number
  seq: number
  predicted: boolean
}

const SURFACE_OF_MATERIAL = [Surface.Wood, Surface.Brick, Surface.Metal] as const
const EPS = 0.12

export function pieceMaxHealth(material: number): number {
  return BUILD_MATERIALS[material]?.maxHealth ?? 100
}

/** Vida atual: cresce da fração inicial até a máxima durante o tempo de construção. */
export function pieceHealth(p: Pick<Piece, 'material' | 'builtAt' | 'damage'>, tick: number, tickRate: number): number {
  const m = BUILD_MATERIALS[p.material]
  const progress = Math.min(1, Math.max(0, (tick - p.builtAt) / (m.buildTime * tickRate)))
  return m.maxHealth * (BUILD_START_FRACTION + (1 - BUILD_START_FRACTION) * progress) - p.damage
}

export class BuildingWorld {
  readonly byKey = new Map<string, Piece>()
  readonly byId = new Map<number, Piece>()
  private readonly byCollider = new Map<number, Piece>()
  private readonly scratch: Collider[] = []

  constructor(readonly world: CollisionWorld) {}

  get count(): number {
    return this.byId.size
  }

  pieceOfCollider(colliderId: number): Piece | undefined {
    return this.byCollider.get(colliderId)
  }

  hasRamp(i: number, j: number, k: number, dir: number): boolean {
    const p = this.byKey.get(pieceKey({ kind: BuildKind.Ramp, i, j, k, dir }))
    return !!p && p.spec.dir === dir
  }

  add(spec: PieceSpec, id: number, material: number, o: { builtAt?: number; damage?: number; builder?: number; seq?: number; predicted?: boolean } = {}): Piece {
    const obbs = pieceObbs(spec)
    const colliders = obbs.map((obb) => this.world.add(obb, SURFACE_OF_MATERIAL[material] ?? Surface.Wood))
    const p: Piece = {
      id, spec: { ...spec }, key: pieceKey(spec), material, colliders,
      minX: Math.min(...obbs.map((o) => o.minX)), minY: Math.min(...obbs.map((o) => o.minY)), minZ: Math.min(...obbs.map((o) => o.minZ)),
      maxX: Math.max(...obbs.map((o) => o.maxX)), maxY: Math.max(...obbs.map((o) => o.maxY)), maxZ: Math.max(...obbs.map((o) => o.maxZ)),
      builtAt: o.builtAt ?? 0, damage: o.damage ?? 0, builder: o.builder ?? 0, seq: o.seq ?? 0, predicted: o.predicted ?? false,
    }
    this.byKey.set(p.key, p)
    this.byId.set(id, p)
    for (const c of colliders) this.byCollider.set(c, p)
    return p
  }

  remove(p: Piece): void {
    if (this.byId.get(p.id) !== p) return
    for (const c of p.colliders) {
      this.world.remove(c)
      this.byCollider.delete(c)
    }
    this.byId.delete(p.id)
    if (this.byKey.get(p.key) === p) this.byKey.delete(p.key)
  }

  /** Troca o id de uma peça (peça prevista confirmada pelo servidor). */
  rekey(p: Piece, id: number): void {
    this.byId.delete(p.id)
    p.id = id
    p.predicted = false
    this.byId.set(id, p)
  }

  /** Peças cuja caixa envolvente encosta em [min, max] (com folga). */
  private piecesNear(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, except?: Piece): Piece[] {
    const out = new Set<Piece>()
    this.world.queryAabb(minX - EPS, minY - EPS, minZ - EPS, maxX + EPS, maxY + EPS, maxZ + EPS, this.scratch)
    for (const c of this.scratch) {
      const p = this.byCollider.get(c.id)
      if (p && p !== except) out.add(p)
    }
    return [...out]
  }

  neighbors(p: Piece): Piece[] {
    return this.piecesNear(p.minX, p.minY, p.minZ, p.maxX, p.maxY, p.maxZ, p)
  }

  /** A peça toca o relevo ou a geometria fixa do mapa? */
  isGrounded(b: { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number }): boolean {
    const t = this.world.terrain
    const inset = 0.3
    const xs = [b.minX + inset, (b.minX + b.maxX) / 2, b.maxX - inset]
    const zs = [b.minZ + inset, (b.minZ + b.maxZ) / 2, b.maxZ - inset]
    for (const x of xs) for (const z of zs) if (t.heightAt(x, z) >= b.minY - 0.3) return true
    this.world.queryAabb(b.minX - EPS, b.minY - EPS, b.minZ - EPS, b.maxX + EPS, b.minY + 0.5, b.maxZ + EPS, this.scratch)
    for (const c of this.scratch) if (!this.byCollider.has(c.id)) return true
    return false
  }

  /** null se pode construir; senão, o motivo. */
  canPlace(spec: PieceSpec): string | null {
    const key = pieceKey(spec)
    if (this.byKey.has(key)) return 'Ocupado'
    if (spec.kind === BuildKind.Ramp && this.byKey.has(pieceKey({ ...spec, kind: BuildKind.Roof }))) return 'Ocupado'
    if (spec.kind === BuildKind.Roof && this.byKey.has(pieceKey({ ...spec, kind: BuildKind.Ramp }))) return 'Ocupado'
    const obbs = pieceObbs(spec)
    const b = {
      minX: Math.min(...obbs.map((o) => o.minX)), minY: Math.min(...obbs.map((o) => o.minY)), minZ: Math.min(...obbs.map((o) => o.minZ)),
      maxX: Math.max(...obbs.map((o) => o.maxX)), maxY: Math.max(...obbs.map((o) => o.maxY)), maxZ: Math.max(...obbs.map((o) => o.maxZ)),
    }
    const bound = this.world.bound - 2
    if (b.minX < -bound || b.maxX > bound || b.minZ < -bound || b.maxZ > bound) return 'Fora da área'
    const t = this.world.terrain
    if (b.minY > t.highest + BUILD.maxHeightAboveTerrain) return 'Alto demais'
    const cx = (b.minX + b.maxX) / 2
    const cz = (b.minZ + b.maxZ) / 2
    if (b.maxY < t.heightAt(cx, cz) - 0.2 && b.maxY < t.heightAt(b.minX, b.minZ) && b.maxY < t.heightAt(b.maxX, b.maxZ)) return 'Enterrado'
    if (this.isGrounded(b)) return null
    if (this.piecesNear(b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ).length > 0) return null
    return 'Sem apoio'
  }

  /**
   * Depois que peças foram removidas, devolve as que ficaram sem ligação com o
   * chão (a partir das vizinhas das removidas, colhidas ANTES da remoção).
   */
  unsupported(candidates: Iterable<Piece>): Piece[] {
    const visited = new Set<Piece>()
    const out: Piece[] = []
    for (const start of candidates) {
      if (visited.has(start) || this.byId.get(start.id) !== start) continue
      const comp: Piece[] = []
      const queue = [start]
      visited.add(start)
      let grounded = false
      while (queue.length > 0) {
        const p = queue.pop()!
        comp.push(p)
        if (!grounded && this.isGrounded(p)) grounded = true
        for (const n of this.neighbors(p)) {
          if (!visited.has(n)) {
            visited.add(n)
            queue.push(n)
          }
        }
      }
      if (!grounded) out.push(...comp)
    }
    return out
  }
}
