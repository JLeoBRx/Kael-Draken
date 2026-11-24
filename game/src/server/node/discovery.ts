import { createSocket, type Socket } from 'node:dgram'
import type { HostInfo } from '../core/game-host'

/**
 * Descoberta de partidas na rede local.
 *
 * Navegadores não escutam UDP; por isso cada servidor (host de LAN ou
 * dedicado) faz as duas pontas: anuncia-se por broadcast UDP a cada 2 s e
 * escuta os anúncios dos outros. A lista fica em `/api/lan` — a página
 * servida por qualquer host da rede mostra todas as partidas encontradas.
 */

export const DISCOVERY_PORT = 7351
const MAGIC = 'ultima-chama'
const EXPIRE_MS = 7000

export interface LanServer {
  /** IP de quem anunciou (como chegou o pacote). */
  address: string
  port: number
  name: string
  mapName: string
  players: number
  bots: number
  maxPlayers: number
  mode: number
  lobby: boolean
  running: boolean
  teamSize: number
  version: number
  /** ms desde o último anúncio */
  age: number
}

export interface DiscoveryOptions {
  /** Porta HTTP/WebSocket deste servidor (vai no anúncio). */
  httpPort: number
  /** Situação anunciada; null = só escuta (o aplicativo de computador procurando partidas). */
  info: (() => HostInfo) | null
  /** Porta UDP em que escuta. */
  listenPort?: number
  /** Para onde anuncia (padrão: broadcast na porta de descoberta). */
  announceTo?: { host: string; port: number }[]
  intervalMs?: number
  onWarn?: (message: string) => void
}

interface Seen extends Omit<LanServer, 'age'> {
  at: number
}

export class LanDiscovery {
  private socket: Socket | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private readonly seen = new Map<string, Seen>()
  /** Identifica os próprios anúncios (para não listar a si mesmo). */
  private readonly id = Math.random().toString(36).slice(2, 10)

  constructor(private readonly opts: DiscoveryOptions) {}

  /** Começa a ouvir e anunciar. Falhas (porta ocupada, rede sem broadcast) só desligam a descoberta. */
  start(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = createSocket({ type: 'udp4', reuseAddr: true })
      let settled = false
      const fail = (err: Error) => {
        this.opts.onWarn?.(`descoberta na rede desligada: ${err.message}`)
        socket.close()
        this.socket = null
        if (!settled) {
          settled = true
          resolve(false)
        }
      }
      socket.on('error', fail)
      socket.on('message', (buf, rinfo) => this.receive(buf, rinfo.address))
      socket.bind(this.opts.listenPort ?? DISCOVERY_PORT, () => {
        try {
          socket.setBroadcast(true)
        } catch (err) {
          fail(err as Error)
          return
        }
        this.socket = socket
        this.announce()
        this.timer = setInterval(() => this.announce(), this.opts.intervalMs ?? 2000)
        ;(this.timer as { unref?: () => void }).unref?.()
        settled = true
        resolve(true)
      })
    })
  }

  private announce(): void {
    const s = this.socket
    if (!s || !this.opts.info) return
    const i = this.opts.info()
    const msg = Buffer.from(JSON.stringify({
      app: MAGIC, id: this.id, port: this.opts.httpPort, name: i.name, mapName: i.mapName, players: i.players, bots: i.bots,
      maxPlayers: i.maxPlayers, mode: i.mode, lobby: i.lobby, running: i.running, teamSize: i.teamSize, version: i.version,
    }))
    const targets = this.opts.announceTo ?? [{ host: '255.255.255.255', port: DISCOVERY_PORT }]
    for (const t of targets) s.send(msg, t.port, t.host, () => {})
  }

  private receive(buf: Buffer, address: string): void {
    if (buf.length > 2048) return
    let m: Record<string, unknown>
    try {
      m = JSON.parse(buf.toString('utf8')) as Record<string, unknown>
    } catch {
      return
    }
    if (m.app !== MAGIC || m.id === this.id || typeof m.port !== 'number') return
    const str = (v: unknown, max = 40) => (typeof v === 'string' ? v.slice(0, max) : '')
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    this.seen.set(`${address}:${m.port}`, {
      address, port: m.port, name: str(m.name), mapName: str(m.mapName), players: num(m.players), bots: num(m.bots),
      maxPlayers: num(m.maxPlayers), mode: num(m.mode), lobby: m.lobby === true, running: m.running === true,
      teamSize: num(m.teamSize) || 1, version: num(m.version), at: Date.now(),
    })
  }

  /** Partidas vistas nos últimos segundos. */
  list(): LanServer[] {
    const now = Date.now()
    const out: LanServer[] = []
    for (const [key, s] of this.seen) {
      if (now - s.at > EXPIRE_MS) {
        this.seen.delete(key)
        continue
      }
      const { at, ...rest } = s
      out.push({ ...rest, age: now - at })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  close(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.socket?.close()
    this.socket = null
  }
}
