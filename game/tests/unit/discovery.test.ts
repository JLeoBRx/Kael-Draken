import { afterAll, describe, expect, it } from 'vitest'
import { startServer, type RunningServer } from '../../src/server/node/server'

const quiet = { info() {}, warn() {} }

describe('descoberta na rede local', () => {
  const servers: RunningServer[] = []
  afterAll(async () => {
    for (const s of servers) await s.close()
  })

  it('cada servidor anuncia-se por UDP e lista os outros em /api/lan', async () => {
    // portas UDP próprias e anúncios cruzados (no lugar do broadcast, que um contêiner pode não ter)
    const d1 = 40000 + Math.floor(Math.random() * 10000)
    const d2 = d1 + 1
    const a = await startServer({
      port: 0, host: '127.0.0.1', mapId: 'campo-de-provas', maxPlayers: 8, tickRate: 30, name: 'Sala da Ana', staticDir: null, logger: quiet,
      match: { lobby: true, teamSize: 2 },
      discovery: { listenPort: d1, announceTo: [{ host: '127.0.0.1', port: d2 }], intervalMs: 150 },
    })
    const b = await startServer({
      port: 0, host: '127.0.0.1', mapId: 'campo-de-provas', maxPlayers: 8, tickRate: 30, name: 'Servidor do Bruno', staticDir: null, logger: quiet,
      discovery: { listenPort: d2, announceTo: [{ host: '127.0.0.1', port: d1 }], intervalMs: 150 },
    })
    servers.push(a, b)
    expect(a.discovery).not.toBeNull()
    const lan = async (s: RunningServer) => (await (await fetch(`http://127.0.0.1:${s.port}/api/lan`)).json()) as { self: { name: string; port: number; lobby: boolean }; servers: { name: string; port: number; lobby: boolean; teamSize: number; address: string }[] }
    let seenByA: Awaited<ReturnType<typeof lan>>['servers'] = []
    for (let k = 0; k < 40 && seenByA.length === 0; k++) {
      await new Promise((r) => setTimeout(r, 100))
      seenByA = (await lan(a)).servers
    }
    expect(seenByA).toEqual([expect.objectContaining({ name: 'Servidor do Bruno', port: b.port, address: '127.0.0.1', lobby: false })])
    const fromB = await lan(b)
    expect(fromB.self).toMatchObject({ name: 'Servidor do Bruno', port: b.port })
    expect(fromB.servers).toEqual([expect.objectContaining({ name: 'Sala da Ana', port: a.port, lobby: true, teamSize: 2 })])
  })
})
