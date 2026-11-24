/**
 * Teste de carga: N pessoas simuladas passam pelo caminho real — entram na
 * plataforma pelo nome, entram na fila solo, recebem o bilhete, conectam ao
 * servidor de jogo (local ou num nó remoto) e mandam comandos a 30 Hz
 * (andar, virar, pular, saltar do dirigível). Mede o tempo de tick dos
 * servidores e a banda recebida.
 *
 *   npx tsx scripts/load-test.ts [pessoas=100] [segundos=90] [mapa=ilha-de-brasa]
 *   npx tsx scripts/load-test.ts --pessoas 60 --segundos 60 --url http://localhost:7370
 *
 * Sem --url, a plataforma sobe em outro processo (como em produção), com
 * --trust-proxy e --por-partida pessoas por partida. Com --url, usa uma
 * plataforma já rodando (por exemplo, o docker compose) — ela precisa de
 * TRUST_PROXY=1: cada cliente simulado manda um X-Forwarded-For diferente,
 * para que os limites por IP valham como se fossem computadores diferentes.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { parseArgs } from 'node:util'
import { WebSocket } from 'ws'
import { encodeHello, encodeInputs, S2C } from '../src/shared/net/protocol'
import { PLATFORM_VERSION } from '../src/shared/platform/messages'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pessoas: { type: 'string' },
    segundos: { type: 'string' },
    mapa: { type: 'string' },
    url: { type: 'string' },
    'por-partida': { type: 'string' },
  },
})
const N = Number(values.pessoas ?? positionals[0] ?? 100)
const SECONDS = Number(values.segundos ?? positionals[1] ?? 90)
const MAP = values.mapa ?? positionals[2] ?? 'ilha-de-brasa'
const PER_MATCH = Number(values['por-partida'] ?? N)
const BASE = (values.url ?? 'http://127.0.0.1:7390').replace(/\/$/, '')
const WS_BASE = BASE.replace(/^http/, 'ws')

let proc: ChildProcess | null = null
if (!values.url) {
  // node direto (com o carregador do tsx): um processo só, que recebe o SIGTERM e encerra limpo
  proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', '--import', 'tsx', 'src/platform/main.ts', '--port', new URL(BASE).port, '--host', '127.0.0.1', '--db', ':memory:', '--no-static', '--trust-proxy',
    '--map', MAP, '--max-humans', String(PER_MATCH), '--lobby-size', String(PER_MATCH), '--max-wait', '15', '--warmup', '10', '--max-servers', String(Math.ceil(N / PER_MATCH) + 1)], { stdio: ['ignore', 'pipe', 'inherit'] })
  await new Promise<void>((ok) => proc!.stdout!.on('data', (d: Buffer) => { if (d.toString().includes('em execução')) ok() }))
}

interface Bot {
  bytes: number
  snaps: number
  tick: number
  seq: number
  yaw: number
  /** Lado para onde anda (muda a cada ~1 s, como quem segura as teclas). */
  right: number
  game: WebSocket | null
}

async function person(i: number, bots: Bot[]): Promise<void> {
  const ip = `10.1.${i >> 8}.${i & 255}`
  const b: Bot = { bytes: 0, snaps: 0, tick: 0, seq: 0, yaw: Math.random() * 6.28, right: 0, game: null }
  bots.push(b)
  const ws = new WebSocket(`${WS_BASE}/platform`, { headers: { 'x-forwarded-for': ip } })
  await new Promise((ok, fail) => { ws.once('open', ok); ws.once('error', fail) })
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString())
    if (m.t === 'welcome') ws.send(JSON.stringify({ t: 'queue', teamSize: 1, region: 'sa', fill: true }))
    if (m.t === 'error') console.warn(`pessoa ${i}: ${m.message}`)
    if (m.t === 'matchFound') {
      // nó remoto: endereço completo; servidor na própria plataforma: caminho no mesmo endereço
      const g = new WebSocket(m.match.url ?? `${WS_BASE}${m.match.path}`, { headers: { 'x-forwarded-for': ip } })
      g.binaryType = 'arraybuffer'
      b.game = g
      g.on('open', () => g.send(encodeHello('x', '', m.match.ticket)))
      g.on('message', (data) => {
        const u8 = new Uint8Array(data as ArrayBuffer)
        b.bytes += u8.length
        if (u8[0] === S2C.Snapshot) {
          b.snaps++
          b.tick = new DataView(u8.buffer, u8.byteOffset).getUint32(1, true)
        }
      })
      g.on('error', (e) => console.warn(`jogo ${i}: ${e.message}`))
    }
  })
  ws.send(JSON.stringify({ t: 'login', name: `Carga ${i}`, version: PLATFORM_VERSION }))
}

const bots: Bot[] = []
const t0 = Date.now()
for (let i = 0; i < N; i++) await person(i, bots)
console.log(`${N} pessoas conectadas à plataforma em ${Date.now() - t0} ms`)

// comandos a 30 Hz: anda para a frente e de lado (troca ~1 vez por segundo), vira o mouse, pula às vezes
const input = setInterval(() => {
  for (const b of bots) {
    if (!b.game || b.game.readyState !== WebSocket.OPEN || b.tick === 0) continue
    b.seq++
    // mouse: giros pequenos e contínuos, às vezes uma virada rápida
    b.yaw += (Math.random() - 0.5) * 0.04 + (Math.random() < 0.01 ? (Math.random() - 0.5) * 2 : 0)
    if (Math.random() < 1 / 30) b.right = [-1, 0, 0, 1][Math.floor(Math.random() * 4)]
    const buttons = (Math.random() < 0.02 ? 1 : 0) | 2
    b.game.send(encodeInputs([{ seq: b.seq, forward: 1, right: b.right, yaw: b.yaw, pitch: 0, buttons, slot: 0, viewTick: b.tick, build: 0 }]))
  }
}, 1000 / 30)

interface ServerRow { id: string; node: string; tickMs: number; alive: number; phase: number; players: number }
const samples: ServerRow[] = []
let lastBytes = 0
const start = Date.now()
while (Date.now() - start < SECONDS * 1000) {
  await new Promise((r) => setTimeout(r, 5000))
  const st = await (await fetch(`${BASE}/api/online/status`)).json() as { servers: ServerRow[]; online: number; searching: number }
  const bytes = bots.reduce((a, b) => a + b.bytes, 0)
  const inGame = bots.filter((b) => b.snaps > 0).length
  const kbs = (bytes - lastBytes) / 5 / 1024 / Math.max(1, inGame)
  lastBytes = bytes
  for (const s of st.servers) if (s.phase >= 2) samples.push(s)
  const servers = st.servers.map((s) => `${s.node}:${s.players}p/${s.tickMs.toFixed(2)}ms/f${s.phase}`).join(' ') || '-'
  console.log(`${((Date.now() - start) / 1000).toFixed(0).padStart(3)} s · online ${st.online} · fila ${st.searching} · no jogo ${inGame} · ${kbs.toFixed(2)} KB/s por pessoa · servidores ${servers}`)
}
clearInterval(input)
const byNode = new Map<string, ServerRow[]>()
for (const s of samples) byNode.set(s.node, [...(byNode.get(s.node) ?? []), s])
for (const [node, rows] of byNode) {
  const avg = rows.reduce((a, x) => a + x.tickMs, 0) / rows.length
  const max = Math.max(...rows.map((x) => x.tickMs))
  const servers = new Set(rows.map((r) => r.id)).size
  console.log(`\ntick em ${node} (${servers} servidor(es), até ${Math.max(...rows.map((r) => r.players))} pessoas cada): médio ${avg.toFixed(2)} ms, pior amostra ${max.toFixed(2)} ms (orçamento a 30 Hz: 33,3 ms)`)
}
for (const b of bots) b.game?.terminate()
if (proc) {
  // espera a plataforma terminar antes de sair (a saída dela ainda está ligada a este processo)
  const exited = new Promise((ok) => proc!.once('exit', ok))
  proc.kill('SIGTERM')
  await exited
}
process.exit(0)
