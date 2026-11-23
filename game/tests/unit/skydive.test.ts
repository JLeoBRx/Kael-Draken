import { describe, expect, it } from 'vitest'
import { MOVE } from '../../src/shared/config/movement'
import { ITEM, weaponDef } from '../../src/shared/config/items'
import { Buttons, CharFlag, boardAirship, createCharacterState, stepCharacter } from '../../src/shared/movement/character'
import { createPlayerState, stepPlayer, type PlayerEvent } from '../../src/shared/player/player'
import { DT, addBox, cmd, flatWorld } from './helpers'

describe('dirigível', () => {
  it('segue a rota sem colidir e salta com o botão de pulo', () => {
    const world = flatWorld()
    const s = createCharacterState(0, 0, 0)
    boardAirship(s, -100, 120, 0, 30, 0, 5)
    for (let k = 0; k < 60; k++) stepCharacter(s, cmd(), world, DT)
    expect(s.x).toBeCloseTo(-40, 5)
    expect(s.y).toBe(120)
    expect(s.flags).toBe(CharFlag.Riding)
    stepCharacter(s, cmd({ buttons: Buttons.Jump }), world, DT)
    expect(s.flags).toBe(CharFlag.Skydiving)
    expect(s.vx).toBeCloseTo(30 * MOVE.exitSpeedFactor)
    // segurar o pulo não abre o planador no mesmo instante
    stepCharacter(s, cmd({ buttons: Buttons.Jump }), world, DT)
    expect(s.flags).toBe(CharFlag.Skydiving)
  })

  it('salta sozinho no fim da rota', () => {
    const world = flatWorld()
    const s = createCharacterState(0, 0, 0)
    boardAirship(s, 0, 100, 0, 0, 30, 1)
    for (let k = 0; k < 31; k++) stepCharacter(s, cmd(), world, DT)
    expect(s.flags & CharFlag.Skydiving).toBeTruthy()
  })
})

describe('queda livre e planador', () => {
  it('cai rápido, abre o planador a ~38 m e pousa sem dano', () => {
    const world = flatWorld()
    const p = createPlayerState(createCharacterState(0, 0, 0))
    boardAirship(p.char, 0, 150, 0, 0, 0, 0.01)
    const events: PlayerEvent[] = []
    let deployAt = -1
    let maxFall = 0
    for (let k = 0; k < 30 * 30 && !(p.char.flags & CharFlag.Grounded); k++) {
      const before = p.char.flags
      stepPlayer(p, { ...cmd(), seq: k + 1, slot: 5, build: 0 }, world, DT, 1, events)
      maxFall = Math.max(maxFall, -p.char.vy)
      if (!(before & CharFlag.Gliding) && p.char.flags & CharFlag.Gliding) deployAt = p.char.y
    }
    expect(p.char.flags & CharFlag.Grounded).toBeTruthy()
    expect(maxFall).toBeGreaterThan(MOVE.freefallSpeed - 1)
    expect(deployAt).toBeGreaterThan(30)
    expect(deployAt).toBeLessThanOrEqual(MOVE.glideDeployHeight + 0.01)
    expect(p.char.landImpact).toBeLessThan(MOVE.glideFallSpeed + 0.5)
    expect(p.health).toBe(100)
    expect(events.filter((e) => e.type === 'fall')).toHaveLength(0)
  })

  it('mergulhar (olhar para baixo e ir à frente) cai mais rápido; pulo abre o planador cedo', () => {
    const world = flatWorld()
    const dive = createCharacterState(0, 0, 0)
    const flat = createCharacterState(0, 0, 0)
    boardAirship(dive, 0, 200, 0, 0, 0, 0.01)
    boardAirship(flat, 0, 200, 0, 0, 0, 0.01)
    for (let k = 0; k < 120; k++) {
      stepCharacter(dive, cmd({ forward: 1, pitch: -1.2 }), world, DT)
      stepCharacter(flat, cmd(), world, DT)
    }
    expect(dive.y).toBeLessThan(flat.y - 12)
    expect(Math.hypot(dive.vx, dive.vz)).toBeGreaterThan(MOVE.freefallHSpeed * 0.9)
    stepCharacter(flat, cmd({ buttons: Buttons.Jump }), world, DT)
    expect(flat.flags).toBe(CharFlag.Gliding)
  })

  it('o planador abre pela altura sobre o telhado, não sobre o relevo', () => {
    const world = flatWorld()
    addBox(world, 0, 20, 0, 30, 40, 30) // prédio de 40 m
    const s = createCharacterState(0, 0, 0)
    boardAirship(s, 0, 160, 0, 0, 0, 0.01)
    let deployAt = -1
    for (let k = 0; k < 900 && !(s.flags & CharFlag.Grounded); k++) {
      const before = s.flags
      stepCharacter(s, cmd(), world, DT)
      if (!(before & CharFlag.Gliding) && s.flags & CharFlag.Gliding) deployAt = s.y
    }
    expect(deployAt).toBeGreaterThan(40 + 30)
    expect(s.y).toBeCloseTo(40, 1)
  })

  it('caindo no mar passa a nadar', () => {
    const world = flatWorld(() => -20, 0)
    const s = createCharacterState(0, 0, 0)
    boardAirship(s, 0, 80, 0, 0, 0, 0.01)
    for (let k = 0; k < 900 && !(s.flags & CharFlag.Swimming); k++) stepCharacter(s, cmd(), world, DT)
    expect(s.flags).toBe(CharFlag.Swimming)
  })

  it('armas ficam guardadas no ar', () => {
    const world = flatWorld()
    const p = createPlayerState(createCharacterState(0, 0, 0))
    Object.assign(p.slots[0], { item: ITEM.Rifle, rarity: 2, count: 1, ammo: weaponDef(ITEM.Rifle)!.magSize })
    p.selected = 0
    p.equipTimer = 0
    boardAirship(p.char, 0, 150, 0, 0, 0, 0.01)
    const events: PlayerEvent[] = []
    for (let k = 0; k < 30; k++) stepPlayer(p, { ...cmd({ buttons: Buttons.Fire }), seq: k + 1, slot: 0, build: 0 }, world, DT, 1, events)
    expect(events.filter((e) => e.type === 'shot')).toHaveLength(0)
    expect(p.slots[0].ammo).toBe(weaponDef(ITEM.Rifle)!.magSize)
  })
})
