/**
 * Mede a banda que o servidor envia a cada cliente numa partida battle royale
 * no mapa principal: N bots + K conexões (sem comandos), por fase.
 *
 *   npx tsx scripts/bench-net.ts [bots=60] [clientes=8] [segundos=150]
 */
import { GameHost, type HostConnection } from '../src/server/core/game-host'
import { MAIN_MAP_ID } from '../src/shared/maps'
import { GameMode, MatchPhase } from '../src/shared/match/zone'
import { S2C, SnapshotDecoder, decodeServerMessage, encodeHello } from '../src/shared/net/protocol'

const bots = Number(process.argv[2] ?? 60)
const clients = Number(process.argv[3] ?? 8)
const seconds = Number(process.argv[4] ?? 150)

const interest = process.env.INTEREST !== '0'
const host = new GameHost({ mapId: MAIN_MAP_ID, mode: GameMode.BattleRoyale, bots, botDifficulty: 'normal', maxPlayers: 100, br: { warmup: 1 }, reconnectSeconds: 0, interest })
const bytes = new Map<number, { snap: number; ev: number; other: number; snaps: number }>()
const decodeCheck = process.env.DECODE === '1'
for (let k = 1; k <= clients; k++) {
  const stats = { snap: 0, ev: 0, other: 0, snaps: 0 }
  const dec = new SnapshotDecoder()
  bytes.set(k, stats)
  const conn: HostConnection = {
    id: k,
    send(d) {
      if (d[0] === S2C.Snapshot) {
        stats.snap += d.length
        stats.snaps++
      } else if (d[0] === S2C.Events) stats.ev += d.length
      else stats.other += d.length
      if (decodeCheck) decodeServerMessage(d, dec)
    },
    close() {},
  }
  host.connect(conn)
  host.receive(k, encodeHello(`Cliente ${k}`))
}

const byPhase = new Map<number, { ticks: number; snap: number; ev: number }>()
let prev = { snap: 0, ev: 0 }
const t0 = performance.now()
for (let t = 0; t < seconds * host.tickRate; t++) {
  host.tick()
  let snap = 0
  let ev = 0
  for (const s of bytes.values()) {
    snap += s.snap
    ev += s.ev
  }
  const ph = host.phase
  const acc = byPhase.get(ph) ?? { ticks: 0, snap: 0, ev: 0 }
  acc.ticks++
  acc.snap += snap - prev.snap
  acc.ev += ev - prev.ev
  byPhase.set(ph, acc)
  prev = { snap, ev }
  if (host.br?.phase === MatchPhase.Ended) break
}
const ms = performance.now() - t0
const names: Record<number, string> = { [MatchPhase.Warmup]: 'aquecimento', [MatchPhase.Airship]: 'dirigível', [MatchPhase.Playing]: 'partida', [MatchPhase.Ended]: 'fim' }
console.log(`${bots} bots, ${clients} clientes, ${(ms / 1000).toFixed(1)} s de CPU; vivos no fim: ${host.sim.aliveCount}`)
for (const [ph, a] of byPhase) {
  const secs = a.ticks / host.tickRate
  console.log(`  ${(names[ph] ?? ph).padEnd(12)} ${secs.toFixed(0).padStart(4)} s  snapshots ${(a.snap / clients / secs / 1024).toFixed(2).padStart(7)} KB/s por cliente  eventos ${(a.ev / clients / secs / 1024).toFixed(2).padStart(6)} KB/s`)
}
const tot = [...bytes.values()].reduce((s, b) => s + b.snap, 0) / [...bytes.values()].reduce((s, b) => s + b.snaps, 0)
console.log(`  snapshot médio: ${tot.toFixed(0)} bytes`)
