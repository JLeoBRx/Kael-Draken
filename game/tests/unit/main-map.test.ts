import { describe, expect, it } from 'vitest'
import { MOVE } from '../../src/shared/config/movement'
import { loadMap, regionAt } from '../../src/shared/maps'
import { buildMap } from '../../src/shared/maps/builder'
import { CharFlag, createCharacterState, stepCharacter, type CharacterState } from '../../src/shared/movement/character'
import type { CollisionWorld } from '../../src/shared/world/collision-world'
import { cmd, DT } from './helpers'

/** Anda por uma lista de pontos (x, z) e devolve a maior altura atingida. */
function walkRoute(s: CharacterState, world: CollisionWorld, route: [number, number][], maxTicks = 3000): { top: number; reached: number } {
  let wp = 0
  let top = s.y
  for (let k = 0; k < maxTicks && wp < route.length; k++) {
    const [tx, tz] = route[wp]
    const dx = tx - s.x
    const dz = tz - s.z
    if (Math.hypot(dx, dz) < 0.35) {
      wp++
      continue
    }
    stepCharacter(s, cmd({ forward: Math.min(1, Math.hypot(dx, dz) / 1.5 + 0.3), yaw: Math.atan2(-dx, -dz) }), world, DT)
    top = Math.max(top, s.y)
  }
  return { top, reached: wp }
}

describe('Ilha de Brasa (mapa principal)', () => {
  const t0 = performance.now()
  const map = loadMap('ilha-de-brasa')
  const ms = performance.now() - t0

  it('gera rápido, de forma determinística, com todas as regiões pedidas', () => {
    expect(ms).toBeLessThan(3000)
    const again = loadMap('ilha-de-brasa')
    expect(again.boxes.length).toBe(map.boxes.length)
    expect(again.lootSpots.map((l) => l.x + l.z)).toEqual(map.lootSpots.map((l) => l.x + l.z))
    const ids = map.regions.map((r) => r.id)
    for (const id of ['cidade', 'mata', 'picos', 'fabril', 'vila', 'lago', 'base', 'farol', 'solar', 'torre']) expect(ids).toContain(id)
    expect(map.terrain.size).toBe(1600)
    expect(map.terrain.highest).toBeGreaterThan(80)
    expect(map.terrain.heightAt(60, 430)).toBeLessThan(-3)
  })

  it('tem loot, baús e esconderijos espalhados', () => {
    expect(map.lootSpots.length).toBeGreaterThan(200)
    expect(map.chests.length).toBeGreaterThan(60)
    expect(map.lootSpots.filter((l) => l.tier >= 2).length).toBeGreaterThan(10)
    const regionsWithLoot = new Set(map.lootSpots.map((l) => regionAt(map, l.x, l.z)?.id).filter(Boolean))
    expect(regionsWithLoot.size).toBeGreaterThanOrEqual(8)
  })

  it('todos os pontos de surgimento são seguros (em pé, fora da água e de geometria)', () => {
    for (const sp of map.spawns) {
      const top = map.terrain.highest + 20
      const hit = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, colliderId: -1, surface: 0 as 0 }
      const y = map.world.raycast(sp.x, top, sp.z, 0, -1, 0, top + 50, hit) ? hit.y : map.terrain.heightAt(sp.x, sp.z)
      const s = createCharacterState(sp.x, y + 0.02, sp.z, sp.yaw)
      for (let k = 0; k < 30; k++) stepCharacter(s, cmd({ yaw: sp.yaw }), map.world, DT)
      expect(s.flags & CharFlag.Swimming, `spawn ${sp.x},${sp.z}`).toBe(0)
      expect(s.flags & CharFlag.Grounded, `spawn ${sp.x},${sp.z}`).toBeTruthy()
      expect(Math.hypot(s.x - sp.x, s.z - sp.z), `spawn ${sp.x},${sp.z}`).toBeLessThan(0.5)
    }
  })
})

describe('prédio gerado', () => {
  it('a escada em vai e volta leva do térreo até a laje do 4º andar', () => {
    const W = 14
    const D = 12
    let info = { floorY: 0, roofY: 0 }
    const map = buildMap({
      id: 'predio', name: 'Prédio', description: '', samples: 65, cell: 2, seed: 3, waterLevel: -50,
      biome: { sand: 0, grass: 0, grassDry: 0, forest: 0, dirt: 0, rock: 0, snow: 0, seabed: 0, sandLevel: -99, snowLevel: 999 },
      atmosphere: { sunAzimuth: 0, sunElevation: 45, skyTop: 0, skyHorizon: 0, fogDensity: 0 },
      build(b) {
        b.shapeTerrain(() => 0)
        info = b.building(0, 0, W, D, { floors: 4, roofAccess: true, loot: null })
      },
    })
    const hw = W / 2
    const hd = D / 2
    const t = 0.25
    const run = Math.round(3.2 / 0.32) * 0.3
    const turn = -hd + t + 1.2
    const front = turn + run
    const sxA = -hw + t + 0.6
    const sxB = sxA + 1.2
    const route: [number, number][] = [[0, hd + 2], [0, hd - 1.5], [sxA, front + 1]]
    for (let f = 0; f < 4; f++) {
      // A sobe para os fundos até o patamar; B volta para a frente
      if (f % 2 === 0) route.push([sxA, front + 0.2], [sxA, turn - 0.5], [sxB, turn - 0.5])
      else route.push([sxB, turn + 0.2], [sxB, front + 0.45], [sxA, front + 0.45])
    }
    route.push([2, 1])
    const s = createCharacterState(0, 0.05, hd + 3, 0)
    const res = walkRoute(s, map.world, route)
    expect(res.reached).toBe(route.length)
    expect(s.y).toBeGreaterThan(info.roofY - 0.1)
    expect(s.y).toBeLessThan(info.roofY + 0.6)
    expect(s.flags & CharFlag.Grounded).toBeTruthy()
    expect(MOVE.stepHeight).toBeGreaterThan(0.32)
  })
})
