import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { GameNode, nodesUrl } from '../../src/platform/node-agent'
import { NODE_PROTOCOL, nodeProof, validPublicUrl, type NodeToPlatform, type PlatformToNode, type RunningServer } from '../../src/platform/node-protocol'
import type { NodeLink } from '../../src/platform/pool'
import { startPlatform, type RunningPlatform } from '../../src/platform/server'
import { PlatformService, type ClientLink } from '../../src/platform/service'
import { PlatformStore } from '../../src/platform/store'
import { verifyTicket } from '../../src/platform/tickets'
import { PROTOCOL_VERSION, SnapshotDecoder, decodeServerMessage, encodeHello, type ServerMessage as GameMessage } from '../../src/shared/net/protocol'
import { PLATFORM_VERSION, type ClientRequest, type MatchTicket, type ServerMessage } from '../../src/shared/platform/messages'
import { testMap } from './sim-helpers'

const SECRET = 'segredo-de-teste'
const quiet = { info() {}, warn() {} }

class Link implements ClientLink {
  inbox: ServerMessage[] = []
  private rid = 1
  constructor(readonly id: number, readonly svc: PlatformService, readonly ip = '10.0.0.1') {
    svc.open(this)
  }
  send(m: ServerMessage) {
    this.inbox.push(m)
  }
  close() {}
  send2(m: ClientRequest): number {
    const rid = this.rid++
    this.svc.message(this.id, JSON.stringify({ ...m, rid }))
    return rid
  }
  reply(rid: number): ServerMessage | undefined {
    return this.inbox.find((x) => (x.t === 'ok' || x.t === 'error') && x.rid === rid)
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    for (let k = this.inbox.length - 1; k >= 0; k--) if (this.inbox[k].t === t) return this.inbox[k] as Extract<ServerMessage, { t: T }>
    return undefined
  }
}

/** Nó falso: guarda o que a plataforma manda e responde à mão. */
class FakeNode implements NodeLink {
  inbox: PlatformToNode[] = []
  closed: string | null = null
  constructor(readonly id: number, readonly svc: PlatformService, readonly name: string, readonly ip = '10.9.0.1') {}
  send(m: PlatformToNode) {
    this.inbox.push(m)
  }
  close(reason: string) {
    this.closed = reason
  }
  open(): this {
    this.svc.pool.openNode(this)
    return this
  }
  msg(m: NodeToPlatform | Record<string, unknown>) {
    this.svc.pool.nodeMessage(this.id, JSON.stringify(m))
  }
  hello(opts: { secret?: string; region?: string; capacity?: number; servers?: RunningServer[]; url?: string } = {}) {
    const ch = this.inbox.find((m) => m.t === 'challenge')
    if (ch?.t !== 'challenge') throw new Error('sem desafio')
    this.msg({
      t: 'hello', name: this.name, region: opts.region ?? 'sa', publicUrl: opts.url ?? `ws://${this.name}.exemplo:7380`, capacity: opts.capacity ?? 2,
      nodeProtocol: NODE_PROTOCOL, gameProtocol: PROTOCOL_VERSION, proof: nodeProof(opts.secret ?? SECRET, ch.nonce, this.name), servers: opts.servers ?? [],
    })
    return this
  }
  creates() {
    return this.inbox.filter((m): m is Extract<PlatformToNode, { t: 'create' }> => m.t === 'create')
  }
  disconnect() {
    this.svc.pool.closeNode(this.id)
  }
}

function service(opts: { maxServers?: number } = {}) {
  let now = Date.parse('2026-11-24T12:00:00Z')
  const store = new PlatformStore(':memory:', () => now)
  const svc = new PlatformService({
    store, secret: SECRET, autoStart: false, clock: () => now, logger: quiet,
    matchmaker: { maxHumans: 1, lobbySize: 3, maxWaitMs: 0 },
    pool: { maxServers: opts.maxServers ?? 0, autoStart: false, mapFactory: () => testMap(() => {}), botDifficulty: 'facil', nodeGraceMs: 30_000 },
  })
  return { svc, store, advance: (ms: number) => (now += ms) }
}

function login(svc: PlatformService, id: number, name: string): Link {
  const l = new Link(id, svc)
  const rid = l.send2({ t: 'login', name, version: PLATFORM_VERSION })
  expect(l.reply(rid)?.t).toBe('ok')
  return l
}

describe('nós de servidor de jogo (plataforma)', () => {
  it('só aceita nós que provam o segredo e falam a mesma versão', () => {
    const { svc } = service()
    const bad = new FakeNode(1, svc, 'intruso').open().hello({ secret: 'errado' })
    expect(bad.closed).toMatch(/segredo/)
    expect(svc.pool.nodes.size).toBe(0)
    const old = new FakeNode(2, svc, 'antigo').open()
    const ch = old.inbox[0]
    if (ch.t !== 'challenge') throw new Error('desafio')
    old.msg({ t: 'hello', name: 'antigo', region: 'sa', publicUrl: 'ws://a:1', capacity: 2, nodeProtocol: NODE_PROTOCOL, gameProtocol: PROTOCOL_VERSION - 1, proof: nodeProof(SECRET, ch.nonce, 'antigo'), servers: [] })
    expect(old.closed).toMatch(/protocolo de jogo/)
    // antes do hello, nada é aceito
    const early = new FakeNode(3, svc, 'apressado').open()
    early.msg({ t: 'report', servers: [], rssMb: 1, load: 0 })
    expect(early.closed).toMatch(/hello/)
    const ok = new FakeNode(4, svc, 'no-a').open().hello()
    expect(ok.closed).toBeNull()
    expect(ok.inbox.at(-1)).toEqual({ t: 'welcome', node: 'no-a' })
    expect(svc.pool.capacity).toBe(2)
    expect(validPublicUrl('ws://1.2.3.4:7380')).toBe(true)
    expect(validPublicUrl('http://1.2.3.4')).toBe(false)
    expect(validPublicUrl('wss://x.com/n/no-1')).toBe(true)
    expect(validPublicUrl('wss://x.com/n?x=1')).toBe(false)
    expect(validPublicUrl('ws://usuario:senha@x.com')).toBe(false)
    expect(nodesUrl('http://plataforma:7370')).toBe('ws://plataforma:7370/nodes')
    expect(nodesUrl('https://jogo.exemplo')).toBe('wss://jogo.exemplo/nodes')
  })

  it('partida pública num nó remoto: bilhete só depois da confirmação, com o endereço do nó', () => {
    const { svc, store } = service()
    const node = new FakeNode(1, svc, 'no-a').open().hello({ capacity: 2 })
    const ana = login(svc, 1, 'Ana')
    ana.send2({ t: 'queue', teamSize: 1, region: 'sa', fill: true })
    svc.step()
    const [create] = node.creates()
    expect(create).toBeTruthy()
    expect(create.spec).toMatchObject({ kind: 'publico', bots: 2, expected: 1, lobby: false })
    // ainda sem bilhete: o nó não confirmou
    expect(ana.last('matchFound')).toBeUndefined()
    expect(ana.last('queue')?.queue).not.toBeNull()
    node.msg({ t: 'created', id: create.id })
    const found = ana.last('matchFound')!.match
    expect(found.url).toBe(`ws://no-a.exemplo:7380/game/${create.id}`)
    expect(verifyTicket(SECRET, found.ticket, create.id)).toMatchObject({ uid: '1', name: 'Ana' })
    // a plataforma conta a partida no banco e avisa o nó
    const meta = node.inbox.filter((m) => m.t === 'meta').at(-1)
    expect(meta?.t === 'meta' && meta.meta.matchId).toBeGreaterThan(0)
    // relatório do nó: presença dos amigos e situação
    node.msg({ t: 'report', servers: [{ id: create.id, players: 1, phase: 1, tickMs: 0.8, alive: 3, uids: ['1'] }], rssMb: 120, load: 0.3 })
    expect(svc.presenceOf(1)).toBe('match')
    expect(svc.status()).toMatchObject({ capacity: 2, nodes: [{ name: 'no-a', connected: true, servers: 1, rssMb: 120 }], servers: [{ node: 'no-a', players: 1, ready: true }] })
    // resultado vindo do nó vira XP; fim da partida libera o servidor
    node.msg({ t: 'result', id: create.id, result: { uid: '1', name: 'Ana', playerId: 1, team: 0, place: 1, teams: 3, participants: 3, kills: 2, damage: 300, chests: 1, built: 0, harvested: 0, seconds: 400, victory: true, teamSize: 1, mapId: 'campo-de-provas' } })
    expect(ana.last('reward')?.reward).toMatchObject({ place: 1, victory: true })
    node.msg({ t: 'matchEnd', id: create.id, summary: { mapId: 'campo-de-provas', teamSize: 1, teams: 3, participants: 3, humans: 1, bots: 2, winnerTeam: 0, winners: ['Ana'], seconds: 400 } })
    node.msg({ t: 'finished', id: create.id })
    expect(svc.pool.servers.size).toBe(0)
    expect(node.inbox.at(-1)).toMatchObject({ t: 'release', id: create.id })
    expect(store.history(1)[0]).toMatchObject({ place: 1, victory: true })
    // um nó não mexe em servidor de outro
    const other = new FakeNode(2, svc, 'no-b').open().hello()
    other.msg({ t: 'finished', id: 'abcdef-1' })
    expect(other.closed).toBeNull()
  })

  it('escolhe a região pedida, depois o nó menos ocupado; cheio volta para a fila; falha procura outro', () => {
    const { svc } = service({ maxServers: 1 })
    const eu = new FakeNode(1, svc, 'europa').open().hello({ region: 'eu', capacity: 1 })
    const sa1 = new FakeNode(2, svc, 'sa-1').open().hello({ region: 'sa', capacity: 2 })
    const sa2 = new FakeNode(3, svc, 'sa-2').open().hello({ region: 'sa', capacity: 2 })
    const users = ['Ana', 'Bia', 'Caio', 'Duda', 'Edu', 'Fabi', 'Gil'].map((n, k) => login(svc, k + 1, n))
    const queue = (u: Link, region: string) => {
      u.send2({ t: 'queue', teamSize: 1, region, fill: true })
      svc.step()
    }
    queue(users[0], 'eu')
    expect(eu.creates()).toHaveLength(1)
    queue(users[1], 'sa')
    queue(users[2], 'sa')
    // um em cada nó da América do Sul (o menos ocupado)
    expect([sa1.creates().length, sa2.creates().length]).toEqual([1, 1])
    queue(users[3], 'sa')
    queue(users[4], 'sa')
    expect([sa1.creates().length, sa2.creates().length]).toEqual([2, 2])
    // nós da região cheios: vai para o que sobrou (servidor local)
    queue(users[5], 'sa')
    expect(svc.pool.localCount).toBe(1)
    // tudo cheio: continua na fila
    queue(users[6], 'sa')
    expect(svc.matchmaker.size).toBe(1)
    expect(users[6].last('notice')?.text).toMatch(/ocupados/)
    // o nó recusa: quem esperava volta para a fila e o servidor é descartado
    const before = svc.pool.servers.size
    sa1.msg({ t: 'createFailed', id: sa1.creates()[0].id, message: 'sem memória' })
    expect(svc.pool.servers.size).toBe(before - 1)
    expect(users[1].last('notice')?.text).toMatch(/falhou/)
    expect(svc.matchmaker.size).toBe(2)
    svc.step()
    // a vaga liberada no sa-1 é usada
    expect(sa1.creates()).toHaveLength(3)
  })

  it('nó em desligamento não recebe partidas; sala espera a confirmação do nó', async () => {
    const { svc } = service()
    const node = new FakeNode(1, svc, 'no-a').open().hello({ capacity: 4 })
    const ana = login(svc, 1, 'Ana')
    const rid = ana.send2({ t: 'roomCreate' })
    expect(ana.reply(rid)).toBeUndefined()
    const create = node.creates()[0]
    expect(create.spec).toMatchObject({ kind: 'privado', lobby: true, ownerUid: '1' })
    node.msg({ t: 'created', id: create.id })
    await Promise.resolve()
    const ok = ana.reply(rid)
    expect(ok?.t).toBe('ok')
    const room = (ok as { data: MatchTicket }).data
    expect(room.url).toMatch(/^ws:\/\/no-a\.exemplo:7380\/game\//)
    expect(room.code).toHaveLength(6)
    // entrar pelo código não espera (já pronta)
    const bia = login(svc, 2, 'Bia')
    const jr = bia.send2({ t: 'roomJoin', code: room.code! })
    expect((bia.reply(jr) as { data: MatchTicket }).data.url).toBe(room.url)
    node.msg({ t: 'drain' })
    const cr = bia.send2({ t: 'roomCreate' })
    expect(bia.reply(cr)).toMatchObject({ t: 'error', message: expect.stringMatching(/ocupados/) })
    // sem resposta do nó: a sala falha com aviso
    const node2 = new FakeNode(2, svc, 'no-b').open().hello({ capacity: 1 })
    const cr2 = bia.send2({ t: 'roomCreate' })
    const id2 = node2.creates()[0].id
    node2.disconnect()
    await Promise.resolve()
    await Promise.resolve()
    expect(bia.reply(cr2)).toMatchObject({ t: 'error', message: expect.stringMatching(/não pôde ser criado/) })
    expect(svc.pool.get(id2)).toBeUndefined()
  })

  it('nó que cai mantém as partidas pela carência e é readotado; sem volta, as partidas acabam', () => {
    const { svc, advance } = service()
    const node = new FakeNode(1, svc, 'no-a').open().hello()
    const ana = login(svc, 1, 'Ana')
    ana.send2({ t: 'queue', teamSize: 1, region: 'sa', fill: true })
    svc.step()
    const create = node.creates()[0]
    node.msg({ t: 'created', id: create.id })
    node.disconnect()
    expect(svc.pool.capacity).toBe(0)
    advance(10_000)
    svc.pool.sweep()
    expect(svc.pool.get(create.id)).toBeTruthy()
    // volta com o servidor ainda rodando: readotado, nada é perdido
    const back = new FakeNode(2, svc, 'no-a').open().hello({ servers: [{ id: create.id, spec: create.spec, meta: create.meta, report: { id: create.id, players: 1, phase: 2, tickMs: 1, alive: 2, uids: ['1'] } }] })
    expect(back.closed).toBeNull()
    expect(svc.pool.get(create.id)?.status().phase).toBe(2)
    // cai de novo e não volta: depois da carência, o servidor é dado como perdido
    back.disconnect()
    advance(31_000)
    svc.pool.sweep()
    expect(svc.pool.get(create.id)).toBeUndefined()
    expect(svc.pool.nodes.size).toBe(0)
  })

  it('plataforma reiniciada readota servidores que os nós ainda rodam (bilhetes continuam valendo)', () => {
    const first = service()
    const node = new FakeNode(1, first.svc, 'no-a').open().hello()
    const ana = login(first.svc, 1, 'Ana')
    ana.send2({ t: 'roomCreate' })
    const create = node.creates()[0]
    node.msg({ t: 'created', id: create.id })
    first.svc.close()
    // outra plataforma (mesmo segredo); o nó se apresenta com o que está rodando
    const second = service()
    const again = new FakeNode(1, second.svc, 'no-a').open().hello({ servers: [{ id: create.id, spec: create.spec, meta: { ...create.meta, code: 'ABC234' }, report: { id: create.id, players: 1, phase: 0, tickMs: 1, alive: 0, uids: ['1'] } }] })
    expect(again.closed).toBeNull()
    const adopted = second.svc.pool.byCode('ABC234')!
    expect(adopted).toMatchObject({ id: create.id, node: 'no-a', kind: 'privado', ready: true })
    expect(adopted.invited.has(1)).toBe(true)
    // descrição adulterada não é adotada
    const bad = new FakeNode(2, second.svc, 'no-b').open().hello({ servers: [{ id: 'abcdef-9', spec: { ...create.spec, bots: 5000 }, meta: create.meta, report: { id: 'abcdef-9', players: 0, phase: 0, tickMs: 0, alive: 0, uids: [] } }] })
    expect(bad.inbox.at(-1)).toMatchObject({ t: 'release', id: 'abcdef-9' })
    expect(second.svc.pool.get('abcdef-9')).toBeUndefined()
  })
})

// ---- integração: plataforma e nó de verdade, em rede -------------------------------------

async function freePort(): Promise<number> {
  const srv = createServer()
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => ok()))
  const port = (srv.address() as AddressInfo).port
  await new Promise<void>((ok) => srv.close(() => ok()))
  return port
}

async function until<T>(fn: () => T | undefined | null | false, ms = 8000): Promise<T> {
  const t0 = Date.now()
  for (;;) {
    const v = fn()
    if (v) return v
    if (Date.now() - t0 > ms) throw new Error('tempo esgotado')
    await new Promise((r) => setTimeout(r, 20))
  }
}

describe('nó de servidor de jogo em rede', () => {
  let p: RunningPlatform | null = null
  let node: GameNode | null = null
  afterEach(async () => {
    await node?.close()
    await p?.close()
    node = null
    p = null
  })

  it('registra, recebe a sala, jogadores conectam direto no nó; reconecta quando a plataforma cai', async () => {
    p = await startPlatform({
      port: 0, host: '127.0.0.1', dbPath: ':memory:', staticDir: null, logger: quiet, secret: SECRET,
      service: { pool: { maxServers: 0, mapFactory: () => testMap(() => {}), botDifficulty: 'facil' } },
    })
    const platformPort = p.port
    const nodePort = await freePort()
    node = new GameNode({ name: 'teste-1', platformUrl: `http://127.0.0.1:${platformPort}`, secret: SECRET, publicUrl: `ws://127.0.0.1:${nodePort}`, region: 'sa', capacity: 2, port: nodePort, host: '127.0.0.1', logger: quiet, reportMs: 100, mapFactory: () => testMap(() => {}) })
    const n = node
    await n.start()
    await until(() => n.connected)

    const health = await (await fetch(`http://127.0.0.1:${n.port}/api/health`)).json()
    expect(health).toMatchObject({ ok: true, node: 'teste-1', connected: true, capacity: 2 })
    const ph = await (await fetch(`http://127.0.0.1:${platformPort}/api/health`)).json()
    expect(ph).toMatchObject({ ok: true, db: true, nodes: 1 })

    const ws = new WebSocket(`ws://127.0.0.1:${platformPort}/platform`)
    const inbox: ServerMessage[] = []
    ws.on('message', (d) => inbox.push(JSON.parse(d.toString())))
    await new Promise((ok) => ws.once('open', ok))
    ws.send(JSON.stringify({ t: 'login', name: 'Rede', version: PLATFORM_VERSION, rid: 1 }))
    await until(() => inbox.find((m) => m.t === 'welcome'))
    ws.send(JSON.stringify({ t: 'roomCreate', rid: 2 }))
    const reply = await until(() => inbox.find((m) => m.t === 'ok' && m.rid === 2))
    const room = (reply as { data: MatchTicket }).data
    expect(room.url).toMatch(new RegExp(`^ws://127\\.0\\.0\\.1:${n.port}/game/[0-9a-f]{6}-\\d+$`))
    expect(n.servers.size).toBe(1)

    const game = new WebSocket(room.url!)
    game.binaryType = 'arraybuffer'
    const dec = new SnapshotDecoder()
    const gin: GameMessage[] = []
    game.on('message', (d) => gin.push(decodeServerMessage(new Uint8Array(d as ArrayBuffer), dec)))
    await new Promise((ok) => game.once('open', ok))
    game.send(encodeHello('x', '', room.ticket))
    // sala privada: entra na sala de espera, com a própria conta como dona
    const lobby = await until(() => gin.find((m) => m.type === 'lobby'))
    expect(lobby.type === 'lobby' && lobby.state.members.map((m) => m.name)).toEqual(['Rede'])
    // a plataforma vê a pessoa no nó (relatório)
    await until(() => p!.service.presenceOf(1) === 'room')
    const metrics = await (await fetch(`http://127.0.0.1:${platformPort}/metrics`)).text()
    expect(metrics).toMatch(/uc_node_up\{node="teste-1",region="sa"\} 1/)
    expect(metrics).toMatch(/uc_players_in_matches\{node="teste-1"\} 1/)
    expect(await (await fetch(`http://127.0.0.1:${n.port}/metrics`)).text()).toMatch(/uc_node_players\{node="teste-1"\} 1/)
    // bilhete de outro servidor não entra; servidor inexistente é recusado
    const nope = new WebSocket(`ws://127.0.0.1:${n.port}/game/abcdef-99`)
    await new Promise<void>((ok) => nope.once('error', () => ok()))

    // a plataforma cai e volta na mesma porta (mesmo segredo, banco novo): a partida continua no nó e é readotada
    ws.close()
    await p.close()
    p = null
    await until(() => !n.connected)
    expect(n.servers.size).toBe(1)
    p = await startPlatform({
      port: platformPort, host: '127.0.0.1', dbPath: ':memory:', staticDir: null, logger: quiet, secret: SECRET,
      service: { pool: { maxServers: 0, mapFactory: () => testMap(() => {}), botDifficulty: 'facil' } },
    })
    await until(() => n.connected, 20_000)
    const adopted = await until(() => p!.service.pool.byCode(room.code!))
    expect(adopted.node).toBe('teste-1')
    expect(gin.some((m) => m.type === 'kick')).toBe(false)
    expect(n.sessions).toBe(2)
    expect(game.readyState).toBe(WebSocket.OPEN)
    game.close(1000)
  }, 40_000)
})
