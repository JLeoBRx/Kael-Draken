import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { networkInterfaces } from 'node:os'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { WebSocket, WebSocketServer, type RawData } from 'ws'
import { GameHost, type HostConnection, type HostLogger, type HostOptions } from '../core/game-host'
import { LanDiscovery, type DiscoveryOptions } from './discovery'

/**
 * Servidor dedicado / host de LAN.
 *
 * - HTTP: serve o cliente compilado (dist/client) e /api/info (estado do servidor).
 * - WebSocket em /ws: protocolo binário do jogo.
 *
 * Em LAN, os outros computadores abrem http://IP-DO-HOST:PORTA no navegador.
 * Online, o mesmo processo roda como servidor dedicado (atrás de TLS/wss).
 */

export interface ServerOptions {
  port: number
  host: string
  mapId: string
  maxPlayers: number
  tickRate: number
  name: string
  /** Pasta do cliente compilado; null para não servir arquivos. */
  staticDir: string | null
  logger?: HostLogger
  /** Modo de jogo, bots e regras do battle royale (repassados ao GameHost). */
  match?: Pick<HostOptions, 'mode' | 'bots' | 'botDifficulty' | 'br' | 'autoRestart' | 'lobby' | 'teamSize' | 'friendlyFire' | 'reconnectSeconds'>
  /** Anunciar/descobrir partidas na rede local (UDP). Padrão: desligado. */
  discovery?: boolean | Omit<DiscoveryOptions, 'httpPort' | 'info'>
}

export interface RunningServer {
  port: number
  host: GameHost
  discovery: LanDiscovery | null
  lanAddresses: string[]
  close(): Promise<void>
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm',
  '.ico': 'image/x-icon',
}

export const consoleLogger: HostLogger = {
  info: (m) => console.log(`[servidor] ${m}`),
  warn: (m) => console.warn(`[servidor] ${m}`),
}

export function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal) out.push(a.address)
  }
  return out
}

export function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', 'http://localhost')
  let rel = decodeURIComponent(url.pathname)
  if (rel.endsWith('/')) rel += 'index.html'
  const file = resolve(root, normalize('.' + rel))
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end('Proibido')
    return
  }
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Não encontrado')
    return
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  createReadStream(file).pipe(res)
}

function toBytes(data: RawData): Uint8Array {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) return new Uint8Array(Buffer.concat(data))
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

/** Opções do WebSocket dos servidores de jogo (mensagens pequenas, sem compressão por mensagem). */
export const GAME_SOCKET_OPTIONS = { noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false } as const

/**
 * Liga um WebSocket já aceito a um GameHost: mensagens binárias entram na
 * simulação; o fechamento com código 1000 (saída pelo menu) tira o jogador
 * na hora, outros códigos (queda, aba fechada) deixam o personagem esperando.
 */
export function bindGameSocket(ws: WebSocket, host: GameHost, connId: number, log: HostLogger, onClose?: () => void): HostConnection {
  const conn: HostConnection = {
    id: connId,
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    },
    close: (reason) => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(1000, reason.slice(0, 120))
    },
  }
  ws.binaryType = 'arraybuffer'
  host.connect(conn)
  ws.on('message', (data, isBinary) => {
    if (!isBinary) {
      conn.close('Somente mensagens binárias')
      return
    }
    host.receive(conn.id, toBytes(data))
  })
  ws.on('close', (code) => {
    host.disconnect(conn.id, code === 1000)
    onClose?.()
  })
  ws.on('error', (err) => log.warn(`conexão ${conn.id}: ${err.message}`))
  return conn
}

export async function startServer(opts: ServerOptions): Promise<RunningServer> {
  const log = opts.logger ?? consoleLogger
  const host = new GameHost({
    mapId: opts.mapId,
    tickRate: opts.tickRate,
    maxPlayers: opts.maxPlayers,
    serverName: opts.name,
    logger: log,
    ...opts.match,
  })
  const staticRoot = opts.staticDir ? resolve(opts.staticDir) : null
  if (staticRoot && !existsSync(join(staticRoot, 'index.html'))) {
    log.warn(`cliente não encontrado em ${staticRoot} — rode "npm run build" para servir o jogo por este endereço`)
  }

  const http = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    if (path === '/api/info') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' })
      res.end(JSON.stringify({ ...host.info(), tickMs: Number(host.tickMs.toFixed(3)) }))
      return
    }
    if (path === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ ok: true, players: host.playerCount, phase: host.phase, tickMs: Number(host.tickMs.toFixed(3)) }))
      return
    }
    if (path === '/api/lan') {
      // partidas encontradas na rede local (este servidor + os anunciados)
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' })
      res.end(JSON.stringify({ self: { ...host.info(), port: boundPort, addresses: lanAddresses() }, servers: discovery?.list() ?? [], discovery: !!discovery }))
      return
    }
    if (staticRoot && existsSync(staticRoot)) {
      serveStatic(staticRoot, req, res)
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Servidor de jogo ativo. Cliente não compilado (npm run build).')
  })

  const wss = new WebSocketServer(GAME_SOCKET_OPTIONS)
  let nextConnId = 1
  http.on('upgrade', (req, socket, head) => {
    const path = (req.url ?? '').split('?')[0]
    if (path !== '/ws') {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      bindGameSocket(ws, host, nextConnId++, log)
    })
  })

  let discovery: LanDiscovery | null = null
  let boundPort = 0
  await new Promise<void>((ok, fail) => {
    http.once('error', fail)
    http.listen(opts.port, opts.host, () => ok())
  })
  host.start()
  const port = (http.address() as AddressInfo).port
  boundPort = port
  if (opts.discovery) {
    const extra = typeof opts.discovery === 'object' ? opts.discovery : {}
    const d = new LanDiscovery({ ...extra, httpPort: port, info: () => host.info(), onWarn: (m) => log.warn(m) })
    if (await d.start()) discovery = d
  }

  return {
    port,
    host,
    discovery,
    lanAddresses: lanAddresses(),
    close: () =>
      new Promise<void>((ok) => {
        discovery?.close()
        host.stop()
        for (const client of wss.clients) client.terminate()
        wss.close()
        http.close(() => ok())
      }),
  }
}
