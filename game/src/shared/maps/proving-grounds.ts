import { fbm2, ridged2 } from '../math/noise'
import { DEG, lerp, smoothstep } from '../math/scalar'
import type { MapBuilder } from './builder'
import type { MapDefinition, MaterialId } from './types'

/**
 * CAMPO DE PROVAS — mapa de testes da Fase 1 (512 m × 512 m).
 *
 * Ilha com um pátio de treino central (pista de movimentação com medidas),
 * vila ao sul, bosque a oeste, lagoa a leste e serra ao norte. Serve para
 * validar movimentação, câmera, colisão e desempenho antes do mapa principal.
 */

const PAD_Y = 6
const SEED = 0x5eed_c4a5

function terrainHeight(x: number, z: number): number {
  let h = 5 + fbm2(x / 180, z / 180, SEED, 4) * 6 + fbm2(x / 38, z / 38, SEED + 1, 3) * 1.1
  // Serra ao norte
  const north = smoothstep(-95, -215, z)
  h += north * (10 + ridged2(x / 110, z / 110, SEED + 2, 5) * 52)
  // Colinas suaves a oeste (bosque)
  h += smoothstep(-80, -170, x) * (fbm2(x / 70, z / 70, SEED + 3, 3) * 5 + 3)
  // Lagoa a leste
  const dl = Math.hypot(x - 150, z - 30)
  h = lerp(h, -4.5, smoothstep(60, 20, dl))
  // Costa: quadrado arredondado com borda irregular
  const q = Math.max(Math.abs(x), Math.abs(z)) * 0.65 + Math.hypot(x, z) * 0.35
  const coast = smoothstep(196, 246, q + fbm2(x / 60, z / 60, SEED + 4, 3) * 18)
  h = lerp(h, -7, coast)
  return h
}

export const provingGrounds: MapDefinition = {
  id: 'campo-de-provas',
  name: 'Campo de Provas',
  description: 'Ilha de testes: pista de movimentação, vila, bosque, lagoa e serra.',
  samples: 257,
  cell: 2,
  seed: SEED,
  waterLevel: 0,
  biome: {
    sand: 0xd8c79a,
    grass: 0x6f9a4a,
    grassDry: 0x9aa25a,
    forest: 0x4f7a3c,
    dirt: 0x8a6e4f,
    rock: 0x7d7a74,
    snow: 0xeef2f5,
    seabed: 0x8c8466,
    sandLevel: 1.6,
    snowLevel: 52,
  },
  atmosphere: {
    sunAzimuth: 135,
    sunElevation: 48,
    skyTop: 0x4f86c6,
    skyHorizon: 0xcfe0ea,
    fogDensity: 0.0032,
  },
  build(b) {
    b.shapeTerrain(terrainHeight)
    b.flatten(0, -20, 90, PAD_Y, 40)
    b.flatten(0, 150, 52, 5, 30)
    b.flatten(110, 30, 7, 1.1, 10)

    buildTrainingPad(b)
    buildVillage(b)
    buildLakeside(b)
    scatterNature(b)

    b.region('patio', 'Pátio de Treino', 0, -20, 88)
    b.region('vila', 'Vila Ensaio', 0, 150, 62)
    b.region('bosque', 'Bosque das Agulhas', -165, 0, 95)
    b.region('lagoa', 'Lagoa Espelho', 150, 30, 72)
    b.region('serra', 'Serra Norte', 0, -175, 100)
  },
}

function buildTrainingPad(b: MapBuilder): void {
  const y = PAD_Y + 0.15
  // Piso quadriculado de 1 m (referência de medida)
  b.box(0, PAD_Y - 0.45, -25, 116, 1.2, 112, 'grid-gray')

  // Spawns em duas fileiras, olhando para a pista (norte)
  for (let k = 0; k < 8; k++) {
    b.spawn(-14 + k * 4, 22, 0)
    b.spawn(-14 + k * 4, 26, 0)
  }
  b.label('PÁTIO DE TREINO', 0, y + 3.2, 14, 0, 1.4)

  // A — Rampas de 15°, 30°, 45° (construção) e 55° (não caminhável), 3 m de altura
  const angles = [15, 30, 45, 55]
  angles.forEach((deg, k) => {
    const x = -44 + k * 8
    const run = 3 / Math.tan(deg * DEG)
    const mat: MaterialId = deg === 55 ? 'grid-dark' : 'grid-orange'
    b.ramp(x, -20, y, 4, 3, deg * DEG, 0, mat)
    b.block(x, -20 - run - 2, y, 4, 3, 4, 'grid-blue', 0, 0.2)
    b.label(`${deg}°`, x, y + 0.9, -18.6, 0, 0.6)
  })
  b.label('RAMPAS · 3 m', -32, y + 4.6, -19.6, 0, 0.7)

  // B — Escadas: degraus de 0,2 / 0,3 / 0,4 m (sobem) e 0,6 m (não sobe)
  const steps = [0.2, 0.3, 0.4, 0.6]
  steps.forEach((h, k) => {
    const x = 2 + k * 6
    const count = Math.round(2.4 / h)
    b.stairs(x, -20, y, 3, h, 0.5, count, 0, h > 0.45 ? 'grid-dark' : 'grid-orange')
    b.block(x, -20 - count * 0.5 - 1.5, y, 3, count * h, 3, 'grid-blue', 0, 0.2)
    b.label(`${String(h).replace('.', ',')} m`, x, y + 0.9, -18.6, 0, 0.55)
  })
  b.label('DEGRAUS', 11, y + 4.2, -19.6, 0, 0.7)

  // C — Caixas de salto: 0,5 / 1,0 / 1,3 / 1,6 / 2,0 m
  ;[0.5, 1.0, 1.3, 1.6, 2.0].forEach((h, k) => {
    const x = -46 + k * 7
    b.block(x, -46, y, 2.5, h, 2.5, h > 1.35 ? 'grid-dark' : 'grid-orange', 0, 0.2)
    b.label(`${String(h).replace('.', ',')} m`, x, y + h + 0.7, -44.6, 0, 0.5)
  })
  b.label('ALTURA DE PULO', -32, y + 3.4, -44.4, 0, 0.7)

  // D — Vãos para pular a 2 m de altura: 3 / 4 / 5 / 6,5 m
  const platH = 2
  b.stairs(3, -42, y, 4, 0.4, 0.5, 5, 0, 'grid-orange')
  const gaps = [3, 4, 5, 6.5]
  let x0 = 0
  let x1 = 6
  b.block((x0 + x1) / 2, -48, y, x1 - x0, platH, 6, 'grid-blue', 0, 0.2)
  gaps.forEach((g) => {
    const nx0 = x1 + g
    const nx1 = nx0 + 4
    b.block((nx0 + nx1) / 2, -48, y, nx1 - nx0, platH, 6, 'grid-blue', 0, 0.2)
    b.label(`${String(g).replace('.', ',')} m`, x1 + g / 2, y + platH + 1.6, -44.9, 0, 0.55)
    x0 = nx0
    x1 = nx1
  })
  b.label('VÃOS · 6,5 m só com deslize + pulo', 24, y + platH + 3, -44.9, 0, 0.6)

  // E — Túnel de 1,4 m (agachar / deslizar), 12 m de comprimento ao longo de X
  const tz = -64
  b.block(-30, tz - 1.45, y, 12, 1.4, 0.5, 'grid-gray')
  b.block(-30, tz + 1.45, y, 12, 1.4, 0.5, 'grid-gray')
  b.block(-30, tz, y + 1.4, 12, 0.5, 3.4, 'grid-orange')
  b.label('TÚNEL 1,4 m · AGACHE OU DESLIZE', -30, y + 2.6, tz + 1.75, 0, 0.55)

  // F — Torre de rampas: 4 lances de 45° até 16 m, com pilares
  const lanes = [26, 34]
  const zA = -62
  const zB = -66
  for (let lvl = 0; lvl < 4; lvl++) {
    const base = y + lvl * 4
    const up = lvl % 2 === 0
    const lane = lanes[lvl % 2]
    if (up) b.ramp(lane, zA, base, 4, 4, 45 * DEG, 0, 'grid-orange')
    else b.ramp(lane, zB, base, 4, 4, 45 * DEG, Math.PI, 'grid-orange')
    const pz = up ? zB - 2 : zA + 2
    b.box(30, base + 4 - 0.15, pz, 12, 0.3, 4, 'grid-blue')
  }
  for (const px of [24.2, 35.8]) {
    for (const pz of [-69.8, -58.2]) b.block(px, pz, y, 0.4, 16, 0.4, 'concrete')
  }
  b.label('TORRE · 16 m', 30, y + 1.8, -56.6, 0, 0.7)

  // G — Morro de deslize: sobe a 30°, desce a 15°
  b.ramp(50, 12, y, 6, 6, 30 * DEG, 0, 'grid-orange')
  const upRun = 6 / Math.tan(30 * DEG)
  b.block(50, 12 - upRun - 2, y, 6, 6, 4, 'grid-blue', 0, 0.2)
  const topEdge = 12 - upRun - 4
  const downRun = 6 / Math.tan(15 * DEG)
  b.ramp(50, topEdge - downRun, y, 6, 6, 15 * DEG, Math.PI, 'grid-orange')
  b.label('DESLIZE NA DESCIDA', 50, y + 1.2, 13.4, 0, 0.6)

  // H — Paredes em L e arco para testar câmera e colisão lateral
  b.block(-30, 12, y, 14, 4, 0.3, 'concrete')
  b.block(-37, 5, y, 0.3, 4, 14, 'concrete')
  b.wall(-24, -2, -24, 10, y, 4, 'brick', [{ at: 4.5, width: 2, bottom: 0, top: 2.6 }])
  b.label('CÂMERA E PAREDES', -30, y + 4.6, 12.3, 0, 0.6)

  // Mureta de 1 m e caixotes soltos
  b.block(20, 8, y, 10, 1, 0.4, 'concrete')
  for (let k = 0; k < 5; k++) b.block(30 + (k % 2) * 1.3, 2 + k * 1.6, y, 1.2, 1.2, 1.2, 'wood', k * 0.3)
}

function buildVillage(b: MapBuilder): void {
  b.house(-25, 134, 8, 7, { wall: 'plaster-warm', trim: 'concrete' })
  b.house(0, 131, 10, 8, { floors: 2, wall: 'plaster', trim: 'concrete' })
  b.house(25, 138, 8, 8, { yaw: -0.3, wall: 'brick', trim: 'concrete' })
  b.house(-22, 166, 9, 7, { yaw: Math.PI, wall: 'plaster', trim: 'wood-dark' })
  b.house(-2, 170, 7, 7, { yaw: Math.PI + 0.15, wall: 'plaster-warm', trim: 'concrete' })

  // Galpão metálico com portão largo
  const gx = 24
  const gz = 168
  const base = b.maxHeightIn(gx, gz, 7, 9)
  b.block(gx, gz, base, 14, 0.15, 18, 'concrete', 0, 1.5)
  const fy = base + 0.15
  b.wall(gx - 7, gz + 9, gx + 7, gz + 9, fy, 5.5, 'metal-red', [{ at: 3.5, width: 7, bottom: 0, top: 4.2 }])
  b.wall(gx + 7, gz - 9, gx - 7, gz - 9, fy, 5.5, 'metal-red', [{ at: 6, width: 2, bottom: 2.5, top: 3.8 }])
  b.wall(gx - 7, gz - 8.8, gx - 7, gz + 8.8, fy, 5.5, 'metal-red', [{ at: 8, width: 1.4, bottom: 0, top: 2.4 }])
  b.wall(gx + 7, gz + 8.8, gx + 7, gz - 8.8, fy, 5.5, 'metal-red')
  b.box(gx, fy + 5.5 + 0.12, gz, 14.6, 0.25, 18.6, 'metal')
  // Mezanino interno com escada
  b.box(gx + 3.5, fy + 2.9, gz - 4, 7, 0.25, 9.6, 'wood-dark')
  b.stairs(gx - 1, gz + 3.2, fy, 1.4, 0.32, 0.32, 9, 0, 'wood-dark')
  for (let k = 0; k < 6; k++) b.prop('crate', gx - 4 + (k % 3) * 1.2, gz + 5 + Math.floor(k / 3) * 1.2, k * 0.4, 1)

  // Muretas de madeira e caixotes pela vila
  b.wall(-34, 150, -12, 150, b.heightAt(-23, 150), 1, 'wood', [{ at: 10, width: 2, bottom: 0, top: 1 }], 0.15)
  b.wall(10, 150, 34, 150, b.heightAt(22, 150), 1, 'wood', [{ at: 10, width: 2.5, bottom: 0, top: 1 }], 0.15)
  for (const [x, z] of [[-8, 150], [-6.6, 150.4], [-7.4, 151.6], [8, 155]] as const) b.prop('crate', x, z, x * 0.7, 1)
  b.label('VILA ENSAIO', 0, b.heightAt(0, 120) + 3, 120, 0, 1)
}

function buildLakeside(b: MapBuilder): void {
  // Píer de madeira entrando na lagoa
  const deckY = 1.2
  b.box(124, deckY, 30, 26, 0.25, 3, 'wood')
  for (let k = 0; k <= 6; k++) {
    const x = 112 + k * 4.2
    for (const z of [28.7, 31.3]) {
      const ground = b.heightAt(x, z)
      const h = deckY - 0.12 - ground + 0.5
      if (h > 0.2) b.box(x, ground - 0.5 + h / 2, z, 0.3, h, 0.3, 'wood-dark')
    }
  }
  b.label('LAGOA ESPELHO · NADE ATÉ A MARGEM', 112, deckY + 2.2, 32, -Math.PI / 2, 0.6)
}

function scatterNature(b: MapBuilder): void {
  const rng = b.rng.fork(7)
  const placed: [number, number][] = []
  const blocked = (x: number, z: number) =>
    Math.hypot(x, z + 20) < 92 || Math.hypot(x, z - 150) < 62 || Math.hypot(x - 125, z - 30) < 16 || Math.abs(x) > 228 || Math.abs(z) > 228
  const free = (x: number, z: number, minDist: number) => {
    for (const [px, pz] of placed) if ((px - x) ** 2 + (pz - z) ** 2 < minDist * minDist) return false
    return true
  }
  const normal = { x: 0, y: 1, z: 0 }
  // Árvores: densas no bosque (oeste), esparsas no resto, pinheiros nas encostas
  for (let attempt = 0; attempt < 9000 && placed.length < 950; attempt++) {
    const x = rng.range(-230, 230)
    const z = rng.range(-230, 230)
    if (blocked(x, z)) continue
    const h = b.heightAt(x, z)
    if (h < 2.2) continue
    b.terrain.normalAt(x, z, normal)
    if (normal.y < 0.82) continue
    const inForest = x < -85
    const density = inForest ? 1 : z < -110 ? 0.35 : 0.12
    if (!rng.chance(density)) continue
    if (!free(x, z, inForest ? 4.5 : 7)) continue
    placed.push([x, z])
    const pine = h > 22 || (inForest ? rng.chance(0.65) : rng.chance(0.4))
    b.prop(pine ? 'pine' : 'broadleaf', x, z, rng.range(0, Math.PI * 2), rng.range(0.8, 1.35))
  }
  // Rochas
  for (let k = 0, n = 0; k < 3000 && n < 260; k++) {
    const x = rng.range(-225, 225)
    const z = rng.range(-225, 225)
    if (blocked(x, z)) continue
    const h = b.heightAt(x, z)
    if (h < -1) continue
    const onSlope = b.terrain.normalAt(x, z, normal).y < 0.9
    if (!onSlope && !rng.chance(0.25)) continue
    if (!free(x, z, 3)) continue
    placed.push([x, z])
    b.prop('rock', x, z, rng.range(0, Math.PI * 2), rng.range(0.7, 2.2))
    n++
  }
  // Arbustos (sem colisão)
  for (let k = 0, n = 0; k < 4000 && n < 500; k++) {
    const x = rng.range(-225, 225)
    const z = rng.range(-225, 225)
    if (blocked(x, z) || b.heightAt(x, z) < 2) continue
    if (b.terrain.normalAt(x, z, normal).y < 0.85) continue
    b.prop('bush', x, z, rng.range(0, Math.PI * 2), rng.range(0.6, 1.3))
    n++
  }
}
