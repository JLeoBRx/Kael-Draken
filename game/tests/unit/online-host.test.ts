import { describe, expect, it } from 'vitest'
import { GameHost, type HostConnection, type MatchSummary, type PlayerResult, type TicketClaims } from '../../src/server/core/game-host'
import { GameMode, MatchPhase } from '../../src/shared/match/zone'
import { Cause, KICK_MATCH_OVER, SnapshotDecoder, decodeServerMessage, encodeHello, type ServerMessage } from '../../src/shared/net/protocol'
import { testMap } from './sim-helpers'

class FakeConn implements HostConnection {
  inbox: ServerMessage[] = []
  closed: string | null = null
  readonly dec = new SnapshotDecoder()
  constructor(readonly id: number) {}
  send(data: Uint8Array) {
    this.inbox.push(decodeServerMessage(data, this.dec))
  }
  close(reason: string) {
    this.closed = reason
  }
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    for (let k = this.inbox.length - 1; k >= 0; k--) if (this.inbox[k].type === type) return this.inbox[k] as Extract<ServerMessage, { type: T }>
    return undefined
  }
  events() {
    return this.inbox.flatMap((m) => (m.type === 'events' ? m.events : []))
  }
}

/** "Bilhetes" de teste: o texto é o uid; só os listados valem. */
function auth(valid: Record<string, Omit<TicketClaims, 'uid'>>) {
  return { verify: (t: string): TicketClaims | null => (valid[t] ? { uid: t, ...valid[t] } : null) }
}

function connect(host: GameHost, id: number, ticket: string, name = 'Qualquer'): FakeConn {
  const c = new FakeConn(id)
  host.connect(c)
  host.receive(id, encodeHello(name, '', ticket))
  return c
}

describe('servidor online (bilhetes)', () => {
  it('só entra com bilhete válido; nome, visual e grupo vêm do bilhete', () => {
    const map = testMap(() => {})
    const host = new GameHost({ mapId: map.def.id, map, mode: GameMode.BattleRoyale, auth: auth({ u1: { name: 'Ana', skin: 5, team: 3 } }) })
    expect(host.info().online).toBe(true)
    const bad = connect(host, 1, '')
    expect(bad.closed).toMatch(/Bilhete/)
    const forged = connect(host, 2, 'u9')
    expect(forged.closed).toMatch(/Bilhete/)
    const ok = connect(host, 3, 'u1', 'Outro Nome')
    const w = ok.last('welcome')!
    expect(w).toBeTruthy()
    const sp = host.sim.players.get(w.playerId)!
    expect(sp.name).toBe('Ana')
    expect(sp.skin).toBe(5)
    expect(sp.wantTeam).toBe(3)
  })

  it('a mesma conta em outra conexão assume o personagem (sem duplicar)', () => {
    const map = testMap(() => {})
    const host = new GameHost({ mapId: map.def.id, map, auth: auth({ u1: { name: 'Ana', skin: 1, team: -1 } }) })
    const a = connect(host, 1, 'u1')
    const id = a.last('welcome')!.playerId
    host.tick()
    const b = connect(host, 2, 'u1')
    expect(a.closed).toBe('Conectado em outro lugar')
    expect(b.last('welcome')!.playerId).toBe(id)
    expect(host.sim.players.size).toBe(1)
    host.tick()
    expect(b.last('snapshot')!.snapshot.self).toBeTruthy()
  })

  it('aquecimento encurta quando todos os esperados chegam', () => {
    const map = testMap(() => {})
    const host = new GameHost({ mapId: map.def.id, map, mode: GameMode.BattleRoyale, br: { warmup: 60 }, expected: 2, auth: auth({ a: { name: 'A', skin: 0, team: -1 }, b: { name: 'B', skin: 0, team: -1 } }) })
    connect(host, 1, 'a')
    host.tick()
    expect(host.br!.phaseEnd - host.sim.tick).toBeGreaterThan(30 * 50)
    connect(host, 2, 'b')
    host.tick()
    expect(host.br!.phaseEnd - host.sim.tick).toBeLessThanOrEqual(30 * 6)
  })

  it('reporta a colocação de cada pessoa, inclusive de quem saiu, e o fim da partida', () => {
    const map = testMap(() => {})
    const results: PlayerResult[] = []
    const ends: MatchSummary[] = []
    let finished = 0
    const host = new GameHost({
      mapId: map.def.id, map, mode: GameMode.BattleRoyale, bots: 2, botDifficulty: 'facil', br: { warmup: 1, zoneSpeed: 50, endDelay: 1 }, reconnectSeconds: 0,
      auth: auth({ a: { name: 'Ana', skin: 0, team: -1 }, b: { name: 'Bia', skin: 1, team: -1 }, c: { name: 'Caio', skin: 2, team: -1 } }),
      onResult: (r) => results.push(r), onMatchEnd: (s) => ends.push(s), onFinished: () => finished++,
    })
    const a = connect(host, 1, 'a')
    connect(host, 2, 'b')
    connect(host, 3, 'c')
    for (let k = 0; k < 60; k++) host.tick()
    expect(host.phase).toBe(MatchPhase.Airship)
    // Caio desiste a bordo: conta como eliminado (Cause.Quit) e já recebe a colocação
    host.disconnect(3, true)
    host.tick()
    expect(a.events().some((e) => e.type === 'eliminated' && e.cause === Cause.Quit)).toBe(true)
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ uid: 'c', name: 'Caio', place: 5, teams: 5, victory: false })
    for (let k = 0; k < 30 * 120 && !finished; k++) host.tick()
    expect(finished).toBe(1)
    expect(ends).toHaveLength(1)
    expect(results.map((r) => r.uid).sort()).toEqual(['a', 'b', 'c'])
    const places = results.map((r) => r.place)
    expect(new Set(places).size).toBe(3)
    for (const r of results) {
      expect(r.place).toBeGreaterThanOrEqual(1)
      expect(r.place).toBeLessThanOrEqual(5)
      expect(r.victory).toBe(r.place === 1)
      expect(r.seconds).toBeGreaterThanOrEqual(0)
    }
    expect(ends[0]).toMatchObject({ teams: 5, participants: 5, humans: 3, bots: 2 })
    expect(ends[0].winners.length).toBe(1)
    // encerrar avisa todos com o motivo de fim de partida (o cliente volta à plataforma)
    host.shutdown()
    expect(a.closed).toBe(KICK_MATCH_OVER)
    expect(a.last('kick')!.reason).toBe(KICK_MATCH_OVER)
  })
})

describe('gerência de interesse', () => {
  it('quem está longe vai em menos snapshots; perto e colegas vão em todos', () => {
    const map = testMap(() => {})
    const host = new GameHost({ mapId: map.def.id, map })
    const conns = [1, 2, 3].map((id) => {
      const c = new FakeConn(id)
      host.connect(c)
      host.receive(id, encodeHello(`J${id}`))
      return c
    })
    const ids = conns.map((c) => c.last('welcome')!.playerId)
    const [me, near, far] = ids.map((id) => host.sim.players.get(id)!)
    near.p.char.x = me.p.char.x + 10
    far.p.char.x = me.p.char.x + 600
    host.tick()
    const before = conns[0].inbox.length
    for (let k = 0; k < 40; k++) host.tick()
    const snaps = conns[0].inbox.slice(before).filter((m) => m.type === 'snapshot').map((m) => (m.type === 'snapshot' ? m.snapshot : null)!)
    const count = (id: number) => snaps.filter((s) => s.entities.some((e) => e.id === id)).length
    expect(count(near.id)).toBe(snaps.length)
    expect(count(far.id)).toBeGreaterThanOrEqual(snaps.length / 4 - 1)
    expect(count(far.id)).toBeLessThanOrEqual(snaps.length / 4 + 1)
    // a posição de quem está longe continua certa quando chega
    const last = snaps.filter((s) => s.entities.some((e) => e.id === far.id)).pop()!
    expect(last.entities.find((e) => e.id === far.id)!.x).toBeCloseTo(far.p.char.x, 1)
    // sem gerência de interesse, todos vão sempre
    const host2 = new GameHost({ mapId: map.def.id, map, interest: false })
    const c2 = [1, 2].map((id) => {
      const c = new FakeConn(id)
      host2.connect(c)
      host2.receive(id, encodeHello(`J${id}`))
      return c
    })
    host2.sim.players.get(c2[1].last('welcome')!.playerId)!.p.char.x += 600
    for (let k = 0; k < 10; k++) host2.tick()
    expect(c2[0].inbox.filter((m) => m.type === 'snapshot' && m.snapshot.entities.length === 1).length).toBe(10)
  })
})
