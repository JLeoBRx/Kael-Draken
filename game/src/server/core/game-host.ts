import { loadMap } from '../../shared/maps'
import type { GameMap } from '../../shared/maps/types'
import { GameMode, MatchPhase } from '../../shared/match/zone'
import { ProtocolError } from '../../shared/net/binary'
import {
  KICK_NEW_MATCH,
  PROTOCOL_VERSION,
  beginSnapshot,
  decodeClientMessage,
  encodeEvents,
  encodeKick,
  encodePlayerInfo,
  encodePlayerLeft,
  encodePong,
  encodeWelcome,
  sanitizeName,
  writeEntity,
  type GameEvent,
} from '../../shared/net/protocol'
import { BattleRoyale, type BattleRoyaleOptions } from './battle-royale'
import { BotManager } from './bots/bot-manager'
import type { BotDifficulty } from './bots/profiles'
import { Simulation, type MatchRules, type SimPlayer } from './simulation'

/**
 * Anfitrião de partida independente de ambiente: roda no Node (servidor
 * dedicado/LAN) e dentro de um Web Worker (modo offline). Recebe conexões
 * abstratas, decodifica mensagens, alimenta a simulação e envia snapshots.
 */

export interface HostConnection {
  readonly id: number
  send(data: Uint8Array): void
  close(reason: string): void
}

export interface HostLogger {
  info(message: string): void
  warn(message: string): void
}

export interface HostOptions {
  mapId: string
  tickRate?: number
  maxPlayers?: number
  /** Envia um snapshot a cada N ticks. */
  snapshotInterval?: number
  serverName?: string
  logger?: HostLogger
  /** Mapa já construído (evita reconstruir em testes). */
  map?: GameMap
  /** Como gerar o mapa de novo a cada partida (padrão: pelo id). */
  mapFactory?: () => GameMap
  /** Regras da partida (padrão: treino com renascimento). */
  rules?: Partial<MatchRules>
  /** GameMode: treino (padrão) ou battle royale. */
  mode?: number
  /** Ajustes do battle royale (aquecimento, velocidade da zona…). */
  br?: Partial<BattleRoyaleOptions>
  /** Bots controlados pelo servidor. */
  bots?: number
  botDifficulty?: BotDifficulty
  /** Recomeça sozinho depois do fim da partida (servidor dedicado/LAN). */
  autoRestart?: boolean
}

export interface HostInfo {
  name: string
  mapId: string
  mapName: string
  /** Pessoas conectadas (sem contar bots). */
  players: number
  bots: number
  maxPlayers: number
  tickRate: number
  version: number
  mode: number
  phase: number
}

interface ClientSlot {
  conn: HostConnection
  player: SimPlayer | null
  /** Tick em que começou a janela atual de contagem de mensagens. */
  windowTick: number
  messagesInWindow: number
}

/**
 * Limite de mensagens por segundo de jogo por conexão (entradas a até ~60/s +
 * pings). A janela é medida em ticks do servidor: determinística e tolerante
 * a servidores atrasados.
 */
const MAX_MESSAGES_PER_SECOND = 240
const HELLO_TIMEOUT_MS = 10_000
const SKINS = 8

const silentLogger: HostLogger = { info() {}, warn() {} }

function now(): number {
  return performance.now()
}

export class GameHost {
  sim!: Simulation
  map: GameMap
  br: BattleRoyale | null = null
  bots: BotManager | null = null
  readonly mode: number
  readonly tickRate: number
  readonly maxPlayers: number
  readonly snapshotInterval: number
  readonly serverName: string
  private readonly log: HostLogger
  private readonly clients = new Map<number, ClientSlot>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private nextTickAt = 0
  /** Duração média do tick (ms), para monitoramento. */
  tickMs = 0

  constructor(opts: HostOptions) {
    this.map = opts.map ?? loadMap(opts.mapId)
    this.tickRate = opts.tickRate ?? 30
    this.maxPlayers = opts.maxPlayers ?? 16
    this.snapshotInterval = Math.max(1, opts.snapshotInterval ?? 1)
    this.serverName = opts.serverName ?? 'Servidor'
    this.log = opts.logger ?? silentLogger
    this.mode = opts.mode ?? GameMode.Training
    this.opts = opts
    this.setupMatch()
  }

  private readonly opts: HostOptions
  private matchNumber = 0

  /** Cria simulação, regras do battle royale e bots de uma partida nova. */
  private setupMatch(): void {
    this.matchNumber++
    const seed = (this.opts.rules?.seed ?? 1) + this.matchNumber - 1
    this.sim = new Simulation(this.map, this.tickRate, { ...this.opts.rules, seed })
    this.br = this.mode === GameMode.BattleRoyale ? new BattleRoyale(this.sim, { ...this.opts.br, seed }) : null
    const count = Math.max(0, Math.min(this.opts.bots ?? 0, this.maxPlayers - 1))
    this.bots = count > 0 ? new BotManager(this.sim, this.br, { count, difficulty: this.opts.botDifficulty ?? 'normal', seed }) : null
  }

  get playerCount(): number {
    let n = 0
    for (const p of this.sim.players.values()) if (!p.bot) n++
    return n
  }

  get phase(): number {
    return this.br?.phase ?? MatchPhase.Training
  }

  info(): HostInfo {
    return {
      name: this.serverName,
      mapId: this.map.def.id,
      mapName: this.map.def.name,
      players: this.playerCount,
      bots: this.bots?.bots.length ?? 0,
      maxPlayers: this.maxPlayers,
      tickRate: this.tickRate,
      version: PROTOCOL_VERSION,
      mode: this.mode,
      phase: this.phase,
    }
  }

  connect(conn: HostConnection): void {
    this.clients.set(conn.id, { conn, player: null, windowTick: this.sim.tick, messagesInWindow: 0 })
    const timer = setTimeout(() => {
      const slot = this.clients.get(conn.id)
      if (slot && !slot.player) this.kick(slot, 'Tempo de handshake esgotado')
    }, HELLO_TIMEOUT_MS)
    // No Node, não segura o processo aberto só por causa deste timer.
    ;(timer as { unref?: () => void }).unref?.()
  }

  disconnect(connId: number): void {
    const slot = this.clients.get(connId)
    if (!slot) return
    this.clients.delete(connId)
    if (slot.player) {
      this.log.info(`${slot.player.name} (#${slot.player.id}) saiu`)
      this.sim.removePlayer(slot.player.id)
      this.broadcast(encodePlayerLeft(slot.player.id))
    }
  }

  receive(connId: number, data: Uint8Array): void {
    const slot = this.clients.get(connId)
    if (!slot) return
    if (this.sim.tick - slot.windowTick >= this.tickRate) {
      slot.windowTick = this.sim.tick
      slot.messagesInWindow = 0
    }
    if (++slot.messagesInWindow > MAX_MESSAGES_PER_SECOND) {
      this.kick(slot, 'Mensagens demais por segundo')
      return
    }
    let msg
    try {
      msg = decodeClientMessage(data)
    } catch (err) {
      const reason = err instanceof ProtocolError ? err.message : 'erro de decodificação'
      this.log.warn(`conexão ${connId}: mensagem inválida (${reason})`)
      this.kick(slot, 'Mensagem inválida')
      return
    }
    switch (msg.type) {
      case 'hello':
        this.handleHello(slot, msg.version, msg.name)
        break
      case 'input':
        if (slot.player) this.sim.enqueue(slot.player.id, msg.commands)
        break
      case 'ping':
        slot.conn.send(encodePong(msg.time, this.sim.tick))
        break
      case 'inventory':
        if (slot.player) this.sim.inventoryAction(slot.player.id, msg.op)
        break
    }
  }

  private handleHello(slot: ClientSlot, version: number, rawName: string): void {
    if (slot.player) return
    if (version !== PROTOCOL_VERSION) {
      this.kick(slot, `Versão incompatível (servidor ${PROTOCOL_VERSION}, cliente ${version})`)
      return
    }
    if (this.sim.players.size >= this.maxPlayers) {
      this.kick(slot, 'Servidor cheio')
      return
    }
    const name = sanitizeName(rawName)
    // Battle royale já começou: assiste até a próxima partida
    const late = !!this.br && this.br.phase !== MatchPhase.Warmup
    const player = this.sim.addPlayer(name, (this.sim.tick + slot.conn.id) % SKINS, { spectator: late })
    slot.player = player
    slot.conn.send(encodeWelcome({
      version: PROTOCOL_VERSION,
      playerId: player.id,
      mapId: this.map.def.id,
      tickRate: this.tickRate,
      tick: this.sim.tick,
      serverName: this.serverName,
      mode: this.mode,
    }))
    for (const other of this.sim.players.values()) {
      if (other.id !== player.id) slot.conn.send(encodePlayerInfo(other.id, other.name, other.skin))
    }
    this.broadcast(encodePlayerInfo(player.id, player.name, player.skin))
    // Estado atual do mundo: itens no chão, baús abertos, alvos, projéteis em voo
    const sync = [...this.sim.worldSyncEvents(), ...(this.br?.syncEvents() ?? [])]
    for (let k = 0; k < sync.length; k += 2000) slot.conn.send(encodeEvents(sync.slice(k, k + 2000)))
    this.log.info(`${name} (#${player.id}) entrou — ${this.sim.players.size}/${this.maxPlayers}`)
  }

  private kick(slot: ClientSlot, reason: string): void {
    try {
      slot.conn.send(encodeKick(reason))
    } finally {
      slot.conn.close(reason)
      this.disconnect(slot.conn.id)
    }
  }

  private broadcast(data: Uint8Array): void {
    for (const slot of this.clients.values()) if (slot.player) slot.conn.send(data)
  }

  /** Avança um tick e envia snapshots quando for a vez. */
  tick(): void {
    const t0 = now()
    this.bots?.update()
    this.sim.step()
    this.br?.update()
    this.sendEvents()
    if (this.sim.tick % this.snapshotInterval === 0) this.sendSnapshots()
    this.tickMs = this.tickMs * 0.95 + (now() - t0) * 0.05
    if (this.br?.finished && this.opts.autoRestart) this.restart()
  }

  /** Nova partida: mapa e simulação do zero; os clientes reconectam sozinhos. */
  restart(): void {
    this.log.info('partida encerrada; preparando a próxima')
    for (const slot of [...this.clients.values()]) this.kick(slot, KICK_NEW_MATCH)
    this.map = this.opts.mapFactory?.() ?? loadMap(this.map.def.id)
    this.setupMatch()
  }

  /**
   * Distribui os eventos do tick, na ordem em que aconteceram: cada cliente
   * recebe uma única mensagem com os eventos públicos e os endereçados a ele.
   */
  private sendEvents(): void {
    const routed = this.sim.events
    if (routed.length === 0) return
    this.sim.events = []
    if (routed.every((r) => r.to === undefined && r.except === undefined)) {
      const data = encodeEvents(routed.map((r) => r.ev))
      this.broadcast(data)
      return
    }
    for (const slot of this.clients.values()) {
      const me = slot.player
      if (!me) continue
      const list: GameEvent[] = []
      for (const r of routed) if ((r.to === undefined || r.to === me.id) && r.except !== me.id) list.push(r.ev)
      if (list.length > 0) slot.conn.send(encodeEvents(list))
    }
  }

  private sendSnapshots(): void {
    const players = [...this.sim.players.values()]
    const alive = players.filter((p) => p.p.alive)
    const phase = this.phase
    const phaseEnd = this.br?.phaseEnd ?? 0
    for (const slot of this.clients.values()) {
      const me = slot.player
      if (!me) continue
      // Todos os jogadores vivos são relevantes por enquanto. Gerência de
      // interesse (só quem está por perto, em taxas menores) entra na Fase 6.
      const others = alive.filter((p) => p !== me)
      const w = beginSnapshot(this.sim.tick, me.lastSeq, me.queue.length, alive.length, me.kills, phase, phaseEnd, me.p, others.length)
      for (const p of others) writeEntity(w, p.id, p.p)
      slot.conn.send(w.finish())
    }
  }

  /** Inicia o laço de ticks com compensação de deriva. */
  start(): void {
    if (this.timer) return
    const stepMs = 1000 / this.tickRate
    this.nextTickAt = now()
    const loop = () => {
      const t = now()
      let ran = 0
      while (t >= this.nextTickAt && ran < 5) {
        this.tick()
        this.nextTickAt += stepMs
        ran++
      }
      if (t - this.nextTickAt > 250) {
        this.log.warn('servidor atrasado; descartando ticks acumulados')
        this.nextTickAt = t
      }
      this.timer = setTimeout(loop, Math.max(0, this.nextTickAt - now()))
    }
    loop()
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    for (const slot of [...this.clients.values()]) slot.conn.close('Servidor encerrado')
    this.clients.clear()
  }
}
