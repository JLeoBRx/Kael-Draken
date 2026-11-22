import { BuildingWorld, type Piece } from '../../shared/building/buildings'
import { pieceKey, type PieceSpec } from '../../shared/building/grid'
import type { GameEvent } from '../../shared/net/protocol'
import type { BuildDelegate } from '../../shared/player/player'
import type { CollisionWorld } from '../../shared/world/collision-world'

type Placed = Extract<GameEvent, { type: 'piecePlaced' }>

/**
 * Construções do lado do cliente: as confirmadas pelo servidor e as previstas
 * pelo próprio jogador (id = −seq do comando que as criou).
 *
 * - Ao prever um comando de construção, a peça entra na hora no mundo de
 *   colisão local (dá para subir na rampa sem esperar a rede).
 * - `piecePlaced` do servidor com o mesmo `seq` confirma a peça prevista
 *   (troca o id); chega sempre antes do snapshot que confirma o comando.
 * - Na reconciliação, previstas com seq ≤ ackSeq sem confirmação foram
 *   recusadas pelo servidor e somem; as ainda pendentes são refeitas ao
 *   reaplicar os comandos (ver beginReplay).
 */
export class PredictedBuildings implements BuildDelegate {
  readonly buildings: BuildingWorld
  /** Aumenta a cada mudança visível (para a renderização refazer as instâncias). */
  version = 0
  /** Tick do servidor estimado (para a vida das peças em construção). */
  serverTick = 0
  /** Peças previstas recusadas pelo servidor (estatística/depuração). */
  rejected = 0

  constructor(world: CollisionWorld, private playerId = 0) {
    this.buildings = new BuildingWorld(world)
  }

  setPlayerId(id: number): void {
    this.playerId = id
  }

  /** Chamado pela simulação compartilhada (predição e reaplicação de comandos). */
  tryBuild(spec: PieceSpec, material: number, seq: number): boolean {
    const key = pieceKey(spec)
    const mine = this.buildings.byId.get(-seq)
    if (mine) {
      if (mine.key === key) return true
      // a posição corrigida mudou o alvo: a previsão antiga não vale mais
      this.buildings.remove(mine)
      this.version++
    }
    const at = this.buildings.byKey.get(key)
    if (at && !at.predicted && at.builder === this.playerId && at.seq === seq) return true
    if (this.buildings.canPlace(spec) !== null) return false
    this.buildings.add(spec, -seq, material, { builtAt: this.serverTick, builder: this.playerId, seq, predicted: true })
    this.version++
    return true
  }

  /**
   * Antes de reaplicar os comandos pendentes: tira do mundo TODAS as peças
   * previstas. As de seq ≤ ackSeq não foram confirmadas (o evento chega antes
   * do snapshot), então o servidor as recusou; as demais voltam ao mundo
   * quando o próprio comando for reaplicado — assim os comandos anteriores a
   * elas não "veem" uma peça que ainda não existia (igual ao servidor).
   */
  beginReplay(ackSeq: number): void {
    for (const p of [...this.buildings.byId.values()]) {
      if (!p.predicted) continue
      this.buildings.remove(p)
      if (p.seq <= ackSeq) this.rejected++
      this.version++
    }
  }

  /** Aplica um evento de construção do servidor. Devolve a peça afetada (se houver). */
  apply(e: GameEvent): Piece | null {
    switch (e.type) {
      case 'piecePlaced':
        return this.placed(e)
      case 'pieceDamaged': {
        const p = this.buildings.byId.get(e.id)
        if (p) {
          p.damage = e.damage
          this.version++
        }
        return p ?? null
      }
      case 'pieceRemoved': {
        const p = this.buildings.byId.get(e.id)
        if (p) {
          this.buildings.remove(p)
          this.version++
        }
        return p ?? null
      }
      default:
        return null
    }
  }

  private placed(e: Placed): Piece {
    const spec: PieceSpec = { kind: e.kind, i: e.i, j: e.j, k: e.k, dir: e.dir }
    const key = pieceKey(spec)
    const builtAt = this.serverTick - e.age
    this.version++
    // Confirmação da própria previsão
    if (e.builder === this.playerId && e.seq > 0) {
      const mine = this.buildings.byId.get(-e.seq)
      if (mine && mine.key === key && mine.material === e.material) {
        this.buildings.rekey(mine, e.id)
        mine.builtAt = builtAt
        mine.damage = e.damage
        return mine
      }
      if (mine) this.buildings.remove(mine)
    }
    // Id reaproveitado ou lugar ocupado por uma previsão que vai ser recusada
    const old = this.buildings.byId.get(e.id)
    if (old) this.buildings.remove(old)
    const at = this.buildings.byKey.get(key)
    if (at) this.buildings.remove(at)
    return this.buildings.add(spec, e.id, e.material, { builtAt, damage: e.damage, builder: e.builder, seq: e.seq })
  }
}
