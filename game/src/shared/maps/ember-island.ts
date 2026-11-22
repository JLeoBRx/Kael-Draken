import { fbm2, ridged2 } from '../math/noise'
import { DEG, lerp, smoothstep } from '../math/scalar'
import type { Rng } from '../math/rng'
import type { MapBuilder } from './builder'
import { car, container, fence, scatter, warehouse, watchtower } from './structures'
import type { MapDefinition, MaterialId } from './types'

/**
 * ILHA DE BRASA — mapa principal (1,6 km × 1,6 km).
 *
 *              N (−Z)
 *        Picos Gélidos · Torre do Vigia
 *   Solar dos Ventos          Base Sentinela
 *   Mata Fechada   Cidade Esquecida
 *   Vila Serena               Distrito Fabril
 *         Farol do Fim    Lago Azul
 *
 * Cada região tem loot próprio (mais raro nas áreas de risco: base militar,
 * torre, farol), esconderijos, telhados acessíveis e linhas de visão longas.
 */

const SEED = 0x0b7a_5a1d
const CITY = { x: 0, z: 0, h: 10, r: 175 }
const FAB = { x: 460, z: 160, h: 9, r: 130 }
const BASE = { x: 430, z: -330, h: 18, r: 110 }
const VILA = { x: -430, z: 300, h: 11, r: 95 }
const SOLAR = { x: -230, z: -330, h: 26, r: 45 }
const FAROL = { x: -200, z: 600, h: 12, r: 24 }
const LAGO = { x: 60, z: 430 }
const ILHOTA = { x: 92, z: 452 }
const TORRE = { x: 0, z: -540 }
const MATA = { x: -430, z: -120 }

function terrainHeight(x: number, z: number): number {
  let h = 8 + fbm2(x / 300, z / 300, SEED, 4) * 10 + fbm2(x / 70, z / 70, SEED + 1, 3) * 2.5
  const north = smoothstep(-200, -480, z)
  h += north * (12 + ridged2(x / 180, z / 180, SEED + 2, 5) * 95)
  h += smoothstep(-150, -420, x) * (fbm2(x / 120, z / 120, SEED + 3, 3) * 8 + 6) * (1 - north)
  const dl = Math.hypot(x - LAGO.x, z - LAGO.z)
  h = lerp(h, -6, smoothstep(140, 60, dl))
  const r = Math.hypot(x, z * 1.05) + fbm2(x / 180, z / 180, SEED + 4, 3) * 60
  h = lerp(h, -10, smoothstep(640, 735, r))
  return h
}

const CITY_PALETTE: MaterialId[] = ['plaster', 'plaster-warm', 'brick', 'concrete']

export const emberIsland: MapDefinition = {
  id: 'ilha-de-brasa',
  name: 'Ilha de Brasa',
  description: 'Mapa principal: cidade, floresta, montanhas, indústria, vilarejo, lago, base militar e construções especiais.',
  samples: 401,
  cell: 4,
  seed: SEED,
  waterLevel: 0,
  biome: {
    sand: 0xd9c89c,
    grass: 0x6a9748,
    grassDry: 0xa3a25c,
    forest: 0x46703a,
    dirt: 0x8a6c4c,
    rock: 0x7b7974,
    snow: 0xf0f4f7,
    seabed: 0x8a8264,
    sandLevel: 1.8,
    snowLevel: 70,
  },
  atmosphere: {
    sunAzimuth: 210,
    sunElevation: 42,
    skyTop: 0x4a7fc0,
    skyHorizon: 0xd3e1ea,
    fogDensity: 0.0016,
  },
  build(b) {
    b.shapeTerrain(terrainHeight)
    for (const p of [CITY, FAB, BASE, VILA, SOLAR, FAROL]) b.flatten(p.x, p.z, p.r, p.h, p.r * 0.4 + 20)
    b.flatten(ILHOTA.x, ILHOTA.z, 14, 2.6, 10)
    b.flatten(LAGO.x, LAGO.z - 108, 12, 1.4, 14)
    b.flatten(MATA.x, MATA.z, 14, b.heightAt(MATA.x, MATA.z), 12)
    b.flatten(MATA.x - 90, MATA.z + 70, 10, b.heightAt(MATA.x - 90, MATA.z + 70), 10)
    b.flatten(MATA.x + 70, MATA.z - 80, 10, b.heightAt(MATA.x + 70, MATA.z - 80), 10)
    b.flatten(TORRE.x, TORRE.z, 16, b.heightAt(TORRE.x, TORRE.z), 14)

    const rng = b.rng.fork(11)
    buildCity(b, rng)
    buildIndustrial(b, rng)
    buildMilitary(b)
    buildVillage(b, rng)
    buildForest(b)
    buildMansion(b)
    buildLighthouse(b)
    buildLake(b)
    buildTower(b)
    scatterNature(b, rng)

    b.region('cidade', 'Cidade Esquecida', CITY.x, CITY.z, 195)
    b.region('fabril', 'Distrito Fabril', FAB.x, FAB.z, 150)
    b.region('base', 'Base Sentinela', BASE.x, BASE.z, 130)
    b.region('vila', 'Vila Serena', VILA.x, VILA.z, 120)
    b.region('mata', 'Mata Fechada', MATA.x, MATA.z, 170)
    b.region('picos', 'Picos Gélidos', 0, -570, 230)
    b.region('torre', 'Torre do Vigia', TORRE.x, TORRE.z, 40)
    b.region('solar', 'Solar dos Ventos', SOLAR.x, SOLAR.z, 60)
    b.region('lago', 'Lago Azul', LAGO.x, LAGO.z, 140)
    b.region('farol', 'Farol do Fim', FAROL.x, FAROL.z, 60)

    // Pontos de surgimento (modo treino): espalhados nas regiões
    const spawns: [number, number][] = [
      [29, 29], [-29, 29], [29, -29], [-29, -29], [87, 29], [-87, -29], [29, 87], [-29, -87],
      [FAB.x - 90, FAB.z], [FAB.x, FAB.z + 95], [FAB.x + 80, FAB.z - 60],
      [BASE.x - 105, BASE.z + 20], [BASE.x + 10, BASE.z + 105],
      [VILA.x + 60, VILA.z], [VILA.x, VILA.z - 60], [VILA.x - 50, VILA.z + 40],
      [MATA.x + 20, MATA.z + 25], [MATA.x - 80, MATA.z + 90], [MATA.x + 90, MATA.z - 60],
      [SOLAR.x + 40, SOLAR.z + 40], [FAROL.x + 25, FAROL.z - 20], [LAGO.x - 30, LAGO.z - 125],
      [LAGO.x + 120, LAGO.z - 60], [TORRE.x + 20, TORRE.z + 25], [-150, 150], [200, -150], [250, 330], [-250, -50],
    ]
    spawns.forEach(([x, z], k) => b.spawn(x, z, (k * 2.4) % (Math.PI * 2)))
  },
}

function buildCity(b: MapBuilder, rng: Rng): void {
  const top = CITY.h + 0.15
  b.box(CITY.x, CITY.h, CITY.z, 330, 0.3, 330, 'asphalt')
  const pitch = 58
  const half = 22
  const walk = top + 0.2
  for (let bi = -2; bi <= 2; bi++) {
    for (let bj = -2; bj <= 2; bj++) {
      const cx = CITY.x + bi * pitch
      const cz = CITY.z + bj * pitch
      b.box(cx, top + 0.1, cz, half * 2, 0.2, half * 2, 'concrete')
      // Praça central com monumento
      if (bi === 0 && bj === 0) {
        b.block(cx, cz, walk, 4, 1.2, 4, 'concrete')
        b.block(cx, cz, walk + 1.2, 1.4, 9, 1.4, 'brick')
        b.chest(cx + 3.5, cz, Math.PI / 2, 1, walk)
        for (const [dx, dz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) b.prop('broadleaf', cx + dx, cz + dz, rng.range(0, 6), 1.1)
        b.label('CIDADE ESQUECIDA', cx, walk + 4.5, cz + 2.2, 0, 1.2)
        continue
      }
      const facing = Math.abs(bi) >= Math.abs(bj) ? (bi >= 0 ? -Math.PI / 2 : Math.PI / 2) : bj >= 0 ? Math.PI : 0
      const wall = () => rng.pick(CITY_PALETTE)
      const ruin = () => (rng.chance(0.3) ? rng.range(0.3, 0.9) : 0)
      const layout = rng.int(0, 4)
      if (layout === 0) {
        b.building(cx, cz, 30, 28, { yaw: facing, floors: rng.int(4, 7), wall: wall(), baseY: walk, ruin: ruin(), chestChance: 0.35 })
      } else if (layout === 1) {
        const ax = Math.abs(facing) < 0.1 || Math.abs(facing - Math.PI) < 0.1
        for (const k of [-1, 1]) {
          const ox = ax ? k * 10.5 : 0
          const oz = ax ? 0 : k * 10.5
          b.building(cx + ox, cz + oz, ax ? 18 : 36, ax ? 36 : 18, { yaw: ax ? facing : facing, floors: rng.int(2, 6), wall: wall(), baseY: walk, ruin: ruin() })
        }
      } else if (layout === 2) {
        for (const [ox, oz] of [[-10.5, -10.5], [10.5, -10.5], [-10.5, 10.5], [10.5, 10.5]]) {
          b.building(cx + ox, cz + oz, 17, 17, { yaw: facing, floors: rng.int(2, 5), wall: wall(), baseY: walk, ruin: ruin() })
        }
      } else {
        // Estacionamento/terreno baldio: carros, contêineres e loot no chão
        for (let k = 0; k < 5; k++) car(b, cx + rng.range(-15, 15), cz + rng.range(-15, 15), rng.range(0, Math.PI), rng.pick(['metal-red', 'metal-blue', 'metal-green'] as MaterialId[]), walk)
        container(b, cx + 12, cz - 12, rng.range(0, 1), 'metal-blue', walk, 2)
        b.lootSpot(cx - 6, cz + 6, 0, walk)
        b.lootSpot(cx + 6, cz - 2, 0, walk)
        if (rng.chance(0.6)) b.chest(cx, cz + 12, 0, 1, walk)
      }
    }
  }
  // Carros abandonados nas ruas e loot nas esquinas
  for (let k = 0; k < 36; k++) {
    const along = rng.range(-150, 150)
    const lane = rng.int(-2, 3) * pitch - pitch / 2 + rng.range(-3, 3)
    const vertical = rng.chance(0.5)
    car(b, vertical ? lane : along, vertical ? along : lane, (vertical ? 0 : Math.PI / 2) + rng.range(-0.3, 0.3), rng.pick(['metal-red', 'metal-blue', 'metal-green', 'metal'] as MaterialId[]), top)
  }
  for (let k = 0; k < 16; k++) b.lootSpot(rng.int(-2, 3) * pitch - pitch / 2, rng.range(-140, 140), 0, top)
}

function buildIndustrial(b: MapBuilder, rng: Rng): void {
  const y = FAB.h + 0.15
  b.box(FAB.x, FAB.h, FAB.z, 230, 0.3, 230, 'concrete')
  warehouse(b, FAB.x - 50, FAB.z - 55, 32, 22, { baseY: y, wall: 'metal-red', yaw: 0 })
  warehouse(b, FAB.x + 45, FAB.z - 50, 28, 20, { baseY: y, wall: 'metal-blue', yaw: Math.PI / 2 })
  warehouse(b, FAB.x + 50, FAB.z + 55, 34, 22, { baseY: y, wall: 'metal-green', yaw: Math.PI })
  // Fábrica de 3 andares com chaminé
  b.building(FAB.x - 50, FAB.z + 50, 26, 18, { floors: 3, wall: 'brick', trim: 'concrete', baseY: y, chestChance: 0.5, floorHeight: 3.6 })
  b.block(FAB.x - 66, FAB.z + 62, y, 3.2, 34, 3.2, 'brick')
  // Silos (octogonais: duas caixas sobrepostas giradas 45°)
  for (const [sx, sz] of [[FAB.x + 5, FAB.z - 5], [FAB.x + 15, FAB.z - 5], [FAB.x + 5, FAB.z + 6]]) {
    b.block(sx, sz, y, 7, 18, 7, 'concrete')
    b.block(sx, sz, y, 7, 18, 7, 'concrete', Math.PI / 4)
  }
  // Pátio de contêineres
  const colors: MaterialId[] = ['metal-red', 'metal-blue', 'metal-green', 'metal']
  for (let row = 0; row < 4; row++) {
    for (let k = 0; k < 5; k++) {
      if (rng.chance(0.2)) continue
      container(b, FAB.x + 70 + row * 4, FAB.z - 15 + k * 7, 0, rng.pick(colors), y, rng.int(1, 4))
    }
  }
  for (let k = 0; k < 6; k++) b.lootSpot(FAB.x + 68 + rng.range(0, 14), FAB.z - 18 + k * 7, 0, y)
  b.chest(FAB.x + 75, FAB.z + 22, 0, 1, y)
  for (let k = 0; k < 8; k++) car(b, FAB.x + rng.range(-90, 90), FAB.z + rng.range(-90, 90), rng.range(0, 3), rng.pick(colors), y)
  b.label('DISTRITO FABRIL', FAB.x - 20, y + 3, FAB.z + 100, 0, 1)
}

function buildMilitary(b: MapBuilder): void {
  const y = BASE.h + 0.15
  const s = 90
  b.box(BASE.x, BASE.h, BASE.z, 190, 0.3, 190, 'concrete')
  const wall = (x0: number, z0: number, x1: number, z1: number) =>
    b.wall(x0, z0, x1, z1, y - 0.3, 4, 'concrete', [{ at: s - 4, width: 8, bottom: 0, top: 5 }], 0.6)
  wall(BASE.x - s, BASE.z + s, BASE.x + s, BASE.z + s)
  wall(BASE.x + s, BASE.z - s, BASE.x - s, BASE.z - s)
  wall(BASE.x - s, BASE.z - s, BASE.x - s, BASE.z + s)
  wall(BASE.x + s, BASE.z + s, BASE.x + s, BASE.z - s)
  // Hangar
  warehouse(b, BASE.x + 35, BASE.z - 40, 40, 26, { baseY: y, wall: 'metal-green', height: 10, loot: 2 })
  // Alojamentos e bunkers
  b.building(BASE.x - 45, BASE.z - 40, 24, 10, { floors: 2, wall: 'concrete', trim: 'metal-green', baseY: y, loot: 2, chestChance: 0.6 })
  b.building(BASE.x - 45, BASE.z - 10, 24, 10, { floors: 2, wall: 'concrete', trim: 'metal-green', baseY: y, loot: 2, chestChance: 0.6 })
  for (const [bx, bz] of [[BASE.x - 40, BASE.z + 45], [BASE.x + 5, BASE.z + 50], [BASE.x + 50, BASE.z + 40]]) {
    b.building(bx, bz, 9, 8, { floors: 1, wall: 'concrete', trim: 'concrete', windows: false, baseY: y, loot: 2, chestChance: 0.8 })
  }
  // Torres de vigia nos cantos
  for (const [tx, tz, yaw] of [[BASE.x - s + 8, BASE.z - s + 8, Math.PI * 0.75], [BASE.x + s - 8, BASE.z - s + 8, -Math.PI * 0.75], [BASE.x - s + 8, BASE.z + s - 8, Math.PI * 0.25], [BASE.x + s - 8, BASE.z + s - 8, -Math.PI * 0.25]]) {
    watchtower(b, tx, tz, yaw, y, 8, 2)
  }
  // Heliponto e caixas de suprimento
  b.box(BASE.x + 10, y + 0.05, BASE.z + 5, 16, 0.1, 16, 'grid-dark')
  for (let k = 0; k < 6; k++) b.lootSpot(BASE.x - 10 + k * 6, BASE.z + 15, 2, y)
  b.label('BASE SENTINELA', BASE.x, y + 5.5, BASE.z + s + 1, 0, 1.1)
}

function buildVillage(b: MapBuilder, rng: Rng): void {
  const houses: [number, number, number][] = [
    [-30, -28, 0], [-6, -32, 0], [20, -30, 0.1], [36, -6, -Math.PI / 2], [34, 22, -Math.PI / 2],
    [8, 34, Math.PI], [-18, 34, Math.PI], [-40, 18, Math.PI / 2], [-42, -6, Math.PI / 2],
  ]
  houses.forEach(([dx, dz, yaw]) => {
    const floors = rng.chance(0.4) ? 2 : 1
    b.house(VILA.x + dx, VILA.z + dz, rng.pick([8, 9, 10]), rng.pick([7, 8]), { yaw, floors, wall: rng.pick(['plaster', 'plaster-warm', 'brick'] as MaterialId[]), trim: rng.pick(['concrete', 'wood-dark'] as MaterialId[]) })
  })
  // Capela com torre do sino
  b.building(VILA.x - 2, VILA.z - 2, 10, 16, { floors: 1, floorHeight: 6, wall: 'plaster', trim: 'wood-dark', chestChance: 1, loot: 1, yaw: Math.PI })
  b.block(VILA.x - 2, VILA.z - 13, VILA.h, 4, 15, 4, 'plaster')
  fence(b, VILA.x - 60, VILA.z + 55, VILA.x + 60, VILA.z + 55, 'wood', 1.1, 56, 4)
  fence(b, VILA.x - 60, VILA.z - 55, VILA.x + 60, VILA.z - 55, 'wood', 1.1, 56, 4)
  b.label('VILA SERENA', VILA.x, VILA.h + 3.5, VILA.z + 58, 0, 1)
}

function buildForest(b: MapBuilder): void {
  // Cabanas na mata (em clareiras niveladas)
  for (const [x, z, yaw] of [[MATA.x, MATA.z, 0.3], [MATA.x - 90, MATA.z + 70, -0.5], [MATA.x + 70, MATA.z - 80, 1.2]]) {
    b.house(x, z, 7, 6, { yaw, wall: 'wood', trim: 'wood-dark', chestChance: 0.7 })
  }
}

function buildMansion(b: MapBuilder): void {
  const y = SOLAR.h + 0.15
  b.building(SOLAR.x, SOLAR.z, 28, 18, { floors: 3, wall: 'plaster-warm', trim: 'wood-dark', baseY: y, loot: 1, chestChance: 0.6, floorHeight: 3.4 })
  fence(b, SOLAR.x - 30, SOLAR.z + 24, SOLAR.x + 30, SOLAR.z + 24, 'brick', 1.4, 28, 5)
  fence(b, SOLAR.x - 30, SOLAR.z - 24, SOLAR.x + 30, SOLAR.z - 24, 'brick', 1.4)
  fence(b, SOLAR.x - 30, SOLAR.z - 24, SOLAR.x - 30, SOLAR.z + 24, 'brick', 1.4)
  fence(b, SOLAR.x + 30, SOLAR.z + 24, SOLAR.x + 30, SOLAR.z - 24, 'brick', 1.4)
  b.label('SOLAR DOS VENTOS', SOLAR.x, y + 2.5, SOLAR.z + 25, 0, 0.9)
}

function buildLighthouse(b: MapBuilder): void {
  const y = FAROL.h + 0.15
  const r = b.building(FAROL.x, FAROL.z, 8, 8, { floors: 6, wall: 'plaster', trim: 'metal-red', baseY: y, loot: 2, chestChance: 0.25, roofAccess: true, windows: true })
  // Lanterna no alto
  b.block(FAROL.x, FAROL.z, r.roofY + 0.25, 3, 0.6, 3, 'metal-red')
  for (const [dx, dz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) b.block(FAROL.x + dx, FAROL.z + dz, r.roofY + 0.85, 0.15, 2.2, 0.15, 'metal')
  b.block(FAROL.x, FAROL.z, r.roofY + 3.05, 3.4, 0.4, 3.4, 'metal-red')
  b.house(FAROL.x + 14, FAROL.z - 6, 8, 7, { yaw: -Math.PI / 2, wall: 'plaster', trim: 'wood-dark', loot: 1, chestChance: 0.6 })
  b.label('FAROL DO FIM', FAROL.x, y + 3.2, FAROL.z + 5, 0, 0.8)
}

function buildLake(b: MapBuilder): void {
  // Píer na margem norte e casa de barcos
  const px = LAGO.x
  const pz = LAGO.z - 108
  const deckY = 1.3
  b.box(px, deckY, pz + 14, 3, 0.25, 30, 'wood')
  for (let k = 0; k <= 7; k++) {
    const z = pz + k * 4
    for (const dx of [-1.3, 1.3]) {
      const g = b.heightAt(px + dx, z)
      const hgt = deckY - 0.12 - g + 0.5
      if (hgt > 0.2) b.box(px + dx, g - 0.5 + hgt / 2, z, 0.3, hgt, 0.3, 'wood-dark')
    }
  }
  b.lootSpot(px, pz + 26, 0, deckY + 0.13)
  b.house(px - 14, pz - 6, 8, 6, { yaw: 0, wall: 'wood', trim: 'wood-dark', chestChance: 0.5 })
  // Casa na ilhota
  b.house(ILHOTA.x, ILHOTA.z, 8, 7, { yaw: -0.4, wall: 'plaster', trim: 'wood-dark', loot: 1, chestChance: 0.9 })
  b.label('LAGO AZUL', px, deckY + 2.2, pz - 1, 0, 0.9)
}

function buildTower(b: MapBuilder): void {
  // Torre do Vigia: rampas de 45° em zigue-zague até 20 m, baú raro no topo
  const base = b.heightAt(TORRE.x, TORRE.z)
  const x = TORRE.x
  const z = TORRE.z
  const lanes = [x - 4, x + 4]
  for (let lvl = 0; lvl < 5; lvl++) {
    const y = base + lvl * 4
    const up = lvl % 2 === 0
    const lane = lanes[lvl % 2]
    if (up) b.ramp(lane, z + 4, y, 4, 4, 45 * DEG, 0, 'wood')
    else b.ramp(lane, z, y, 4, 4, 45 * DEG, Math.PI, 'wood')
    b.box(x, y + 4 - 0.15, up ? z - 2 : z + 6, 12, 0.3, 4, 'wood-dark')
  }
  for (const px of [x - 5.8, x + 5.8]) for (const pz of [z - 3.8, z + 7.8]) b.block(px, pz, base, 0.4, 20, 0.4, 'metal')
  b.chest(x, z + 6, Math.PI, 2, base + 20)
  b.lootSpot(x + 3, z - 2, 2, base + 16)
  b.label('TORRE DO VIGIA', x, base + 2.4, z + 9, 0, 0.8)
}

function scatterNature(b: MapBuilder, rng: Rng): void {
  const pois = [CITY, FAB, BASE, VILA, SOLAR, FAROL]
  const blocked = (x: number, z: number) => {
    for (const p of pois) if (Math.hypot(x - p.x, z - p.z) < p.r + 12) return true
    if (Math.hypot(x - ILHOTA.x, z - ILHOTA.z) < 16) return true
    if (Math.hypot(x - LAGO.x, z - (LAGO.z - 108)) < 22) return true
    if (Math.hypot(x - TORRE.x, z - TORRE.z) < 18) return true
    for (const [cx, cz] of [[MATA.x, MATA.z], [MATA.x - 90, MATA.z + 70], [MATA.x + 70, MATA.z - 80]]) if (Math.hypot(x - cx, z - cz) < 10) return true
    return false
  }
  const inForest = (x: number, z: number) => Math.hypot(x - MATA.x, (z - MATA.z) * 0.8) < 190
  scatter(b, rng, {
    count: 2600, minX: -720, maxX: 720, minZ: -720, maxZ: 720, minDist: 5, scale: [0.8, 1.4],
    blocked,
    density: (x, z, h) => (inForest(x, z) ? 1 : h > 30 ? 0.35 : 0.16),
    kind: (x, z, h, r) => (h > 35 || (inForest(x, z) && r.chance(0.6)) ? 'pine' : r.chance(0.35) ? 'pine' : 'broadleaf'),
    minHeight: 2.4,
    maxSlope: 32,
  })
  scatter(b, rng, {
    count: 650, minX: -720, maxX: 720, minZ: -720, maxZ: 720, minDist: 4, scale: [0.8, 2.6],
    blocked,
    density: (_x, z) => (z < -350 ? 0.8 : 0.3),
    kind: () => 'rock',
    minHeight: 0.5,
    maxSlope: 50,
  })
  scatter(b, rng, {
    count: 1400, minX: -720, maxX: 720, minZ: -720, maxZ: 720, minDist: 2.5, scale: [0.6, 1.3],
    blocked,
    density: (x, z) => (inForest(x, z) ? 0.9 : 0.4),
    kind: () => 'bush',
    minHeight: 2.2,
    maxSlope: 30,
  })
  // Loot avulso pela ilha (acampamentos, trilhas)
  for (let k = 0; k < 40; k++) {
    const x = rng.range(-600, 600)
    const z = rng.range(-600, 600)
    if (blocked(x, z) || b.heightAt(x, z) < 2) continue
    b.lootSpot(x, z, 0)
  }
}
