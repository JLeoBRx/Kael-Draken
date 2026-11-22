import { Buttons, createCharacterState, stepCharacter, type CharacterState, type MoveCommand } from '../../src/shared/movement/character'
import { CollisionWorld, Surface } from '../../src/shared/world/collision-world'
import { Heightfield } from '../../src/shared/world/heightfield'
import { makeObb } from '../../src/shared/world/obb'

export const DT = 1 / 30

/** Mundo plano (altura 0) de 256 m, com água bem abaixo do chão. */
export function flatWorld(heightFn: (x: number, z: number) => number = () => 0, waterLevel = -100): CollisionWorld {
  const hf = new Heightfield(129, 2)
  for (let j = 0; j < hf.n; j++) for (let i = 0; i < hf.n; i++) hf.set(i, j, heightFn(hf.worldX(i), hf.worldZ(j)))
  hf.finalize()
  return new CollisionWorld(hf, waterLevel)
}

export function addBox(world: CollisionWorld, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, yaw = 0, pitch = 0): number {
  return world.add(makeObb(cx, cy, cz, sx / 2, sy / 2, sz / 2, yaw, pitch), Surface.Concrete)
}

/**
 * Rampa que sobe em direção a -Z a partir da borda inferior em (x, 0, z0),
 * com `rise` metros de altura e inclinação `angle` (rad).
 */
export function addRamp(world: CollisionWorld, x: number, z0: number, width: number, rise: number, angle: number): void {
  const t = 0.3
  const len = rise / Math.sin(angle)
  const run = rise / Math.tan(angle)
  // Normal da face superior (yaw 0): (0, cos, sin)
  const sx = x
  const sy = rise / 2
  const sz = z0 - run / 2
  const cx = sx
  const cy = sy - Math.cos(angle) * (t / 2)
  const cz = sz - Math.sin(angle) * (t / 2)
  world.add(makeObb(cx, cy, cz, width / 2, t / 2, len / 2, 0, angle), Surface.Concrete)
}

export function cmd(partial: Partial<MoveCommand> = {}): MoveCommand {
  return { forward: 0, right: 0, yaw: 0, pitch: 0, buttons: 0, ...partial }
}

export function run(s: CharacterState, world: CollisionWorld, ticks: number, c: MoveCommand | ((tick: number) => MoveCommand)): CharacterState {
  for (let k = 0; k < ticks; k++) stepCharacter(s, typeof c === 'function' ? c(k) : c, world, DT)
  return s
}

/** Personagem já assentado no chão em (x, z). */
export function settled(world: CollisionWorld, x = 0, z = 0, yaw = 0, y?: number): CharacterState {
  const s = createCharacterState(x, y ?? world.terrain.heightAt(x, z) + 0.05, z, yaw)
  return run(s, world, 20, cmd({ yaw }))
}

export function hspeed(s: CharacterState): number {
  return Math.hypot(s.vx, s.vz)
}

export { Buttons }
