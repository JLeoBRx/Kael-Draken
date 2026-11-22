import { describe, expect, it } from 'vitest'
import { BuildKind } from '../../src/shared/config/building'
import { BuildingWorld, pieceHealth } from '../../src/shared/building/buildings'
import { buildTarget, facingDir, pieceObbs, type PieceSpec } from '../../src/shared/building/grid'
import { CharFlag, createCharacterState, stepCharacter } from '../../src/shared/movement/character'
import { cmd, DT, flatWorld, settled } from './helpers'

const spec = (kind: number, i: number, j: number, k: number, dir = 0): PieceSpec => ({ kind, i, j, k, dir })

describe('geometria das peças', () => {
  it('parede, piso, rampa de 45° e telhado de duas águas', () => {
    const [w] = pieceObbs(spec(BuildKind.Wall, 0, 0, 0, 0))
    expect([w.minX, w.maxX, w.minY, w.maxY]).toEqual([0, 4, 0, 4])
    expect(w.maxZ - w.minZ).toBeCloseTo(0.2)
    const [f] = pieceObbs(spec(BuildKind.Floor, 1, 1, 2))
    expect(f.maxY).toBeCloseTo(8)
    expect([f.minX, f.maxX, f.minZ, f.maxZ]).toEqual([4, 8, 4, 8])
    const [r] = pieceObbs(spec(BuildKind.Ramp, 0, 0, 0, 0))
    expect(r.pitch).toBeCloseTo(Math.PI / 4)
    expect(r.maxY).toBeGreaterThan(3.9)
    expect(r.minZ).toBeGreaterThan(-0.3)
    const roof = pieceObbs(spec(BuildKind.Roof, 0, 0, 1, 0))
    expect(roof).toHaveLength(2)
    expect(Math.max(...roof.map((o) => o.maxY))).toBeCloseTo(4 + 1.6, 0)
  })

  it('direção cardinal pelo yaw', () => {
    expect(facingDir(0)).toBe(0)
    expect(facingDir(Math.PI / 2)).toBe(1)
    expect(facingDir(-Math.PI / 2)).toBe(3)
    expect(facingDir(Math.PI * 0.97)).toBe(2)
  })
})

describe('alvo do fantasma', () => {
  const none = () => false
  const at = (pitch = 0) => {
    const c = createCharacterState(2, 0, 2, 0)
    c.pitch = pitch
    return c
  }
  it('olhando ao norte do centro da célula', () => {
    expect(buildTarget(at(), BuildKind.Wall, 0, none)).toEqual(spec(BuildKind.Wall, 0, 0, 0, 0))
    expect(buildTarget(at(), BuildKind.Floor, 0, none)).toEqual(spec(BuildKind.Floor, 0, -1, 0, 0))
    expect(buildTarget(at(), BuildKind.Ramp, 0, none)).toEqual(spec(BuildKind.Ramp, 0, -1, 0, 0))
    expect(buildTarget(at(), BuildKind.Ramp, 1, none).dir).toBe(1)
    expect(buildTarget(at(), BuildKind.Roof, 0, none).dir).toBe(0)
  })
  it('olhando para cima sobe um nível', () => {
    expect(buildTarget(at(0.75), BuildKind.Floor, 0, none).k).toBe(1)
    expect(buildTarget(at(0.75), BuildKind.Wall, 0, none).k).toBe(1)
    expect(buildTarget(at(-0.9), BuildKind.Floor, 0, none).k).toBe(0)
  })
  it('em chão alto (pátio a 6,15 m) o nível é o do corpo, não o de cima', () => {
    const c = createCharacterState(2, 6.15, 2, 0)
    expect(buildTarget(c, BuildKind.Wall, 0, none).k).toBe(1)
    expect(buildTarget(c, BuildKind.Ramp, 0, none).k).toBe(1)
    c.pitch = 0.75
    expect(buildTarget(c, BuildKind.Wall, 0, none).k).toBe(2)
    // quase no topo de uma rampa (pés a 0,8 m do nível seguinte) já conta como o de cima
    expect(buildTarget(createCharacterState(2, 3.2, 2, 0), BuildKind.Wall, 0, none).k).toBe(1)
  })
  it('parede vira para o jogador quando ele olha para o lado', () => {
    const c = createCharacterState(2, 0, 2, -Math.PI / 2) // olhando para +X
    expect(buildTarget(c, BuildKind.Wall, 0, none)).toEqual(spec(BuildKind.Wall, 1, 0, 0, 1))
  })
})

describe('apoio, ocupação e desabamento', () => {
  it('só constrói apoiado no chão ou em outra peça', () => {
    const world = flatWorld()
    const bw = new BuildingWorld(world)
    expect(bw.canPlace(spec(BuildKind.Floor, 0, 0, 0))).toBeNull()
    expect(bw.canPlace(spec(BuildKind.Floor, 0, 0, 2))).toBe('Sem apoio')
    bw.add(spec(BuildKind.Wall, 0, 0, 0, 0), 1, 0)
    expect(bw.canPlace(spec(BuildKind.Wall, 0, 0, 0, 0))).toBe('Ocupado')
    expect(bw.canPlace(spec(BuildKind.Floor, 0, 0, 1))).toBeNull()
    expect(bw.canPlace(spec(BuildKind.Floor, 0, -1, 1))).toBeNull()
    expect(bw.canPlace(spec(BuildKind.Floor, 5, 5, 1))).toBe('Sem apoio')
  })

  it('derrubar a base derruba o que ficou no ar; outra base segura', () => {
    const world = flatWorld()
    const bw = new BuildingWorld(world)
    const wall = bw.add(spec(BuildKind.Wall, 0, 0, 0, 0), 1, 0)
    const f1 = bw.add(spec(BuildKind.Floor, 0, 0, 1), 2, 0)
    const f2 = bw.add(spec(BuildKind.Floor, 1, 0, 1), 3, 0)
    const f3 = bw.add(spec(BuildKind.Floor, 2, 0, 1), 4, 0)
    const support = bw.add(spec(BuildKind.Wall, 2, 1, 0, 0), 5, 1)
    let near = bw.neighbors(wall)
    bw.remove(wall)
    expect(bw.unsupported(near)).toEqual([])
    near = bw.neighbors(support)
    bw.remove(support)
    const fall = bw.unsupported(near).map((p) => p.id).sort()
    expect(fall).toEqual([f1.id, f2.id, f3.id].sort())
  })

  it('vida cresce durante a construção e cai com dano', () => {
    const p = { material: 0, builtAt: 0, damage: 0 }
    expect(pieceHealth(p, 0, 30)).toBeCloseTo(15)
    expect(pieceHealth(p, 45, 30)).toBeCloseTo(15 + 135 / 2)
    expect(pieceHealth(p, 300, 30)).toBe(150)
    expect(pieceHealth({ ...p, damage: 100 }, 300, 30)).toBe(50)
  })
})

describe('corrida de rampas', () => {
  it('constrói rampas seguidas enquanto corre e sobe 3 níveis', () => {
    const world = flatWorld()
    const bw = new BuildingWorld(world)
    const s = settled(world, 2, 2, 0)
    let id = 1
    let peak = 0
    for (let tick = 0; tick < 100; tick++) {
      const target = buildTarget(s, BuildKind.Ramp, 0, (i, j, k, d) => bw.hasRamp(i, j, k, d))
      if (bw.count < 3 && bw.canPlace(target) === null) bw.add(target, id++, 0)
      stepCharacter(s, cmd({ forward: 1, yaw: 0 }), world, DT)
      peak = Math.max(peak, s.y)
    }
    expect(bw.count).toBe(3)
    const levels = [...bw.byId.values()].map((p) => `${p.spec.j}:${p.spec.k}`).sort()
    expect(levels).toEqual(['-1:0', '-2:1', '-3:2'].sort())
    // cada rampa continua a anterior: o personagem chega ao topo da terceira (12 m)
    expect(peak).toBeGreaterThan(11.5)
    expect(s.flags & CharFlag.Swimming).toBe(0)
  })

  it('anda sobre um piso construído no alto e é barrado por parede construída', () => {
    const world = flatWorld()
    const bw = new BuildingWorld(world)
    bw.add(spec(BuildKind.Wall, 0, -2, 0, 0), 1, 0)
    const s = settled(world, 2, 2, 0)
    for (let k = 0; k < 120; k++) stepCharacter(s, cmd({ forward: 1, yaw: 0 }), world, DT)
    expect(s.z).toBeGreaterThan(-8 + 0.1 + 0.37)
  })
})
