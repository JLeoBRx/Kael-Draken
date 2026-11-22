import * as THREE from 'three'

/**
 * Texturas procedurais (placeholders organizados e substituíveis).
 *
 * Cada função gera uma textura em canvas a partir de parâmetros; quando
 * houver texturas definitivas, basta trocar a fonte no registro de
 * materiais (materials.ts) por um TextureLoader com o arquivo em
 * public/assets/textures — o resto do jogo não muda.
 *
 * Escala: 1 unidade de UV = 1 metro, salvo indicação.
 */

type Ctx = CanvasRenderingContext2D

function canvas(size: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas 2D indisponível')
  return [c, ctx]
}

/** Ruído de valor periódico (repete sem emendas). */
function periodicNoise(size: number, period: number, seed: number, octaves = 4): Float32Array {
  const out = new Float32Array(size * size)
  let amp = 1
  let norm = 0
  let p = period
  for (let o = 0; o < octaves; o++) {
    const grid = new Float32Array(p * p)
    let s = (seed + o * 7919) >>> 0
    for (let k = 0; k < grid.length; k++) {
      s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0
      grid[k] = (s >>> 8) / 16777216
    }
    for (let y = 0; y < size; y++) {
      const gy = (y / size) * p
      const y0 = Math.floor(gy)
      const fy = gy - y0
      const sy = fy * fy * (3 - 2 * fy)
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * p
        const x0 = Math.floor(gx)
        const fx = gx - x0
        const sx = fx * fx * (3 - 2 * fx)
        const a = grid[(y0 % p) * p + (x0 % p)]
        const b = grid[(y0 % p) * p + ((x0 + 1) % p)]
        const c = grid[((y0 + 1) % p) * p + (x0 % p)]
        const d = grid[((y0 + 1) % p) * p + ((x0 + 1) % p)]
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

function finish(c: HTMLCanvasElement, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.anisotropy = 8
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`
}

/** Aplica ruído multiplicativo ao canvas inteiro (variação de tom). */
function grain(ctx: Ctx, size: number, strength: number, seed: number, period = 8): void {
  const img = ctx.getImageData(0, 0, size, size)
  const n = periodicNoise(size, period, seed, 4)
  for (let k = 0; k < n.length; k++) {
    const f = 1 + (n[k] - 0.5) * strength
    img.data[k * 4] = Math.min(255, img.data[k * 4] * f)
    img.data[k * 4 + 1] = Math.min(255, img.data[k * 4 + 1] * f)
    img.data[k * 4 + 2] = Math.min(255, img.data[k * 4 + 2] * f)
  }
  ctx.putImageData(img, 0, 0)
}

/** Quadriculado de campo de provas: linhas finas a cada 25 cm, grossas a cada metro. 1 tile = 1 m. */
export function gridTexture(base: number, line: number): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas(size)
  ctx.fillStyle = hex(base)
  ctx.fillRect(0, 0, size, size)
  grain(ctx, size, 0.08, base)
  ctx.strokeStyle = hex(line)
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 2
  for (let k = 1; k < 4; k++) {
    const p = (k * size) / 4
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke()
  }
  ctx.globalAlpha = 0.9
  ctx.lineWidth = 6
  ctx.strokeRect(0, 0, size, size)
  ctx.globalAlpha = 1
  return finish(c)
}

/** Ruído claro para detalhe do relevo (multiplica a cor dos vértices). */
export function terrainDetailTexture(): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas(size)
  const img = ctx.createImageData(size, size)
  const coarse = periodicNoise(size, 6, 11, 3)
  const fine = periodicNoise(size, 32, 23, 3)
  for (let k = 0; k < coarse.length; k++) {
    const v = 200 + (coarse[k] - 0.5) * 70 + (fine[k] - 0.5) * 60
    img.data[k * 4] = img.data[k * 4 + 1] = img.data[k * 4 + 2] = Math.max(0, Math.min(255, v + 30))
    img.data[k * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return finish(c)
}

/** Concreto com juntas a cada 2 m. 1 tile = 2 m. */
export function concreteTexture(base: number): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas(size)
  ctx.fillStyle = hex(base)
  ctx.fillRect(0, 0, size, size)
  grain(ctx, size, 0.22, 3, 16)
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, size - 2, size - 2)
  return finish(c)
}

/** Reboco (paredes de casas). 1 tile = 2 m. */
export function plasterTexture(base: number): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas(size)
  ctx.fillStyle = hex(base)
  ctx.fillRect(0, 0, size, size)
  grain(ctx, size, 0.12, 5, 24)
  grain(ctx, size, 0.06, 6, 6)
  return finish(c)
}

/** Tijolos 25 × 8 cm com argamassa. 1 tile = 2 m. */
export function brickTexture(base: number, mortar: number): THREE.CanvasTexture {
  const size = 512
  const [c, ctx] = canvas(size)
  ctx.fillStyle = hex(mortar)
  ctx.fillRect(0, 0, size, size)
  const rows = 24
  const cols = 8
  const bh = size / rows
  const bw = size / cols
  let s = 1234
  for (let r = 0; r < rows; r++) {
    for (let k = -1; k < cols; k++) {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0
      const shade = 0.82 + ((s >>> 16) / 65536) * 0.3
      const col = new THREE.Color(base).multiplyScalar(shade)
      ctx.fillStyle = `#${col.getHexString()}`
      const x = k * bw + (r % 2 ? bw / 2 : 0)
      ctx.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4)
    }
  }
  grain(ctx, size, 0.15, 9, 32)
  return finish(c)
}

/** Tábuas de madeira na vertical. 1 tile = 2 m. */
export function woodTexture(base: number): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas(size)
  const planks = 10
  const pw = size / planks
  for (let k = 0; k < planks; k++) {
    const col = new THREE.Color(base).multiplyScalar(0.85 + ((k * 37) % 11) / 40)
    ctx.fillStyle = `#${col.getHexString()}`
    ctx.fillRect(k * pw, 0, pw, size)
    ctx.strokeStyle = 'rgba(40,20,5,0.18)'
    ctx.lineWidth = 1
    for (let g = 0; g < 4; g++) {
      ctx.beginPath()
      const gx = k * pw + 3 + g * (pw / 4)
      ctx.moveTo(gx, 0)
      ctx.bezierCurveTo(gx + 2, size * 0.3, gx - 2, size * 0.6, gx + 1, size)
      ctx.stroke()
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(k * pw, 0, 2, size)
  }
  grain(ctx, size, 0.1, 13, 8)
  return finish(c)
}

/** Chapa metálica corrugada. 1 tile = 2 m. */
export function metalTexture(base: number): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas(size)
  const grad = ctx.createLinearGradient(0, 0, size / 16, 0)
  const light = new THREE.Color(base).multiplyScalar(1.15)
  const dark = new THREE.Color(base).multiplyScalar(0.7)
  grad.addColorStop(0, `#${dark.getHexString()}`)
  grad.addColorStop(0.5, `#${light.getHexString()}`)
  grad.addColorStop(1, `#${dark.getHexString()}`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, size, size)
  grain(ctx, size, 0.12, 17, 12)
  return finish(c)
}

/** Mapa de normais tileável para a água (derivado de um campo de alturas). */
export function waterNormalTexture(): THREE.CanvasTexture {
  const size = 256
  const [c, ctx] = canvas(size)
  const h = periodicNoise(size, 8, 31, 4)
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)]
      const r = h[y * size + ((x + 1) % size)]
      const u = h[((y - 1 + size) % size) * size + x]
      const d = h[((y + 1) % size) * size + x]
      const nx = (l - r) * 6
      const ny = (u - d) * 6
      const nz = 1
      const len = Math.hypot(nx, ny, nz)
      const k = (y * size + x) * 4
      img.data[k] = ((nx / len) * 0.5 + 0.5) * 255
      img.data[k + 1] = ((ny / len) * 0.5 + 0.5) * 255
      img.data[k + 2] = ((nz / len) * 0.5 + 0.5) * 255
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return finish(c, false)
}

/** Textura de texto para placas e nomes (fundo escuro arredondado). */
export function textTexture(text: string, opts: { height?: number; bg?: string; fg?: string; accent?: string } = {}): { texture: THREE.CanvasTexture; aspect: number } {
  const h = opts.height ?? 96
  const font = `700 ${Math.round(h * 0.56)}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const w = Math.ceil(probe.measureText(text).width + h * 0.8)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = opts.bg ?? 'rgba(18, 22, 28, 0.88)'
  const r = h * 0.18
  ctx.beginPath()
  ctx.roundRect(0, 0, w, h, r)
  ctx.fill()
  if (opts.accent) {
    ctx.fillStyle = opts.accent
    ctx.fillRect(0, h - h * 0.08, w, h * 0.08)
  }
  ctx.font = font
  ctx.fillStyle = opts.fg ?? '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h * 0.5)
  const texture = new THREE.CanvasTexture(c)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return { texture, aspect: w / h }
}
