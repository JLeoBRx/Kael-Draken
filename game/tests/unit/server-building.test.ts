import { describe, expect, it } from 'vitest'
import { BUILD, BuildKind, PICKAXE, encodeBuild } from '../../src/shared/config/building'
import { ITEM, Material } from '../../src/shared/config/items'
import { pieceHealth } from '../../src/shared/building/buildings'
import { PICKAXE_SLOT } from '../../src/shared/player/player'
import { Buttons } from '../../src/shared/movement/character'
import { TargetKind } from '../../src/shared/net/protocol'
import { CHEST, Harness, aimAt, give, testMap } from './sim-helpers'

const FIRE = Buttons.Fire
const wall = (material = 0) => encodeBuild(BuildKind.Wall, 0, material)

/** A e B frente a frente no meio das células: A em (2,0) olhando para −Z, B em (2,−10). */
function duel(build: Parameters<typeof testMap>[0] = () => {}) {
  const h = new Harness(testMap(build))
  const a = h.add('A')
  const b = h.add('B')
  a.p.char.x = 2
  b.p.char.x = 2
  h.run(10)
  return { h, a, b }
}

describe('construção autoritativa', () => {
  it('coloca a parede à frente, gasta material e avisa todos', () => {
    const { h, a } = duel()
    a.p.materials[Material.Wood] = 30
    h.tick(new Map([[a, { yaw: 0, build: wall(), buttons: FIRE }]]))
    const placed = h.events('piecePlaced')
    expect(placed).toHaveLength(1)
    // Primeira linha da grade à frente que não atravessa o jogador: z = −4
    expect(placed[0]).toMatchObject({ kind: BuildKind.Wall, i: 0, j: -1, k: 0, dir: 0, material: 0, builder: a.id, age: 0, damage: 0 })
    expect(placed[0].seq).toBeGreaterThan(0)
    expect(h.log.find((e) => e.ev.type === 'piecePlaced')?.to).toBeUndefined()
    expect(a.p.materials[Material.Wood]).toBe(30 - BUILD.cost)
    expect(h.sim.buildings.count).toBe(1)
    // A peça entra no mundo de colisão: o mesmo lugar fica ocupado
    h.run(5, new Map([[a, { yaw: 0, build: wall(), buttons: FIRE }]]))
    expect(h.sim.buildings.count).toBe(1)
    expect(a.p.materials[Material.Wood]).toBe(30 - BUILD.cost)
  })

  it('sem material não constrói; cooldown entre peças', () => {
    const { h, a } = duel()
    a.p.materials[Material.Stone] = 5
    h.run(3, new Map([[a, { yaw: 0, build: wall(Material.Stone), buttons: FIRE }]]))
    expect(h.sim.buildings.count).toBe(0)
    a.p.materials[Material.Wood] = 100
    // Parede e piso no mesmo comando seguido: o segundo espera o cooldown
    h.tick(new Map([[a, { yaw: 0, build: wall(), buttons: FIRE }]]))
    h.tick(new Map([[a, { yaw: 0, build: encodeBuild(BuildKind.Floor, 0, 0), buttons: FIRE }]]))
    expect(h.sim.buildings.count).toBe(1)
    h.run(4, new Map([[a, { yaw: 0, build: encodeBuild(BuildKind.Floor, 0, 0), buttons: FIRE }]]))
    expect(h.sim.buildings.count).toBe(2)
  })

  it('a parede bloqueia tiros e perde vida até quebrar', () => {
    const { h, a, b } = duel()
    give(a, ITEM.Rifle, 0)
    b.p.materials[Material.Wood] = 10
    // B ergue uma parede virado para A (yaw π olha para +Z)
    h.tick(new Map([[b, { yaw: Math.PI, build: wall(), buttons: FIRE }]]))
    const piece = [...h.sim.buildings.byId.values()][0]
    expect(piece.spec).toMatchObject({ kind: BuildKind.Wall, dir: 0, i: 0, j: -2 })
    // Recém-erguida ela tem só 10% da vida: espera 1 s de construção (60 de vida)
    h.run(30)
    expect(Math.abs(pieceHealth(piece, h.sim.tick, 30) - 60)).toBeLessThan(2)
    const aim = aimAt(a, b.p.char.x, CHEST, b.p.char.z)
    h.tick(new Map([[a, { ...aim, buttons: FIRE | Buttons.Aim }]]))
    const hits = h.events('hit')
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ targetKind: TargetKind.Structure, target: piece.id, head: false })
    expect(b.p.health).toBe(100)
    expect(piece.damage).toBe(hits[0].damage)
    h.tick()
    expect(h.events('pieceDamaged').at(-1)).toMatchObject({ id: piece.id, damage: piece.damage })
    // Mais alguns tiros e ela quebra
    for (let k = 0; k < 60 && h.sim.buildings.count > 0; k++) h.tick(new Map([[a, { ...aim, buttons: FIRE | Buttons.Aim }]]))
    expect(h.sim.buildings.count).toBe(0)
    expect(h.events('pieceRemoved')).toEqual([{ type: 'pieceRemoved', id: piece.id, collapse: false }])
  })

  it('vida cresce enquanto constrói até o máximo do material', () => {
    const { h, a } = duel()
    a.p.materials[Material.Metal] = 10
    h.tick(new Map([[a, { yaw: 0, build: wall(Material.Metal), buttons: FIRE }]]))
    const piece = [...h.sim.buildings.byId.values()][0]
    expect(pieceHealth(piece, h.sim.tick, 30)).toBeLessThan(60)
    h.run(9 * 30)
    expect(pieceHealth(piece, h.sim.tick, 30)).toBe(450)
  })

  it('quebrar a base derruba a estrutura apoiada nela', () => {
    const { h, a } = duel()
    // Parede no chão e dois pisos em cima, um apoiado no outro
    const w = h.sim.buildings.add({ kind: BuildKind.Wall, i: 0, j: -2, k: 0, dir: 0 }, 100, 0, { builtAt: -1000 })
    h.sim.buildings.add({ kind: BuildKind.Floor, i: 0, j: -2, k: 1, dir: 0 }, 101, 0, { builtAt: -1000 })
    h.sim.buildings.add({ kind: BuildKind.Floor, i: 0, j: -3, k: 1, dir: 0 }, 102, 0, { builtAt: -1000 })
    expect(h.sim.damagePiece(w, 1000)).toBe(true)
    h.tick()
    const removed = h.events('pieceRemoved')
    expect(removed[0]).toEqual({ type: 'pieceRemoved', id: 100, collapse: false })
    expect(removed.slice(1).map((e) => e.id).sort()).toEqual([101, 102])
    expect(removed.slice(1).every((e) => e.collapse)).toBe(true)
    expect(h.sim.buildings.count).toBe(0)
    void a
  })

  it('explosões causam dano multiplicado nas construções', () => {
    const { h, a } = duel()
    give(a, ITEM.Launcher, 2)
    const w = h.sim.buildings.add({ kind: BuildKind.Wall, i: -1, j: -2, k: 0, dir: 0 }, 200, Material.Metal, { builtAt: -1000 })
    const aim = aimAt(a, -2, 1.2, -8)
    h.tick(new Map([[a, { ...aim, buttons: FIRE | Buttons.Aim }]]))
    h.run(30)
    expect(h.events('explosion')).toHaveLength(1)
    expect(w.damage).toBeGreaterThan(150)
  })
})

describe('picareta', () => {
  it('é a mão padrão: golpeia jogadores (20) e não atira', () => {
    const { h, a, b } = duel()
    expect(a.p.selected).toBe(PICKAXE_SLOT)
    // Encosta em B
    b.p.char.z = -1.6
    h.run(3)
    const aim = aimAt(a, b.p.char.x, CHEST, b.p.char.z, false)
    h.tick(new Map([[a, { ...aim, buttons: FIRE }]]))
    expect(b.p.health).toBe(100 - PICKAXE.damagePlayer)
    expect(h.events('hit')[0]).toMatchObject({ targetKind: TargetKind.Player, target: b.id, damage: PICKAXE.damagePlayer })
    // Ritmo do golpe (0,55 s): segurar o botão não acerta a cada tick
    h.run(10, new Map([[a, { ...aim, buttons: FIRE }]]))
    expect(b.p.health).toBe(100 - PICKAXE.damagePlayer)
    h.run(10, new Map([[a, { ...aim, buttons: FIRE }]]))
    expect(b.p.health).toBe(100 - 2 * PICKAXE.damagePlayer)
    // Sem tiro de verdade: só o aviso do golpe para os outros (animação), nunca para quem golpeou
    const swings = h.log.filter((e) => e.ev.type === 'shot')
    expect(swings).toHaveLength(2)
    expect(swings.every((e) => e.except === a.id && e.ev.type === 'shot' && e.ev.item === ITEM.Pickaxe && e.ev.ends[0].hit === 2)).toBe(true)
  })

  it('fora do alcance não acerta nada', () => {
    const { h, a, b } = duel()
    h.tick(new Map([[a, { ...aimAt(a, b.p.char.x, CHEST, b.p.char.z, false), buttons: FIRE }]]))
    expect(b.p.health).toBe(100)
    expect(h.events('hit')).toHaveLength(0)
  })

  it('cortar árvore dá madeira até ela cair', () => {
    const { h, a } = duel((b) => b.prop('pine', 2, -2, 0, 1))
    const aim = aimAt(a, 2, 1.2, -2, false)
    const hits = 200 / PICKAXE.damageStructure
    for (let k = 0; k < 200 && h.events('propDestroyed').length === 0; k++) h.tick(new Map([[a, { ...aim, buttons: FIRE }]]))
    const harvest = h.events('harvest')
    expect(harvest).toHaveLength(hits)
    expect(harvest.every((e) => e.material === Material.Wood && e.amount === PICKAXE.harvest[Material.Wood])).toBe(true)
    expect(h.log.find((e) => e.ev.type === 'harvest')?.to).toBe(a.id)
    expect(a.p.materials[Material.Wood]).toBe(hits * PICKAXE.harvest[Material.Wood])
    expect(h.events('propDestroyed')).toEqual([{ type: 'propDestroyed', prop: 0 }])
    expect(h.sim.destroyedProps.has(0)).toBe(true)
    // O tronco some da colisão: o golpe seguinte não rende nada
    h.run(30, new Map([[a, { ...aim, buttons: FIRE }]]))
    expect(h.events('harvest')).toHaveLength(hits)
  })

  it('rocha dá pedra; parede de metal do mapa dá metal com limite', () => {
    const { h, a } = duel((b) => {
      b.prop('rock', 2, -2.2, 0, 1)
      b.box(2, 1.5, 2.2, 4, 3, 0.4, 'metal')
    })
    h.tick(new Map([[a, { ...aimAt(a, 2, 0.5, -2.2, false), buttons: FIRE }]]))
    expect(h.events('harvest')[0]).toMatchObject({ material: Material.Stone, amount: PICKAXE.harvest[Material.Stone] })
    const back = aimAt(a, 2, 1.4, 2.2, false)
    for (let k = 0; k < 400; k++) h.tick(new Map([[a, { ...back, buttons: FIRE }]]))
    expect(a.p.materials[Material.Metal]).toBe(PICKAXE.staticYield)
    // A geometria fixa não quebra
    expect(h.events('propDestroyed')).toHaveLength(0)
  })

  it('golpe em construção causa o dano de estrutura', () => {
    const { h, a } = duel()
    a.p.char.z = -2
    h.run(5)
    const w = h.sim.buildings.add({ kind: BuildKind.Wall, i: 0, j: -1, k: 0, dir: 0 }, 300, 0, { builtAt: -1000 })
    h.tick(new Map([[a, { ...aimAt(a, 2, 1.2, -4, false), buttons: FIRE }]]))
    expect(w.damage).toBe(PICKAXE.damageStructure)
    expect(a.p.materials[Material.Wood]).toBe(0)
  })
})

describe('sincronização de construções', () => {
  it('quem entra recebe peças (com idade e dano) e adereços quebrados', () => {
    const { h, a } = duel((b) => b.prop('crate', 2, -2, 0, 1))
    a.p.materials[Material.Wood] = 10
    h.tick(new Map([[a, { yaw: Math.PI / 2, build: wall(), buttons: FIRE }]]))
    const piece = [...h.sim.buildings.byId.values()][0]
    h.sim.damagePiece(piece, 5)
    const aim = aimAt(a, 2, 0.5, -2, false)
    for (let k = 0; k < 120 && h.events('propDestroyed').length === 0; k++) h.tick(new Map([[a, { ...aim, buttons: FIRE }]]))
    const sync = h.sim.worldSyncEvents()
    const placed = sync.find((e) => e.type === 'piecePlaced')
    expect(placed).toMatchObject({ id: piece.id, damage: 5, builder: a.id, kind: BuildKind.Wall })
    expect(placed && placed.type === 'piecePlaced' && placed.age).toBe(h.sim.tick - piece.builtAt)
    expect(sync).toContainEqual({ type: 'propDestroyed', prop: 0 })
  })
})
