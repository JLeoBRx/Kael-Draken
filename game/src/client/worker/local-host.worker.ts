import { GameHost, type HostConnection } from '../../server/core/game-host'
import type { WorkerEvent, WorkerRequest } from '../net/transport'

/**
 * Servidor autoritativo rodando dentro do navegador (modo offline).
 * Mesma classe GameHost do servidor dedicado; só o transporte muda.
 */

let host: GameHost | null = null

function post(msg: WorkerEvent, transfer: Transferable[] = []): void {
  self.postMessage(msg, { transfer })
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const m = ev.data
  try {
    switch (m.t) {
      case 'start':
        if (host) return
        host = new GameHost({
          mapId: m.mapId,
          maxPlayers: m.maxPlayers,
          serverName: 'Partida local',
          mode: m.match.mode,
          bots: m.match.bots,
          botDifficulty: m.match.difficulty,
          teamSize: m.match.teamSize,
          // offline: aquecimento curto e sem reinício (o jogador escolhe "Jogar de novo")
          br: { warmup: 5, zoneSpeed: m.match.zoneSpeed, endDelay: 3600 },
          autoRestart: false,
          logger: {
            info: (message) => post({ t: 'log', level: 'info', message }),
            warn: (message) => post({ t: 'log', level: 'warn', message }),
          },
        })
        host.start()
        post({ t: 'ready' })
        break
      case 'connect': {
        if (!host) throw new Error('servidor local não iniciado')
        const cid = m.cid
        const conn: HostConnection = {
          id: cid,
          // Cópia por envio: o host reutiliza o mesmo buffer em broadcasts.
          send: (data) => {
            const buf = data.slice().buffer as ArrayBuffer
            post({ t: 'data', cid, buf }, [buf])
          },
          close: (reason) => post({ t: 'close', cid, reason }),
        }
        host.connect(conn)
        break
      }
      case 'data':
        host?.receive(m.cid, new Uint8Array(m.buf))
        break
      case 'disconnect':
        host?.disconnect(m.cid, true)
        break
    }
  } catch (err) {
    post({ t: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
