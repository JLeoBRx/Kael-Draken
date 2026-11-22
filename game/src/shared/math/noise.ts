import { hash2i } from './rng'

/**
 * Ruído de gradiente 2D (estilo Perlin) com tabela fixa de 8 gradientes.
 * Usa apenas soma, multiplicação e floor, então o resultado é idêntico em
 * qualquer motor JavaScript — requisito para cliente e servidor gerarem o
 * mesmo relevo.
 */

const GX = [1, -1, 0, 0, 0.7071067811865476, -0.7071067811865476, 0.7071067811865476, -0.7071067811865476]
const GY = [0, 0, 1, -1, 0.7071067811865476, 0.7071067811865476, -0.7071067811865476, -0.7071067811865476]

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function grad(ix: number, iy: number, seed: number, fx: number, fy: number): number {
  const g = hash2i(ix, iy, seed) & 7
  return GX[g] * fx + GY[g] * fy
}

/** Ruído em aproximadamente [-1, 1]. */
export function gradientNoise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const u = fade(fx)
  const v = fade(fy)
  const n00 = grad(ix, iy, seed, fx, fy)
  const n10 = grad(ix + 1, iy, seed, fx - 1, fy)
  const n01 = grad(ix, iy + 1, seed, fx, fy - 1)
  const n11 = grad(ix + 1, iy + 1, seed, fx - 1, fy - 1)
  const nx0 = n00 + (n10 - n00) * u
  const nx1 = n01 + (n11 - n01) * u
  return (nx0 + (nx1 - nx0) * v) * 1.4142135623730951
}

/** Movimento browniano fracionário, normalizado para aproximadamente [-1, 1]. */
export function fbm2(x: number, y: number, seed: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let sum = 0
  let amp = 1
  let norm = 0
  let freq = 1
  for (let i = 0; i < octaves; i++) {
    sum += gradientNoise2(x * freq, y * freq, seed + i * 1013) * amp
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}

/** Ruído "ridged" em [0, 1]: cristas afiadas, bom para serras. */
export function ridged2(x: number, y: number, seed: number, octaves = 5): number {
  let sum = 0
  let amp = 0.5
  let freq = 1
  let norm = 0
  let weight = 1
  for (let i = 0; i < octaves; i++) {
    let n = 1 - Math.abs(gradientNoise2(x * freq, y * freq, seed + i * 7919))
    n *= n * weight
    weight = Math.min(1, n * 2)
    sum += n * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}
