import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { GameHost, type HostConnection } from '../../src/server/core/game-host'
import { Matchmaker, packTeams, type QueueEntry } from '../../src/platform/matchmaker'
import { RateLimiter } from '../../src/platform/rate-limit'
import { startPlatform, type RunningPlatform } from '../../src/platform/server'
import { PlatformService, type ClientLink } from '../../src/platform/service'
import { PlatformStore } from '../../src/platform/store'
import { signTicket, ticketAuth, verifyTicket } from '../../src/platform/tickets'
import { GameMode, MatchPhase } from '../../src/shared/match/zone'
import { KICK_MATCH_OVER, SnapshotDecoder, decodeServerMessage, encodeHello, type ServerMessage as GameMessage } from '../../src/shared/net/protocol'
import { PLATFORM_VERSION, nameKey, type ClientRequest, type MatchTicket, type ServerMessage } from '../../src/shared/platform/messages'
import { CHALLENGES, dailyChallenges, levelFromXp, matchXp, mmrDelta, skinUnlocked, xpToNext } from '../../src/shared/progression'
import { testMap } from './sim-helpers'

describe('progressão', () => {
  it('níveis, XP de partida e habilidade', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, needed: xpToNext(1) })
    expect(levelFromXp(xpToNext(1)).level).toBe(2)
    expect(levelFromXp(xpToNext(1) + xpToNext(2) + 10)).toEqual({ level: 3, into: 10, needed: xpToNext(3) })
    expect(levelFromXp(1e9).level).toBe(100)
    const win = matchXp({ place: 1, teams: 20, kills: 4, damage: 900, seconds: 1300, victory: true, chests: 0, built: 0, harvested: 0 })
    const last = matchXp({ place: 20, teams: 20, kills: 0, damage: 0, seconds: 30, victory: false, chests: 0, built: 0, harvested: 0 })
    expect(win.total).toBe(50 + 20 * 25 + 240 + 45 + 300 + 400)
    expect(last.total).toBe(50)
    // quem vence acima da média ganha menos que quem vence abaixo; o último perde
    expect(mmrDelta(1000, 1000, 1, 20)).toBeGreaterThan(0)
    expect(mmrDelta(1400, 1000, 1, 20)).toBeLessThan(mmrDelta(800, 1000, 1, 20))
    expect(mmrDelta(1000, 1000, 20, 20)).toBeLessThan(0)
    expect(skinUnlocked(0, 1) && skinUnlocked(1, 1)).toBe(true)
    expect(skinUnlocked(7, 19)).toBe(false)
    expect(skinUnlocked(7, 20)).toBe(true)
  })

  it('desafios do dia: os mesmos para todos, distintos, mudam com a data', () => {
    const a = dailyChallenges('2026-11-23')
    expect(a).toHaveLength(3)
    expect(new Set(a.map((c) => c.id)).size).toBe(3)
    expect(dailyChallenges('2026-11-23')).toEqual(a)
    const days = new Set(Array.from({ length: 10 }, (_, k) => dailyChallenges(`2026-12-${String(k + 1).padStart(2, '0')}`).map((c) => c.id).join()))
    expect(days.size).toBeGreaterThan(3)
    for (const c of a) expect(CHALLENGES).toContain(c)
  })
})

describe('bilhetes e limites', () => {
  it('bilhete assinado: vale só para o servidor certo, dentro do prazo e sem adulteração', () => {
    const secret = 'segredo-de-teste'
    const t = signTicket(secret, { uid: '7', name: 'Ana', skin: 2, team: 1, srv: 's3', exp: 2000 })
    expect(verifyTicket(secret, t, 's3', 1000)).toMatchObject({ uid: '7', name: 'Ana', team: 1 })
    expect(verifyTicket(secret, t, 's4', 1000)).toBeNull()
    expect(verifyTicket(secret, t, 's3', 3000)).toBeNull()
    expect(verifyTicket('outro', t, 's3', 1000)).toBeNull()
    const [body, sig] = t.split('.')
    const forged = Buffer.from(JSON.stringify({ uid: '1', name: 'Ana', skin: 2, team: 1, srv: 's3', exp: 2000 })).toString('base64url')
    expect(verifyTicket(secret, `${forged}.${sig}`, 's3', 1000)).toBeNull()
    expect(verifyTicket(secret, `${body}.`, 's3', 1000)).toBeNull()
    expect(verifyTicket(secret, 'lixo', 's3', 1000)).toBeNull()
    expect(ticketAuth(secret, 's3', () => 1000).verify(t)).toEqual({ uid: '7', name: 'Ana', skin: 2, team: 1 })
  })

  it('limite em balde: rajada e reposição', () => {
    let now = 0
    const rl = new RateLimiter(3, 1, () => now)
    expect([rl.take('a'), rl.take('a'), rl.take('a'), rl.take('a')]).toEqual([true, true, true, false])
    expect(rl.take('b')).toBe(true)
    now += 1000
    expect(rl.take('a')).toBe(true)
    expect(rl.take('a')).toBe(false)
  })
})

describe('matchmaking', () => {
  const entry = (id: string, members: number[], mmr: number, since: number, teamSize = 1, fill = true): QueueEntry => ({ id, members, mmr, teamSize, region: 'sa', fill, since })

  it('fecha a partida cheia na hora; sozinho, espera e completa com bots', () => {
    const mm = new Matchmaker({ maxHumans: 3, lobbySize: 10, maxWaitMs: 5000, minHumans: 1 })
    mm.enqueue(entry('a', [1], 1000, 0))
    mm.enqueue(entry('b', [2], 1050, 100))
    expect(mm.tick(1000)).toEqual([])
    mm.enqueue(entry('c', [3], 990, 200))
    const [m] = mm.tick(1000)
    expect(m.humans).toBe(3)
    expect(m.bots).toBe(7)
    expect(m.teams).toEqual([[1], [2], [3]])
    expect(mm.size).toBe(0)
    mm.enqueue(entry('d', [4], 1000, 2000))
    expect(mm.tick(6000)).toEqual([])
    const [solo] = mm.tick(7000)
    expect(solo).toMatchObject({ humans: 1, bots: 9 })
  })

  it('separa por habilidade, alargando a janela com a espera; filas por modo e região', () => {
    const mm = new Matchmaker({ maxHumans: 2, lobbySize: 2, maxWaitMs: 60_000, mmrWindow: 100, mmrWidenPerSecond: 50 })
    mm.enqueue(entry('fraco', [1], 800, 0))
    mm.enqueue(entry('forte', [2], 1400, 0))
    mm.enqueue({ ...entry('outro-modo', [3], 800, 0), teamSize: 2 })
    mm.enqueue({ ...entry('outra-regiao', [4], 800, 0), region: 'eu' })
    expect(mm.tick(1000)).toEqual([])
    // 600 de diferença: precisa de (600 − 100) / 50 = 10 s de espera
    expect(mm.tick(9000)).toEqual([])
    const [m] = mm.tick(10_000)
    expect(m.entries.map((e) => e.id).sort()).toEqual(['forte', 'fraco'])
    expect(mm.waiting(2, 'sa')).toBe(1)
    expect(mm.waiting(1, 'eu')).toBe(1)
  })

  it('grupos ficam juntos; quem aceita preencher divide equipe', () => {
    expect(packTeams([entry('d', [1, 2], 1000, 0, 4), entry('t', [3, 4, 5], 1000, 1, 4), entry('s', [6], 1000, 2, 4)], 4)).toEqual([[3, 4, 5, 6], [1, 2]])
    expect(packTeams([entry('d', [1, 2], 1000, 0, 4, false), entry('s', [6], 1000, 2, 4)], 4)).toEqual([[1, 2], [6]])
    expect(packTeams([entry('a', [1], 1000, 0, 2), entry('b', [2], 1000, 1, 2), entry('c', [3], 1000, 2, 2)], 2)).toEqual([[1, 2], [3]])
    expect(() => new Matchmaker().enqueue(entry('x', [1, 2, 3], 1000, 0, 2))).toThrow()
  })
})

describe('banco da plataforma', () => {
  it('conta pelo nome (sem diferenciar maiúsculas), sessões, amigos e histórico', () => {
    let now = 1_000_000
    const st = new PlatformStore(':memory:', () => now)
    const a = st.loginByName('Ana Lima')
    expect(a.created).toBe(true)
    const again = st.loginByName('ana  lima')
    expect(again).toMatchObject({ userId: a.userId, created: false })
    expect(again.session).not.toBe(a.session)
    expect(st.resumeSession(a.session)).toBe(a.userId)
    expect(st.resumeSession('inventada')).toBeNull()
    st.endSession(a.session)
    expect(st.resumeSession(a.session)).toBeNull()
    now += 31 * 24 * 3600_000
    expect(st.resumeSession(again.session)).toBeNull()
    expect(nameKey('ÁRVORE  Alta ')).toBe('árvore alta')

    const b = st.loginByName('Bruno').userId
    expect(st.requestFriend(a.userId, b)).toBe('sent')
    expect(st.requestFriend(a.userId, b)).toBe('pending')
    expect(st.friendRequests(b)).toEqual([{ id: a.userId, name: 'Ana Lima', level: 1, incoming: true }])
    // pedir de volta vira amizade
    expect(st.requestFriend(b, a.userId)).toBe('accepted')
    expect(st.areFriends(a.userId, b) && st.areFriends(b, a.userId)).toBe(true)
    expect(st.friendRequests(b)).toEqual([])
    st.removeFriend(b, a.userId)
    expect(st.friendIds(a.userId)).toEqual([])

    const m = st.createMatch('publico', 'ilha-de-brasa', 1, 'sa')
    const rec = { matchId: m, userId: b, place: 1, teams: 10, kills: 3, damage: 420.4, seconds: 600, victory: true, chests: 2, built: 5, harvested: 30, xp: 900, mmrDelta: 12, at: now }
    expect(st.recordResult(rec)).toBe(true)
    expect(st.recordResult(rec)).toBe(false) // resultado repetido não conta duas vezes
    const p = st.profile(b)!
    expect(p.xp).toBe(900)
    expect(p.mmr).toBe(1012)
    expect(p.stats).toMatchObject({ matches: 1, wins: 1, top10: 1, kills: 3, deaths: 0, damage: 420, bestPlace: 1 })
    expect(st.history(b)[0]).toMatchObject({ matchId: m, place: 1, victory: true, kind: 'publico' })
    expect(st.leaderboard()[0]).toMatchObject({ name: 'Bruno', wins: 1 })
    st.close()
  })

  it('desafios: progresso acumulado até a meta, concluído uma vez', () => {
    const st = new PlatformStore(':memory:')
    const u = st.loginByName('Caio').userId
    const day = '2026-11-23'
    const c = dailyChallenges(day)[0]
    expect(st.advanceChallenge(u, day, c.id, c.goal - 1, c.goal)).toBe(false)
    expect(st.advanceChallenge(u, day, c.id, 5, c.goal)).toBe(true)
    expect(st.advanceChallenge(u, day, c.id, 5, c.goal)).toBe(false)
    expect(st.challenges(u, day)[0]).toMatchObject({ id: c.id, progress: c.goal, done: true })
    st.close()
  })
})

// ---- serviço completo (links e servidores de jogo em memória) ---------------------------

class Link implements ClientLink {
  inbox: ServerMessage[] = []
  closed: string | null = null
  private rid = 1
  constructor(readonly id: number, readonly svc: PlatformService, readonly ip = '10.0.0.1') {
    svc.open(this)
  }
  send(m: ServerMessage) {
    this.inbox.push(m)
  }
  close(reason: string) {
    this.closed = reason
  }
  /** Envia e devolve a resposta (ok/erro). */
  req(m: ClientRequest): ServerMessage | undefined {
    const rid = this.rid++
    this.svc.message(this.id, JSON.stringify({ ...m, rid }))
    return this.inbox.find((x) => (x.t === 'ok' || x.t === 'error') && x.rid === rid)
  }
  ok<T = unknown>(m: ClientRequest): T {
    const r = this.req(m)
    if (r?.t !== 'ok') throw new Error(`esperava ok para ${m.t}: ${JSON.stringify(r)}`)
    return r.data as T
  }
  last<T extends ServerMessage['t']>(t: T): Extract<ServerMessage, { t: T }> | undefined {
    for (let k = this.inbox.length - 1; k >= 0; k--) if (this.inbox[k].t === t) return this.inbox[k] as Extract<ServerMessage, { t: T }>
    return undefined
  }
}

class GameConn implements HostConnection {
  inbox: GameMessage[] = []
  closed: string | null = null
  readonly dec = new SnapshotDecoder()
  constructor(readonly id: number) {}
  send(d: Uint8Array) {
    this.inbox.push(decodeServerMessage(d, this.dec))
  }
  close(r: string) {
    this.closed = r
  }
}

function joinGame(host: GameHost, id: number, t: MatchTicket): GameConn {
  const c = new GameConn(id)
  host.connect(c)
  host.receive(id, encodeHello('ignorado', '', t.ticket))
  return c
}

function service(opts: { maxHumans?: number; lobbySize?: number; maxWaitMs?: number } = {}) {
  let now = Date.parse('2026-11-23T12:00:00Z')
  const store = new PlatformStore(':memory:', () => now)
  const svc = new PlatformService({
    store, secret: 'x', autoStart: false, clock: () => now, partyGraceMs: 1,
    matchmaker: { maxHumans: opts.maxHumans ?? 2, lobbySize: opts.lobbySize ?? 4, maxWaitMs: opts.maxWaitMs ?? 60_000 },
    pool: { maxServers: 4, autoStart: false, mapFactory: () => testMap(() => {}), botDifficulty: 'facil', publicBr: { warmup: 1, zoneSpeed: 50, endDelay: 1 }, reconnectSeconds: 0 },
  })
  return { svc, store, advance: (ms: number) => (now += ms), tickServers: (n = 1) => { for (let k = 0; k < n; k++) for (const s of [...svc.pool.servers.values()]) s.host.tick() } }
}

function login(svc: PlatformService, id: number, name: string): Link {
  const l = new Link(id, svc)
  l.ok({ t: 'login', name, version: PLATFORM_VERSION })
  return l
}

describe('plataforma: entrada, amigos e grupo', () => {
  it('entra só com o nome; volta pela sessão; a mesma conta em outro lugar derruba a anterior', () => {
    const { svc } = service()
    const l = new Link(1, svc)
    expect(l.req({ t: 'friendAdd', name: 'x' })).toMatchObject({ t: 'error' })
    expect(l.req({ t: 'login', name: 'Al', version: PLATFORM_VERSION })).toMatchObject({ t: 'error', message: expect.stringMatching(/3 letras/) })
    expect(l.req({ t: 'login', name: 'Ana', version: 999 })).toMatchObject({ t: 'error', message: expect.stringMatching(/desatualizada/) })
    l.ok({ t: 'login', name: '  Ana  ', version: PLATFORM_VERSION })
    const w = l.last('welcome')!
    expect(w).toMatchObject({ created: true, me: { name: 'Ana', level: 1, xp: 0 }, party: null, queue: null, match: null })
    expect(w.challenges).toHaveLength(3)
    // outra aba com a sessão salva
    const l2 = new Link(2, svc)
    l2.ok({ t: 'resume', session: w.session, version: PLATFORM_VERSION })
    expect(l2.last('welcome')!.me.id).toBe(w.me.id)
    expect(l.last('kicked')).toBeTruthy()
    expect(l.closed).toBeTruthy()
    expect(new Link(3, svc).req({ t: 'resume', session: 'falsa', version: PLATFORM_VERSION })).toMatchObject({ t: 'error' })
    // lixo e inundação encerram a conexão
    const bad = new Link(4, svc)
    svc.message(4, '{nao é json')
    expect(bad.closed).toMatch(/JSON/)
    const flood = new Link(5, svc)
    for (let k = 0; k < 60; k++) svc.message(5, JSON.stringify({ t: 'ping' }))
    expect(flood.closed).toMatch(/demais/)
    expect(svc.store.auditLog().some((a) => a.kind === 'abuse')).toBe(true)
  })

  it('pedido de amizade, presença, convite para o grupo e saída', () => {
    const { svc } = service()
    const ana = login(svc, 1, 'Ana')
    const bia = login(svc, 2, 'Bia')
    const caio = login(svc, 3, 'Caio')
    expect(ana.req({ t: 'friendAdd', name: 'Ninguém' })).toMatchObject({ t: 'error' })
    expect(ana.req({ t: 'partyInvite', id: bia.last('welcome')!.me.id })).toMatchObject({ t: 'error', message: expect.stringMatching(/amigos/) })
    expect(ana.ok({ t: 'friendAdd', name: 'bia' })).toEqual({ result: 'sent' })
    const req = bia.last('friends')!.requests[0]
    expect(req).toMatchObject({ name: 'Ana', incoming: true })
    bia.ok({ t: 'friendAccept', id: req.id })
    expect(ana.last('friends')!.friends).toEqual([expect.objectContaining({ name: 'Bia', presence: 'online' })])
    const biaId = bia.last('welcome')!.me.id
    ana.ok({ t: 'partyInvite', id: biaId })
    const inv = bia.last('partyInvite')!
    expect(inv.from.name).toBe('Ana')
    bia.ok({ t: 'partyAccept', partyId: inv.partyId })
    const party = ana.last('party')!.party!
    expect(party.members.map((m) => m.name)).toEqual(['Ana', 'Bia'])
    expect(party.leader).toBe(ana.last('welcome')!.me.id)
    // só o líder procura partida
    expect(bia.req({ t: 'queue', teamSize: 2, region: 'sa', fill: true })).toMatchObject({ t: 'error', message: expect.stringMatching(/líder/) })
    expect(ana.req({ t: 'queue', teamSize: 1, region: 'sa', fill: true })).toMatchObject({ t: 'error', message: expect.stringMatching(/2 pessoas/) })
    // Caio não é amigo: não pode ser convidado
    expect(ana.req({ t: 'partyInvite', id: caio.last('welcome')!.me.id })).toMatchObject({ t: 'error' })
    // Bia sai: grupo de um se desfaz
    bia.ok({ t: 'partyLeave' })
    expect(ana.last('party')!.party).toBeNull()
    expect(bia.last('party')!.party).toBeNull()
    // quem cai da plataforma fica offline para os amigos
    svc.closeLink(2)
    expect(ana.last('friends')!.friends[0].presence).toBe('offline')
  })
})

describe('plataforma: partidas', () => {
  it('dupla na fila → servidor alocado → bilhetes → partida até o fim → XP, estatísticas e desafios', () => {
    const { svc, store, tickServers } = service({ maxHumans: 2, lobbySize: 4 })
    const ana = login(svc, 1, 'Ana')
    const bia = login(svc, 2, 'Bia')
    ana.ok({ t: 'friendAdd', name: 'Bia' })
    bia.ok({ t: 'friendAccept', id: ana.last('welcome')!.me.id })
    ana.ok({ t: 'partyInvite', id: bia.last('welcome')!.me.id })
    bia.ok({ t: 'partyAccept', partyId: bia.last('partyInvite')!.partyId })
    ana.ok({ t: 'queue', teamSize: 2, region: 'sa', fill: true })
    expect(bia.last('queue')!.queue).toMatchObject({ searching: true, teamSize: 2, inQueue: 2 })
    expect(svc.presenceOf(bia.last('welcome')!.me.id)).toBe('searching')
    svc.step()
    const ta = ana.last('matchFound')!.match
    const tb = bia.last('matchFound')!.match
    expect(ta.path).toBe(tb.path)
    expect(ta.kind).toBe('publico')
    const server = svc.pool.get(ta.path.split('/')[2])!
    // bilhete de um servidor não vale em outro, nem adulterado
    const stranger = new GameHost({ mapId: 'teste', map: testMap(() => {}), auth: ticketAuth('x', 's99') })
    const sc = new GameConn(9)
    stranger.connect(sc)
    stranger.receive(9, encodeHello('Ana', '', ta.ticket))
    expect(sc.closed).toMatch(/Bilhete/)
    const ga = joinGame(server.host, 1, ta)
    const gb = joinGame(server.host, 2, tb)
    const wa = ga.inbox.find((m) => m.type === 'welcome')!
    expect(wa).toBeTruthy()
    tickServers(40)
    expect(server.host.phase).not.toBe(MatchPhase.Warmup)
    // a dupla ficou na mesma equipe; bots completam o lobby
    const pa = server.host.sim.players.get(wa.type === 'welcome' ? wa.playerId : 0)!
    const team = [...server.host.sim.players.values()].filter((p) => p.team === pa.team)
    expect(team.filter((p) => !p.bot).map((p) => p.name).sort()).toEqual(['Ana', 'Bia'])
    expect([...server.host.sim.players.values()].filter((p) => p.bot)).toHaveLength(2)
    svc.refreshPresence()
    expect(ana.last('friends')!.friends[0].presence).toBe('match')
    // a zona (50×) termina a partida; cada uma recebe XP e o servidor é liberado
    for (let k = 0; k < 30 * 150 && svc.pool.servers.size > 0; k++) tickServers()
    expect(svc.pool.servers.size).toBe(0)
    expect(ga.closed).toBe(KICK_MATCH_OVER)
    expect(gb.closed).toBe(KICK_MATCH_OVER)
    const ra = ana.last('reward')!.reward
    expect(ra.xp.total).toBeGreaterThanOrEqual(50)
    expect(ra.matchId).toBeGreaterThan(0)
    const me = ana.last('me')!.me
    expect(me.stats.matches).toBe(1)
    expect(me.xp).toBe(ra.xp.total + ra.challengeXp)
    expect(store.history(me.id)).toHaveLength(1)
    expect(ana.last('challenges')!.challenges.some((c) => c.progress > 0)).toBe(true)
    // sem partida ativa, volta a 'online'; na lista de classificação aparecem as duas
    expect(svc.presenceOf(me.id)).toBe('online')
    expect(ana.ok<{ name: string }[]>({ t: 'leaderboard' }).map((r) => r.name).sort()).toEqual(['Ana', 'Bia'])
    expect(ana.ok<unknown[]>({ t: 'history' })).toHaveLength(1)
  })

  it('sozinho na fila: espera e começa com bots; cancelar tira da fila', () => {
    const { svc, advance } = service({ maxHumans: 4, lobbySize: 6, maxWaitMs: 5000 })
    const ana = login(svc, 1, 'Ana')
    ana.ok({ t: 'queue', teamSize: 1, region: 'sa', fill: true })
    ana.ok({ t: 'queueCancel' })
    expect(ana.last('queue')!.queue).toBeNull()
    svc.step()
    expect(svc.pool.servers.size).toBe(0)
    ana.ok({ t: 'queue', teamSize: 1, region: 'sa', fill: true })
    advance(3000)
    svc.step()
    expect(ana.last('matchFound')).toBeUndefined()
    advance(3000)
    svc.step()
    const t = ana.last('matchFound')!.match
    expect(svc.pool.get(t.path.split('/')[2])!.host.config.bots).toBe(5)
  })

  it('sala privada: código, entrar pelo código, dono configura e inicia', () => {
    const { svc, tickServers } = service()
    const ana = login(svc, 1, 'Ana')
    const bia = login(svc, 2, 'Bia')
    const room = ana.ok<MatchTicket>({ t: 'roomCreate' })
    expect(room.code).toMatch(/^[A-Z2-9]{6}$/)
    expect(bia.req({ t: 'roomJoin', code: 'ZZZZZZ' })).toMatchObject({ t: 'error' })
    const joined = bia.ok<MatchTicket>({ t: 'roomJoin', code: room.code!.toLowerCase() })
    expect(joined.path).toBe(room.path)
    const server = svc.pool.get(room.path.split('/')[2])!
    // Bia chega antes, mas quem criou a sala é a anfitriã
    const gb = joinGame(server.host, 2, joined)
    const ga = joinGame(server.host, 1, room)
    const lobby = gb.inbox.filter((m) => m.type === 'lobby').pop()!
    if (lobby.type !== 'lobby') throw new Error('tipo')
    expect(lobby.state.members.map((m) => m.name)).toEqual(['Bia', 'Ana'])
    expect(lobby.state.owner).toBe(ga.id)
    expect(server.host.info().lobby).toBe(true)
    svc.refreshPresence()
    expect(svc.presenceOf(bia.last('welcome')!.me.id)).toBe('room')
    void ga
    tickServers(2)
  })

  it('visual e título só quando desbloqueados', () => {
    const { svc } = service()
    const ana = login(svc, 1, 'Ana')
    ana.ok({ t: 'setSkin', skin: 1 })
    expect(ana.last('me')!.me.skin).toBe(1)
    expect(ana.req({ t: 'setSkin', skin: 7 })).toMatchObject({ t: 'error', message: expect.stringMatching(/nível 20/) })
    expect(ana.req({ t: 'setSkin', skin: 99 })).toMatchObject({ t: 'error' })
    expect(ana.req({ t: 'setTitle', id: 'lenda' })).toMatchObject({ t: 'error' })
    ana.ok({ t: 'setTitle', id: 'recruta' })
    expect(ana.ok({ t: 'profile', name: 'ana' })).toMatchObject({ name: 'Ana', presence: 'online', skin: 1 })
  })
})

describe('plataforma em rede (HTTP + WebSocket)', () => {
  let p: RunningPlatform | null = null
  afterEach(async () => {
    await p?.close()
    p = null
  })

  it('entra pelo WebSocket, encontra partida e conecta ao servidor de jogo com o bilhete', async () => {
    p = await startPlatform({
      port: 0, host: '127.0.0.1', dbPath: ':memory:', staticDir: null, logger: { info() {}, warn() {} },
      service: { matchmaker: { maxHumans: 1, lobbySize: 3, maxWaitMs: 0 }, pool: { maxServers: 2, mapFactory: () => testMap(() => {}), botDifficulty: 'facil', publicBr: { warmup: 30 } } },
    })
    const status = await (await fetch(`http://127.0.0.1:${p.port}/api/online/status`)).json()
    expect(status).toMatchObject({ platform: true, version: PLATFORM_VERSION, online: 0 })
    const ws = new WebSocket(`ws://127.0.0.1:${p.port}/platform`)
    const inbox: ServerMessage[] = []
    ws.on('message', (d) => inbox.push(JSON.parse(d.toString())))
    await new Promise((ok) => ws.once('open', ok))
    const until = async <T>(fn: () => T | undefined, ms = 5000): Promise<T> => {
      const t0 = Date.now()
      for (;;) {
        const v = fn()
        if (v) return v
        if (Date.now() - t0 > ms) throw new Error('tempo esgotado')
        await new Promise((r) => setTimeout(r, 20))
      }
    }
    ws.send(JSON.stringify({ t: 'login', name: 'Rede', version: PLATFORM_VERSION }))
    await until(() => inbox.find((m) => m.t === 'welcome'))
    ws.send(JSON.stringify({ t: 'queue', teamSize: 1, region: 'sa', fill: true }))
    const found = await until(() => inbox.find((m) => m.t === 'matchFound'))
    if (found.t !== 'matchFound') throw new Error('tipo')
    const game = new WebSocket(`ws://127.0.0.1:${p.port}${found.match.path}`)
    game.binaryType = 'arraybuffer'
    const dec = new SnapshotDecoder()
    const gin: GameMessage[] = []
    game.on('message', (d) => gin.push(decodeServerMessage(new Uint8Array(d as ArrayBuffer), dec)))
    await new Promise((ok) => game.once('open', ok))
    game.send(encodeHello('x', '', found.match.ticket))
    const w = await until(() => gin.find((m) => m.type === 'welcome'))
    expect(w.type === 'welcome' && w.mode).toBe(GameMode.BattleRoyale)
    await until(() => gin.find((m) => m.type === 'snapshot'))
    // servidor inexistente: a conexão é recusada
    const nope = new WebSocket(`ws://127.0.0.1:${p.port}/game/s999`)
    await new Promise<void>((ok) => nope.once('error', () => ok()))
    game.close(1000)
    ws.close()
  })
})
