/**
 * Números pseudoaleatórios determinísticos. Cliente e servidor geram o mesmo
 * mundo a partir da mesma semente, então nada aqui pode depender de
 * Math.random ou de funções transcendentais com resultado variável entre motores.
 */

/** Hash inteiro de duas coordenadas e uma semente (32 bits, sem sinal). */
export function hash2i(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) | 0
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Gerador mulberry32: rápido, período 2^32, suficiente para geração de conteúdo. */
export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** Valor em [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0
    let t = this.state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next()
  }

  /** Inteiro em [min, maxExclusive). */
  int(min: number, maxExclusive: number): number {
    return min + Math.floor(this.next() * (maxExclusive - min))
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  /** Deriva um gerador independente (útil para separar etapas da geração). */
  fork(salt: number): Rng {
    return new Rng(hash2i(this.int(0, 0x7fffffff), salt, 0x9e3779b9))
  }
}
