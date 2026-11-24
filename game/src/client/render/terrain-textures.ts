import * as THREE from 'three'

/**
 * Texturas de detalhe do relevo, geradas uma vez por sessão e repetíveis sem
 * emenda. Cada uma guarda, em RGB, um MULTIPLICADOR da cor do bioma (128 =
 * 1,0) e, em A, a "altura" do detalhe — usada para misturar camadas de forma
 * natural (a rocha aparece primeiro nas frestas da grama) e para o relevo
 * fino da iluminação.
 *
 * Camadas: 0 grama · 1 terra · 2 rocha · 3 areia · 4 neve (+ variação ampla).
 * Para usar texturas definitivas, troque `terrainLayers()` por imagens com o
 * mesmo arranjo (cor multiplicadora + altura no alfa).
 */

export const TERRAIN_LAYER_NAMES = ['grama', 'terra', 'rocha', 'areia', 'neve'] as const

const SIZE = 512

class Rand {
  constructor(private s: number) {}
  next(): number {
    this.s = (Math.imul(this.s ^ (this.s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0
    return (this.s >>> 8) / 16777216
  }
}

/** Ruído de valor periódico (repete sem emenda), 0–1. */
function noise(period: number, seed: number, octaves = 4, size = SIZE): Float32Array {
  const out = new Float32Array(size * size)
  let amp = 1
  let norm = 0
  let p = period
  for (let o = 0; o < octaves; o++) {
    const r = new Rand(seed * 7919 + o * 104729)
    const grid = new Float32Array(p * p)
    for (let k = 0; k < grid.length; k++) grid[k] = r.next()
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * p
      const y0 = Math.floor(gy)
      const fy = gy - y0
      const sy = fy * fy * (3 - 2 * fy)
      const r0 = (y0 % p) * p
      const r1 = ((y0 + 1) % p) * p
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * p
        const x0 = Math.floor(gx)
        const fx = gx - x0
        const sx = fx * fx * (3 - 2 * fx)
        const x1 = (x0 + 1) % p
        const a = grid[r0 + (x0 % p)]
        const b = grid[r0 + x1]
        const c = grid[r1 + (x0 % p)]
        const d = grid[r1 + x1]
        out[y * size + x] += (a + (b - a) * sx + (c - a + (d - c - b + a) * sx) * sy) * amp
      }
    }
    norm += amp
    amp *= 0.5
    p *= 2
  }
  for (let k = 0; k < out.length; k++) out[k] /= norm
  return out
}

interface Layer {
  /** Multiplicador de cor (1 = cor do bioma) por canal. */
  r: Float32Array
  g: Float32Array
  b: Float32Array
  h: Float32Array
}

function layer(): Layer {
  const n = SIZE * SIZE
  return { r: new Float32Array(n).fill(1), g: new Float32Array(n).fill(1), b: new Float32Array(n).fill(1), h: new Float32Array(n).fill(0.5) }
}

const wrap = (v: number) => ((v % SIZE) + SIZE) % SIZE

/** Traço curto (lâmina de grama vista de cima), com borda clara na ponta. */
function stroke(L: Layer, x: number, y: number, dx: number, dy: number, len: number, bright: number, tint: [number, number, number]): void {
  for (let s = 0; s <= len; s++) {
    const t = s / len
    const px = wrap(Math.round(x + dx * s))
    const py = wrap(Math.round(y + dy * s))
    const k = py * SIZE + px
    const v = bright * (0.82 + 0.3 * t)
    L.r[k] = v * tint[0]
    L.g[k] = v * tint[1]
    L.b[k] = v * tint[2]
    L.h[k] = 0.45 + 0.55 * t
  }
}

function grass(): Layer {
  const L = layer()
  const clump = noise(6, 1, 4)
  const fine = noise(48, 2, 2)
  for (let k = 0; k < SIZE * SIZE; k++) {
    // solo entre as lâminas: mais escuro e terroso
    const v = 0.62 + (clump[k] - 0.5) * 0.25 + (fine[k] - 0.5) * 0.12
    L.r[k] = v * 1.02
    L.g[k] = v * 0.96
    L.b[k] = v * 0.9
    L.h[k] = 0.25 + fine[k] * 0.2
  }
  const r = new Rand(3)
  for (let i = 0; i < 26000; i++) {
    const x = r.next() * SIZE
    const y = r.next() * SIZE
    const a = r.next() * Math.PI * 2
    const len = 3 + r.next() * 7
    const k = Math.floor(y) * SIZE + Math.floor(x)
    const bright = 0.95 + (clump[k] - 0.5) * 0.4 + r.next() * 0.2
    const dry = r.next() < 0.12
    stroke(L, x, y, Math.cos(a), Math.sin(a), len, bright, dry ? [1.18, 1.08, 0.82] : [0.97 + r.next() * 0.06, 1.04, 0.95])
  }
  return L
}

function dirt(): Layer {
  const L = layer()
  const base = noise(8, 11, 5)
  const fine = noise(64, 12, 2)
  for (let k = 0; k < SIZE * SIZE; k++) {
    const v = 0.85 + (base[k] - 0.5) * 0.35 + (fine[k] - 0.5) * 0.2
    L.r[k] = L.g[k] = L.b[k] = v
    L.h[k] = base[k] * 0.5
  }
  // pedrinhas
  const r = new Rand(13)
  for (let i = 0; i < 1800; i++) {
    const cx = r.next() * SIZE
    const cy = r.next() * SIZE
    const rad = 1.5 + r.next() * 4.5
    const tone = 0.85 + r.next() * 0.45
    for (let y = -Math.ceil(rad); y <= Math.ceil(rad); y++) {
      for (let x = -Math.ceil(rad); x <= Math.ceil(rad); x++) {
        const d = Math.hypot(x, y) / rad
        if (d > 1) continue
        const k = wrap(Math.round(cy + y)) * SIZE + wrap(Math.round(cx + x))
        const shade = tone * (1.05 - 0.25 * d) * (y < 0 ? 1.06 : 0.92)
        L.r[k] = L.g[k] = L.b[k] = shade
        L.h[k] = 0.55 + 0.45 * Math.sqrt(1 - d * d)
      }
    }
  }
  return L
}

function rock(): Layer {
  const L = layer()
  const base = noise(4, 21, 5)
  const cracks = noise(10, 22, 4)
  const fine = noise(64, 23, 2)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const k = y * SIZE + x
      // fendas: vales estreitos do ruído "dobrado"
      const c = 1 - Math.abs(cracks[k] - 0.5) * 2
      const crack = Math.pow(Math.max(0, c), 14)
      // estratos levemente ondulados
      const strata = 0.5 + 0.5 * Math.sin(((y / SIZE) * 14 + base[k] * 3) * Math.PI * 2)
      const v = 0.92 + (base[k] - 0.5) * 0.4 + (strata - 0.5) * 0.1 + (fine[k] - 0.5) * 0.18 - crack * 0.55
      L.r[k] = v * 1.02
      L.g[k] = v
      L.b[k] = v * 0.97
      L.h[k] = Math.max(0, 0.35 + base[k] * 0.55 - crack * 0.6 + (fine[k] - 0.5) * 0.1)
    }
  }
  return L
}

function sand(): Layer {
  const L = layer()
  const warp = noise(4, 31, 3)
  const grain = noise(128, 32, 1)
  const fine = noise(16, 33, 3)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const k = y * SIZE + x
      // marolas desenhadas pelo vento
      const ripple = 0.5 + 0.5 * Math.sin(((x / SIZE) * 22 + (y / SIZE) * 6 + warp[k] * 5) * Math.PI * 2)
      const v = 0.95 + (ripple - 0.5) * 0.12 + (grain[k] - 0.5) * 0.16 + (fine[k] - 0.5) * 0.1
      L.r[k] = v
      L.g[k] = v * 0.99
      L.b[k] = v * 0.97
      L.h[k] = ripple * 0.7 + grain[k] * 0.3
    }
  }
  return L
}

function snow(): Layer {
  const L = layer()
  const soft = noise(6, 41, 4)
  const fine = noise(64, 42, 2)
  const r = new Rand(43)
  for (let k = 0; k < SIZE * SIZE; k++) {
    const v = 0.97 + (soft[k] - 0.5) * 0.14 + (fine[k] - 0.5) * 0.05
    L.r[k] = v * 0.98
    L.g[k] = v * 0.99
    L.b[k] = v * 1.03
    L.h[k] = soft[k]
  }
  // cristais que brilham
  for (let i = 0; i < 2500; i++) {
    const k = Math.floor(r.next() * SIZE * SIZE)
    L.r[k] = L.g[k] = L.b[k] = 1.35
  }
  return L
}

function toTexture(L: Layer, name: string): THREE.DataTexture {
  const data = new Uint8Array(SIZE * SIZE * 4)
  const q = (v: number) => Math.max(0, Math.min(255, Math.round(v * 128)))
  for (let k = 0; k < SIZE * SIZE; k++) {
    data[k * 4] = q(L.r[k])
    data[k * 4 + 1] = q(L.g[k])
    data[k * 4 + 2] = q(L.b[k])
    data[k * 4 + 3] = Math.max(0, Math.min(255, Math.round(L.h[k] * 255)))
  }
  const t = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat)
  t.name = `relevo-${name}`
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.anisotropy = 8
  t.colorSpace = THREE.NoColorSpace
  t.needsUpdate = true
  return t
}

/** Variação ampla (quebra a repetição a distância): R = brilho, G = matiz. */
function macroTexture(): THREE.DataTexture {
  const size = 256
  const a = noise(4, 51, 5, size)
  const b = noise(3, 52, 4, size)
  const data = new Uint8Array(size * size * 4)
  for (let k = 0; k < size * size; k++) {
    data[k * 4] = Math.round(a[k] * 255)
    data[k * 4 + 1] = Math.round(b[k] * 255)
    data[k * 4 + 2] = 0
    data[k * 4 + 3] = 255
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  t.name = 'relevo-macro'
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.generateMipmaps = true
  t.colorSpace = THREE.NoColorSpace
  t.needsUpdate = true
  return t
}

export interface TerrainLayers {
  layers: THREE.DataTexture[]
  macro: THREE.DataTexture
}

let cached: TerrainLayers | null = null

/** As texturas do relevo (geradas na primeira chamada e reaproveitadas entre partidas). */
export function terrainLayers(): TerrainLayers {
  if (!cached) {
    const make = [grass, dirt, rock, sand, snow]
    cached = { layers: make.map((f, k) => toTexture(f(), TERRAIN_LAYER_NAMES[k])), macro: macroTexture() }
  }
  return cached
}
