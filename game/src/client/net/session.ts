import {
  MAX_COMMANDS_PER_MESSAGE,
  PROTOCOL_VERSION,
  SnapshotDecoder,
  decodeServerMessage,
  encodeHello,
  encodeInputs,
  encodePing,
  type GameEvent,
  type InputCommand,
  encodeInventoryAction,
  type InventoryAction,
  type LobbyAction,
  type LobbyState,
  type ServerMessage,
  type Snapshot,
  type WelcomeMessage,
  encodeLobbyAction,
} from '../../shared/net/protocol'
import type { Transport } from './transport'

export interface SessionHandlers {
  onSnapshot(snapshot: Snapshot, receivedAt: number): void
  onPlayerInfo(id: number, name: string, skin: number, team: number): void
  onPlayerLeft(id: number): void
  onEvents(events: GameEvent[]): void
  onClosed(reason: string): void
}

/** Resposta ao handshake: já na partida, ou na sala de espera. */
export type Greeting = { kind: 'welcome'; welcome: WelcomeMessage } | { kind: 'lobby'; state: LobbyState }

/**
 * Sessão de rede: handshake, despacho de mensagens, ping e estatísticas.
 * Mensagens que chegam enquanto a partida ainda carrega ficam guardadas
 * (só o snapshot mais recente) até os handlers serem registrados.
 *
 * A mesma sessão atravessa sala de espera → partida → sala: `onLobby` e
 * `onWelcome` avisam a casca quando o servidor muda de fase.
 */
export class NetSession {
  welcome: WelcomeMessage | null = null
  rttMs = 0
  bytesIn = 0
  bytesOut = 0
  closedReason: string | null = null
  /** O servidor encerrou com motivo (expulsão, nova partida) — não é queda de rede. */
  kicked = false
  lobby: LobbyState | null = null
  /** Partida começou (vindo da sala de espera). */
  onWelcome: ((w: WelcomeMessage) => void) | null = null
  /** Estado da sala (ao entrar, a cada mudança e ao voltar do fim da partida). */
  onLobby: ((st: LobbyState) => void) | null = null
  /** Conexão terminou (antes de haver partida com handlers). */
  onClose: ((reason: string) => void) | null = null
  private handlers: SessionHandlers | null = null
  private backlog: { msg: ServerMessage; at: number }[] = []
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private welcomeWaiter: ((g: Greeting) => void) | null = null
  private failWaiter: ((e: Error) => void) | null = null
  /** Base dos snapshots em delta (recomeça a cada Welcome). */
  private readonly decoder = new SnapshotDecoder()

  constructor(readonly transport: Transport) {
    transport.onMessage = (data) => this.receive(data)
    transport.onClose = (reason) => this.closed(reason)
  }

  /** `ticket`: bilhete da plataforma (servidores online). */
  handshake(name: string, token = '', ticket = '', timeoutMs = 8000): Promise<Greeting> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('O servidor não respondeu ao handshake')), timeoutMs)
      this.welcomeWaiter = (g) => {
        clearTimeout(timer)
        resolve(g)
      }
      this.failWaiter = (e) => {
        clearTimeout(timer)
        reject(e)
      }
      this.send(encodeHello(name, token, ticket))
    })
  }

  sendLobby(a: LobbyAction): void {
    this.send(encodeLobbyAction(a))
  }

  /** A partida acabou e voltamos à sala: descarta handlers e o que ficou pendente. */
  detachMatch(): void {
    this.handlers = null
    this.backlog = []
    this.welcome = null
  }

  setHandlers(h: SessionHandlers): void {
    this.handlers = h
    const pending = this.backlog
    this.backlog = []
    for (const { msg, at } of pending) this.dispatch(msg, at)
    if (this.closedReason) h.onClosed(this.closedReason)
  }

  sendInputs(cmds: InputCommand[]): void {
    for (let k = 0; k < cmds.length; k += MAX_COMMANDS_PER_MESSAGE) this.send(encodeInputs(cmds.slice(k, k + MAX_COMMANDS_PER_MESSAGE)))
  }

  sendInventory(op: InventoryAction): void {
    this.send(encodeInventoryAction(op))
  }

  startPing(intervalMs = 1000): void {
    if (this.pingTimer) return
    const ping = () => this.send(encodePing(performance.now()))
    ping()
    this.pingTimer = setInterval(ping, intervalMs)
  }

  close(): void {
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    this.transport.onMessage = null
    this.transport.onClose = null
    this.transport.close()
  }

  private send(data: Uint8Array): void {
    this.bytesOut += data.byteLength
    this.transport.send(data)
  }

  private receive(data: Uint8Array): void {
    this.bytesIn += data.byteLength
    const at = performance.now()
    let msg: ServerMessage
    try {
      msg = decodeServerMessage(data, this.decoder)
    } catch (err) {
      // a base dos snapshots ficaria errada daqui em diante: encerra a conexão
      console.error('Mensagem inválida do servidor', err)
      this.closed(`Mensagem inválida do servidor (${err instanceof Error ? err.message : err})`)
      this.transport.close()
      return
    }
    if (msg.type === 'welcome') {
      if (msg.version !== PROTOCOL_VERSION) {
        this.failWaiter?.(new Error(`Versão do servidor incompatível (${msg.version}; este cliente usa ${PROTOCOL_VERSION})`))
        return
      }
      this.welcome = msg
      if (this.welcomeWaiter) {
        this.welcomeWaiter({ kind: 'welcome', welcome: msg })
        this.welcomeWaiter = null
      } else this.onWelcome?.(msg)
      return
    }
    if (msg.type === 'lobby') {
      this.lobby = msg.state
      if (this.welcomeWaiter) {
        this.welcomeWaiter({ kind: 'lobby', state: msg.state })
        this.welcomeWaiter = null
      } else this.onLobby?.(msg.state)
      return
    }
    if (msg.type === 'pong') {
      const sample = at - msg.time
      this.rttMs = this.rttMs === 0 ? sample : this.rttMs * 0.8 + sample * 0.2
      return
    }
    if (msg.type === 'kick') {
      this.kicked = true
      this.closed(msg.reason)
      return
    }
    if (!this.handlers) {
      if (msg.type === 'snapshot') {
        const idx = this.backlog.findIndex((b) => b.msg.type === 'snapshot')
        if (idx >= 0) this.backlog.splice(idx, 1)
      }
      this.backlog.push({ msg, at })
      return
    }
    this.dispatch(msg, at)
  }

  private dispatch(msg: ServerMessage, at: number): void {
    const h = this.handlers
    if (!h) return
    switch (msg.type) {
      case 'snapshot':
        h.onSnapshot(msg.snapshot, at)
        break
      case 'playerInfo':
        h.onPlayerInfo(msg.id, msg.name, msg.skin, msg.team)
        break
      case 'playerLeft':
        h.onPlayerLeft(msg.id)
        break
      case 'events':
        h.onEvents(msg.events)
        break
      default:
        break
    }
  }

  private closed(reason: string): void {
    if (this.closedReason) return
    this.closedReason = reason
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.pingTimer = null
    this.failWaiter?.(new Error(reason))
    this.failWaiter = null
    if (this.handlers) this.handlers.onClosed(reason)
    else this.onClose?.(reason)
  }
}
