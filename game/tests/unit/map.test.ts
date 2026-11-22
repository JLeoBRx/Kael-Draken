import { describe, expect, it } from 'vitest'
import { MOVE } from '../../src/shared/config/movement'
import { loadMap, regionAt } from '../../src/shared/maps'
import { CharFlag, createCharacterState, stepCharacter } from '../../src/shared/movement/character'
import { cmd, DT } from './helpers'

describe('Campo de Provas', () => {
  const t0 = performance.now()
  const map = loadMap('campo-de-provas')
  const buildMs = performance.now() - t0

  it('gera rápido e de forma determinística', () => {
    expect(buildMs).toBeLessThan(1500)
    const again = loadMap('campo-de-provas')
    expect(again.terrain.heights).toEqual(map.terrain.heights)
    expect(again.boxes.length).toBe(map.boxes.length)
    expect(again.props.length).toBe(map.props.length)
    expect(again.boxes.map((b) => b.obb.cx + b.obb.cy + b.obb.cz)).toEqual(map.boxes.map((b) => b.obb.cx + b.obb.cy + b.obb.cz))
  })

  it('tem conteúdo nas regiões esperadas', () => {
    expect(map.boxes.length).toBeGreaterThan(150)
    expect(map.props.filter((p) => p.kind === 'pine' || p.kind === 'broadleaf').length).toBeGreaterThan(300)
    expect(map.spawns.length).toBe(16)
    expect(regionAt(map, 0, 0)?.id).toBe('patio')
    expect(regionAt(map, 0, 150)?.id).toBe('vila')
    expect(regionAt(map, 150, 30)?.id).toBe('lagoa')
    // lagoa abaixo da água, serra bem alta
    expect(map.terrain.heightAt(150, 30)).toBeLessThan(-3)
    expect(map.terrain.highest).toBeGreaterThan(30)
  })

  it('todos os spawns assentam no piso de treino', () => {
    for (const sp of map.spawns) {
      const s = createCharacterState(sp.x, 8, sp.z, sp.yaw)
      for (let k = 0; k < 30; k++) stepCharacter(s, cmd({ yaw: sp.yaw }), map.world, DT)
      expect(s.flags & CharFlag.Grounded).toBeTruthy()
      expect(s.y).toBeCloseTo(6.15, 2)
    }
  })

  it('a rampa de 45° leva à plataforma de 3 m e a de 55° não', () => {
    const climb = (x: number) => {
      const s = createCharacterState(x, 7, -14, 0)
      let top = 0
      for (let k = 0; k < 120; k++) {
        stepCharacter(s, cmd({ forward: 1 }), map.world, DT)
        top = Math.max(top, s.y)
      }
      return top - 6.15
    }
    expect(climb(-28)).toBeGreaterThan(2.95)
    expect(climb(-20)).toBeLessThan(1)
  })

  it('a torre de rampas sobe até 16 m', () => {
    const s = createCharacterState(26, 7, -56, 0)
    let top = 0
    // sobe a rampa, vira 180°, sobe a próxima... (roteiro simples de waypoints)
    const route: [number, number][] = [[26, -68], [34, -68], [34, -60], [26, -60], [26, -68], [34, -68], [34, -60]]
    let wp = 0
    for (let k = 0; k < 900 && wp < route.length; k++) {
      const [tx, tz] = route[wp]
      const dx = tx - s.x
      const dz = tz - s.z
      if (Math.hypot(dx, dz) < 0.8) { wp++; continue }
      const yaw = Math.atan2(-dx, -dz)
      stepCharacter(s, cmd({ forward: 1, yaw }), map.world, DT)
      top = Math.max(top, s.y)
    }
    expect(top - 6.15).toBeGreaterThan(15.9)
  })

  it('o píer fica acima da água e dá para nadar ao lado dele', () => {
    const s = createCharacterState(118, 3, 30, -Math.PI / 2)
    for (let k = 0; k < 30; k++) stepCharacter(s, cmd({ yaw: -Math.PI / 2 }), map.world, DT)
    expect(s.y).toBeGreaterThan(1.2)
    expect(s.flags & CharFlag.Grounded).toBeTruthy()
    const swim = createCharacterState(130, 1, 36, 0)
    for (let k = 0; k < 60; k++) stepCharacter(swim, cmd(), map.world, DT)
    expect(swim.flags & CharFlag.Swimming).toBeTruthy()
    expect(swim.y).toBeCloseTo(-MOVE.swimFloatDepth, 0)
  })
})
