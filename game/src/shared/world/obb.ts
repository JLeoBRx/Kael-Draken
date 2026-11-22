/**
 * Caixas orientadas (OBB): paredes, pisos, rampas, telhados, prédios.
 *
 * A rotação segue a convenção do three.js com Euler 'YXZ' (yaw em Y, depois
 * pitch em X), então o cliente desenha com `rotation.set(pitch, yaw, 0, 'YXZ')`
 * exatamente a mesma caixa que o servidor usa para colidir.
 */
export interface Obb {
  cx: number
  cy: number
  cz: number
  hx: number
  hy: number
  hz: number
  yaw: number
  pitch: number
  /** Eixo local X no mundo. */
  ux: number
  uy: number
  uz: number
  /** Eixo local Y no mundo. */
  vx: number
  vy: number
  vz: number
  /** Eixo local Z no mundo. */
  wx: number
  wy: number
  wz: number
  /** Caixa alinhada aos eixos que envolve a OBB. */
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

export function makeObb(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, yaw = 0, pitch = 0): Obb {
  const cy_ = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  // M = Ry(yaw) * Rx(pitch); colunas = eixos locais
  const ux = cy_
  const uy = 0
  const uz = -sy
  const vx = sy * sp
  const vy = cp
  const vz = cy_ * sp
  const wx = sy * cp
  const wy = -sp
  const wz = cy_ * cp
  const ex = Math.abs(ux) * hx + Math.abs(vx) * hy + Math.abs(wx) * hz
  const ey = Math.abs(uy) * hx + Math.abs(vy) * hy + Math.abs(wy) * hz
  const ez = Math.abs(uz) * hx + Math.abs(vz) * hy + Math.abs(wz) * hz
  return {
    cx, cy, cz, hx, hy, hz, yaw, pitch,
    ux, uy, uz, vx, vy, vz, wx, wy, wz,
    minX: cx - ex, minY: cy - ey, minZ: cz - ez,
    maxX: cx + ex, maxY: cy + ey, maxZ: cz + ez,
  }
}

export interface Contact {
  /** Normal que aponta da caixa para a cápsula. */
  nx: number
  ny: number
  nz: number
  /** Penetração ao longo da normal (m). */
  depth: number
}

// Rascunhos reutilizados (a simulação roda em uma única thread por processo).
let sAx = 0, sAy = 0, sAz = 0, sDx = 0, sDy = 0, sDz = 0
let sHx = 0, sHy = 0, sHz = 0

function distSqAt(t: number): number {
  const px = sAx + sDx * t
  const py = sAy + sDy * t
  const pz = sAz + sDz * t
  const qx = px < -sHx ? -sHx : px > sHx ? sHx : px
  const qy = py < -sHy ? -sHy : py > sHy ? sHy : py
  const qz = pz < -sHz ? -sHz : pz > sHz ? sHz : pz
  const ex = px - qx
  const ey = py - qy
  const ez = pz - qz
  return ex * ex + ey * ey + ez * ez
}

const GOLDEN = 0.6180339887498949

/**
 * Cápsula (segmento A–B com raio r) contra OBB.
 * A distância ao quadrado entre o segmento e a caixa é convexa no parâmetro t,
 * então a busca pela razão áurea encontra o ponto mais próximo com precisão
 * sub-milimétrica; as extremidades são avaliadas à parte para o caso comum de
 * apoio exato (pé sobre um piso).
 */
export function capsuleVsObb(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r: number, o: Obb, out: Contact,
): boolean {
  // Para o espaço local da caixa
  let rx = ax - o.cx, ry = ay - o.cy, rz = az - o.cz
  sAx = rx * o.ux + ry * o.uy + rz * o.uz
  sAy = rx * o.vx + ry * o.vy + rz * o.vz
  sAz = rx * o.wx + ry * o.wy + rz * o.wz
  rx = bx - ax; ry = by - ay; rz = bz - az
  sDx = rx * o.ux + ry * o.uy + rz * o.uz
  sDy = rx * o.vx + ry * o.vy + rz * o.vz
  sDz = rx * o.wx + ry * o.wy + rz * o.wz
  sHx = o.hx; sHy = o.hy; sHz = o.hz

  let bestT = 0
  let best = distSqAt(0)
  const d1 = distSqAt(1)
  if (d1 < best) { best = d1; bestT = 1 }
  if (best > 0) {
    let lo = 0
    let hi = 1
    let x1 = hi - GOLDEN * (hi - lo)
    let x2 = lo + GOLDEN * (hi - lo)
    let f1 = distSqAt(x1)
    let f2 = distSqAt(x2)
    for (let k = 0; k < 24; k++) {
      if (f1 < f2) {
        hi = x2; x2 = x1; f2 = f1
        x1 = hi - GOLDEN * (hi - lo); f1 = distSqAt(x1)
      } else {
        lo = x1; x1 = x2; f1 = f2
        x2 = lo + GOLDEN * (hi - lo); f2 = distSqAt(x2)
      }
      if (f1 === 0 || f2 === 0) break
    }
    if (f1 < best) { best = f1; bestT = x1 }
    if (f2 < best) { best = f2; bestT = x2 }
  }
  if (best >= r * r) return false

  const px = sAx + sDx * bestT
  const py = sAy + sDy * bestT
  const pz = sAz + sDz * bestT
  let lnx: number, lny: number, lnz: number, depth: number
  if (best > 1e-12) {
    const qx = px < -sHx ? -sHx : px > sHx ? sHx : px
    const qy = py < -sHy ? -sHy : py > sHy ? sHy : py
    const qz = pz < -sHz ? -sHz : pz > sHz ? sHz : pz
    const dist = Math.sqrt(best)
    lnx = (px - qx) / dist
    lny = (py - qy) / dist
    lnz = (pz - qz) / dist
    depth = r - dist
  } else {
    // O eixo da cápsula entrou na caixa: sai pela face de menor penetração.
    const penX = sHx - Math.abs(px)
    const penY = sHy - Math.abs(py)
    const penZ = sHz - Math.abs(pz)
    lnx = 0; lny = 0; lnz = 0
    if (penY <= penX && penY <= penZ) { lny = py >= 0 ? 1 : -1; depth = penY + r }
    else if (penX <= penZ) { lnx = px >= 0 ? 1 : -1; depth = penX + r }
    else { lnz = pz >= 0 ? 1 : -1; depth = penZ + r }
  }
  out.nx = o.ux * lnx + o.vx * lny + o.wx * lnz
  out.ny = o.uy * lnx + o.vy * lny + o.wy * lnz
  out.nz = o.uz * lnx + o.vz * lny + o.wz * lnz
  out.depth = depth
  return true
}

export interface RayHit {
  t: number
  nx: number
  ny: number
  nz: number
}

/** Raio (direção unitária) contra OBB pelo método das placas. Devolve false se não acerta até maxT. */
export function rayVsObb(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  o: Obb, maxT: number, out: RayHit,
): boolean {
  const rx = ox - o.cx, ry = oy - o.cy, rz = oz - o.cz
  const lo = [rx * o.ux + ry * o.uy + rz * o.uz, rx * o.vx + ry * o.vy + rz * o.vz, rx * o.wx + ry * o.wy + rz * o.wz]
  const ld = [dx * o.ux + dy * o.uy + dz * o.uz, dx * o.vx + dy * o.vy + dz * o.vz, dx * o.wx + dy * o.wy + dz * o.wz]
  const h = [o.hx, o.hy, o.hz]
  let tMin = 0
  let tMax = maxT
  let axis = -1
  let sign = 0
  for (let k = 0; k < 3; k++) {
    if (Math.abs(ld[k]) < 1e-12) {
      if (lo[k] < -h[k] || lo[k] > h[k]) return false
      continue
    }
    const inv = 1 / ld[k]
    let t1 = (-h[k] - lo[k]) * inv
    let t2 = (h[k] - lo[k]) * inv
    let s = -1
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1 }
    if (t1 > tMin) { tMin = t1; axis = k; sign = s }
    if (t2 < tMax) tMax = t2
    if (tMin > tMax) return false
  }
  if (axis < 0) {
    // Origem dentro da caixa
    out.t = 0
    out.nx = -dx; out.ny = -dy; out.nz = -dz
    return true
  }
  const ln = [0, 0, 0]
  ln[axis] = sign
  out.t = tMin
  out.nx = o.ux * ln[0] + o.vx * ln[1] + o.wx * ln[2]
  out.ny = o.uy * ln[0] + o.vy * ln[1] + o.wy * ln[2]
  out.nz = o.uz * ln[0] + o.vz * ln[1] + o.wz * ln[2]
  return true
}
