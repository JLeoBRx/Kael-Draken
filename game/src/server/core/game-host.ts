import { MAPS, loadMap } from '../../shared/maps'
import type { GameMap } from '../../shared/maps/types'
import { GameMode, MatchPhase } from '../../shared/match/zone'
import { ProtocolError } from '../../shared/net/binary'
import {
  KICK_NEW_MATCH,
  MAX_LOBBY_TEAMS,
  MAX_TEAM_SIZE,
  PROTOCOL_VERSION,
  beginSnapshot,
  decodeClientMessage,
  encodeEvents,
  encodeKick,
  encodeLobbyState,
  encodePlayerInfo,
  encodePlayerLeft,
  encodePong,
  encodeWelcome,
  sanitizeName,
  writeEntity,
  writeMates,
  type GameEvent,
  type LobbyAction,
  type LobbyConfig,
} from '../../shared/net/protocol'
import { BattleRoyale, type BattleRoyaleOptions } from './battle-royale'
import { BotManager } from './bots/bot-manager'
import { BOT_DIFFICULTIES, type BotDifficulty } from './bots/profiles'
import { Simulation, type MatchRules, type SimPlayer } from './simulation'

/**
 * Anfitrião de partida independente de ambiente: roda no Node (servidor
 * dedicado/LAN) e dentro de um Web Worker (modo offline). Recebe conexões
 * abstratas, decodifica mensagens, alimenta a simulação e envia snapshots.
 *
 * Fluxos:
 * - Sem sala de espera: cada conexão entra direto na partida (em battle
 *   royale já começado, só assiste até a próxima). No fim, com
 *   `autoRestart`, todos são desconectados com KICK_NEW_MATCH e voltam.
 * - Com sala de espera (`lobby`, LAN): quem conecta fica na sala, marca
 *   "pronto", escolhe equipe; o dono (primeiro a entrar) configura mapa,
 *   modo, bots, equipes e zona e inicia. No fim da partida, todos voltam à
 *   sala pela mesma conexão.
 * - Reconexão: cada jogador recebe um token; se a conexão cair no meio da
 *   partida, o personagem fica no mundo por `reconnectSeconds` e quem voltar
 *   com o token assume o mesmo personagem (posição, vida, inventário).
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
  mapFactory?: (mapId: string) => GameMap
  /** Regras da partida (padrão: treino com renascimento). */
  rules?: Partial<MatchRules>
  /** GameMode: treino (padrão) ou battle royale. */
  mode?: number
  /** Ajustes do battle royale (aquecimento, velocidade da zona…). */
  br?: Partial<BattleRoyaleOptions>
  /** Bots controlados pelo servidor. */
  bots?: number
  botDifficulty?: BotDifficulty
  /** Jogadores por equipe (1–4) e fogo amigo. */
  teamSize?: number
  friendlyFire?: boolean
  /** Recomeça sozinho depois do fim da partida (servidor dedicado sem sala). */
  autoRestart?: boolean
  /** Sala de espera antes de cada partida (LAN). */
  lobby?: boolean
  /** Segundos que um personagem espera a volta de quem caiu (0 = remove na hora). */
  reconnectSeconds?: number
}

export interface HostInfo {
  name: string
  mapId: string
  mapName: string
  /** Pessoas conectadas (na partida ou na sala; sem bots). */
  players: number
  bots: number
  maxPlayers: number
  tickRate: number
  version: number
  mode: number
  phase: number
  /** Sala de espera ativa (aceitando gente para a próxima partida). */
  lobby: boolean
  /** Partida em andamento. */
  running: boolean
  teamSize: number
}

interface ClientSlot {
  conn: HostConnection
  player: SimPlayer | null
  /** Tick em que começou a janela atual de contagem de mensagens. */
  windowTick: number
  messagesInWindow: number
  hello: boolean
  name: string
  skin: number
  ready: boolean
  /** Equipe escolhida na sala (-1 = automática). */
  wantTeam: number
  token: string
  /** Expulso pelo servidor: não fica esperando reconexão. */
  kicked: boolean
}

interface Orphan {
  player: SimPlayer
  until: number
}

/**
 * Limite de mensagens por segundo de jogo por conexão (entradas a até ~60/s +
 * pings). A janela é medida em ticks do servidor: determinística e tolerante
 * a servidores atrasados.
 */
const MAX_MESSAGES_PER_SECOND = 240
const HELLO_TIMEOUT_MS = 10_000
const SKINS = 8
/** Aquecimento depois da sala de espera (todos já estão juntos). */
const LOBBY_WARMUP = 3

const silentLogger: HostLogger = { info() {}, warn() {} }

function now(): number {
  return performance.now()
}

function newToken(): string {
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export class GameHost {
  sim!: Simulation
  map: GameMap
  br: BattleRoyale | null = null
  bots: BotManager | null = null
  readonly tickRate: number
  readonly maxPlayers: number
  readonly snapshotInterval: number
  readonly serverName: string
  readonly lobbyEnabled: boolean
  /** Configuração da partida (da linha de comando ou da sala de espera). */
  config: LobbyConfig
  /** Partida em andamento (sem sala, sempre). */
  active = false
  private readonly opts: HostOptions
  private readonly log: HostLogger
  private readonly clients = new Map<number, ClientSlot>()
  private readonly orphans = new Map<string, Orphan>()
  private owner = 0
  private rosterSeen = -1
  private matchNumber = 0
  /** O mapa atual já foi jogado (construções, adereços quebrados): precisa ser refeito. */
  private mapUsed = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private nextTickAt = 0
  /** Duração média do tick (ms), para monitoramento. */
  tickMs = 0

  constructor(opts: HostOptions) {
    this.opts = opts
    this.map = opts.map ?? loadMap(opts.mapId)
    this.tickRate = opts.tickRate ?? 30
    this.maxPlayers = opts.maxPlayers ?? 16
    this.snapshotInterval = Math.max(1, opts.snapshotInterval ?? 1)
    this.serverName = opts.serverName ?? 'Servidor'
    this.log = opts.logger ?? silentLogger
    this.lobbyEnabled = opts.lobby ?? false
    this.config = {
      mapId: this.map.def.id,
      mode: opts.mode ?? GameMode.Training,
      bots: Math.max(0, Math.min(99, opts.bots ?? 0)),
      difficulty: Math.max(0, BOT_DIFFICULTIES.indexOf(opts.botDifficulty ?? 'normal')),
      teamSize: Math.max(1, Math.min(MAX_TEAM_SIZE, opts.teamSize ?? opts.rules?.teamSize ?? 1)),
      friendlyFire: opts.friendlyFire ?? opts.rules?.friendlyFire ?? false,
      zoneSpeed: opts.br?.zoneSpeed ?? 1,
    }
    this.setupMatch()
    // sem sala de espera, a partida já está aberta
    this.active = !this.lobbyEnabled
    this.mapUsed = this.active
  }

  get mode(): number {
    return this.config.mode
  }

  /** Cria simulação, regras do battle royale e bots de uma partida nova. */
  private setupMatch(): void {
    this.matchNumber++
    const c = this.config
    const seed = (this.opts.rules?.seed ?? 1) + this.matchNumber - 1
    this.sim = new Simulation(this.map, this.tickRate, { ...this.opts.rules, seed, teamSize: c.teamSize, friendlyFire: c.friendlyFire })
    const warmup = this.lobbyEnabled ? LOBBY_WARMUP : this.opts.br?.warmup
    this.br = c.mode === GameMode.BattleRoyale ? new BattleRoyale(this.sim, { ...this.opts.br, warmup, zoneSpeed: c.zoneSpeed, seed }) : null
    const count = Math.max(0, Math.min(c.bots, this.maxPlayers - 1))
    this.bots = count > 0 ? new BotManager(this.sim, this.br, { count, difficulty: BOT_DIFFICULTIES[c.difficulty] ?? 'normal', seed }) : null
    this.rosterSeen = -1
  }

  /** Pessoas conectadas (na partida e na sala), sem bots. */
  get playerCount(): number {
    let n = 0
    for (const s of this.clients.values()) if (s.hello) n++
    return n + this.orphans.size
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
      bots: this.config.bots,
      maxPlayers: this.maxPlayers,
      tickRate: this.tickRate,
      version: PROTOCOL_VERSION,
      mode: this.mode,
      phase: this.phase,
      lobby: this.lobbyEnabled,
      running: this.active,
      teamSize: this.config.teamSize,
    }
  }

  // ---- conexões -------------------------------------------------------------

  connect(conn: HostConnection): void {
    this.clients.set(conn.id, {
      conn, player: null, windowTick: this.sim.tick, messagesInWindow: 0,
      hello: false, name: '', skin: 0, ready: false, wantTeam: -1, token: '', kicked: false,
    })
    const timer = setTimeout(() => {
      const slot = this.clients.get(conn.id)
      if (slot && !slot.hello) this.kick(slot, 'Tempo de handshake esgotado')
    }, HELLO_TIMEOUT_MS)
    // No Node, não segura o processo aberto só por causa deste timer.
    ;(timer as { unref?: () => void }).unref?.()
  }

  disconnect(connId: number): void {
    const slot = this.clients.get(connId)
    if (!slot) return
    this.clients.delete(connId)
    const p = slot.player
    if (p) {
      const rs = this.opts.reconnectSeconds ?? 60
      if (this.active && p.p.alive && !p.spectator && rs > 0 && slot.token && !slot.kicked) {
        // o personagem fica no mundo esperando a volta (pode ser atingido)
        this.orphans.set(slot.token, { player: p, until: this.sim.tick + Math.round(rs * this.tickRate) })
        this.log.info(`${p.name} (#${p.id}) caiu; aguardando reconexão por ${rs} s`)
      } else this.dropPlayer(p, 'saiu')
    }
    if (this.lobbyEnabled && slot.hello) {
      if (this.owner === connId) this.owner = this.nextOwner()
      this.broadcastLobby()
    }
  }

  private dropPlayer(p: SimPlayer, why: string): void {
    this.log.info(`${p.name} (#${p.id}) ${why}`)
    this.sim.removePlayer(p.id)
    this.broadcast(encodePlayerLeft(p.id))
  }

  private nextOwner(): number {
    for (const s of this.clients.values()) if (s.hello) return s.conn.id
    return 0
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
        this.handleHello(slot, msg.version, msg.name, msg.token)
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
      case 'lobby':
        if (slot.hello && !slot.player) this.handleLobby(slot, msg.action)
        break
    }
  }

  private handleHello(slot: ClientSlot, version: number, rawName: string, token: string): void {
    if (slot.hello) return
    if (version !== PROTOCOL_VERSION) {
      this.kick(slot, `Versão incompatível (servidor ${PROTOCOL_VERSION}, cliente ${version})`)
      return
    }
    // Voltando ao mesmo personagem?
    const orphan = token ? this.orphans.get(token) : undefined
    if (orphan && this.sim.players.get(orphan.player.id) === orphan.player) {
      this.orphans.delete(token)
      slot.hello = true
      slot.name = orphan.player.name
      slot.skin = orphan.player.skin
      slot.token = token
      this.resume(slot, orphan.player)
      return
    }
    if (this.playerCount >= this.maxPlayers) {
      this.kick(slot, 'Servidor cheio')
      return
    }
    slot.hello = true
    slot.name = sanitizeName(rawName)
    slot.skin = (this.sim.tick + slot.conn.id) % SKINS
    if (this.lobbyEnabled) {
      if (!this.owner) this.owner = slot.conn.id
      this.log.info(`${slot.name} entrou na sala de espera`)
      this.broadcastLobby()
      return
    }
    // Battle royale já começou: assiste até a próxima partida
    const late = !!this.br && this.br.phase !== MatchPhase.Warmup
    this.joinMatch(slot, late)
  }

  /** Coloca a conexão na partida em andamento. */
  private joinMatch(slot: ClientSlot, spectator: boolean): void {
    const player = this.sim.addPlayer(slot.name, slot.skin, { spectator, team: slot.wantTeam })
    if (this.mode === GameMode.Training && this.config.teamSize > 1) this.sim.assignTeams()
    slot.token = newToken()
    this.resume(slot, player)
    this.log.info(`${player.name} (#${player.id}) entrou — ${this.playerCount}/${this.maxPlayers}`)
  }

  /** Liga a conexão ao personagem e envia boas-vindas, nomes e o estado do mundo. */
  private resume(slot: ClientSlot, player: SimPlayer): void {
    slot.player = player
    // o cliente recomeça a numeração dos comandos
    player.queue.length = 0
    player.lastSeq = 0
    player.lastQueuedSeq = 0
    slot.conn.send(encodeWelcome({
      version: PROTOCOL_VERSION,
      playerId: player.id,
      mapId: this.map.def.id,
      tickRate: this.tickRate,
      tick: this.sim.tick,
      serverName: this.serverName,
      mode: this.mode,
      token: slot.token,
    }))
    for (const other of this.sim.players.values()) {
      if (other.id !== player.id) slot.conn.send(encodePlayerInfo(other.id, other.name, other.skin, other.team))
    }
    this.broadcast(encodePlayerInfo(player.id, player.name, player.skin, player.team))
    // Estado atual do mundo: itens no chão, baús abertos, alvos, projéteis, construções, zona
    const sync = [...this.sim.worldSyncEvents(), ...(this.br?.syncEvents() ?? [])]
    for (let k = 0; k < sync.length; k += 2000) slot.conn.send(encodeEvents(sync.slice(k, k + 2000)))
  }

  // ---- sala de espera ------------------------------------------------------------

  private handleLobby(slot: ClientSlot, a: LobbyAction): void {
    if (!this.lobbyEnabled) return
    switch (a.op) {
      case 'ready':
        slot.ready = a.ready
        break
      case 'team':
        slot.wantTeam = Math.max(-1, Math.min(MAX_LOBBY_TEAMS - 1, a.team))
        break
      case 'config': {
        if (slot.conn.id !== this.owner || this.active) return
        const c = a.config
        this.config = {
          mapId: MAPS[c.mapId] ? c.mapId : this.config.mapId,
          mode: c.mode === GameMode.BattleRoyale ? GameMode.BattleRoyale : GameMode.Training,
          bots: Math.max(0, Math.min(99, c.bots, this.maxPlayers - 1)),
          difficulty: Math.max(0, Math.min(2, c.difficulty)),
          teamSize: Math.max(1, Math.min(MAX_TEAM_SIZE, c.teamSize)),
          friendlyFire: c.friendlyFire,
          zoneSpeed: Math.max(0.25, Math.min(10, c.zoneSpeed)),
        }
        break
      }
      case 'start':
        if (slot.conn.id === this.owner && !this.active) {
          this.startFromLobby()
          return
        }
        break
    }
    this.broadcastLobby()
  }

  /** O dono iniciou: mapa e partida novos com todos da sala. */
  private startFromLobby(): void {
    const members = [...this.clients.values()].filter((s) => s.hello && !s.player)
    if (members.length === 0) return
    if (this.mapUsed || this.map.def.id !== this.config.mapId) this.map = this.opts.mapFactory?.(this.config.mapId) ?? loadMap(this.config.mapId)
    this.mapUsed = true
    this.setupMatch()
    this.orphans.clear()
    this.active = true
    for (const s of members) this.joinMatch(s, false)
    this.log.info(`partida iniciada: ${MAPS[this.config.mapId]?.name ?? this.config.mapId}, ${members.length} pessoas, ${this.config.bots} bots`)
  }

  /** Fim da partida com sala de espera: todos voltam à sala pela mesma conexão. */
  private backToLobby(): void {
    this.log.info('partida encerrada; de volta à sala de espera')
    this.active = false
    this.orphans.clear()
    for (const s of this.clients.values()) {
      s.player = null
      s.ready = false
      s.token = ''
    }
    // simulação vazia enquanto a sala se organiza
    this.matchNumber++
    this.sim = new Simulation(this.map, this.tickRate, { ...this.opts.rules })
    this.br = null
    this.bots = null
    if (!this.owner || !this.clients.get(this.owner)?.hello) this.owner = this.nextOwner()
    this.broadcastLobby()
  }

  private broadcastLobby(): void {
    if (!this.lobbyEnabled) return
    const members = [...this.clients.values()].filter((s) => s.hello)
    const list = members.map((s) => ({ id: s.conn.id, name: s.name, ready: s.ready, team: s.wantTeam, skin: s.skin }))
    const alive = this.active ? this.sim.aliveCount : 0
    for (const s of members) {
      if (s.player) continue
      s.conn.send(encodeLobbyState({ you: s.conn.id, owner: this.owner, config: this.config, running: this.active, runningAlive: alive, members: list }))
    }
  }

  // ---- laço --------------------------------------------------------------------

  private kick(slot: ClientSlot, reason: string): void {
    slot.kicked = true
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
    if (this.active) {
      this.bots?.update()
      this.sim.step()
      this.br?.update()
      this.expireOrphans()
      if (this.sim.rosterVersion !== this.rosterSeen) {
        // equipes mudaram: todos recebem nomes e equipes de novo
        this.rosterSeen = this.sim.rosterVersion
        for (const p of this.sim.players.values()) this.broadcast(encodePlayerInfo(p.id, p.name, p.skin, p.team))
      }
      this.sendEvents()
      if (this.sim.tick % this.snapshotInterval === 0) this.sendSnapshots()
      // a sala acompanha quantos ainda estão vivos (a cada segundo)
      if (this.lobbyEnabled && this.sim.tick % this.tickRate === 0) this.broadcastLobby()
    }
    this.tickMs = this.tickMs * 0.95 + (now() - t0) * 0.05
    if (this.br?.finished) {
      if (this.lobbyEnabled) this.backToLobby()
      else if (this.opts.autoRestart) this.restart()
    }
  }

  private expireOrphans(): void {
    for (const [token, o] of this.orphans) {
      if (this.sim.tick < o.until && this.sim.players.get(o.player.id) === o.player) continue
      this.orphans.delete(token)
      if (this.sim.players.get(o.player.id) === o.player) this.dropPlayer(o.player, 'não voltou a tempo')
    }
  }

  /** Nova partida: mapa e simulação do zero; os clientes reconectam sozinhos. */
  restart(): void {
    this.log.info('partida encerrada; preparando a próxima')
    for (const slot of [...this.clients.values()]) this.kick(slot, KICK_NEW_MATCH)
    this.orphans.clear()
    this.map = this.opts.mapFactory?.(this.map.def.id) ?? loadMap(this.map.def.id)
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
      writeMates(w, this.sim.teammates(me).map((q) => ({ id: q.id, health: q.p.health, shield: q.p.shield, alive: q.p.alive })))
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
