import { describe, expect, it } from 'vitest'
import { ITEM, NO_ITEM, weaponDef } from '../../src/shared/config/items'
import { Buttons } from '../../src/shared/movement/character'
import type { GameEvent } from '../../src/shared/net/protocol'
import { CHEST, DT, Harness, aimAt, give, testMap } from './sim-helpers'

describe('tiros e dano', () => {
  it('acerto direto: escudo primeiro, eventos para atirador, alvo e espectadores', () => {
    const h = new Harness(testMap(() => {}))
    const a = h.add('A')
    const b = h.add('B')
    h.add('C')
    h.run(10)
    give(a, ITEM.Rifle, 0)
    b.p.shield = 20
    const aim = aimAt(a, b.p.char.x, CHEST, b.p.char.z)
    h.tick(new Map([[a, { ...aim, buttons: Buttons.Fire | Buttons.Aim }]]))
    h.run(3)
    const hits = h.log.filter((e) => e.ev.type === 'hit')
    expect(hits).toHaveLength(1)
    expect(hits[0].to).toBe(a.id)
    const hit = hits[0].ev as Extract<GameEvent, { type: 'hit' }>
    expect(hit.damage).toBe(31)
    expect(hit.shield).toBe(true)
    expect(hit.broke).toBe(true)
    expect(b.p.shield).toBe(0)
    expect(b.p.health).toBe(100 - 11)
    expect(h.log.find((e) => e.ev.type === 'damaged')?.to).toBe(b.id)
    const shot = h.log.find((e) => e.ev.type === 'shot')!
    expect(shot.except).toBe(a.id)
  })

  it('parede no caminho bloqueia o tiro', () => {
    const h = new Harness(testMap((b) => b.box(0, 1.5, -5, 6, 3, 0.3, 'concrete')))
    const a = h.add('A')
    const b = h.add('B')
    h.run(10)
    give(a, ITEM.Rifle)
    h.tick(new Map([[a, { ...aimAt(a, b.p.char.x, CHEST, b.p.char.z), buttons: Buttons.Fire | Buttons.Aim }]]))
    h.run(2)
    expect(h.events('hit')).toHaveLength(0)
    expect(b.p.health).toBe(100)
    expect(h.events('shot')[0].ends[0].hit).toBe(1)
  })

  it('compensação de latência: acerta onde o atirador via o alvo, não onde ele está agora', () => {
    const h = new Harness(testMap(() => {}))
    const a = h.add('A')
    const b = h.add('B')
    h.run(10)
    give(a, ITEM.Sniper, 4)
    // B corre para o lado por 12 ticks
    const startTick = h.sim.tick
    const bx0 = b.p.char.x
    h.run(12, new Map([[b, { yaw: Math.PI, right: 1 }]]))
    expect(Math.abs(b.p.char.x - bx0)).toBeGreaterThan(1.5)
    // A mira onde B estava 12 ticks atrás (o que A estava vendo com 400 ms de atraso)
    const aim = aimAt(a, bx0, CHEST, b.p.char.z)
    h.tick(new Map([[a, { ...aim, buttons: Buttons.Fire | Buttons.Aim, viewTick: startTick + 0.5 }]]))
    expect(h.events('hit')).toHaveLength(1)
    // O mesmo tiro sem voltar no tempo erra
    const h2 = new Harness(testMap(() => {}))
    const a2 = h2.add('A')
    const b2 = h2.add('B')
    h2.run(10)
    give(a2, ITEM.Sniper, 4)
    h2.run(12, new Map([[b2, { yaw: Math.PI, right: 1 }]]))
    h2.tick(new Map([[a2, { ...aim, buttons: Buttons.Fire | Buttons.Aim, viewTick: h2.sim.tick }]]))
    expect(h2.events('hit')).toHaveLength(0)
  })

  it('o cliente não pode voltar mais de 1 s no tempo', () => {
    const h = new Harness(testMap(() => {}))
    const a = h.add('A')
    const b = h.add('B')
    h.run(10)
    give(a, ITEM.Sniper, 4)
    const bx0 = b.p.char.x
    const t0 = h.sim.tick
    h.run(60, new Map([[b, { yaw: Math.PI, right: 1 }]]))
    h.tick(new Map([[a, { ...aimAt(a, bx0, CHEST, b.p.char.z), buttons: Buttons.Fire | Buttons.Aim, viewTick: t0 }]]))
    expect(h.events('hit')).toHaveLength(0)
  })
})

describe('eliminação, loot do corpo e renascimento', () => {
  it('elimina, solta o inventário, conta a eliminação e renasce limpo', () => {
    const h = new Harness(testMap(() => {}), { respawnDelay: 2 })
    const a = h.add('A')
    const b = h.add('B')
    h.run(10)
    give(a, ITEM.Sniper, 4)
    give(b, ITEM.Rifle, 2)
    b.p.slots[1] = { item: ITEM.Bandage, rarity: 0, count: 5, ammo: 0 }
    b.p.materials[0] = 40
    // Falcão lendário: 105 × 1,22 = 128 no corpo → elimina sem escudo
    h.tick(new Map([[a, { ...aimAt(a, b.p.char.x, CHEST, b.p.char.z), buttons: Buttons.Fire | Buttons.Aim }]]))
    expect(b.p.alive).toBe(false)
    expect(a.kills).toBe(1)
    const elim = h.events('eliminated')[0]
    expect(elim).toMatchObject({ victim: b.id, killer: a.id, cause: ITEM.Sniper })
    const dropped = h.events('itemSpawn').map((e) => e.item)
    expect(dropped).toEqual(expect.arrayContaining([ITEM.Rifle, ITEM.Bandage, ITEM.AmmoMedium, ITEM.Wood]))
    expect(b.p.slots.every((s) => s.item === NO_ITEM)).toBe(true)
    h.run(61)
    expect(b.p.alive).toBe(true)
    expect(b.p.health).toBe(100)
    expect(h.events('respawn')).toHaveLength(1)
  })

  it('sem renascimento (battle royale), o eliminado fica fora', () => {
    const h = new Harness(testMap(() => {}), { respawn: false })
    const a = h.add('A')
    const b = h.add('B')
    h.run(10)
    give(a, ITEM.Sniper, 4)
    h.tick(new Map([[a, { ...aimAt(a, b.p.char.x, CHEST, b.p.char.z), buttons: Buttons.Fire | Buttons.Aim }]]))
    h.run(300)
    expect(b.p.alive).toBe(false)
    expect(h.sim.aliveCount).toBe(1)
  })
})

describe('itens, baús e inventário', () => {
  it('pega o item à frente com Interagir; arsenal repõe depois', () => {
    const h = new Harness(testMap((b) => {
      b.lootSpot(0, -1.5, 0, undefined, { item: ITEM.Shotgun, rarity: 3, count: 1 }, 2)
    }))
    const a = h.add('A')
    h.run(5)
    expect(h.sim.items.size).toBe(1)
    h.tick(new Map([[a, { yaw: 0, buttons: Buttons.Use }]]))
    expect(a.p.slots[0].item).toBe(ITEM.Shotgun)
    expect(a.p.slots[0].ammo).toBe(5)
    expect(h.sim.items.size).toBe(0)
    expect(h.events('itemRemove')[0].by).toBe(a.id)
    h.run(61)
    expect(h.sim.items.size).toBe(1)
  })

  it('baú abre uma vez e solta arma, munição, consumível e materiais', () => {
    const h = new Harness(testMap((b) => b.chest(0, -1.6, 0, 1)))
    const a = h.add('A')
    h.run(5)
    h.tick(new Map([[a, { yaw: 0, buttons: Buttons.Use }]]))
    expect(h.sim.chestOpened[0]).toBe(true)
    const spawned = h.events('itemSpawn')
    expect(spawned.length).toBeGreaterThanOrEqual(4)
    expect(spawned.some((e) => weaponDef(e.item))).toBe(true)
    h.run(1)
    h.tick(new Map([[a, { yaw: 0, buttons: Buttons.Use }]]))
    expect(h.events('chestOpen')).toHaveLength(1)
  })

  it('soltar um espaço põe o item no chão', () => {
    const h = new Harness(testMap(() => {}))
    const a = h.add('A')
    h.run(5)
    give(a, ITEM.Smg, 1)
    h.sim.inventoryAction(a.id, { action: 'drop', slot: 0 })
    expect(a.p.slots[0].item).toBe(NO_ITEM)
    const [item] = [...h.sim.items.values()]
    expect(item.item).toBe(ITEM.Smg)
    expect(item.ammo).toBe(30)
  })
})

describe('explosivos e bonecos de treino', () => {
  it('foguete na parede ao lado do alvo causa dano em área; atirador não se fere', () => {
    const h = new Harness(testMap((b) => b.box(1.6, 1.5, -10, 0.4, 3, 4, 'concrete')))
    const a = h.add('A')
    const b = h.add('B')
    h.run(10)
    give(a, ITEM.Launcher, 3)
    h.tick(new Map([[a, { ...aimAt(a, 1.4, 1.0, -10), buttons: Buttons.Fire | Buttons.Aim }]]))
    expect(h.events('projSpawn')).toHaveLength(1)
    h.run(15)
    expect(h.events('explosion')).toHaveLength(1)
    expect(b.p.health).toBeLessThan(100)
    expect(a.p.health).toBe(100)
    expect(h.log.some((e) => e.ev.type === 'hit' && e.to === a.id)).toBe(true)
  })

  it('granada explode no tempo do pavio', () => {
    const h = new Harness(testMap(() => {}))
    const a = h.add('A')
    h.run(10)
    a.p.slots[0] = { item: ITEM.Grenade, rarity: 1, count: 1, ammo: 0 }
    a.p.selected = 0
    a.p.equipTimer = 0
    h.tick(new Map([[a, { yaw: 0, buttons: Buttons.Fire }]]))
    expect(h.events('projSpawn')).toHaveLength(1)
    h.run(Math.ceil(2.4 * 30) - 2)
    expect(h.events('explosion')).toHaveLength(0)
    h.run(4)
    expect(h.events('explosion')).toHaveLength(1)
  })

  it('boneco de treino recebe dano, cai com 200 e volta depois de 3 s', () => {
    const h = new Harness(testMap((b) => b.target(0, -8, Math.PI)))
    const a = h.add('A')
    h.run(5)
    give(a, ITEM.Rifle, 4)
    const d = h.sim.dummies[0]
    const aim = aimAt(a, d.x, d.y + CHEST, d.z)
    // rajada contínua mirando: 31 × 1,22 ≈ 38 por acerto → cai no 6º acerto
    h.run(40, new Map([[a, { ...aim, buttons: Buttons.Fire | Buttons.Aim }]]))
    const hits = h.events('hit')
    expect(hits[0]).toMatchObject({ targetKind: 1, target: 0, damage: 38 })
    expect(hits.some((e) => e.eliminated)).toBe(true)
    expect(d.downUntil).toBeGreaterThan(0)
    expect(h.events('target')[0]).toMatchObject({ id: 0, down: true })
    h.run(95)
    expect(d.downUntil).toBe(-1)
    expect(d.health).toBe(200)
  })
})

describe('sincronização inicial', () => {
  it('quem entra recebe itens, baús abertos e alvos caídos', () => {
    const h = new Harness(testMap((b) => {
      b.lootSpot(5, 5, 0, undefined, { item: ITEM.Medkit, rarity: 1, count: 1 })
      b.chest(0, -1.6, 0, 1)
    }))
    const a = h.add('A')
    h.run(3)
    h.tick(new Map([[a, { yaw: 0, buttons: Buttons.Use }]]))
    const sync = h.sim.worldSyncEvents()
    expect(sync.filter((e) => e.type === 'itemSpawn').length).toBe(h.sim.items.size)
    expect(sync.some((e) => e.type === 'chestOpen' && e.chest === 0)).toBe(true)
  })
})

void DT
