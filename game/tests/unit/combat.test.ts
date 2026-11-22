import { describe, expect, it } from 'vitest'
import { ALL_ITEMS, ITEM, NO_ITEM, WEAPONS, ammoItemFor, damageAt, weaponDef } from '../../src/shared/config/items'
import { aimFrame, createAimFrame } from '../../src/shared/combat/aim'
import { createHitbox, hitboxAt, rayHitbox } from '../../src/shared/combat/hitboxes'
import { splashDamage, stepProjectile } from '../../src/shared/combat/projectile'
import { CharFlag, createCharacterState } from '../../src/shared/movement/character'
import { pickInteractable } from '../../src/shared/player/interact'
import { pickupItem, swapSlots, takeSlot, type WorldItem } from '../../src/shared/player/inventory'
import {
  FALL_SAFE_SPEED, createPlayerState, shotRays, stepPlayer, type PlayerCommand, type PlayerEvent, type PlayerState,
} from '../../src/shared/player/player'
import { Buttons, DT, addBox, flatWorld } from './helpers'

function cmd(seq: number, partial: Partial<PlayerCommand> = {}): PlayerCommand {
  return { seq, forward: 0, right: 0, yaw: 0, pitch: 0, buttons: 0, slot: 0, build: 0, ...partial }
}

function armed(item: number, rarity = 2, reserve = 120): PlayerState {
  const world = flatWorld()
  const p = createPlayerState(createCharacterState(0, 0.02, 0))
  for (let k = 0; k < 10; k++) stepPlayer(p, cmd(k), world, DT, 1, null)
  const w = weaponDef(item)!
  pickupItem(p, { id: 1, item, rarity, count: 1, ammo: w.magSize, x: 0, y: 0, z: 0 })
  p.ammo[w.ammoType] = reserve
  p.selected = 0
  p.equipTimer = 0
  return p
}

let seq = 100
function run(p: PlayerState, ticks: number, c: Partial<PlayerCommand>, events?: PlayerEvent[]) {
  const world = flatWorld()
  for (let k = 0; k < ticks; k++) stepPlayer(p, cmd(seq++, c), world, DT, 1, events ?? null)
}

describe('catálogo de itens', () => {
  it('ids únicos, toda arma tem munição correspondente e dano cai com a distância', () => {
    expect(new Set(ALL_ITEMS.map((i) => i.id)).size).toBe(ALL_ITEMS.length)
    for (const w of WEAPONS) expect(ammoItemFor(w.ammoType).kind).toBe('ammo')
    const ar = weaponDef(ITEM.Rifle)!
    expect(damageAt(ar, 0, 10)).toBeCloseTo(31)
    expect(damageAt(ar, 0, 400)).toBeCloseTo(31 * 0.7)
    expect(damageAt(ar, 4, 10)).toBeCloseTo(31 * 1.22)
  })
})

describe('armas', () => {
  it('automática segue a cadência; semiautomática exige soltar o gatilho', () => {
    const smg = armed(ITEM.Smg)
    const ev: PlayerEvent[] = []
    run(smg, 60, { buttons: Buttons.Fire }, ev)
    const shots = ev.filter((e) => e.type === 'shot').length
    // ~13,3 tiros/s, primeiro disparo em t = 0: 27 tiros em 2 s
    expect(shots).toBe(27)
    const pistol = armed(ITEM.Pistol)
    const ev2: PlayerEvent[] = []
    run(pistol, 30, { buttons: Buttons.Fire }, ev2)
    expect(ev2.filter((e) => e.type === 'shot').length).toBe(1)
    const ev3: PlayerEvent[] = []
    for (let k = 0; k < 20; k++) run(pistol, 1, { buttons: k % 2 === 0 ? Buttons.Fire : 0 }, ev3)
    // 9 cliques novos em 0,67 s, mas a cadência (0,16 s) limita a no máximo 5 disparos
    const clicks = ev3.filter((e) => e.type === 'shot').length
    expect(clicks).toBeGreaterThanOrEqual(3)
    expect(clicks).toBeLessThanOrEqual(5)
  })

  it('recarga manual e automática transferem munição da reserva', () => {
    const p = armed(ITEM.Rifle, 0, 40)
    run(p, 5, { buttons: Buttons.Fire })
    const mag = p.slots[0].ammo
    expect(mag).toBeLessThan(30)
    const ev: PlayerEvent[] = []
    run(p, 1, { buttons: Buttons.Reload }, ev)
    expect(ev.some((e) => e.type === 'reload')).toBe(true)
    run(p, Math.ceil(2.3 / DT) + 1, {})
    expect(p.slots[0].ammo).toBe(30)
    expect(p.ammo[1]).toBe(40 - (30 - mag))
    // esvazia o pente: recarrega sozinho
    run(p, 300, { buttons: Buttons.Fire })
    expect(p.ammo[1]).toBe(40 - (30 - mag) - 30)
  })

  it('não atira durante a troca de arma', () => {
    const p = armed(ITEM.Rifle)
    pickupItem(p, { id: 2, item: ITEM.Shotgun, rarity: 1, count: 1, ammo: 5, x: 0, y: 0, z: 0 })
    const ev: PlayerEvent[] = []
    run(p, 1, { slot: 1, buttons: Buttons.Fire }, ev)
    expect(p.selected).toBe(1)
    expect(ev.filter((e) => e.type === 'shot')).toHaveLength(0)
    run(p, 20, { slot: 1 })
    run(p, 1, { slot: 1, buttons: Buttons.Fire }, ev)
    const shot = ev.find((e) => e.type === 'shot')
    expect(shot && shot.type === 'shot' && shot.rays.length).toBe(9)
  })

  it('dispersão é determinística e menor mirando', () => {
    const p = armed(ITEM.Rifle)
    const w = weaponDef(ITEM.Rifle)!
    const a = shotRays(p, w, 77, 5)
    const b = shotRays(p, w, 77, 5)
    expect(a).toEqual(b)
    expect(shotRays(p, w, 78, 5)[0]).not.toEqual(a[0])
    const angle = (rays: ReturnType<typeof shotRays>) => {
      const f = aimFrame(p.char, createAimFrame())
      return Math.acos(Math.min(1, rays[0].dx * f.fx + rays[0].dy * f.fy + rays[0].dz * f.fz))
    }
    let maxHip = 0
    for (let s = 0; s < 200; s++) maxHip = Math.max(maxHip, angle(shotRays(p, w, s, 1)))
    p.char.flags |= CharFlag.Aiming
    let maxAim = 0
    for (let s = 0; s < 200; s++) maxAim = Math.max(maxAim, angle(shotRays(p, w, s, 1)))
    expect(maxHip).toBeLessThanOrEqual(w.spreadHip + 1e-6)
    expect(maxHip).toBeGreaterThan(w.spreadHip * 0.8)
    expect(maxAim).toBeLessThan(maxHip * 0.3)
  })
})

describe('consumíveis e dano de queda', () => {
  it('bandagem cura até 75 e é consumida; não usa com vida acima do limite', () => {
    const p = armed(ITEM.Rifle)
    pickupItem(p, { id: 3, item: ITEM.Bandage, rarity: 0, count: 5, ammo: 0, x: 0, y: 0, z: 0 })
    p.health = 40
    run(p, 1, { slot: 1 })
    run(p, 10, { slot: 1 })
    run(p, 1, { slot: 1, buttons: Buttons.Fire })
    run(p, Math.ceil(3.2 / DT) + 1, { slot: 1 })
    expect(p.health).toBe(55)
    expect(p.slots[1].count).toBe(4)
    p.health = 80
    run(p, 1, { slot: 1 })
    run(p, 1, { slot: 1, buttons: Buttons.Fire })
    expect(p.useTimer).toBe(0)
  })

  it('escudo respeita o limite de cada item', () => {
    const p = armed(ITEM.Rifle)
    pickupItem(p, { id: 4, item: ITEM.ShieldCell, rarity: 1, count: 3, ammo: 0, x: 0, y: 0, z: 0 })
    for (let k = 0; k < 3; k++) {
      run(p, 10, { slot: 1 })
      run(p, 1, { slot: 1, buttons: Buttons.Fire })
      run(p, 70, { slot: 1 })
    }
    expect(p.shield).toBe(50)
    expect(p.slots[1].count).toBe(1)
  })

  it('queda de 16 m machuca; pulo comum não', () => {
    const world = flatWorld()
    addBox(world, 0, 8, 0, 4, 16, 4)
    const p = createPlayerState(createCharacterState(0, 16.1, 0))
    const ev: PlayerEvent[] = []
    for (let k = 0; k < 10; k++) stepPlayer(p, cmd(k), world, DT, 1, ev)
    expect(p.health).toBe(100)
    for (let k = 0; k < 90; k++) stepPlayer(p, cmd(10 + k, { forward: 1 }), world, DT, 1, ev)
    const fall = ev.find((e) => e.type === 'fall')
    expect(fall && fall.type === 'fall' && fall.damage).toBeGreaterThan(35)
    expect(p.health).toBeLessThan(65)
    expect(p.health).toBeGreaterThan(30)
    const q = createPlayerState(createCharacterState(0, 0.02, 5))
    for (let k = 0; k < 60; k++) stepPlayer(q, cmd(k, { buttons: k === 5 ? Buttons.Jump : 0 }), flatWorld(), DT, 1, null)
    expect(q.health).toBe(100)
    expect(Math.sqrt(2 * 23 * 1.32)).toBeLessThan(FALL_SAFE_SPEED)
  })

  it('granada é arremessada e sai do inventário', () => {
    const p = armed(ITEM.Rifle)
    pickupItem(p, { id: 5, item: ITEM.Grenade, rarity: 1, count: 2, ammo: 0, x: 0, y: 0, z: 0 })
    const ev: PlayerEvent[] = []
    run(p, 10, { slot: 1 })
    run(p, 1, { slot: 1, buttons: Buttons.Fire }, ev)
    run(p, 40, { slot: 1 })
    run(p, 1, { slot: 1, buttons: Buttons.Fire }, ev)
    expect(ev.filter((e) => e.type === 'throw')).toHaveLength(2)
    expect(p.slots[1].item).toBe(NO_ITEM)
  })
})

describe('inventário', () => {
  const at = (item: number, count = 1, rarity = 1, ammo = 0): WorldItem => ({ id: 9, item, rarity, count, ammo, x: 0, y: 0, z: 0 })

  it('empilha consumíveis, enche espaços e troca com o selecionado quando cheio', () => {
    const p = createPlayerState()
    expect(pickupItem(p, at(ITEM.Bandage, 10)).taken).toBe(10)
    expect(pickupItem(p, at(ITEM.Bandage, 10)).taken).toBe(10)
    expect(p.slots[0].count).toBe(15)
    expect(p.slots[1].count).toBe(5)
    pickupItem(p, at(ITEM.Rifle, 1, 2, 30))
    pickupItem(p, at(ITEM.Smg, 1, 2, 30))
    pickupItem(p, at(ITEM.Pistol, 1, 2, 16))
    // com a picareta na mão (padrão) e o inventário cheio, não troca
    expect(pickupItem(p, at(ITEM.Sniper, 1, 3, 1)).taken).toBe(0)
    p.selected = 0
    const r = pickupItem(p, at(ITEM.Sniper, 1, 3, 1))
    expect(r.swapped?.item).toBe(ITEM.Bandage)
    expect(p.slots[0].item).toBe(ITEM.Sniper)
  })

  it('munição e materiais respeitam o limite', () => {
    const p = createPlayerState()
    p.ammo[4] = 28
    expect(pickupItem(p, at(ITEM.AmmoRockets, 5)).taken).toBe(2)
    p.materials[0] = 990
    expect(pickupItem(p, at(ITEM.Wood, 30)).taken).toBe(9)
  })

  it('soltar e reorganizar espaços', () => {
    const p = createPlayerState()
    pickupItem(p, at(ITEM.Rifle, 1, 2, 30))
    pickupItem(p, at(ITEM.Medkit, 2))
    expect(swapSlots(p, 0, 1)).toBe(true)
    expect(p.slots[0].item).toBe(ITEM.Medkit)
    expect(takeSlot(p, 1)?.item).toBe(ITEM.Rifle)
    expect(p.slots[1].item).toBe(NO_ITEM)
  })
})

describe('caixas de acerto', () => {
  const hb = hitboxAt(0, 0, -10, 0, createHitbox())
  const out = { t: 0, head: false }
  it('acerta cabeça e corpo e erra ao lado', () => {
    expect(rayHitbox(0, 1.6, 0, 0, 0, -1, 100, hb, out)).toBe(true)
    expect(out.head).toBe(true)
    expect(out.t).toBeCloseTo(10 - 0.17, 2)
    expect(rayHitbox(0, 1.0, 0, 0, 0, -1, 100, hb, out)).toBe(true)
    expect(out.head).toBe(false)
    expect(out.t).toBeCloseTo(10 - 0.32, 2)
    expect(rayHitbox(0.5, 1.0, 0, 0, 0, -1, 100, hb, out)).toBe(false)
    expect(rayHitbox(0, 1.0, 0, 0, 0, -1, 5, hb, out)).toBe(false)
  })
  it('agachado: a cabeça desce', () => {
    const low = hitboxAt(0, 0, -10, CharFlag.Crouched, createHitbox())
    expect(rayHitbox(0, 1.6, 0, 0, 0, -1, 100, low, out)).toBe(false)
    expect(rayHitbox(0, 1.08, 0, 0, 0, -1, 100, low, out)).toBe(true)
    expect(out.head).toBe(true)
  })
})

describe('projéteis', () => {
  it('foguete explode ao tocar a parede; granada quica e explode no tempo', () => {
    const world = flatWorld()
    addBox(world, 0, 2, -20, 10, 4, 1)
    const rocket = weaponDef(ITEM.Launcher)!.projectile!
    const r = { x: 0, y: 1.5, z: 0, vx: 0, vy: 0, vz: -rocket.speed, age: 0 }
    const res = { exploded: false, x: 0, y: 0, z: 0 }
    let ticks = 0
    while (!res.exploded && ticks < 100) { stepProjectile(r, rocket, world, DT, res); ticks++ }
    expect(res.exploded).toBe(true)
    expect(res.z).toBeGreaterThan(-19.6)
    expect(res.z).toBeLessThan(-19.3)
    const g = { x: 0, y: 1.5, z: 0, vx: 0, vy: 4, vz: -10, age: 0 }
    const grenade = { speed: 22, gravityScale: 1, fuse: 2.4, restitution: 0.35, splashRadius: 5.5, damage: 95, minDamage: 25 }
    let bounced = false
    ticks = 0
    res.exploded = false
    while (!res.exploded && ticks < 200) {
      const vy = g.vy
      stepProjectile(g, grenade, world, DT, res)
      if (vy < 0 && g.vy > 0) bounced = true
      ticks++
    }
    expect(bounced).toBe(true)
    expect(ticks).toBe(Math.ceil(2.4 / DT - 1e-9))
    expect(splashDamage(grenade, 0)).toBe(95)
    expect(splashDamage(grenade, 5.5)).toBe(0)
    expect(splashDamage(grenade, 2.75)).toBeCloseTo(60)
  })
})

describe('interação', () => {
  it('prefere o que está à frente e perto', () => {
    const c = createCharacterState(0, 0, 0, 0)
    const pick = pickInteractable(c, [
      { kind: 'item', id: 1, x: 0, y: 0.2, z: 1.5 },
      { kind: 'item', id: 2, x: 0, y: 0.2, z: -1.5 },
      { kind: 'item', id: 3, x: 0, y: 0.2, z: -6 },
    ])
    expect(pick?.id).toBe(2)
    expect(pickInteractable(c, [{ kind: 'item', id: 3, x: 0, y: 0.2, z: -6 }])).toBeNull()
  })
})
