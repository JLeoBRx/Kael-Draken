import { describe, expect, it } from 'vitest'
import { MOVE } from '../../src/shared/config/movement'
import { DEG } from '../../src/shared/math/scalar'
import { CharFlag, copyCharacterState, createCharacterState, stepCharacter } from '../../src/shared/movement/character'
import { Rng } from '../../src/shared/math/rng'
import { addBox, addRamp, Buttons, cmd, DT, flatWorld, hspeed, run, settled } from './helpers'

describe('chão e repouso', () => {
  it('assenta no chão e fica parado sem tremer', () => {
    const world = flatWorld()
    const s = settled(world)
    expect(s.flags & CharFlag.Grounded).toBeTruthy()
    const y0 = s.y
    run(s, world, 300, cmd())
    expect(Math.abs(s.y - y0)).toBeLessThan(1e-6)
    expect(Math.abs(s.y)).toBeLessThan(1e-3)
    expect(s.flags & CharFlag.Grounded).toBeTruthy()
  })

  it('não escorrega parado em encosta caminhável (30°)', () => {
    const slope = Math.tan(30 * DEG)
    const world = flatWorld((x) => x * slope)
    const s = settled(world, 10, 0)
    const x0 = s.x
    run(s, world, 300, cmd())
    expect(Math.abs(s.x - x0)).toBeLessThan(1e-3)
    expect(s.flags & CharFlag.Grounded).toBeTruthy()
  })

  it('escorrega em encosta íngreme demais (65°)', () => {
    const slope = Math.tan(65 * DEG)
    const world = flatWorld((x) => Math.max(0, x) * slope)
    const s = createCharacterState(10, 10 * slope + 0.1, 0)
    run(s, world, 120, cmd())
    expect(s.x).toBeLessThan(8)
  })
})

describe('locomoção', () => {
  it('corre na velocidade padrão e acelera rápido', () => {
    const world = flatWorld()
    const s = settled(world)
    run(s, world, 10, cmd({ forward: 1 }))
    expect(hspeed(s)).toBeCloseTo(MOVE.runSpeed, 3)
    expect(s.z).toBeLessThan(-1)
    expect(Math.abs(s.x)).toBeLessThan(1e-9)
  })

  it('sprint, caminhada e agachado têm velocidades distintas', () => {
    const world = flatWorld()
    const sprint = run(settled(world), world, 30, cmd({ forward: 1, buttons: Buttons.Sprint }))
    expect(hspeed(sprint)).toBeCloseTo(MOVE.sprintSpeed, 3)
    expect(sprint.flags & CharFlag.Sprinting).toBeTruthy()
    const walk = run(settled(world), world, 30, cmd({ forward: 1, buttons: Buttons.Walk }))
    expect(hspeed(walk)).toBeCloseTo(MOVE.walkSpeed, 3)
    const crouch = run(settled(world), world, 30, cmd({ forward: 1, buttons: Buttons.Crouch }))
    expect(hspeed(crouch)).toBeCloseTo(MOVE.crouchSpeed, 3)
    expect(crouch.flags & CharFlag.Crouched).toBeTruthy()
    const aim = run(settled(world), world, 30, cmd({ forward: 1, buttons: Buttons.Aim | Buttons.Sprint }))
    expect(hspeed(aim)).toBeCloseTo(MOVE.aimSpeed, 3)
    expect(aim.flags & CharFlag.Sprinting).toBeFalsy()
  })

  it('yaw define a direção (yaw = 90° anda para -X)', () => {
    const world = flatWorld()
    const s = run(settled(world), world, 30, cmd({ forward: 1, yaw: Math.PI / 2 }))
    expect(s.x).toBeLessThan(-3)
    expect(Math.abs(s.z)).toBeLessThan(1e-6)
  })

  it('para ao soltar o movimento', () => {
    const world = flatWorld()
    const s = run(settled(world), world, 30, cmd({ forward: 1 }))
    run(s, world, 10, cmd())
    expect(hspeed(s)).toBe(0)
  })
})

describe('pulo', () => {
  it('atinge ~1,32 m e aterrissa', () => {
    const world = flatWorld()
    const s = settled(world)
    let maxY = 0
    let landed = -1
    run(s, world, 60, (k) => {
      if (k > 2 && landed < 0 && s.flags & CharFlag.Grounded) landed = k
      maxY = Math.max(maxY, s.y)
      return cmd({ buttons: k === 0 ? Buttons.Jump : 0 })
    })
    expect(maxY).toBeGreaterThan(1.2)
    expect(maxY).toBeLessThan(1.45)
    expect(landed).toBeGreaterThan(15)
    expect(landed).toBeLessThan(25)
    expect(s.flags & CharFlag.Grounded).toBeTruthy()
  })

  it('segurar o botão não repete o pulo', () => {
    const world = flatWorld()
    const s = settled(world)
    let jumps = 0
    let wasGrounded = true
    run(s, world, 120, () => {
      const g = (s.flags & CharFlag.Grounded) !== 0
      if (wasGrounded && !g) jumps++
      wasGrounded = g
      return cmd({ buttons: Buttons.Jump })
    })
    expect(jumps).toBe(1)
  })

  it('aceita o pulo apertado um pouco antes de aterrissar (buffer)', () => {
    const world = flatWorld()
    const s = createCharacterState(0, 1.0, 0)
    // cai ~1 m (≈ 0,3 s); aperta o pulo 2 ticks antes de tocar o chão
    let pressedAt = -1
    let rejumped = false
    run(s, world, 40, (k) => {
      const nearGround = s.y < 0.25 && s.vy < 0 && pressedAt < 0
      if (nearGround) pressedAt = k
      if (pressedAt >= 0 && k > pressedAt && s.vy > 5) rejumped = true
      return cmd({ buttons: nearGround ? Buttons.Jump : 0 })
    })
    expect(rejumped).toBe(true)
  })
})

describe('rampas e degraus', () => {
  it('sobe rampa de 45° (construção) e não sobe a de 60°', () => {
    const world45 = flatWorld()
    addRamp(world45, 0, -2, 4, 3, 45 * DEG)
    let top = 0
    const a = settled(world45)
    run(a, world45, 40, () => { top = Math.max(top, a.y); return cmd({ forward: 1 }) })
    expect(top).toBeGreaterThan(2.5)

    const world60 = flatWorld()
    addRamp(world60, 0, -2, 4, 3, 60 * DEG)
    const b = run(settled(world60), world60, 90, cmd({ forward: 1 }))
    expect(b.y).toBeLessThan(0.6)
  })

  it('desce a rampa colado nela', () => {
    const world = flatWorld()
    addRamp(world, 0, -2, 4, 3, 30 * DEG)
    // começa no topo (lado -Z) virado para +Z
    const run_ = 3 / Math.tan(30 * DEG)
    const s = settled(world, 0, -2 - run_ + 0.6, Math.PI, 3.2)
    expect(s.y).toBeGreaterThan(2.4)
    let airborneTicks = 0
    run(s, world, 45, () => {
      if (!(s.flags & CharFlag.Grounded)) airborneTicks++
      return cmd({ forward: 1, yaw: Math.PI })
    })
    expect(s.z).toBeGreaterThan(0)
    expect(airborneTicks).toBe(0)
  })

  it('sobe degraus de 0,4 m e é bloqueado por 0,6 m', () => {
    const low = flatWorld()
    for (let k = 0; k < 4; k++) addBox(low, 0, ((k + 1) * 0.4) / 2, -2 - k * 0.6 - 0.3, 3, (k + 1) * 0.4, 0.6)
    const a = settled(low)
    let top = 0
    run(a, low, 40, () => { top = Math.max(top, a.y); return cmd({ forward: 1 }) })
    expect(top).toBeCloseTo(1.6, 2)

    const high = flatWorld()
    addBox(high, 0, 0.3, -3, 3, 0.6, 2)
    const b = run(settled(high), high, 60, cmd({ forward: 1 }))
    expect(b.y).toBeLessThan(0.05)
    expect(b.z).toBeGreaterThan(-2)
  })
})

describe('agachar e túnel', () => {
  // teto de 1,4 m: só passa agachado (cápsula de 1,2 m)
  function tunnelWorld() {
    const world = flatWorld()
    addBox(world, 0, 1.4 + 0.25, -8, 4, 0.5, 8)
    return world
  }

  it('em pé é barrado pela entrada do túnel', () => {
    const world = tunnelWorld()
    const s = run(settled(world), world, 60, cmd({ forward: 1 }))
    expect(s.z).toBeGreaterThan(-4.1)
  })

  it('agachado atravessa e não consegue levantar embaixo do teto', () => {
    const world = tunnelWorld()
    const s = run(settled(world), world, 75, cmd({ forward: 1, buttons: Buttons.Crouch }))
    expect(s.z).toBeLessThan(-5)
    expect(s.z).toBeGreaterThan(-12)
    run(s, world, 5, cmd())
    expect(s.flags & CharFlag.Crouched).toBeTruthy()
    run(s, world, 90, cmd({ forward: 1 }))
    expect(s.z).toBeLessThan(-12)
    expect(s.flags & CharFlag.Crouched).toBeFalsy()
  })
})

describe('deslize', () => {
  it('sprint + agachar desliza mais rápido que o sprint e termina sozinho', () => {
    const world = flatWorld()
    const s = run(settled(world), world, 30, cmd({ forward: 1, buttons: Buttons.Sprint }))
    stepCharacter(s, cmd({ forward: 1, buttons: Buttons.Sprint | Buttons.Crouch }), world, DT)
    expect(s.flags & CharFlag.Sliding).toBeTruthy()
    expect(hspeed(s)).toBeGreaterThan(MOVE.sprintSpeed + 1.5)
    let ended = -1
    run(s, world, 90, (k) => {
      if (ended < 0 && !(s.flags & CharFlag.Sliding)) ended = k
      return cmd({ forward: 1, buttons: Buttons.Sprint | Buttons.Crouch })
    })
    expect(ended).toBeGreaterThan(20)
    expect(ended).toBeLessThan(60)
    expect(hspeed(s)).toBeCloseTo(MOVE.crouchSpeed, 2)
  })

  it('pular do deslize mantém o impulso', () => {
    const world = flatWorld()
    const s = run(settled(world), world, 30, cmd({ forward: 1, buttons: Buttons.Sprint }))
    run(s, world, 3, cmd({ forward: 1, buttons: Buttons.Sprint | Buttons.Crouch }))
    stepCharacter(s, cmd({ forward: 1, buttons: Buttons.Sprint | Buttons.Crouch | Buttons.Jump }), world, DT)
    expect(s.vy).toBeGreaterThan(5)
    expect(hspeed(s)).toBeGreaterThan(MOVE.sprintSpeed + 1)
    expect(s.flags & CharFlag.Sliding).toBeFalsy()
  })
})

describe('colisão em alta velocidade', () => {
  it('queda de 150 m em piso de 20 cm não atravessa', () => {
    const world = flatWorld()
    addBox(world, 0, 50, 0, 6, 0.2, 6)
    const s = createCharacterState(0, 200, 0)
    run(s, world, 300, cmd())
    expect(s.y).toBeCloseTo(50.1, 2)
    expect(s.flags & CharFlag.Grounded).toBeTruthy()
  })

  it('sprint contra parede fina nunca a atravessa', () => {
    const world = flatWorld()
    addBox(world, 0, 2, -5, 10, 4, 0.2)
    const s = run(settled(world), world, 120, cmd({ forward: 1, buttons: Buttons.Sprint }))
    expect(s.z).toBeGreaterThan(-5 + 0.1 + MOVE.radius - 0.01)
  })

  it('desliza ao longo da parede em diagonal', () => {
    const world = flatWorld()
    addBox(world, 0, 2, -3, 40, 4, 0.2)
    const s = run(settled(world), world, 60, cmd({ forward: 1, yaw: -Math.PI / 4 }))
    expect(s.z).toBeGreaterThan(-3)
    expect(s.x).toBeGreaterThan(4)
  })
})

describe('água', () => {
  it('nada e boia em água funda', () => {
    const world = flatWorld(() => 0, 5)
    const s = createCharacterState(0, 6, 0)
    run(s, world, 150, cmd({ forward: 1 }))
    expect(s.flags & CharFlag.Swimming).toBeTruthy()
    expect(s.y).toBeCloseTo(5 - MOVE.swimFloatDepth, 1)
    expect(hspeed(s)).toBeCloseTo(MOVE.swimSpeed, 1)
  })

  it('sai da água ao chegar na margem', () => {
    // chão sobe de -4 para +2 ao longo de -Z
    const world = flatWorld((_x, z) => Math.min(2, Math.max(-4, -z * 0.25 - 4)), 0)
    const s = createCharacterState(0, 0, 0)
    run(s, world, 30, cmd())
    expect(s.flags & CharFlag.Swimming).toBeTruthy()
    run(s, world, 400, cmd({ forward: 1 }))
    expect(s.flags & CharFlag.Swimming).toBeFalsy()
    expect(s.flags & CharFlag.Grounded).toBeTruthy()
  })
})

describe('determinismo da simulação', () => {
  it('mesmos comandos produzem estados idênticos bit a bit', () => {
    const world = flatWorld((x, z) => Math.sin(x * 0.1) * 2 + Math.cos(z * 0.13) * 1.5)
    addBox(world, 5, 1, -10, 4, 2, 4)
    addRamp(world, -6, -6, 4, 3, 40 * DEG)
    const rng = new Rng(1234)
    const cmds = Array.from({ length: 600 }, () => cmd({
      forward: rng.range(-1, 1),
      right: rng.range(-1, 1),
      yaw: rng.range(-Math.PI, Math.PI),
      pitch: rng.range(-1, 1),
      buttons: rng.int(0, 32),
    }))
    const a = settled(world)
    const b = copyCharacterState(a, createCharacterState(0, 0, 0))
    for (const c of cmds) stepCharacter(a, c, world, DT)
    for (const c of cmds) stepCharacter(b, c, world, DT)
    expect(b).toEqual(a)
  })
})
