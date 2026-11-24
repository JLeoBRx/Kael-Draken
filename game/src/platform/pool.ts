import { randomBytes } from 'node:crypto'
import type { GameHost, HostLogger, MatchSummary, PlayerResult } from '../server/core/game-host'
import type { BattleRoyaleOptions } from '../server/core/battle-royale'
import type { BotDifficulty } from '../server/core/bots/profiles'
import { MAIN_MAP_ID } from '../shared/maps'
import type { GameMap } from '../shared/maps/types'
import { PROTOCOL_VERSION } from '../shared/net/protocol'
import { createGameHost, validSpec, type ServerKind, type ServerSpec } from './game-spec'
import {
  NODE_PROTOCOL,
  checkNodeProof,
  validNodeName,
  validPublicUrl,
  type NodeToPlatform,
  type PlatformToNode,
  type ServerMeta,
  type ServerReport,
} from './node-protocol'

/**
 * Servidores de jogo alocados pela plataforma. Cada servidor é um GameHost
 * com o próprio laço de ticks e roda:
 *
 * - aqui mesmo (nó "local"), servido em /game/<id> no endereço da plataforma; ou
 * - num nó remoto (outra máquina, `npm run game-node`), que se registra em /nodes
 *   e serve /game/<id> no próprio endereço público.
 *
 * A alocação escolhe, entre os nós com vaga, os da região pedida, depois os
 * remotos (os servidores locais ficam de reserva) e o menos ocupado
 * (proporção servidores/capacidade). Nós em desligamento (drain) não
 * recebem partidas novas.
 *
 * Partidas públicas: battle royale com as pessoas do matchmaking + bots,
 * encerrado no fim. Salas privadas: sala de espera (o dono configura e
 * inicia), com partidas seguidas até ficar vazia. Os servidores só aceitam
 * bilhetes assinados para eles (`ticketAuth`).
 */

export type { ServerKind } from './game-spec'

export interface ServerStatus {
  players: number
  phase: number
  tickMs: number
  alive: number
  uids: ReadonlySet<string>
}

export interface GameServer {
  id: string
  path: string
  kind: ServerKind
  teamSize: number
  region: string
  mapId: string
  /** Onde roda: 'local' ou o nome do nó remoto. */
  node: string
  /** Endereço WebSocket completo (nós remotos); os locais usam `path` no endereço da plataforma. */
  url: string | null
  /** GameHost deste processo (null em nós remotos). */
  host: GameHost | null
  /** Pronto para receber jogadores (remotos: depois que o nó confirma). */
  ready: boolean
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
  /** Situação atual (do host local ou do último relatório do nó). */
  status(): ServerStatus
}

export interface PoolHooks {
  onResult(server: GameServer, r: PlayerResult): void
  onMatchEnd(server: GameServer, s: MatchSummary): void
  onReleased(server: GameServer): void
  /** Um servidor remoto ficou pronto (ou falhou: `error`). */
  onReady?(server: GameServer, error: string | null): void
  /** Servidor remoto readotado (nó reconectou depois de cair, ou a plataforma reiniciou). */
  onAdopted?(server: GameServer): void
}

export interface PoolOptions {
  secret: string
  /** Servidores neste processo (0 = só nós remotos). */
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
  /** Região dos servidores locais. */
  localRegion?: string
  /** Quanto a plataforma espera um nó que caiu antes de dar as partidas dele como perdidas (ms). */
  nodeGraceMs?: number
  /** Tempo para um nó confirmar a criação de um servidor (ms). */
  createTimeoutMs?: number
  logger?: HostLogger
  mapFactory?: (mapId: string) => GameMap
  clock?: () => number
  /** Liga o laço de ticks de cada servidor (testes desligam e chamam tick() à mão). */
  autoStart?: boolean
}

/** Conexão (já aceita) com um nó remoto. */
export interface NodeLink {
  readonly id: number
  readonly ip: string
  send(msg: PlatformToNode): void
  close(reason: string): void
}

export interface RemoteNode {
  name: string
  region: string
  publicUrl: string
  capacity: number
  link: NodeLink | null
  draining: boolean
  connectedAt: number
  /** Desde quando está desconectado (0 = conectado). */
  lostAt: number
  lastReport: number
  rssMb: number
  load: number
}

interface PendingLink {
  link: NodeLink
  nonce: string
  node: string | null
  timer: ReturnType<typeof setTimeout> | null
}

const IDLE_STATUS: ServerStatus = { players: 0, phase: 0, tickMs: 0, alive: 0, uids: new Set() }

export class GameServerPool {
  readonly servers = new Map<string, GameServer>()
  readonly nodes = new Map<string, RemoteNode>()
  private readonly links = new Map<number, PendingLink>()
  private readonly reports = new Map<string, ServerStatus>()
  private readonly createTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private nextId = 1
  /** Prefixo deste processo: ids não se repetem entre reinícios (servidores readotados). */
  private readonly boot = randomBytes(3).toString('hex')
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly clock: () => number

  constructor(private readonly opts: PoolOptions, private readonly hooks: PoolHooks) {
    this.clock = opts.clock ?? Date.now
  }

  /** Servidores rodando neste processo. */
  get localCount(): number {
    let n = 0
    for (const s of this.servers.values()) if (s.node === 'local') n++
    return n
  }

  /** Capacidade total (local + nós conectados que aceitam partidas). */
  get capacity(): number {
    let n = this.opts.maxServers
    for (const node of this.nodes.values()) if (node.link && !node.draining) n += node.capacity
    return n
  }

  get full(): boolean {
    return this.pick(undefined) === null
  }

  get(id: string): GameServer | undefined {
    return this.servers.get(id)
  }

  byCode(code: string): GameServer | undefined {
    for (const s of this.servers.values()) if (s.code === code) return s
    return undefined
  }

  private countOn(node: string): number {
    let n = 0
    for (const s of this.servers.values()) if (s.node === node) n++
    return n
  }

  /**
   * Nó para um servidor novo; null se tudo cheio. Ordem: região pedida (o
   * local sem --region atende qualquer uma), nós remotos antes do local (que
   * fica de reserva), e o menos ocupado.
   */
  private pick(region: string | undefined): string | null {
    const options: { node: string; match: boolean; local: boolean; ratio: number }[] = []
    const local = this.localCount
    const lr = this.opts.localRegion
    if (local < this.opts.maxServers) options.push({ node: 'local', match: !lr || lr === region, local: true, ratio: local / this.opts.maxServers })
    for (const n of this.nodes.values()) {
      if (!n.link || n.draining) continue
      const used = this.countOn(n.name)
      if (used < n.capacity) options.push({ node: n.name, match: n.region === region, local: false, ratio: used / n.capacity })
    }
    if (options.length === 0) return null
    options.sort((a, b) => Number(b.match) - Number(a.match) || Number(a.local) - Number(b.local) || a.ratio - b.ratio)
    return options[0].node
  }

  private logger(id: string): HostLogger | undefined {
    const log = this.opts.logger
    return log ? { info: (m) => log.info(`[${id}] ${m}`), warn: (m) => log.warn(`[${id}] ${m}`) } : undefined
  }

  private newServer(id: string, spec: ServerSpec, region: string, node: string): GameServer {
    const now = this.clock()
    const server: GameServer = {
      id, path: `/game/${id}`, kind: spec.kind, teamSize: spec.teamSize, region, mapId: spec.mapId, node,
      url: null, host: null, ready: false, matchId: null, code: null, avgMmr: 0, createdAt: now, lastBusy: now, invited: new Set(),
      status: () => {
        const h = server.host
        if (h) return { players: h.playerCount, phase: h.phase, tickMs: h.tickMs, alive: h.sim.aliveCount, uids: h.connectedUids() }
        return this.reports.get(server.id) ?? IDLE_STATUS
      },
    }
    return server
  }

  private make(spec: ServerSpec, region: string, code: string | null): GameServer | null {
    const node = this.pick(region)
    if (!node) return null
    const id = `${this.boot}-${this.nextId++}`
    const server = this.newServer(id, spec, node === 'local' ? (this.opts.localRegion ?? region) : this.nodes.get(node)!.region, node)
    server.code = code
    this.servers.set(id, server)
    if (node === 'local') {
      server.host = createGameHost(spec, { id, secret: this.opts.secret, clock: this.clock, logger: this.logger(id), mapFactory: this.opts.mapFactory }, {
        onResult: (r) => this.hooks.onResult(server, r),
        onMatchEnd: (m) => this.hooks.onMatchEnd(server, m),
        onFinished: () => this.release(id, 'partida encerrada'),
      })
      server.ready = true
      if (this.opts.autoStart !== false) server.host.start()
    } else {
      const n = this.nodes.get(node)!
      server.url = `${n.publicUrl.replace(/\/$/, '')}${server.path}`
      n.link!.send({ t: 'create', id, spec, meta: this.meta(server) })
      const t = setTimeout(() => this.failCreate(id, 'o nó não respondeu a tempo'), this.opts.createTimeoutMs ?? 15_000)
      ;(t as { unref?: () => void }).unref?.()
      this.createTimers.set(id, t)
    }
    this.ensureTimer()
    return server
  }

  private baseSpec(kind: ServerKind): Pick<ServerSpec, 'mapId' | 'tickRate' | 'reconnectSeconds' | 'botDifficulty' | 'kind'> {
    return {
      kind,
      mapId: this.opts.mapId ?? MAIN_MAP_ID,
      tickRate: this.opts.tickRate ?? 30,
      reconnectSeconds: this.opts.reconnectSeconds ?? 60,
      botDifficulty: this.opts.botDifficulty ?? 'normal',
    }
  }

  /** Battle royale público para as pessoas do matchmaking (bilhetes com a equipe de cada uma). */
  createPublic(teamSize: number, region: string, humans: number, bots: number): GameServer | null {
    const spec: ServerSpec = {
      ...this.baseSpec('publico'), serverName: 'Partida pública', teamSize, bots, expected: humans, lobby: false,
      br: { warmup: 25, endDelay: 12, ...this.opts.publicBr },
    }
    return this.make(spec, region, null)
  }

  /** Sala privada com código: sala de espera, só para quem tem bilhete. */
  createRoom(code: string, region: string, ownerUid?: string): GameServer | null {
    const spec: ServerSpec = {
      ...this.baseSpec('privado'), serverName: `Sala ${code}`, teamSize: 1, bots: 10, expected: 0, lobby: true, ownerUid,
      br: { endDelay: 10, ...this.opts.publicBr },
    }
    return this.make(spec, region, code)
  }

  private meta(s: GameServer): ServerMeta {
    return { kind: s.kind, region: s.region, teamSize: s.teamSize, code: s.code, matchId: s.matchId, avgMmr: s.avgMmr }
  }

  /** A plataforma mudou dados do servidor (partida na base, habilidade): o nó guarda para uma readoção. */
  updateMeta(s: GameServer): void {
    if (s.node === 'local') return
    this.nodes.get(s.node)?.link?.send({ t: 'meta', id: s.id, meta: this.meta(s) })
  }

  /** Encerra um servidor (fim da partida, vazio por muito tempo, plataforma desligando). */
  release(id: string, why: string): void {
    const s = this.servers.get(id)
    if (!s) return
    this.servers.delete(id)
    this.reports.delete(id)
    const t = this.createTimers.get(id)
    if (t) clearTimeout(t)
    this.createTimers.delete(id)
    this.opts.logger?.info(`[${id}] encerrado: ${why}${s.node !== 'local' ? ` (nó ${s.node})` : ''}`)
    if (s.host) s.host.shutdown()
    else this.nodes.get(s.node)?.link?.send({ t: 'release', id, why })
    if (!s.ready) this.hooks.onReady?.(s, why)
    this.hooks.onReleased(s)
  }

  private failCreate(id: string, why: string): void {
    const s = this.servers.get(id)
    if (!s || s.ready) return
    this.opts.logger?.warn(`[${id}] nó ${s.node} não criou o servidor: ${why}`)
    this.release(id, `falha ao criar: ${why}`)
  }

  /** Conta conectada em algum servidor (presença dos amigos). */
  whereIs(uid: number): GameServer | null {
    const key = String(uid)
    for (const s of this.servers.values()) if (s.status().uids.has(key)) return s
    return null
  }

  private ensureTimer(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.sweep(), 5000)
    ;(this.timer as { unref?: () => void }).unref?.()
  }

  /** Fecha salas vazias, partidas públicas que ninguém abriu e servidores de nós que não voltaram. */
  sweep(): void {
    const now = this.clock()
    for (const s of [...this.servers.values()]) {
      if (s.status().players > 0 || !s.ready) {
        s.lastBusy = now
        continue
      }
      const idle = now - s.lastBusy
      if (s.kind === 'privado' && idle > (this.opts.roomIdleMs ?? 120_000)) this.release(s.id, 'sala vazia')
      else if (s.kind === 'publico' && idle > (this.opts.publicIdleMs ?? 90_000)) this.release(s.id, 'ninguém conectado')
    }
    const grace = this.opts.nodeGraceMs ?? 60_000
    for (const n of [...this.nodes.values()]) {
      if (n.link || now - n.lostAt < grace) continue
      this.nodes.delete(n.name)
      this.opts.logger?.warn(`nó ${n.name} não voltou: partidas dele encerradas`)
      for (const s of [...this.servers.values()]) if (s.node === n.name) this.release(s.id, `nó ${n.name} perdido`)
    }
  }

  close(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    // servidores remotos continuam no nó (a plataforma pode voltar e readotá-los)
    for (const s of [...this.servers.values()]) {
      if (s.node === 'local') this.release(s.id, 'plataforma encerrada')
      else this.servers.delete(s.id)
    }
    for (const t of this.createTimers.values()) clearTimeout(t)
    this.createTimers.clear()
    for (const p of this.links.values()) {
      if (p.timer) clearTimeout(p.timer)
      p.link.close('plataforma encerrada')
    }
    this.links.clear()
  }

  // ---- nós remotos ------------------------------------------------------------------

  /** Conexão nova em /nodes: desafio e prazo para o hello. */
  openNode(link: NodeLink): void {
    const nonce = randomBytes(18).toString('base64url')
    const timer = setTimeout(() => {
      this.opts.logger?.warn(`nó em ${link.ip} não se apresentou a tempo`)
      link.close('sem hello')
      this.links.delete(link.id)
    }, 10_000)
    ;(timer as { unref?: () => void }).unref?.()
    this.links.set(link.id, { link, nonce, node: null, timer })
    link.send({ t: 'challenge', nonce, protocol: NODE_PROTOCOL })
  }

  closeNode(linkId: number): void {
    const p = this.links.get(linkId)
    if (!p) return
    this.links.delete(linkId)
    if (p.timer) clearTimeout(p.timer)
    const n = p.node ? this.nodes.get(p.node) : undefined
    if (!n || n.link !== p.link) return
    n.link = null
    n.lostAt = this.clock()
    this.opts.logger?.warn(`nó ${n.name} desconectado (espera a volta por ${Math.round((this.opts.nodeGraceMs ?? 60_000) / 1000)} s)`)
    // servidores que ainda não tinham sido criados não vão ser
    for (const s of [...this.servers.values()]) if (s.node === n.name && !s.ready) this.failCreate(s.id, 'nó desconectado')
  }

  private reject(p: PendingLink, why: string): void {
    this.opts.logger?.warn(`nó recusado (${p.link.ip}): ${why}`)
    p.link.send({ t: 'error', message: why })
    p.link.close(why)
    this.closeNode(p.link.id)
  }

  /** Mensagem de um nó. Nada vindo do nó passa sem conferência de tipo. */
  nodeMessage(linkId: number, raw: string): void {
    const p = this.links.get(linkId)
    if (!p) return
    let m: NodeToPlatform
    try {
      m = JSON.parse(raw) as NodeToPlatform
    } catch {
      return this.reject(p, 'JSON inválido')
    }
    if (typeof m !== 'object' || m === null || typeof m.t !== 'string') return this.reject(p, 'mensagem sem tipo')
    if (m.t === 'hello') return this.hello(p, m)
    const node = p.node ? this.nodes.get(p.node) : undefined
    if (!node || node.link !== p.link) return this.reject(p, 'apresente-se primeiro (hello)')
    const mine = (id: unknown): GameServer | null => {
      const s = typeof id === 'string' ? this.servers.get(id) : undefined
      return s && s.node === node.name ? s : null
    }
    switch (m.t) {
      case 'created': {
        const s = mine(m.id)
        if (!s || s.ready) return
        const t = this.createTimers.get(s.id)
        if (t) clearTimeout(t)
        this.createTimers.delete(s.id)
        s.ready = true
        s.lastBusy = this.clock()
        this.hooks.onReady?.(s, null)
        return
      }
      case 'createFailed': {
        const s = mine(m.id)
        if (s) this.failCreate(s.id, String(m.message).slice(0, 200))
        return
      }
      case 'report': {
        if (!Array.isArray(m.servers)) return
        node.lastReport = this.clock()
        node.rssMb = Number(m.rssMb) || 0
        node.load = Number(m.load) || 0
        for (const r of m.servers) {
          const s = mine(r?.id)
          if (s) this.applyReport(s, r)
        }
        return
      }
      case 'result': {
        const s = mine(m.id)
        if (s && m.result && typeof m.result === 'object') this.hooks.onResult(s, m.result)
        return
      }
      case 'matchEnd': {
        const s = mine(m.id)
        if (s && m.summary && typeof m.summary === 'object') this.hooks.onMatchEnd(s, m.summary)
        return
      }
      case 'finished': {
        const s = mine(m.id)
        if (s) this.release(s.id, 'partida encerrada')
        return
      }
      case 'drain':
        if (!node.draining) this.opts.logger?.info(`nó ${node.name} em desligamento: sem partidas novas`)
        node.draining = true
        return
      default:
        return this.reject(p, 'mensagem desconhecida')
    }
  }

  private applyReport(s: GameServer, r: ServerReport): void {
    const uids = new Set(Array.isArray(r.uids) ? r.uids.filter((u): u is string => typeof u === 'string').slice(0, 200) : [])
    this.reports.set(s.id, { players: Number(r.players) || 0, phase: Number(r.phase) || 0, tickMs: Number(r.tickMs) || 0, alive: Number(r.alive) || 0, uids })
    // o nó só aceita quem traz bilhete assinado por esta plataforma para este servidor
    for (const u of uids) if (/^\d+$/.test(u)) s.invited.add(Number(u))
  }

  private hello(p: PendingLink, m: Extract<NodeToPlatform, { t: 'hello' }>): void {
    if (p.node) return this.reject(p, 'hello repetido')
    if (m.nodeProtocol !== NODE_PROTOCOL) return this.reject(p, `protocolo de nó ${m.nodeProtocol}; a plataforma usa ${NODE_PROTOCOL}`)
    if (m.gameProtocol !== PROTOCOL_VERSION) return this.reject(p, `protocolo de jogo ${m.gameProtocol}; a plataforma usa ${PROTOCOL_VERSION} (atualize o nó)`)
    if (!validNodeName(m.name)) return this.reject(p, 'nome de nó inválido')
    if (!checkNodeProof(this.opts.secret, p.nonce, m.name, m.proof)) return this.reject(p, 'segredo incorreto')
    if (!validPublicUrl(m.publicUrl)) return this.reject(p, 'endereço público inválido (use ws://host:porta ou wss://host[/prefixo])')
    const capacity = Number.isInteger(m.capacity) && m.capacity >= 0 && m.capacity <= 256 ? m.capacity : -1
    if (capacity < 0) return this.reject(p, 'capacidade inválida')
    const prev = this.nodes.get(m.name)
    if (prev?.link) {
      // mesma máquina reconectando antes de a conexão velha cair
      prev.link.close('substituído por uma conexão nova')
      const old = [...this.links.values()].find((x) => x.link === prev.link)
      if (old) this.links.delete(old.link.id)
    }
    if (p.timer) clearTimeout(p.timer)
    p.timer = null
    p.node = m.name
    const now = this.clock()
    const node: RemoteNode = {
      name: m.name, region: typeof m.region === 'string' ? m.region.slice(0, 8) : '', publicUrl: m.publicUrl, capacity, link: p.link, draining: false,
      connectedAt: now, lostAt: 0, lastReport: now, rssMb: 0, load: 0,
    }
    this.nodes.set(m.name, node)
    p.link.send({ t: 'welcome', node: m.name })
    this.opts.logger?.info(`nó ${m.name} conectado (${p.link.ip}, região ${node.region || '—'}, ${capacity} servidores, ${m.publicUrl})`)
    // servidores que o nó ainda roda: readota os conhecidos e os de antes de um reinício; os outros, encerra
    const running = Array.isArray(m.servers) ? m.servers : []
    const seen = new Set<string>()
    for (const r of running) {
      if (typeof r?.id !== 'string' || !/^[0-9a-f]{6}-\d{1,9}$/.test(r.id)) continue
      seen.add(r.id)
      const known = this.servers.get(r.id)
      if (known) {
        if (known.node !== m.name) {
          p.link.send({ t: 'release', id: r.id, why: 'servidor pertence a outro nó' })
          continue
        }
        if (r.report) this.applyReport(known, r.report)
        if (!known.ready) {
          known.ready = true
          this.hooks.onReady?.(known, null)
        }
        continue
      }
      if (!validSpec(r.spec) || typeof r.meta !== 'object' || r.meta === null) {
        p.link.send({ t: 'release', id: r.id, why: 'servidor desconhecido' })
        continue
      }
      const meta = r.meta
      const s = this.newServer(r.id, r.spec, typeof meta.region === 'string' ? meta.region.slice(0, 8) : node.region, m.name)
      s.url = `${node.publicUrl.replace(/\/$/, '')}${s.path}`
      s.ready = true
      s.code = typeof meta.code === 'string' && meta.code.length <= 16 ? meta.code : null
      s.matchId = s.kind === 'publico' && Number.isInteger(meta.matchId) ? meta.matchId : null
      s.avgMmr = Number(meta.avgMmr) || 0
      this.servers.set(s.id, s)
      if (r.report) this.applyReport(s, r.report)
      this.opts.logger?.info(`[${s.id}] readotado do nó ${m.name}`)
      this.hooks.onAdopted?.(s)
    }
    // os que a plataforma achava que estavam no nó e ele não tem mais
    for (const s of [...this.servers.values()]) {
      if (s.node === m.name && s.ready && !seen.has(s.id)) this.release(s.id, 'o nó não tem mais este servidor')
    }
    this.ensureTimer()
  }
}
