import { copyCharacterState, createCharacterState, stepCharacter, type CharacterState, type MoveCommand } from '../../shared/movement/character'
import { quantizeCommand, type InputCommand } from '../../shared/net/protocol'
import type { CollisionWorld } from '../../shared/world/collision-world'

/**
 * Predição do jogador local com reconciliação.
 *
 * A cada tick o cliente cria um comando, aplica-o imediatamente ao próprio
 * personagem (resposta instantânea) e o envia ao servidor. Quando chega um
 * snapshot, o estado oficial substitui o previsto e os comandos ainda não
 * confirmados são reaplicados. Como a simulação é determinística, em mundo
 * estático a correção é zero; quando houver divergência (outro jogador
 * construiu uma parede, por exemplo), o erro visual é suavizado.
 */

const MAX_PENDING = 128
const SNAP_DISTANCE = 4

export class Predictor {
  readonly state: CharacterState = createCharacterState(0, 0, 0)
  /** Estado no tick anterior (para interpolar a renderização entre ticks). */
  readonly prev: CharacterState = createCharacterState(0, 0, 0)
  /** Deslocamento visual remanescente de correções. */
  readonly offset = { x: 0, y: 0, z: 0 }
  initialized = false
  corrections = 0
  lastError = 0
  private pending: InputCommand[] = []
  private nextSeq = 1

  constructor(private readonly world: CollisionWorld, private readonly dt: number) {}

  get pendingCount(): number {
    return this.pending.length
  }

  init(server: CharacterState): void {
    copyCharacterState(server, this.state)
    copyCharacterState(server, this.prev)
    this.pending = []
    this.initialized = true
  }

  /** Cria o comando do tick, prevê o movimento e devolve o comando a enviar. */
  predict(input: MoveCommand): InputCommand {
    const cmd = quantizeCommand({ ...input, seq: this.nextSeq++ })
    copyCharacterState(this.state, this.prev)
    stepCharacter(this.state, cmd, this.world, this.dt)
    this.pending.push(cmd)
    if (this.pending.length > MAX_PENDING) this.pending.shift()
    return cmd
  }

  reconcile(server: CharacterState, ackSeq: number): void {
    if (!this.initialized) {
      this.init(server)
      return
    }
    let drop = 0
    while (drop < this.pending.length && this.pending[drop].seq <= ackSeq) drop++
    if (drop > 0) this.pending.splice(0, drop)

    const bx = this.state.x
    const by = this.state.y
    const bz = this.state.z
    copyCharacterState(server, this.state)
    for (const c of this.pending) stepCharacter(this.state, c, this.world, this.dt)

    const ex = bx - this.state.x
    const ey = by - this.state.y
    const ez = bz - this.state.z
    const err = Math.sqrt(ex * ex + ey * ey + ez * ez)
    this.lastError = err
    if (err < 1e-6) return
    this.corrections++
    if (err > SNAP_DISTANCE) {
      // Teletransporte (renascimento, correção grande): sem suavização.
      this.offset.x = this.offset.y = this.offset.z = 0
      copyCharacterState(this.state, this.prev)
      return
    }
    this.offset.x += ex
    this.offset.y += ey
    this.offset.z += ez
    this.prev.x -= ex
    this.prev.y -= ey
    this.prev.z -= ez
  }

  /** Reduz o deslocamento visual exponencialmente (meia-vida ~70 ms). */
  decayOffset(frameDt: number): void {
    const k = Math.exp(-10 * frameDt)
    this.offset.x *= k
    this.offset.y *= k
    this.offset.z *= k
  }
}
