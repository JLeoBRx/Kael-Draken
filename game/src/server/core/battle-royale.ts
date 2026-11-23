import { Rng } from '../../shared/math/rng'
import { MatchPhase, distanceOutside, planAirship, planZone, zoneCircleAt, type AirshipRoute, type ZoneCircle, type ZoneStage } from '../../shared/match/zone'
import { MOVE } from '../../shared/config/movement'
import { CharFlag, boardAirship } from '../../shared/movement/character'
import { Cause, type GameEvent } from '../../shared/net/protocol'
import type { Simulation } from './simulation'

/**
 * Regras do battle royale sobre a Simulation:
 *
 *   Aquecimento → Dirigível → Partida → Fim
 *
 * - Aquecimento: todos no mapa, sem dano e sem loot; a contagem só corre
 *   com pelo menos uma pessoa (não bot) conectada.
 * - Dirigível: todos embarcam com o estado zerado; cada um salta quando
 *   quiser (ou no fim da rota). A zona começa a contar.
 * - Partida: a zona fecha em etapas e dá dano por segundo a quem está fora;
 *   eliminados não renascem.
 * - Fim: sobrou um (ou ninguém). Depois de `endDelay`, `finished` fica true.
 */

export interface BattleRoyaleOptions {
  /** Aquecimento antes do dirigível (s). */
  warmup: number
  /** Multiplicador da velocidade da zona (2 = fecha no dobro da velocidade). */
  zoneSpeed: number
  /** Tempo mostrando o resultado antes de `finished` (s). */
  endDelay: number
  seed: number
}

export const DEFAULT_BR: BattleRoyaleOptions = { warmup: 45, zoneSpeed: 1, endDelay: 15, seed: 1 }

export class BattleRoyale {
  readonly opts: BattleRoyaleOptions
  phase: number = MatchPhase.Warmup
  /** Tick em que a fase atual acaba (0 = sem prazo). */
  phaseEnd = 0
  route: AirshipRoute | null = null
  stages: ZoneStage[] = []
  stageIndex = -1
  winner = 0
  /** Quantos começaram a partida. */
  participants = 0
  /** Tick em que o dirigível partiu. */
  startTick = -1
  /** O resultado já foi mostrado pelo tempo combinado. */
  finished = false
  private readonly rng: Rng
  private readonly circle: ZoneCircle = { x: 0, z: 0, r: 0 }

  constructor(private readonly sim: Simulation, opts: Partial<BattleRoyaleOptions> = {}) {
    this.opts = { ...DEFAULT_BR, ...opts }
    this.rng = new Rng(0xb4a7 ^ (this.opts.seed * 0x9e3779b1))
    sim.rules.respawn = true
    sim.rules.damage = false
    sim.rules.interact = false
    this.phaseEnd = sim.tick + this.ticks(this.opts.warmup)
  }

  private ticks(seconds: number): number {
    return Math.max(1, Math.round(seconds * this.sim.tickRate))
  }

  private get humans(): number {
    let n = 0
    for (const p of this.sim.players.values()) if (!p.bot) n++
    return n
  }

  /** Jogadores ainda na disputa. */
  get alive(): number {
    let n = 0
    for (const p of this.sim.players.values()) if (p.p.alive && !p.spectator) n++
    return n
  }

  /** Círculo da zona agora (null antes do dirigível). */
  zone(tick = this.sim.tick): ZoneCircle | null {
    const st = this.stages[this.stageIndex]
    return st ? zoneCircleAt(st, tick, this.circle) : null
  }

  get stage(): ZoneStage | null {
    return this.stages[this.stageIndex] ?? null
  }

  /** Chamar depois de cada `sim.step()`. */
  update(): void {
    const sim = this.sim
    const tick = sim.tick
    switch (this.phase) {
      case MatchPhase.Warmup:
        // sem ninguém (só bots), a contagem não anda
        if (this.humans === 0) this.phaseEnd = tick + this.ticks(this.opts.warmup)
        else if (tick >= this.phaseEnd) this.startAirship()
        break
      case MatchPhase.Airship:
      case MatchPhase.Playing:
        if (this.phase === MatchPhase.Airship && tick >= this.phaseEnd) {
          this.phase = MatchPhase.Playing
          this.phaseEnd = this.stage?.shrinkStart ?? 0
        }
        // Quem não mandou comandos (travou, ficou ausente) não fica a bordo para sempre
        if (this.route && tick === this.route.endTick + sim.tickRate) {
          for (const sp of sim.players.values()) {
            const c = sp.p.char
            if (!(c.flags & CharFlag.Riding)) continue
            c.flags = CharFlag.Skydiving
            c.rideTime = 0
            c.vx *= MOVE.exitSpeedFactor
            c.vz *= MOVE.exitSpeedFactor
          }
        }
        this.updateZone(tick)
        this.checkEnd()
        break
      case MatchPhase.Ended:
        if (tick >= this.phaseEnd) this.finished = true
        break
    }
  }

  /** Começa já (sem esperar o aquecimento). */
  startNow(): void {
    if (this.phase === MatchPhase.Warmup) this.startAirship()
  }

  private startAirship(): void {
    const sim = this.sim
    const map = sim.map
    const tick = sim.tick
    sim.rules.respawn = false
    sim.rules.damage = true
    sim.rules.interact = true
    sim.clearBuildings()
    const route = planAirship(map.world.bound, map.terrain.highest, tick, sim.tickRate, this.rng)
    this.route = route
    const duration = (route.endTick - tick) / sim.tickRate
    const len = Math.hypot(route.x1 - route.x0, route.z1 - route.z0)
    const vx = ((route.x1 - route.x0) / len) * (len / duration)
    const vz = ((route.z1 - route.z0) / len) * (len / duration)
    this.participants = 0
    for (const sp of sim.players.values()) {
      sim.resetForMatch(sp)
      boardAirship(sp.p.char, route.x0, route.y, route.z0, vx, vz, duration)
      this.participants++
    }
    sim.emit({ type: 'airship', ...route })
    const isLand = (x: number, z: number) => map.terrain.heightAt(x, z) > map.def.waterLevel + 0.5
    this.stages = planZone({ x: 0, z: 0, r: map.world.bound }, tick, sim.tickRate, this.opts.zoneSpeed, this.rng.fork(7), isLand)
    this.stageIndex = 0
    sim.emit({ type: 'zone', ...this.stages[0] })
    this.startTick = tick
    this.phase = MatchPhase.Airship
    this.phaseEnd = route.endTick
  }

  private updateZone(tick: number): void {
    // Próxima etapa quando a atual terminou de encolher
    while (this.stageIndex + 1 < this.stages.length && tick >= this.stages[this.stageIndex].shrinkEnd) {
      this.stageIndex++
      this.sim.emit({ type: 'zone', ...this.stages[this.stageIndex] })
      if (this.phase === MatchPhase.Playing) this.phaseEnd = this.stages[this.stageIndex].shrinkStart
    }
    const st = this.stage
    if (!st) return
    if (this.phase === MatchPhase.Playing && tick >= this.phaseEnd && tick < st.shrinkEnd) this.phaseEnd = st.shrinkEnd
    // Dano da zona, uma vez por segundo (direto na vida)
    if ((tick - this.startTick) % this.sim.tickRate !== 0) return
    const c = this.zone(tick)!
    for (const sp of [...this.sim.players.values()]) {
      if (!sp.p.alive || sp.spectator) continue
      const ch = sp.p.char
      if (distanceOutside(c, ch.x, ch.z) > 0) this.sim.applyDamage(sp, st.dps, null, Cause.Zone, c.x, c.z, true)
    }
  }

  private checkEnd(): void {
    const alive = this.alive
    if (alive > 1 || (alive === 1 && this.participants < 2)) return
    let winner = 0
    if (alive === 1) for (const sp of this.sim.players.values()) if (sp.p.alive && !sp.spectator) winner = sp.id
    this.winner = winner
    this.phase = MatchPhase.Ended
    this.phaseEnd = this.sim.tick + this.ticks(this.opts.endDelay)
    // o vencedor não pode mais ser eliminado (zona, quedas)
    this.sim.rules.damage = false
    this.sim.emit({ type: 'matchEnd', winner })
  }

  /** Estado da partida para quem entra depois (dirigível e etapa atual da zona). */
  syncEvents(): GameEvent[] {
    const out: GameEvent[] = []
    if (this.route) out.push({ type: 'airship', ...this.route })
    const st = this.stage
    if (st) out.push({ type: 'zone', ...st })
    if (this.phase === MatchPhase.Ended) out.push({ type: 'matchEnd', winner: this.winner })
    return out
  }
}
