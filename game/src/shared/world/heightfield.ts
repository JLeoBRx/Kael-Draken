/**
 * Relevo em grade regular, centrado na origem.
 *
 * A altura é interpolada pelos MESMOS triângulos usados na malha de
 * renderização (cada célula dividida na diagonal (i+1,j)–(i,j+1)), então os
 * pés do personagem ficam exatamente sobre a superfície desenhada.
 */
export class Heightfield {
  /** Amostras por lado. */
  readonly n: number
  /** Distância entre amostras (m). */
  readonly cell: number
  /** Lado do terreno (m). */
  readonly size: number
  /** Coordenada mundial da amostra 0 em X e em Z. */
  readonly min: number
  readonly heights: Float32Array
  private maxHeight = -Infinity

  constructor(samplesPerSide: number, cell: number) {
    if (samplesPerSide < 2) throw new Error('Heightfield precisa de ao menos 2 amostras por lado')
    this.n = samplesPerSide
    this.cell = cell
    this.size = (samplesPerSide - 1) * cell
    this.min = -this.size / 2
    this.heights = new Float32Array(samplesPerSide * samplesPerSide)
  }

  get(i: number, j: number): number {
    const n = this.n
    i = i < 0 ? 0 : i >= n ? n - 1 : i
    j = j < 0 ? 0 : j >= n ? n - 1 : j
    return this.heights[j * n + i]
  }

  set(i: number, j: number, h: number): void {
    this.heights[j * this.n + i] = h
  }

  /** Coordenada mundial de uma amostra. */
  worldX(i: number): number {
    return this.min + i * this.cell
  }

  worldZ(j: number): number {
    return this.min + j * this.cell
  }

  /** Recalcula a altura máxima (usada para encerrar raios cedo). Chamar após editar. */
  finalize(): void {
    let max = -Infinity
    for (let k = 0; k < this.heights.length; k++) if (this.heights[k] > max) max = this.heights[k]
    this.maxHeight = max
  }

  get highest(): number {
    return this.maxHeight
  }

  heightAt(x: number, z: number): number {
    const n = this.n
    const gx = (x - this.min) / this.cell
    const gz = (z - this.min) / this.cell
    let i = Math.floor(gx)
    let j = Math.floor(gz)
    if (i < 0) i = 0
    else if (i > n - 2) i = n - 2
    if (j < 0) j = 0
    else if (j > n - 2) j = n - 2
    let fx = gx - i
    let fz = gz - j
    fx = fx < 0 ? 0 : fx > 1 ? 1 : fx
    fz = fz < 0 ? 0 : fz > 1 ? 1 : fz
    const h = this.heights
    const k = j * n + i
    const h00 = h[k]
    const h10 = h[k + 1]
    const h01 = h[k + n]
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz
    const h11 = h[k + n + 1]
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz)
  }

  /** Normal do triângulo sob (x, z). Escreve em `out` e o devolve. */
  normalAt(x: number, z: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const n = this.n
    const gx = (x - this.min) / this.cell
    const gz = (z - this.min) / this.cell
    let i = Math.floor(gx)
    let j = Math.floor(gz)
    if (i < 0) i = 0
    else if (i > n - 2) i = n - 2
    if (j < 0) j = 0
    else if (j > n - 2) j = n - 2
    const fx = gx - i
    const fz = gz - j
    const h = this.heights
    const k = j * n + i
    let dhdx: number
    let dhdz: number
    if (fx + fz <= 1) {
      dhdx = (h[k + 1] - h[k]) / this.cell
      dhdz = (h[k + n] - h[k]) / this.cell
    } else {
      const h11 = h[k + n + 1]
      dhdx = (h11 - h[k + n]) / this.cell
      dhdz = (h11 - h[k + 1]) / this.cell
    }
    const inv = 1 / Math.sqrt(dhdx * dhdx + 1 + dhdz * dhdz)
    out.x = -dhdx * inv
    out.y = inv
    out.z = -dhdz * inv
    return out
  }

  /**
   * Raio contra o relevo. Devolve a distância do impacto ou -1.
   * Marcha em meio-passo de célula e refina por bisseção.
   */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number {
    let prevDiff = oy - this.heightAt(ox, oz)
    if (prevDiff < 0) return 0
    const step = this.cell * 0.5
    let prevT = 0
    let t = 0
    while (t < maxDist) {
      t = Math.min(t + step, maxDist)
      const y = oy + dy * t
      if (dy >= 0 && y > this.maxHeight) return -1
      const diff = y - this.heightAt(ox + dx * t, oz + dz * t)
      if (diff < 0) {
        let lo = prevT
        let hi = t
        for (let k = 0; k < 10; k++) {
          const mid = (lo + hi) * 0.5
          const d = oy + dy * mid - this.heightAt(ox + dx * mid, oz + dz * mid)
          if (d < 0) hi = mid
          else lo = mid
        }
        return (lo + hi) * 0.5
      }
      prevDiff = diff
      prevT = t
    }
    return -1
  }
}
