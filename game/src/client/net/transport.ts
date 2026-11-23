import type { BotDifficulty } from '../../server/core/bots/profiles'
import { GameMode } from '../../shared/match/zone'
/**
 * Transportes do cliente. A partida não sabe se fala com um Worker local
 * (offline), com um host na rede local ou com um servidor dedicado na
 * internet: todos trocam os mesmos bytes do protocolo.
 */

export interface Transport {
  readonly kind: 'local' | 'remote'
  readonly label: string
  send(data: Uint8Array): void
  close(): void
  onMessage: ((data: Uint8Array) => void) | null
  onClose: ((reason: string) => void) | null
}

/** Normaliza o endereço digitado: "192.168.0.5:7350" → "ws://192.168.0.5:7350/ws". */
export function normalizeServerUrl(input: string, page: Location | null = typeof location !== 'undefined' ? location : null): string {
  let v = input.trim()
  if (!v) {
    if (!page || page.protocol === 'file:') return 'ws://localhost:7350/ws'
    return `${page.protocol === 'https:' ? 'wss' : 'ws'}://${page.host}/ws`
  }
  if (/^https?:\/\//i.test(v)) v = v.replace(/^http/i, 'ws')
  if (!/^wss?:\/\//i.test(v)) v = `ws://${v}`
  const url = new URL(v)
  if (url.pathname === '/' || url.pathname === '') url.pathname = '/ws'
  return url.toString()
}

export function connectWebSocket(url: string, timeoutMs = 8000): Promise<Transport> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      reject(new Error(`Endereço inválido: ${url}`))
      return
    }
    ws.binaryType = 'arraybuffer'
    let opened = false
    const timer = setTimeout(() => {
      if (!opened) {
        ws.close()
        reject(new Error(`Sem resposta de ${url} (tempo esgotado)`))
      }
    }, timeoutMs)
    const transport: Transport = {
      kind: 'remote',
      label: new URL(url).host,
      send(data) {
        if (ws.readyState === WebSocket.OPEN) ws.send(data)
      },
      close() {
        ws.close(1000, 'cliente saiu')
      },
      onMessage: null,
      onClose: null,
    }
    ws.onopen = () => {
      opened = true
      clearTimeout(timer)
      resolve(transport)
    }
    ws.onmessage = (ev) => {
      if (ev.data instanceof ArrayBuffer) transport.onMessage?.(new Uint8Array(ev.data))
    }
    ws.onerror = () => {
      if (!opened) {
        clearTimeout(timer)
        reject(new Error(`Não foi possível conectar a ${url}`))
      }
    }
    ws.onclose = (ev) => {
      if (opened) transport.onClose?.(ev.reason || `Conexão encerrada (código ${ev.code})`)
    }
  })
}

/** Mensagens entre a página e o Worker do servidor local. */
export type WorkerRequest =
  | { t: 'start'; mapId: string; maxPlayers: number; match: LocalMatchOptions }
  | { t: 'connect'; cid: number }
  | { t: 'data'; cid: number; buf: ArrayBuffer }
  | { t: 'disconnect'; cid: number }

export type WorkerEvent =
  | { t: 'ready' }
  | { t: 'error'; message: string }
  | { t: 'log'; level: 'info' | 'warn'; message: string }
  | { t: 'data'; cid: number; buf: ArrayBuffer }
  | { t: 'close'; cid: number; reason: string }

function ownBuffer(data: Uint8Array): ArrayBuffer {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength && data.buffer instanceof ArrayBuffer) return data.buffer
  return data.slice().buffer as ArrayBuffer
}

/**
 * Sobe o servidor autoritativo num Web Worker (sem rede, sem internet) e
 * conecta a ele. É o mesmo GameHost do servidor dedicado.
 */
/** Partida offline: modo, bots e velocidade da zona. */
export interface LocalMatchOptions {
  mode: number
  bots: number
  difficulty: BotDifficulty
  zoneSpeed: number
  /** Jogadores por equipe (os jogadores deste computador ficam juntos). */
  teamSize: number
}

export const TRAINING_MATCH: LocalMatchOptions = { mode: GameMode.Training, bots: 0, difficulty: 'normal', zoneSpeed: 1, teamSize: 1 }

export function startLocalServer(mapId: string, match: LocalMatchOptions = TRAINING_MATCH, timeoutMs = 20000): Promise<Transport> {
  return startLocalServers(mapId, match, 1, timeoutMs).then((t) => t[0])
}

/**
 * Um servidor local e `count` conexões a ele (tela dividida: uma por
 * jogador). O Worker termina quando a última conexão fecha.
 */
export function startLocalServers(mapId: string, match: LocalMatchOptions, count: number, timeoutMs = 20000): Promise<Transport[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../worker/local-host.worker.ts', import.meta.url), { type: 'module', name: 'servidor-local' })
    let ready = false
    let open = count
    const timer = setTimeout(() => {
      if (!ready) {
        worker.terminate()
        reject(new Error('O servidor local não respondeu'))
      }
    }, timeoutMs)
    const transports = new Map<number, Transport>()
    for (let cid = 1; cid <= count; cid++) {
      let closed = false
      transports.set(cid, {
        kind: 'local',
        label: count > 1 ? `Servidor local · jogador ${cid}` : 'Servidor local',
        send(data) {
          const buf = ownBuffer(data)
          worker.postMessage({ t: 'data', cid, buf } satisfies WorkerRequest, [buf])
        },
        close() {
          if (closed) return
          closed = true
          worker.postMessage({ t: 'disconnect', cid } satisfies WorkerRequest)
          if (--open <= 0) worker.terminate()
        },
        onMessage: null,
        onClose: null,
      })
    }
    worker.onmessage = (ev: MessageEvent<WorkerEvent>) => {
      const m = ev.data
      switch (m.t) {
        case 'ready':
          ready = true
          clearTimeout(timer)
          for (const cid of transports.keys()) worker.postMessage({ t: 'connect', cid } satisfies WorkerRequest)
          resolve([...transports.values()])
          break
        case 'error':
          clearTimeout(timer)
          if (!ready) reject(new Error(m.message))
          else for (const t of transports.values()) t.onClose?.(m.message)
          break
        case 'log':
          ;(m.level === 'warn' ? console.warn : console.info)(`[servidor local] ${m.message}`)
          break
        case 'data':
          transports.get(m.cid)?.onMessage?.(new Uint8Array(m.buf))
          break
        case 'close':
          transports.get(m.cid)?.onClose?.(m.reason)
          break
      }
    }
    worker.onerror = (ev) => {
      clearTimeout(timer)
      const message = `Falha no servidor local: ${ev.message || 'erro desconhecido'}`
      if (!ready) reject(new Error(message))
      else for (const t of transports.values()) t.onClose?.(message)
    }
    worker.postMessage({ t: 'start', mapId, maxPlayers: Math.max(16, match.bots + count), match } satisfies WorkerRequest)
  })
}
