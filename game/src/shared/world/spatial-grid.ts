/**
 * Grade espacial 2D (plano XZ) para consultas de vizinhança. Cada objeto é
 * registrado em todas as células que sua caixa envolvente toca; consultas
 * devolvem cada id uma única vez (carimbo por consulta).
 */
export class SpatialGrid {
  private readonly cells: (number[] | undefined)[]
  private readonly dim: number
  private stamps = new Uint32Array(256)
  private stamp = 0

  constructor(
    private readonly minX: number,
    private readonly minZ: number,
    size: number,
    private readonly cellSize: number,
  ) {
    this.dim = Math.max(1, Math.ceil(size / cellSize))
    this.cells = new Array(this.dim * this.dim)
  }

  private cellRange(minX: number, minZ: number, maxX: number, maxZ: number): [number, number, number, number] {
    const d = this.dim - 1
    const i0 = Math.max(0, Math.min(d, Math.floor((minX - this.minX) / this.cellSize)))
    const i1 = Math.max(0, Math.min(d, Math.floor((maxX - this.minX) / this.cellSize)))
    const j0 = Math.max(0, Math.min(d, Math.floor((minZ - this.minZ) / this.cellSize)))
    const j1 = Math.max(0, Math.min(d, Math.floor((maxZ - this.minZ) / this.cellSize)))
    return [i0, i1, j0, j1]
  }

  insert(id: number, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const [i0, i1, j0, j1] = this.cellRange(minX, minZ, maxX, maxZ)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * this.dim + i
        let cell = this.cells[k]
        if (!cell) this.cells[k] = cell = []
        cell.push(id)
      }
    }
    if (id >= this.stamps.length) {
      let len = this.stamps.length
      while (len <= id) len *= 2
      const next = new Uint32Array(len)
      next.set(this.stamps)
      this.stamps = next
    }
  }

  remove(id: number, minX: number, minZ: number, maxX: number, maxZ: number): void {
    const [i0, i1, j0, j1] = this.cellRange(minX, minZ, maxX, maxZ)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cell = this.cells[j * this.dim + i]
        if (!cell) continue
        const idx = cell.indexOf(id)
        if (idx >= 0) {
          cell[idx] = cell[cell.length - 1]
          cell.pop()
        }
      }
    }
  }

  /** Adiciona a `out` os ids nas células tocadas pela caixa. Não limpa `out`. */
  query(minX: number, minZ: number, maxX: number, maxZ: number, out: number[]): number[] {
    this.stamp = (this.stamp + 1) >>> 0
    if (this.stamp === 0) {
      this.stamps.fill(0)
      this.stamp = 1
    }
    const s = this.stamp
    const [i0, i1, j0, j1] = this.cellRange(minX, minZ, maxX, maxZ)
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cell = this.cells[j * this.dim + i]
        if (!cell) continue
        for (let k = 0; k < cell.length; k++) {
          const id = cell[k]
          if (this.stamps[id] !== s) {
            this.stamps[id] = s
            out.push(id)
          }
        }
      }
    }
    return out
  }
}
