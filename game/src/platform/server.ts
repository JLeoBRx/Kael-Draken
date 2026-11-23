import { existsSync } from 'node:fs'
import { createServer, type IncomingMessage } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, resolve } from 'node:path'
import type { Duplex } from 'node:stream'
import { WebSocket, WebSocketServer } from 'ws'
import type { HostLogger } from '../server/core/game-host'
import { GAME_SOCKET_OPTIONS, bindGameSocket, consoleLogger, lanAddresses, serveStatic } from '../server/node/server'
import { PROTOCOL_VERSION } from '../shared/net/protocol'
import { PLATFORM_VERSION, type ServerMessage } from '../shared/platform/messages'
import { RateLimiter } from './rate-limit'
import { PlatformService, type PlatformOptions } from './service'
import { PlatformStore } from './store'
import { newSecret } from './tickets'

/**
 * Processo da plataforma online: um único endereço HTTP para tudo.
 *
 *   /                  cliente compilado (dist/client)
 *   /api/online/status situação (pessoas online, na fila, servidores)
 *   /api/online/leaderboard
 *   /platform          WebSocket JSON (conta, amigos, grupo, fila, salas)
 *   /game/<id>         WebSocket binário de um servidor de jogo alocado
 *
 * Em produção fica atrás de um proxy com TLS (wss://). Com `trustProxy`, o
 * IP do cliente vem de X-Forwarded-For (limites por IP).
 */

export interface PlatformServerOptions {
  port: number
  host: string
  /** Arquivo do banco SQLite (':memory:' para testes). */
  dbPath: string
  /** Segredo dos bilhetes (gera um aleatório se vazio). */
  secret?: string
  staticDir: string | null
  logger?: HostLogger
  trustProxy?: boolean
  /** Conexões WebSocket simultâneas por IP. */
  maxSocketsPerIp?: number
  service?: Omit<PlatformOptions, 'store' | 'secret' | 'logger'>
}

export interface RunningPlatform {
  port: number
  service: PlatformService
  store: PlatformStore
  lanAddresses: string[]
  close(): Promise<void>
}

const HEARTBEAT_MS = 30_000

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

export async function startPlatform(opts: PlatformServerOptions): Promise<RunningPlatform> {
  const log = opts.logger ?? consoleLogger
  const store = new PlatformStore(opts.dbPath)
  const service = new PlatformService({ ...opts.service, store, secret: opts.secret || newSecret(), logger: log })
  const staticRoot = opts.staticDir ? resolve(opts.staticDir) : null
  if (staticRoot && !existsSync(join(staticRoot, 'index.html'))) log.warn(`cliente não encontrado em ${staticRoot} — rode "npm run build"`)

  const http = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    const json = (body: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    if (path === '/api/online/status') return json({ platform: true, version: PLATFORM_VERSION, protocol: PROTOCOL_VERSION, regions: service.regions, ...service.status() })
    if (path === '/api/online/leaderboard') return json(store.leaderboard())
    if (path === '/api/info') return json({ platform: true, version: PLATFORM_VERSION, protocol: PROTOCOL_VERSION })
    if (staticRoot && existsSync(staticRoot)) return serveStatic(staticRoot, req, res)
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Plataforma ativa. Cliente não compilado (npm run build).')
  })

  const platformWss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024, perMessageDeflate: false })
  const gameWss = new WebSocketServer(GAME_SOCKET_OPTIONS)
  const perIp = new Map<string, number>()
  const connectLimit = new RateLimiter(20, 2)
  const maxPerIp = opts.maxSocketsPerIp ?? 16
  let nextLink = 1
  let nextGameConn = 1
  const alive = new WeakMap<WebSocket, boolean>()

  const track = (ws: WebSocket, ip: string) => {
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1)
    alive.set(ws, true)
    ws.on('pong', () => alive.set(ws, true))
    ws.on('close', () => {
      const n = (perIp.get(ip) ?? 1) - 1
      if (n <= 0) perIp.delete(ip)
      else perIp.set(ip, n)
    })
  }

  http.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0]
    const ip = clientIp(req, opts.trustProxy ?? false)
    if (!connectLimit.take(ip)) {
      store.audit('conexao-limitada', null, ip, path)
      return reject(socket, '429 Too Many Requests')
    }
    if ((perIp.get(ip) ?? 0) >= maxPerIp) {
      store.audit('conexoes-demais', null, ip, path)
      return reject(socket, '429 Too Many Requests')
    }
    if (path === '/platform') {
      platformWss.handleUpgrade(req, socket, head, (ws) => {
        track(ws, ip)
        const id = nextLink++
        service.open({
          id, ip,
          send: (msg: ServerMessage) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
          },
          close: (reason) => {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000, reason.slice(0, 120))
          },
        })
        ws.on('message', (data, isBinary) => {
          if (isBinary) {
            ws.close(1003, 'Somente texto')
            return
          }
          service.message(id, data.toString())
        })
        ws.on('close', () => service.closeLink(id))
        ws.on('error', (err) => log.warn(`plataforma ${id}: ${err.message}`))
      })
      return
    }
    const m = /^\/game\/(s\d+)$/.exec(path)
    const server = m ? service.pool.get(m[1]) : undefined
    if (!server) return reject(socket, '404 Not Found')
    gameWss.handleUpgrade(req, socket, head, (ws) => {
      track(ws, ip)
      bindGameSocket(ws, server.host, nextGameConn++, log)
    })
  })

  // conexões mortas (sem resposta ao ping) são derrubadas
  const heartbeat = setInterval(() => {
    for (const wss of [platformWss, gameWss]) {
      for (const ws of wss.clients) {
        if (alive.get(ws) === false) {
          ws.terminate()
          continue
        }
        alive.set(ws, false)
        ws.ping()
      }
    }
  }, HEARTBEAT_MS)
  heartbeat.unref()

  await new Promise<void>((ok, fail) => {
    http.once('error', fail)
    http.listen(opts.port, opts.host, () => ok())
  })
  const port = (http.address() as AddressInfo).port
  return {
    port,
    service,
    store,
    lanAddresses: lanAddresses(),
    close: () =>
      new Promise<void>((ok) => {
        clearInterval(heartbeat)
        service.close()
        for (const wss of [platformWss, gameWss]) {
          for (const c of wss.clients) c.terminate()
          wss.close()
        }
        http.close(() => {
          store.close()
          ok()
        })
      }),
  }
}
