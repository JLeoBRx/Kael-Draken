import { CharFlag } from '../movement/character'

/**
 * Caixas de acerto de um personagem: corpo (cápsula vertical) + cabeça (esfera).
 * Usadas pelo servidor para validar tiros e explosões.
 */
export interface Hitbox {
  x: number
  /** Base e topo do segmento do corpo. */
  y0: number
  y1: number
  z: number
  bodyR: number
  hx: number
  hy: number
  hz: number
  headR: number
}

export function createHitbox(): Hitbox {
  return { x: 0, y0: 0, y1: 0, z: 0, bodyR: 0, hx: 0, hy: 0, hz: 0, headR: 0 }
}

export function hitboxAt(x: number, y: number, z: number, flags: number, out: Hitbox): Hitbox {
  const low = (flags & (CharFlag.Crouched | CharFlag.Sliding)) !== 0
  const swim = (flags & CharFlag.Swimming) !== 0
  out.x = x
  out.z = z
  // O topo do corpo (y1 + raio) fica abaixo do centro da cabeça: a cabeça "sai" da cápsula.
  if (swim) {
    out.y0 = y + 0.55
    out.y1 = y + 0.75
    out.bodyR = 0.34
    out.hy = y + 1.25
  } else if (low) {
    out.y0 = y + 0.15
    out.y1 = y + 0.6
    out.bodyR = 0.34
    out.hy = y + 1.08
  } else {
    out.y0 = y + 0.15
    out.y1 = y + 1.18
    out.bodyR = 0.32
    out.hy = y + 1.6
  }
  out.hx = x
  out.hz = z
  out.headR = 0.17
  return out
}

/** Centro aproximado do tronco (para explosões e linha de visão). */
export function hitboxCenter(h: Hitbox): { x: number; y: number; z: number } {
  return { x: h.x, y: (h.y0 + h.y1) / 2, z: h.z }
}

function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const mx = ox - cx
  const my = oy - cy
  const mz = oz - cz
  const b = mx * dx + my * dy + mz * dz
  const c = mx * mx + my * my + mz * mz - r * r
  if (c > 0 && b > 0) return -1
  const disc = b * b - c
  if (disc < 0) return -1
  const t = -b - Math.sqrt(disc)
  return t < 0 ? 0 : t
}

/** Raio contra cápsula vertical (segmento de y0 a y1 em (x, z)). */
function rayVerticalCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, h: Hitbox): number {
  const r = h.bodyR
  // Cilindro infinito em XZ
  const px = ox - h.x
  const pz = oz - h.z
  const a = dx * dx + dz * dz
  let best = -1
  if (a > 1e-9) {
    const b = px * dx + pz * dz
    const c = px * px + pz * pz - r * r
    const disc = b * b - a * c
    if (disc >= 0) {
      const t = (-b - Math.sqrt(disc)) / a
      const y = oy + dy * t
      if (t >= 0 && y >= h.y0 && y <= h.y1) best = t
      else if (c <= 0 && oy >= h.y0 && oy <= h.y1) best = 0
    }
  }
  // Calotas esféricas
  for (const cy of [h.y0, h.y1]) {
    const t = raySphere(ox, oy, oz, dx, dy, dz, h.x, cy, h.z, r)
    if (t >= 0 && (best < 0 || t < best)) best = t
  }
  return best
}

export interface HitResult {
  t: number
  head: boolean
}

/** Raio (direção unitária) contra a caixa de acerto. Cabeça tem prioridade quando acertada antes. */
export function rayHitbox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, h: Hitbox, out: HitResult): boolean {
  const th = raySphere(ox, oy, oz, dx, dy, dz, h.hx, h.hy, h.hz, h.headR)
  const tb = rayVerticalCapsule(ox, oy, oz, dx, dy, dz, h)
  let t = -1
  let head = false
  if (th >= 0 && th <= maxT) {
    t = th
    head = true
  }
  if (tb >= 0 && tb <= maxT && (t < 0 || tb < t - 0.02)) {
    t = tb
    head = false
  }
  if (t < 0) return false
  out.t = t
  out.head = head
  return true
}

/** Segmento (de A a B) contra a caixa de acerto — para projéteis. */
export function segmentHitsHitbox(ax: number, ay: number, az: number, bx: number, by: number, bz: number, h: Hitbox, out: HitResult): boolean {
  const dx = bx - ax
  const dy = by - ay
  const dz = bz - az
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
  if (len < 1e-6) return false
  return rayHitbox(ax, ay, az, dx / len, dy / len, dz / len, len, h, out)
}
