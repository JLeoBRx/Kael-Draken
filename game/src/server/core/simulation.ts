import type { GameMap } from '../../shared/maps/types'
import { createCharacterState, stepCharacter, type CharacterState } from '../../shared/movement/character'
import { sanitizeCommand, type InputCommand } from '../../shared/net/protocol'
import { createWorldHit } from '../../shared/world/collision-world'

/**
 * Simulação autoritativa da partida. Só o servidor (dedicado, host LAN ou o
 * Worker do modo offline) executa esta classe; o resultado dela é a verdade.
 *
 * Entrada: cada jogador envia comandos numerados, um por tick do cliente.
 * Cada comando avança o personagem exatamente um tick (dt fixo), na mesma
 * função usada pela predição do cliente.
 *
 * Proteção contra "speed hack": um balde de fichas por jogador limita os
 * comandos aplicados ao ritmo real do servidor (1 ficha por tick, rajada
 * máxima de MAX_TOKENS ticks). Comandos acima disso esperam na fila.
 */

export const MAX_TOKENS = 8
export const MAX_QUEUE = 64

export interface SimPlayer {
  id: number
  name: string
  skin: number
  state: CharacterState
  queue: InputCommand[]
  /** Último comando aplicado. */
  lastSeq: number
  /** Maior sequência já aceita na fila. */
  lastQueuedSeq: number
  tokens: number
  droppedCommands: number
}

export class Simulation {
  readonly map: GameMap
  readonly tickRate: number
  readonly dt: number
  tick = 0
  readonly players = new Map<number, SimPlayer>()
  private nextId = 1
  private spawnCursor = 0
  private readonly hit = createWorldHit()

  constructor(map: GameMap, tickRate: number) {
    this.map = map
    this.tickRate = tickRate
    this.dt = 1 / tickRate
  }

  private allocateId(): number {
    for (let k = 0; k < 0xfffe; k++) {
      const id = this.nextId
      this.nextId = this.nextId >= 0xfffe ? 1 : this.nextId + 1
      if (!this.players.has(id)) return id
    }
    throw new Error('Sem ids de jogador disponíveis')
  }

  /** Ponto de surgimento sobre a primeira superfície abaixo do spawn. */
  spawnState(): CharacterState {
    const sp = this.map.spawns[this.spawnCursor++ % this.map.spawns.length]
    const top = this.map.terrain.highest + 20
    const y = this.map.world.raycast(sp.x, top, sp.z, 0, -1, 0, top + 50, this.hit) ? this.hit.y : this.map.terrain.heightAt(sp.x, sp.z)
    return createCharacterState(sp.x, y + 0.02, sp.z, sp.yaw)
  }

  addPlayer(name: string, skin = 0): SimPlayer {
    const id = this.allocateId()
    const p: SimPlayer = {
      id, name, skin,
      state: this.spawnState(),
      queue: [],
      lastSeq: 0,
      lastQueuedSeq: 0,
      tokens: MAX_TOKENS,
      droppedCommands: 0,
    }
    this.players.set(id, p)
    return p
  }

  removePlayer(id: number): void {
    this.players.delete(id)
  }

  enqueue(id: number, commands: readonly InputCommand[]): void {
    const p = this.players.get(id)
    if (!p) return
    for (const raw of commands) {
      if (raw.seq <= p.lastQueuedSeq) continue
      p.queue.push(sanitizeCommand(raw))
      p.lastQueuedSeq = raw.seq
    }
    while (p.queue.length > MAX_QUEUE) {
      p.queue.shift()
      p.droppedCommands++
    }
  }

  step(): void {
    const world = this.map.world
    for (const p of this.players.values()) {
      p.tokens = Math.min(p.tokens + 1, MAX_TOKENS)
      while (p.queue.length > 0 && p.tokens >= 1) {
        const c = p.queue.shift()!
        stepCharacter(p.state, c, world, this.dt)
        p.lastSeq = c.seq
        p.tokens -= 1
      }
    }
    this.tick++
  }
}
