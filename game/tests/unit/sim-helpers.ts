/** Ambiente de simulação do servidor para os testes (mapa pequeno, comandos por tick). */
import { Simulation, type SimPlayer } from '../../src/server/core/simulation'
import { weaponDef } from '../../src/shared/config/items'
import { buildMap } from '../../src/shared/maps/builder'
import type { GameMap, MapDefinition } from '../../src/shared/maps/types'
import { aimFrame, createAimFrame } from '../../src/shared/combat/aim'
import { CharFlag, copyCharacterState, createCharacterState } from '../../src/shared/movement/character'
import type { GameEvent, InputCommand } from '../../src/shared/net/protocol'

export const DT = 1 / 30

export function testMap(build: MapDefinition['build']): GameMap {
  return buildMap({
    id: 'teste', name: 'Teste', description: '', samples: 65, cell: 2, seed: 7, waterLevel: -50,
    biome: { sand: 0, grass: 0, grassDry: 0, forest: 0, dirt: 0, rock: 0, snow: 0, seabed: 0, sandLevel: -99, snowLevel: 999 },
    atmosphere: { sunAzimuth: 0, sunElevation: 45, skyTop: 0, skyHorizon: 0, fogDensity: 0 },
    build(b) {
      b.shapeTerrain(() => 0)
      b.spawn(0, 0, 0)
      b.spawn(0, -10, Math.PI)
      b.spawn(20, 20, 0)
      build(b)
    },
  })
}

export class Harness {
  readonly sim: Simulation
  private seq = new Map<number, number>()
  /** Eventos acumulados desde o início. */
  readonly log: { ev: GameEvent; to?: number; except?: number }[] = []

  constructor(map: GameMap, rules = {}) {
    this.sim = new Simulation(map, 30, rules)
  }

  add(name: string): SimPlayer {
    const p = this.sim.addPlayer(name)
    this.seq.set(p.id, 0)
    return p
  }

  /** Um tick: cada jogador listado envia um comando; os demais ficam parados. */
  tick(cmds: Map<SimPlayer, Partial<InputCommand>> = new Map()): void {
    for (const sp of this.sim.players.values()) {
      const c = cmds.get(sp) ?? {}
      const seq = (this.seq.get(sp.id) ?? 0) + 1
      this.seq.set(sp.id, seq)
      this.sim.enqueue(sp.id, [{ seq, forward: 0, right: 0, yaw: sp.p.char.yaw, pitch: 0, buttons: 0, slot: sp.p.selected, viewTick: this.sim.tick, build: 0, ...c }])
    }
    this.sim.step()
    this.log.push(...this.sim.events)
    this.sim.events = []
  }

  run(n: number, cmds?: Map<SimPlayer, Partial<InputCommand>>): void {
    for (let k = 0; k < n; k++) this.tick(cmds)
  }

  events<T extends GameEvent['type']>(type: T): Extract<GameEvent, { type: T }>[] {
    return this.log.filter((e) => e.ev.type === type).map((e) => e.ev as Extract<GameEvent, { type: T }>)
  }
}

/**
 * Yaw/pitch que põem a MIRA (raio que sai do ombro da câmera) sobre o ponto,
 * como um jogador faria. Considera o deslocamento do ombro ao mirar.
 */
export function aimAt(sp: SimPlayer, tx: number, ty: number, tz: number, aiming = true): { yaw: number; pitch: number } {
  const c = copyCharacterState(sp.p.char, createCharacterState(0, 0, 0))
  if (aiming) c.flags |= CharFlag.Aiming
  const f = createAimFrame()
  let yaw = Math.atan2(-(tx - c.x), -(tz - c.z))
  let pitch = 0
  for (let k = 0; k < 6; k++) {
    c.yaw = yaw
    c.pitch = pitch
    aimFrame(c, f)
    yaw = Math.atan2(-(tx - f.ox), -(tz - f.oz))
    pitch = Math.atan2(ty - f.oy, Math.hypot(tx - f.ox, tz - f.oz))
  }
  return { yaw, pitch }
}

export const CHEST = 1.0

export function give(sp: SimPlayer, item: number, rarity = 2, reserve = 200): void {
  const w = weaponDef(item)!
  Object.assign(sp.p.slots[0], { item, rarity, count: 1, ammo: w.magSize })
  sp.p.ammo[w.ammoType] = reserve
  sp.p.selected = 0
  sp.p.equipTimer = 0
}
