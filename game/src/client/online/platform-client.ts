import {
  PLATFORM_VERSION,
  type ChallengeProgress,
  type ClientRequest,
  type FriendEntry,
  type FriendRequest,
  type MatchTicket,
  type MyProfile,
  type PartyState,
  type QueueState,
  type RegionInfo,
  type ServerMessage,
  type ServerPush,
} from '../../shared/platform/messages'

/**
 * Conexão do navegador com a plataforma online (/platform, JSON). Mantém um
 * espelho do estado (perfil, amigos, grupo, fila, desafios) atualizado pelas
 * mensagens do servidor; as telas só leem `state` e chamam `request`.
 */

export interface OnlineState {
  session: string
  me: MyProfile
  friends: FriendEntry[]
  requests: FriendRequest[]
  party: PartyState | null
  queue: QueueState | null
  challenges: ChallengeProgress[]
  regions: RegionInfo[]
  online: number
  match: MatchTicket | null
}

/** "meu-servidor.com:7370" / "" (esta página) → base http(s) e ws(s). */
export function platformUrls(address: string, page: Location | null = typeof location !== 'undefined' ? location : null): { http: string; ws: string } {
  let v = address.trim()
  if (!v) {
    if (!page || page.protocol === 'file:') v = 'http://localhost:7370'
    else v = `${page.protocol}//${page.host}`
  }
  if (/^wss?:\/\//i.test(v)) v = v.replace(/^ws/i, 'http')
  if (!/^https?:\/\//i.test(v)) v = `http://${v}`
  const url = new URL(v)
  const http = `${url.protocol}//${url.host}`
  return { http, ws: `${url.protocol === 'https:' ? 'wss' : 'ws'}://${url.host}` }
}

export class PlatformClient {
  state: OnlineState | null = null
  /** Mensagem empurrada pelo servidor (depois de aplicada a `state`). */
  onPush: ((m: ServerPush) => void) | null = null
  /** A conexão caiu ou foi fechada (motivo). */
  onClose: ((reason: string, kicked: boolean) => void) | null = null
  private ws: WebSocket | null = null
  private rid = 1
  private readonly pending = new Map<number, { ok: (v: unknown) => void; fail: (e: Error) => void }>()
  private welcomeWaiter: ((s: OnlineState) => void) | null = null
  private kicked = false
  private pingTimer: ReturnType<typeof setInterval> | null = null

  constructor(readonly wsBase: string) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  connect(timeoutMs = 8000): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${this.wsBase}/platform`
      let ws: WebSocket
      try {
        ws = new WebSocket(url)
      } catch {
        reject(new Error(`Endereço inválido: ${url}`))
        return
      }
      this.ws = ws
      let opened = false
      const timer = setTimeout(() => {
        if (opened) return
        ws.close()
        reject(new Error('A plataforma não respondeu (tempo esgotado)'))
      }, timeoutMs)
      ws.onopen = () => {
        opened = true
        clearTimeout(timer)
        this.pingTimer = setInterval(() => void this.request({ t: 'ping' }).catch(() => {}), 20_000)
        resolve()
      }
      ws.onerror = () => {
        if (opened) return
        clearTimeout(timer)
        reject(new Error('Não foi possível conectar à plataforma online neste endereço'))
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return
        let m: ServerMessage
        try {
          m = JSON.parse(ev.data) as ServerMessage
        } catch (err) {
          console.error('Mensagem inválida da plataforma', err)
          return
        }
        this.receive(m)
      }
      ws.onclose = (ev) => {
        clearTimeout(timer)
        if (this.pingTimer) clearInterval(this.pingTimer)
        this.pingTimer = null
        this.ws = null
        const reason = ev.reason || (opened ? 'Conexão com a plataforma perdida' : 'Não foi possível conectar à plataforma')
        for (const p of this.pending.values()) p.fail(new Error(reason))
        this.pending.clear()
        if (opened) this.onClose?.(reason, this.kicked)
      }
    })
  }

  /** Entra pelo nome (ou volta pela sessão salva) e espera o estado inicial. */
  async login(how: { name: string } | { session: string }): Promise<OnlineState> {
    const welcome = new Promise<OnlineState>((ok) => (this.welcomeWaiter = ok))
    if ('name' in how) await this.request({ t: 'login', name: how.name, version: PLATFORM_VERSION })
    else await this.request({ t: 'resume', session: how.session, version: PLATFORM_VERSION })
    return welcome
  }

  request<T = unknown>(m: ClientRequest): Promise<T> {
    return new Promise((ok, fail) => {
      const ws = this.ws
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        fail(new Error('Sem conexão com a plataforma'))
        return
      }
      const rid = this.rid++
      this.pending.set(rid, { ok: ok as (v: unknown) => void, fail })
      ws.send(JSON.stringify({ ...m, rid }))
    })
  }

  close(): void {
    this.onClose = null
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    this.ws?.close(1000, 'saiu')
    this.ws = null
  }

  private receive(m: ServerMessage): void {
    if (m.t === 'ok' || m.t === 'error') {
      const p = m.rid !== undefined ? this.pending.get(m.rid) : undefined
      if (p) {
        this.pending.delete(m.rid!)
        if (m.t === 'ok') p.ok(m.data)
        else p.fail(new Error(m.message))
      } else if (m.t === 'error') this.onPush?.({ t: 'notice', text: m.message, level: 'error' })
      return
    }
    const st = this.state
    switch (m.t) {
      case 'welcome': {
        const { t: _t, created: _c, ...rest } = m
        this.state = rest
        this.welcomeWaiter?.(this.state)
        this.welcomeWaiter = null
        break
      }
      case 'me':
        if (st) st.me = m.me
        break
      case 'friends':
        if (st) {
          st.friends = m.friends
          st.requests = m.requests
        }
        break
      case 'party':
        if (st) st.party = m.party
        break
      case 'queue':
        if (st) st.queue = m.queue
        break
      case 'challenges':
        if (st) st.challenges = m.challenges
        break
      case 'matchFound':
        if (st) st.match = m.match
        break
      case 'kicked':
        this.kicked = true
        break
      case 'online':
        if (st) st.online = m.count
        break
      default:
        break
    }
    this.onPush?.(m)
  }
}
