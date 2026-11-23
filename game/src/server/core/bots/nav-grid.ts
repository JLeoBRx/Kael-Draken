import { MOVE } from '../../../shared/config/movement'
import type { GameMap } from '../../../shared/maps/types'

/**
 * Grade de navegação dos bots, gerada do mapa (relevo + colisores fixos).
 *
 * Cada célula de `cell` metros guarda se dá para ficar de pé nela no nível do
 * chão e quanto custa atravessá-la (água custa mais). Andares superiores de
 * prédios não entram (os bots ficam no térreo); construções dos jogadores e
 * adereços quebrados mudam durante a partida e são tratados pelo próprio bot
 * (desvia, pula ou quebra o que o prende).
 */

const BLOCKED = 255
const SQRT2 = Math.SQRT2
/** Inclinação máxima que o bot aceita (um pouco abaixo da caminhável). */
const MAX_SLOPE = Math.tan(46 * (Math.PI / 180))

export interface NavPoint {
  x: number
  z: number
}

/** Fila de prioridade (heap binário) de índices de célula. */
class MinHeap {
  private ids = new Int32Array(4096)
  private keys = new Float64Array(4096)
  size = 0

  clear(): void {
    this.size = 0
  }

  push(id: number, key: number): void {
    if (this.size === this.ids.length) {
      const ids = new Int32Array(this.size * 2)
      ids.set(this.ids)
      this.ids = ids
      const keys = new Float64Array(this.size * 2)
      keys.set(this.keys)
      this.keys = keys
    }
    let i = this.size++
    while (i > 0) {
      const p = (i - 1) >> 1
      if (this.keys[p] <= key) break
      this.ids[i] = this.ids[p]
      this.keys[i] = this.keys[p]
      i = p
    }
    this.ids[i] = id
    this.keys[i] = key
  }

  pop(): number {
    const top = this.ids[0]
    const lastId = this.ids[--this.size]
    const lastKey = this.keys[this.size]
    let i = 0
    for (;;) {
      let c = 2 * i + 1
      if (c >= this.size) break
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++
      if (this.keys[c] >= lastKey) break
      this.ids[i] = this.ids[c]
      this.keys[i] = this.keys[c]
      i = c
    }
    this.ids[i] = lastId
    this.keys[i] = lastKey
    return top
  }
}

export class NavGrid {
  readonly cell: number
  readonly n: number
  readonly origin: number
  /** Custo por célula: 1 = chão, maior = água; 255 = bloqueada. */
  readonly cost: Uint8Array
  /** Altura do chão no centro da célula. */
  readonly ground: Float32Array
  /** Expansões da última busca (para medir). */
  lastExpanded = 0
  /** Células de passagem por portas: índice → ponto exato a seguir. */
  readonly portalPoints = new Map<number, NavPoint>()
  private readonly g: Float32Array
  private readonly from: Int32Array
  private readonly stamp: Uint32Array
  private readonly closed: Uint32Array
  private generation = 0
  private readonly heap = new MinHeap()

  constructor(map: GameMap, cell = 2) {
    const world = map.world
    const t = map.terrain
    this.cell = cell
    this.origin = -world.bound
    this.n = Math.ceil((world.bound * 2) / cell)
    const n = this.n
    const total = n * n
    this.cost = new Uint8Array(total)
    this.ground = new Float32Array(total)
    this.g = new Float32Array(total)
    this.from = new Int32Array(total)
    this.stamp = new Uint32Array(total)
    this.closed = new Uint32Array(total)
    const water = map.def.waterLevel
    const h = cell / 2
    // Relevo: inclinação e água
    for (let j = 0; j < n; j++) {
      const z = this.origin + (j + 0.5) * cell
      for (let i = 0; i < n; i++) {
        const x = this.origin + (i + 0.5) * cell
        const y = t.heightAt(x, z)
        const k = j * n + i
        this.ground[k] = y
        const gx = (t.heightAt(x + h, z) - t.heightAt(x - h, z)) / cell
        const gz = (t.heightAt(x, z + h) - t.heightAt(x, z - h)) / cell
        const depth = water - y
        if (depth > MOVE.swimEnterDepth) this.cost[k] = depth > 12 ? 8 : 4 // nadar é lento
        else if (Math.hypot(gx, gz) > MAX_SLOPE) this.cost[k] = BLOCKED
        else this.cost[k] = 1
        if (i === 0 || j === 0 || i === n - 1 || j === n - 1) this.cost[k] = BLOCKED
      }
    }
    // Colisores fixos que barram uma pessoa em pé (paredes, troncos, rochas, baús…)
    const r = MOVE.radius + 0.1
    world.forEach((c) => {
      const o = c.obb
      if (Math.abs(o.pitch) > 0.05) return // rampas e telhados inclinados: passáveis/altos
      // Eixo fino (cercas, paredes): marca toda célula que ele atravessa, não
      // só as de centro próximo; no eixo comprido o teste segue pelo centro
      // (assim portas e vãos continuam passáveis).
      const tu = o.hx + r + (o.hx < cell / 2 ? (cell / 2) * (Math.abs(o.ux) + Math.abs(o.uz)) : 0)
      const tw = o.hz + r + (o.hz < cell / 2 ? (cell / 2) * (Math.abs(o.wx) + Math.abs(o.wz)) : 0)
      const i0 = Math.max(0, Math.floor((o.minX - r - cell / 2 - this.origin) / cell))
      const i1 = Math.min(n - 1, Math.floor((o.maxX + r + cell / 2 - this.origin) / cell))
      const j0 = Math.max(0, Math.floor((o.minZ - r - cell / 2 - this.origin) / cell))
      const j1 = Math.min(n - 1, Math.floor((o.maxZ + r + cell / 2 - this.origin) / cell))
      for (let j = j0; j <= j1; j++) {
        const z = this.origin + (j + 0.5) * cell
        for (let i = i0; i <= i1; i++) {
          const k = j * n + i
          if (this.cost[k] === BLOCKED) continue
          const x = this.origin + (i + 0.5) * cell
          const gy = this.ground[k]
          // ocupa a altura do corpo (degraus baixos e coisas no alto não bloqueiam)
          if (o.maxY < gy + MOVE.stepHeight + 0.05 || o.minY > gy + MOVE.standHeight + 0.1) continue
          const dx = x - o.cx
          const dz = z - o.cz
          if (Math.abs(dx * o.ux + dz * o.uz) > tu) continue
          if (Math.abs(dx * o.wx + dz * o.wz) > tw) continue
          this.cost[k] = BLOCKED
        }
      }
    })
    // Portas e vãos: abre um corredor perpendicular à parede pelo centro do
    // vão e guarda os pontos exatos (o caminho passa por eles, não pelo
    // centro da célula, que pode estar no batente).
    for (const p of map.portals) {
      const i = this.cellX(p.x)
      const j = this.cellZ(p.z)
      if (p.y - this.ground[j * n + i] > 1.2) continue // andares de cima
      for (let s = -2; s <= 2; s++) {
        const x = p.x + p.nx * s * (cell * 0.75)
        const z = p.z + p.nz * s * (cell * 0.75)
        const k = this.cellZ(z) * n + this.cellX(x)
        if (this.cost[k] !== BLOCKED && s !== 0 && !this.portalPoints.has(k)) continue
        if (this.cost[k] === BLOCKED || this.cost[k] > 1) this.cost[k] = 1
        if (!this.portalPoints.has(k)) this.portalPoints.set(k, { x, z })
      }
    }
  }

  cellX(x: number): number {
    return Math.min(this.n - 1, Math.max(0, Math.floor((x - this.origin) / this.cell)))
  }

  cellZ(z: number): number {
    return this.cellX(z)
  }

  centerOf(i: number): number {
    return this.origin + (i + 0.5) * this.cell
  }

  walkableAt(x: number, z: number): boolean {
    return this.cost[this.cellZ(z) * this.n + this.cellX(x)] !== BLOCKED
  }

  isBlocked(i: number, j: number): boolean {
    if (i < 0 || j < 0 || i >= this.n || j >= this.n) return true
    return this.cost[j * this.n + i] === BLOCKED
  }

  /** Célula livre mais próxima (busca em anéis até `radius` células). */
  nearestFree(i: number, j: number, radius = 8): [number, number] | null {
    if (!this.isBlocked(i, j)) return [i, j]
    for (let r = 1; r <= radius; r++) {
      for (let dj = -r; dj <= r; dj++) {
        for (let di = -r; di <= r; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
          if (!this.isBlocked(i + di, j + dj)) return [i + di, j + dj]
        }
      }
    }
    return null
  }

  /** Linha reta entre dois pontos passa só por células livres (sem água funda)? */
  lineWalkable(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax
    const dz = bz - az
    const len = Math.hypot(dx, dz)
    const steps = Math.ceil(len / (this.cell * 0.5))
    for (let s = 0; s <= steps; s++) {
      const f = steps === 0 ? 0 : s / steps
      const k = this.cellZ(az + dz * f) * this.n + this.cellX(ax + dx * f)
      const c = this.cost[k]
      if (c === BLOCKED || c > 4) return false
    }
    return true
  }

  /**
   * A* em 8 direções (sem cortar quinas), com heurística octil ponderada.
   * Se o destino não for alcançado em `maxNodes` expansões, devolve o
   * caminho até a célula mais próxima dele. Pontos já suavizados.
   */
  findPath(sx: number, sz: number, tx: number, tz: number, maxNodes = 20000): NavPoint[] | null {
    const n = this.n
    const start = this.nearestFree(this.cellX(sx), this.cellZ(sz), 3)
    const goal = this.nearestFree(this.cellX(tx), this.cellZ(tz), 10)
    if (!start || !goal) return null
    const s = start[1] * n + start[0]
    const gIdx = goal[1] * n + goal[0]
    const gen = ++this.generation
    const heap = this.heap
    heap.clear()
    const gi = goal[0]
    const gj = goal[1]
    const W = 1.25
    const hfn = (i: number, j: number) => {
      const di = Math.abs(i - gi)
      const dj = Math.abs(j - gj)
      return (Math.max(di, dj) + (SQRT2 - 1) * Math.min(di, dj)) * W
    }
    this.g[s] = 0
    this.from[s] = -1
    this.stamp[s] = gen
    heap.push(s, hfn(start[0], start[1]))
    let best = s
    let bestH = Infinity
    let expanded = 0
    let found = false
    while (heap.size > 0 && expanded < maxNodes) {
      const cur = heap.pop()
      if (this.closed[cur] === gen) continue
      this.closed[cur] = gen
      expanded++
      if (cur === gIdx) {
        found = true
        best = cur
        break
      }
      const ci = cur % n
      const cj = (cur - ci) / n
      const hc = hfn(ci, cj)
      if (hc < bestH) {
        bestH = hc
        best = cur
      }
      const gc = this.g[cur]
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (di === 0 && dj === 0) continue
          const ni = ci + di
          const nj = cj + dj
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) continue
          const nk = nj * n + ni
          const c = this.cost[nk]
          if (c === BLOCKED) continue
          // diagonal só se as duas laterais estiverem livres (não corta quinas)
          if (di !== 0 && dj !== 0 && (this.cost[cj * n + ni] === BLOCKED || this.cost[nj * n + ci] === BLOCKED)) continue
          const step = (di !== 0 && dj !== 0 ? SQRT2 : 1) * c
          const ng = gc + step
          if (this.stamp[nk] === gen && ng >= this.g[nk]) continue
          if (this.closed[nk] === gen) continue
          this.stamp[nk] = gen
          this.g[nk] = ng
          this.from[nk] = cur
          heap.push(nk, ng + hfn(ni, nj))
        }
      }
    }
    this.lastExpanded = expanded
    if (!found && best === s) return null
    // Reconstrói e suaviza (puxa o barbante com linha de visão na grade)
    const cells: number[] = []
    for (let k = best; k !== -1; k = this.from[k]) cells.push(k)
    cells.reverse()
    const pts: NavPoint[] = cells.map((k) => this.portalPoints.get(k) ?? { x: this.centerOf(k % n), z: this.centerOf(Math.floor(k / n)) })
    const isPortal = cells.map((k) => this.portalPoints.has(k))
    if (found) pts[pts.length - 1] = this.lineWalkable(pts[pts.length - 1].x, pts[pts.length - 1].z, tx, tz) ? { x: tx, z: tz } : pts[pts.length - 1]
    const out: NavPoint[] = []
    let a = 0
    while (a < pts.length - 1) {
      // nunca pula um ponto de porta (a reta poderia raspar no batente)
      let limit = Math.min(pts.length - 1, a + 48)
      for (let k = a + 1; k < limit; k++) {
        if (isPortal[k]) {
          limit = k
          break
        }
      }
      let b = limit
      while (b > a + 1 && !this.lineWalkable(pts[a].x, pts[a].z, pts[b].x, pts[b].z)) b--
      out.push(pts[b])
      a = b
    }
    return out
  }
}

const cache = new WeakMap<GameMap, NavGrid>()

/** Uma grade por mapa (gerá-la custa algumas centenas de ms no mapa principal). */
export function navGridFor(map: GameMap): NavGrid {
  let g = cache.get(map)
  if (!g) cache.set(map, (g = new NavGrid(map)))
  return g
}
