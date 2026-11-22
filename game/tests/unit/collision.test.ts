import { describe, expect, it } from 'vitest'
import { gradientNoise2 } from '../../src/shared/math/noise'
import { Rng } from '../../src/shared/math/rng'
import { createWorldHit } from '../../src/shared/world/collision-world'
import { Heightfield } from '../../src/shared/world/heightfield'
import { capsuleVsObb, makeObb, rayVsObb } from '../../src/shared/world/obb'
import { SpatialGrid } from '../../src/shared/world/spatial-grid'
import { addBox, flatWorld } from './helpers'

describe('determinismo', () => {
  it('Rng e ruído reproduzem a mesma sequência para a mesma semente', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    for (let k = 0; k < 100; k++) expect(a.next()).toBe(b.next())
    expect(gradientNoise2(12.3, -4.5, 7)).toBe(gradientNoise2(12.3, -4.5, 7))
    expect(gradientNoise2(12.3, -4.5, 7)).not.toBe(gradientNoise2(12.3, -4.5, 8))
  })
})

describe('Heightfield', () => {
  const hf = new Heightfield(3, 2)
  // amostras: (0,0)=0 (1,0)=2 (0,1)=4 (1,1)=6 ... em uma grade 3x3 centrada
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) hf.set(i, j, i * 2 + j * 4)
  hf.finalize()

  it('interpola nos vértices e no plano dos triângulos', () => {
    expect(hf.heightAt(-2, -2)).toBeCloseTo(0)
    expect(hf.heightAt(0, -2)).toBeCloseTo(2)
    expect(hf.heightAt(-2, 0)).toBeCloseTo(4)
    expect(hf.heightAt(-1, -1)).toBeCloseTo(3)
  })

  it('normal aponta para cima e contra a subida', () => {
    const n = hf.normalAt(-1.5, -1.5, { x: 0, y: 0, z: 0 })
    expect(n.y).toBeGreaterThan(0)
    expect(n.x).toBeLessThan(0)
    expect(n.z).toBeLessThan(0)
    expect(Math.hypot(n.x, n.y, n.z)).toBeCloseTo(1)
  })

  it('raio vertical acerta o chão', () => {
    const world = flatWorld(() => 3)
    const t = world.terrain.raycast(5, 20, 5, 0, -1, 0, 100)
    expect(t).toBeCloseTo(17, 2)
    expect(world.terrain.raycast(5, 20, 5, 0, 1, 0, 100)).toBe(-1)
  })
})

describe('OBB', () => {
  it('cápsula apoiada sobre a caixa recebe normal para cima', () => {
    const box = makeObb(0, 0.5, 0, 1, 0.5, 1)
    const c = { nx: 0, ny: 0, nz: 0, depth: 0 }
    // fundo da cápsula 5 cm dentro do topo
    const r = 0.38
    expect(capsuleVsObb(0, 1 - 0.05 + r, 0, 0, 2, 0, r, box, c)).toBe(true)
    expect(c.ny).toBeCloseTo(1)
    expect(c.depth).toBeCloseTo(0.05, 3)
  })

  it('contato lateral com parede girada', () => {
    const wall = makeObb(0, 1.5, 0, 2, 1.5, 0.1, Math.PI / 4)
    const c = { nx: 0, ny: 0, nz: 0, depth: 0 }
    // normal da face +Z local girada 45° → (sin45, 0, cos45)
    const d = 0.1 + 0.3
    expect(capsuleVsObb(Math.SQRT1_2 * d, 0.5, Math.SQRT1_2 * d, Math.SQRT1_2 * d, 1.5, Math.SQRT1_2 * d, 0.38, wall, c)).toBe(true)
    expect(c.nx).toBeCloseTo(Math.SQRT1_2, 3)
    expect(c.nz).toBeCloseTo(Math.SQRT1_2, 3)
    expect(c.depth).toBeCloseTo(0.08, 3)
  })

  it('sem contato quando afastada', () => {
    const box = makeObb(0, 0.5, 0, 1, 0.5, 1)
    const c = { nx: 0, ny: 0, nz: 0, depth: 0 }
    expect(capsuleVsObb(3, 0.5, 0, 3, 1.5, 0, 0.38, box, c)).toBe(false)
  })

  it('raio acerta a face certa', () => {
    const box = makeObb(0, 1, -10, 1, 1, 1)
    const hit = { t: 0, nx: 0, ny: 0, nz: 0 }
    expect(rayVsObb(0, 1, 0, 0, 0, -1, box, 100, hit)).toBe(true)
    expect(hit.t).toBeCloseTo(9)
    expect(hit.nz).toBeCloseTo(1)
    expect(rayVsObb(0, 5, 0, 0, 0, -1, box, 100, hit)).toBe(false)
  })
})

describe('SpatialGrid e CollisionWorld', () => {
  it('consulta devolve cada id uma vez e respeita remoção', () => {
    const g = new SpatialGrid(-50, -50, 100, 8)
    g.insert(3, -10, -10, 10, 10)
    g.insert(7, 30, 30, 32, 32)
    expect(g.query(-20, -20, 20, 20, []).sort()).toEqual([3])
    expect(g.query(-50, -50, 50, 50, []).sort()).toEqual([3, 7])
    g.remove(3, -10, -10, 10, 10)
    expect(g.query(-20, -20, 20, 20, [])).toEqual([])
  })

  it('raycast do mundo escolhe o impacto mais próximo entre relevo e caixas', () => {
    const world = flatWorld()
    const id = addBox(world, 0, 1, -30, 2, 2, 2)
    const hit = createWorldHit()
    expect(world.raycast(0, 1, 0, 0, 0, -1, 200, hit)).toBe(true)
    expect(hit.colliderId).toBe(id)
    expect(hit.t).toBeCloseTo(29)
    expect(world.raycast(0, 10, 0, 0, -1, 0, 200, hit)).toBe(true)
    expect(hit.colliderId).toBe(-1)
    expect(hit.t).toBeCloseTo(10)
    world.remove(id)
    expect(world.raycast(0, 1, 0, 0, 0, -1, 200, hit, false)).toBe(false)
  })
})
