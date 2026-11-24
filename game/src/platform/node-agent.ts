import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { loadavg } from 'node:os'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import type { GameHost, HostLogger } from '../server/core/game-host'
import { GAME_SOCKET_OPTIONS, bindGameSocket, consoleLogger } from '../server/node/server'
import type { GameMap } from '../shared/maps/types'
import { PROTOCOL_VERSION } from '../shared/net/protocol'
import { createGameHost, validSpec, type ServerSpec } from './game-spec'
import { Metrics } from './metrics'
import { NODE_PROTOCOL, nodeProof, type NodeToPlatform, type PlatformToNode, type RunningServer, type ServerMeta, type ServerReport } from './node-protocol'
import { RateLimiter } from './rate-limit'

/**
 * Nó de servidor de jogo: processo em outra máquina que roda partidas para a
 * plataforma. Conecta em <plataforma>/nodes, prova o segredo, recebe pedidos
 * de servidor (create/release), relata a situação a cada 2 s e repassa
 * resultados e fins de partida. Os jogadores conectam direto aqui, em
 * /game/<id>, com bilhetes que a plataforma assinou.
 *
 * Se a plataforma cair, as partidas continuam; o que precisa ser contado
 * (resultados) fica guardado e é enviado quando a conexão volta. Reconecta
 * sozinho com espera crescente (1 s → 15 s).
 *
 *   GET /api/health   200 com a situação (503 durante o desligamento)
 *   GET /metrics      métricas do Prometheus
 */

export interface GameNodeOptions {
  /** Nome do nó (único entre os nós da plataforma). */
  name: string
  /** Endereço da plataforma (http(s):// ou ws(s)://; o caminho /nodes é acrescentado). */
  platformUrl: string
  secret: string
  /** Endereço que os navegadores usam para chegar aqui (ws://ip:porta ou wss://nome). */
  publicUrl: string
  region: string
  /** Servidores simultâneos. */
  capacity: number
  port: number
  host: string
  logger?: HostLogger
  trustProxy?: boolean
  maxSocketsPerIp?: number
  metricsToken?: string
  /** Intervalo dos relatórios (ms). */
  reportMs?: number
  /** Servidor sem ninguém por mais que isto fecha mesmo sem ordem da plataforma (ms). */
  orphanIdleMs?: number
  mapFactory?: (mapId: string) => GameMap
  clock?: () => number
  /** Liga o laço de ticks de cada servidor (testes desligam e chamam tick() à mão). */
  autoStart?: boolean
}

interface NodeServer {
  id: string
  spec: ServerSpec
  meta: ServerMeta
  host: GameHost
  idleSince: number
}

const ID_RE = /^[0-9a-f]{6}-\d{1,9}$/
const MAX_OUTBOX = 20_000
const HEARTBEAT_MS = 30_000

/** "http://plataforma:7370" → "ws://plataforma:7370/nodes". */
export function nodesUrl(platform: string): string {
  let v = platform.trim()
  if (/^https?:\/\//i.test(v)) v = v.replace(/^http/i, 'ws')
  if (!/^wss?:\/\//i.test(v)) v = `ws://${v}`
  const u = new URL(v)
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/nodes'
  return u.toString()
}

function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for']
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim()
    if (first) return first
  }
  return req.socket.remoteAddress ?? '?'
}

function reject(socket: Duplex, status: string): void {
  socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}

export class GameNode {
  readonly servers = new Map<string, NodeServer>()
  /** Conectado e aceito pela plataforma. */
  connected = false
  draining = false
  port = 0
  private ws: WebSocket | null = null
  private readonly outbox: NodeToPlatform[] = []
  private readonly log: HostLogger
  private readonly clock: () => number
  private readonly startedAt = Date.now()
  private http: Server | null = null
  private readonly gameWss = new WebSocketServer(GAME_SOCKET_OPTIONS)
  private reportTimer: ReturnType<typeof setInterval> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryMs = 1000
  private closed = false
  private nextConn = 1
  private lastError = ''
  /** Quantas vezes conectou (testes e métricas). */
  sessions = 0

  constructor(readonly opts: GameNodeOptions) {
    this.log = opts.logger ?? consoleLogger
    this.clock = opts.clock ?? Date.now
  }

  async start(): Promise<void> {
    const perIp = new Map<string, number>()
    const connectLimit = new RateLimiter(20, 2)
    const maxPerIp = this.opts.maxSocketsPerIp ?? 16
    const alive = new WeakMap<WebSocket, boolean>()
    this.http = createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0]
      if (path === '/api/health') {
        const ok = !this.closed
        res.writeHead(ok ? 200 : 503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify({ ok, node: this.opts.name, connected: this.connected, draining: this.draining, servers: this.servers.size, capacity: this.opts.capacity, players: this.playerCount, uptime: Math.round((Date.now() - this.startedAt) / 1000), lastError: this.lastError || undefined }))
        return
      }
      if (path === '/metrics') {
        if (this.opts.metricsToken && req.headers.authorization !== `Bearer ${this.opts.metricsToken}`) {
          res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }).end('token de métricas ausente ou incorreto')
          return
        }
        return this.metrics().send(res)
      }
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(`Nó de servidor de jogo ${this.opts.name}`)
    })
    this.http.on('upgrade', (req, socket, head) => {
      const path = (req.url ?? '').split('?')[0]
      const ip = clientIp(req, this.opts.trustProxy ?? false)
      if (!connectLimit.take(ip) || (perIp.get(ip) ?? 0) >= maxPerIp) return reject(socket, '429 Too Many Requests')
      const m = /^\/game\/([0-9a-f]{6}-\d{1,9})$/.exec(path)
      const srv = m ? this.servers.get(m[1]) : undefined
      if (!srv) return reject(socket, '404 Not Found')
      this.gameWss.handleUpgrade(req, socket, head, (ws) => {
        perIp.set(ip, (perIp.get(ip) ?? 0) + 1)
        alive.set(ws, true)
        ws.on('pong', () => alive.set(ws, true))
        ws.on('close', () => {
          const n = (perIp.get(ip) ?? 1) - 1
          if (n <= 0) perIp.delete(ip)
          else perIp.set(ip, n)
        })
        bindGameSocket(ws, srv.host, this.nextConn++, this.log)
      })
    })
    this.heartbeat = setInterval(() => {
      for (const ws of this.gameWss.clients) {
        if (alive.get(ws) === false) {
          ws.terminate()
          continue
        }
        alive.set(ws, false)
        ws.ping()
      }
      this.sweep()
    }, Math.min(HEARTBEAT_MS, 5000))
    this.heartbeat.unref()
    await new Promise<void>((ok, fail) => {
      this.http!.once('error', fail)
      this.http!.listen(this.opts.port, this.opts.host, () => ok())
    })
    this.port = (this.http.address() as AddressInfo).port
    this.reportTimer = setInterval(() => this.report(), this.opts.reportMs ?? 2000)
    this.reportTimer.unref()
    this.connect()
  }

  get playerCount(): number {
    let n = 0
    for (const s of this.servers.values()) n += s.host.playerCount
    return n
  }

  // ---- conexão com a plataforma --------------------------------------------------

  private connect(): void {
    if (this.closed) return
    const url = nodesUrl(this.opts.platformUrl)
    const ws = new WebSocket(url, { handshakeTimeout: 10_000, maxPayload: 1024 * 1024, perMessageDeflate: false })
    this.ws = ws
    ws.on('message', (data, isBinary) => {
      if (isBinary) return
      let m: PlatformToNode
      try {
        m = JSON.parse(data.toString()) as PlatformToNode
      } catch {
        return
      }
      this.onPlatform(m)
    })
    ws.on('close', (code, reason) => {
      if (this.ws !== ws) return
      this.ws = null
      const was = this.connected
      this.connected = false
      if (this.closed) return
      if (was) this.log.warn(`conexão com a plataforma caiu (${code}${reason.length ? ` ${reason.toString()}` : ''}); partidas continuam`)
      this.retryTimer = setTimeout(() => this.connect(), this.retryMs)
      this.retryTimer.unref?.()
      this.retryMs = Math.min(15_000, this.retryMs * 2)
    })
    ws.on('error', (err) => {
      if (err.message !== this.lastError) this.log.warn(`plataforma (${url}): ${err.message}`)
      this.lastError = err.message
    })
  }

  private send(m: NodeToPlatform): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m))
  }

  /** Mensagens que precisam chegar (resultados): guardadas enquanto a plataforma está fora. */
  private sendReliable(m: NodeToPlatform): void {
    if (this.connected) return this.send(m)
    if (this.outbox.length >= MAX_OUTBOX) {
      this.log.warn('fila de mensagens para a plataforma cheia: descartando a mais antiga')
      this.outbox.shift()
    }
    this.outbox.push(m)
  }

  private onPlatform(m: PlatformToNode): void {
    if (typeof m !== 'object' || m === null) return
    switch (m.t) {
      case 'challenge': {
        if (m.protocol !== NODE_PROTOCOL) this.log.warn(`plataforma usa protocolo de nó ${m.protocol}; este nó usa ${NODE_PROTOCOL}`)
        const running: RunningServer[] = [...this.servers.values()].map((s) => ({ id: s.id, spec: s.spec, meta: s.meta, report: this.reportOf(s) }))
        this.send({
          t: 'hello', name: this.opts.name, region: this.opts.region, publicUrl: this.opts.publicUrl, capacity: this.opts.capacity,
          nodeProtocol: NODE_PROTOCOL, gameProtocol: PROTOCOL_VERSION, proof: nodeProof(this.opts.secret, String(m.nonce), this.opts.name), servers: running,
        })
        return
      }
      case 'welcome': {
        this.connected = true
        this.sessions++
        this.retryMs = 1000
        this.lastError = ''
        this.log.info(`registrado na plataforma como ${m.node} (${this.servers.size} servidores rodando, ${this.outbox.length} mensagens pendentes)`)
        if (this.draining) this.send({ t: 'drain' })
        for (const msg of this.outbox.splice(0)) this.send(msg)
        this.report()
        return
      }
      case 'create':
        return this.create(m.id, m.spec, m.meta)
      case 'meta': {
        const s = this.servers.get(m.id)
        if (s && typeof m.meta === 'object' && m.meta !== null) s.meta = m.meta
        return
      }
      case 'release': {
        if (typeof m.id === 'string') this.release(m.id, String(m.why ?? 'pedido da plataforma'))
        return
      }
      case 'error':
        this.lastError = String(m.message)
        this.log.warn(`plataforma recusou o nó: ${m.message}`)
        return
    }
  }

  private create(id: unknown, spec: unknown, meta: ServerMeta): void {
    if (typeof id !== 'string' || !ID_RE.test(id)) return
    const fail = (message: string) => this.send({ t: 'createFailed', id, message })
    if (this.servers.has(id)) return this.send({ t: 'created', id })
    if (this.draining) return fail('nó em desligamento')
    if (this.servers.size >= this.opts.capacity) return fail('nó cheio')
    if (!validSpec(spec)) return fail('descrição de servidor inválida')
    let host: GameHost
    const log = this.log
    try {
      host = createGameHost(spec, { id, secret: this.opts.secret, clock: this.clock, mapFactory: this.opts.mapFactory, logger: { info: (t) => log.info(`[${id}] ${t}`), warn: (t) => log.warn(`[${id}] ${t}`) } }, {
        onResult: (result) => this.sendReliable({ t: 'result', id, result }),
        onMatchEnd: (summary) => this.sendReliable({ t: 'matchEnd', id, summary }),
        onFinished: () => this.release(id, 'partida encerrada', true),
      })
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err))
    }
    this.servers.set(id, { id, spec, meta: typeof meta === 'object' && meta !== null ? meta : { kind: spec.kind, region: this.opts.region, teamSize: spec.teamSize, code: null, matchId: null, avgMmr: 0 }, host, idleSince: this.clock() })
    if (this.opts.autoStart !== false) host.start()
    this.log.info(`[${id}] criado: ${spec.serverName}, ${spec.mapId}, equipes de ${spec.teamSize}, ${spec.bots} bots`)
    this.send({ t: 'created', id })
  }

  /** Encerra um servidor; `notify` avisa a plataforma (quando a ordem não veio dela). */
  release(id: string, why: string, notify = false): void {
    const s = this.servers.get(id)
    if (!s) return
    this.servers.delete(id)
    this.log.info(`[${id}] encerrado: ${why}`)
    s.host.shutdown()
    if (notify) this.sendReliable({ t: 'finished', id })
  }

  private reportOf(s: NodeServer): ServerReport {
    const h = s.host
    return { id: s.id, players: h.playerCount, phase: h.phase, tickMs: Number(h.tickMs.toFixed(3)), alive: h.sim.aliveCount, uids: [...h.connectedUids()] }
  }

  report(): void {
    if (!this.connected) return
    this.send({ t: 'report', servers: [...this.servers.values()].map((s) => this.reportOf(s)), rssMb: Math.round(process.memoryUsage().rss / 1048576), load: Number(loadavg()[0].toFixed(2)) })
  }

  /** Rede de segurança: servidor vazio por muito tempo fecha mesmo sem a plataforma mandar. */
  private sweep(): void {
    const now = this.clock()
    for (const s of [...this.servers.values()]) {
      if (s.host.playerCount > 0) s.idleSince = now
      else if (now - s.idleSince > (this.opts.orphanIdleMs ?? 600_000)) this.release(s.id, 'vazio há muito tempo', true)
    }
  }

  /**
   * Desligamento sem derrubar ninguém: avisa a plataforma (sem partidas
   * novas) e espera as atuais terminarem, até `timeoutMs`.
   */
  async drain(timeoutMs: number): Promise<void> {
    this.draining = true
    this.send({ t: 'drain' })
    const until = Date.now() + timeoutMs
    while (this.servers.size > 0 && Date.now() < until && !this.closed) await new Promise((ok) => setTimeout(ok, 500))
  }

  metrics(): Metrics {
    const m = new Metrics()
      .gauge('uc_node_connected', 'Conectado à plataforma', this.connected ? 1 : 0, { node: this.opts.name })
      .gauge('uc_node_draining', 'Em desligamento', this.draining ? 1 : 0, { node: this.opts.name })
      .gauge('uc_node_capacity', 'Servidores que o nó aceita', this.opts.capacity, { node: this.opts.name })
      .gauge('uc_node_servers', 'Servidores rodando', this.servers.size, { node: this.opts.name })
      .gauge('uc_node_players', 'Pessoas conectadas', this.playerCount, { node: this.opts.name })
      .gauge('uc_node_game_sockets', 'Conexões de jogo', this.gameWss.clients.size, { node: this.opts.name })
      .gauge('uc_node_outbox', 'Mensagens esperando a plataforma', this.outbox.length, { node: this.opts.name })
      .counter('uc_node_sessions_total', 'Vezes que se registrou na plataforma', this.sessions, { node: this.opts.name })
    for (const s of this.servers.values()) m.gauge('uc_server_tick_ms', 'Duração média do tick por servidor (ms)', s.host.tickMs, { server: s.id, node: this.opts.name, kind: s.spec.kind })
    return m.process(this.startedAt)
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.reportTimer) clearInterval(this.reportTimer)
    if (this.heartbeat) clearInterval(this.heartbeat)
    for (const id of [...this.servers.keys()]) this.release(id, 'nó encerrado', true)
    const ws = this.ws
    this.ws = null
    this.connected = false
    ws?.close(1000, 'nó encerrado')
    for (const c of this.gameWss.clients) c.terminate()
    this.gameWss.close()
    await new Promise<void>((ok) => (this.http ? this.http.close(() => ok()) : ok()))
  }
}
