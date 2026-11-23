import { GameHost, type HostLogger, type MatchSummary, type PlayerResult } from '../server/core/game-host'
import type { BattleRoyaleOptions } from '../server/core/battle-royale'
import type { BotDifficulty } from '../server/core/bots/profiles'
import { MAIN_MAP_ID } from '../shared/maps'
import type { GameMap } from '../shared/maps/types'
import { GameMode } from '../shared/match/zone'
import { ticketAuth } from './tickets'

/**
 * Servidores de jogo alocados pela plataforma, no mesmo processo: cada um é
 * um GameHost com o próprio laço de ticks, servido em /game/<id>. Partidas
 * públicas: battle royale com as pessoas do matchmaking + bots, encerrado no
 * fim. Salas privadas: sala de espera (o dono configura e inicia), com
 * partidas seguidas até ficar vazia.
 *
 * Os servidores só aceitam bilhetes assinados para eles (`ticketAuth`); para
 * rodar servidores em outras máquinas basta o mesmo segredo — o formato do
 * bilhete não depende deste processo.
 */

export type ServerKind = 'publico' | 'privado'

export interface GameServer {
  id: string
  path: string
  kind: ServerKind
  host: GameHost
  teamSize: number
  region: string
  /** Partida atual na base de dados (pública: desde a criação; privada: a cada partida). */
  matchId: number | null
  /** Código da sala (privadas). */
  code: string | null
  /** Habilidade média das pessoas (partidas públicas). */
  avgMmr: number
  createdAt: number
  /** Última vez que tinha alguém conectado. */
  lastBusy: number
  /** Pessoas convidadas (bilhetes emitidos). */
  invited: Set<number>
}

export interface PoolHooks {
  onResult(server: GameServer, r: PlayerResult): void
  onMatchEnd(server: GameServer, s: MatchSummary): void
  onReleased(server: GameServer): void
}

export interface PoolOptions {
  secret: string
  maxServers: number
  mapId?: string
  tickRate?: number
  /** Partidas públicas: aquecimento (até todos chegarem), zona e fim. */
  publicBr?: Partial<BattleRoyaleOptions>
  botDifficulty?: BotDifficulty
  /** Sala vazia por mais que isto é encerrada (ms). */
  roomIdleMs?: number
  /** Partida pública sem ninguém conectado por mais que isto é encerrada (ms). */
  publicIdleMs?: number
  /** Segundos que o personagem espera quem caiu. */
  reconnectSeconds?: number
  logger?: HostLogger
  mapFactory?: (mapId: string) => GameMap
  clock?: () => number
  /** Liga o laço de ticks de cada servidor (testes desligam e chamam tick() à mão). */
  autoStart?: boolean
}

export class GameServerPool {
  readonly servers = new Map<string, GameServer>()
  private nextId = 1
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly clock: () => number

  constructor(private readonly opts: PoolOptions, private readonly hooks: PoolHooks) {
    this.clock = opts.clock ?? Date.now
  }

  get full(): boolean {
    return this.servers.size >= this.opts.maxServers
  }

  get(id: string): GameServer | undefined {
    return this.servers.get(id)
  }

  byCode(code: string): GameServer | undefined {
    for (const s of this.servers.values()) if (s.code === code) return s
    return undefined
  }

  private make(kind: ServerKind, teamSize: number, region: string, setup: (server: GameServer) => GameHost): GameServer | null {
    if (this.full) return null
    const id = `s${this.nextId++}`
    const now = this.clock()
    const server: GameServer = {
      id, path: `/game/${id}`, kind, host: null as unknown as GameHost, teamSize, region, matchId: null, code: null, avgMmr: 0,
      createdAt: now, lastBusy: now, invited: new Set(),
    }
    server.host = setup(server)
    this.servers.set(id, server)
    if (this.opts.autoStart !== false) {
      server.host.start()
      this.ensureTimer()
    }
    return server
  }

  private logger(id: string): HostLogger | undefined {
    const log = this.opts.logger
    return log ? { info: (m) => log.info(`[${id}] ${m}`), warn: (m) => log.warn(`[${id}] ${m}`) } : undefined
  }

  /** Battle royale público para as pessoas do matchmaking (bilhetes com a equipe de cada uma). */
  createPublic(teamSize: number, region: string, humans: number, bots: number): GameServer | null {
    const mapId = this.opts.mapId ?? MAIN_MAP_ID
    return this.make('publico', teamSize, region, (server) => {
      const id = server.id
      return new GameHost({
        mapId, map: this.opts.mapFactory?.(mapId), mapFactory: this.opts.mapFactory,
        tickRate: this.opts.tickRate ?? 30, maxPlayers: 100, serverName: `Partida pública ${id}`, logger: this.logger(id),
        mode: GameMode.BattleRoyale, bots, botDifficulty: this.opts.botDifficulty ?? 'normal', teamSize,
        br: { warmup: 25, endDelay: 12, ...this.opts.publicBr }, autoRestart: false, lobby: false,
        reconnectSeconds: this.opts.reconnectSeconds ?? 60, expected: humans,
        auth: ticketAuth(this.opts.secret, id, this.clock),
        onResult: (r) => this.hooks.onResult(server, r),
        onMatchEnd: (m) => this.hooks.onMatchEnd(server, m),
        onFinished: () => this.release(id, 'partida encerrada'),
      })
    })
  }

  /** Sala privada com código: sala de espera do Phase 5, só para quem tem bilhete. */
  createRoom(code: string, region: string, ownerUid?: string): GameServer | null {
    const mapId = this.opts.mapId ?? MAIN_MAP_ID
    const room = this.make('privado', 1, region, (server) => {
      const id = server.id
      server.code = code
      return new GameHost({
        mapId, map: this.opts.mapFactory?.(mapId), mapFactory: this.opts.mapFactory,
        tickRate: this.opts.tickRate ?? 30, maxPlayers: 100, serverName: `Sala ${code}`, logger: this.logger(id),
        mode: GameMode.BattleRoyale, bots: 10, botDifficulty: this.opts.botDifficulty ?? 'normal',
        br: { endDelay: 10, ...this.opts.publicBr }, lobby: true, reconnectSeconds: this.opts.reconnectSeconds ?? 60, ownerUid,
        auth: ticketAuth(this.opts.secret, id, this.clock),
        onResult: (r) => this.hooks.onResult(server, r),
        onMatchEnd: (m) => this.hooks.onMatchEnd(server, m),
      })
    })
    return room
  }

  /** Encerra um servidor (fim da partida, vazio por muito tempo, plataforma desligando). */
  release(id: string, why: string): void {
    const s = this.servers.get(id)
    if (!s) return
    this.servers.delete(id)
    this.opts.logger?.info(`[${id}] encerrado: ${why}`)
    s.host.shutdown()
    this.hooks.onReleased(s)
  }

  /** Contas conectadas em cada servidor (presença dos amigos). */
  whereIs(uid: number): GameServer | null {
    const key = String(uid)
    for (const s of this.servers.values()) if (s.host.connectedUids().has(key)) return s
    return null
  }

  private ensureTimer(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.sweep(), 5000)
    ;(this.timer as { unref?: () => void }).unref?.()
  }

  /** Fecha salas vazias e partidas públicas que ninguém abriu. */
  sweep(): void {
    const now = this.clock()
    for (const s of [...this.servers.values()]) {
      if (s.host.playerCount > 0) {
        s.lastBusy = now
        continue
      }
      const idle = now - s.lastBusy
      if (s.kind === 'privado' && idle > (this.opts.roomIdleMs ?? 120_000)) this.release(s.id, 'sala vazia')
      else if (s.kind === 'publico' && idle > (this.opts.publicIdleMs ?? 90_000)) this.release(s.id, 'ninguém conectado')
    }
  }

  close(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    for (const id of [...this.servers.keys()]) this.release(id, 'plataforma encerrada')
  }
}
