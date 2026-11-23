import { randomInt } from 'node:crypto'
import type { HostLogger, MatchSummary, PlayerResult } from '../server/core/game-host'
import { MAX_TEAM_SIZE, sanitizeName } from '../shared/net/protocol'
import {
  MAX_PARTY,
  MIN_NAME_CHARS,
  PLATFORM_VERSION,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  normalizeRoomCode,
  type ClientMessage,
  type FriendEntry,
  type MatchTicket,
  type PartyState,
  type Presence,
  type PublicProfile,
  type QueueState,
  type RegionInfo,
  type ServerMessage,
  type ServerPush,
} from '../shared/platform/messages'
import { challengeGain, dailyChallenges, dayKey, levelFromXp, matchXp, mmrDelta, skinUnlocked, SKIN_UNLOCK_LEVEL, titleById, type MatchPerformance } from '../shared/progression'
import { Matchmaker, type MatchmakerOptions } from './matchmaker'
import { GameServerPool, type GameServer, type PoolOptions } from './pool'
import { RateLimiter } from './rate-limit'
import type { PlatformStore } from './store'
import { signTicket } from './tickets'

/**
 * Serviço da plataforma online, independente de transporte: recebe
 * "links" (conexões já aceitas) e mensagens JSON, guarda quem está online,
 * grupos, convites e filas, e conversa com o banco (PlatformStore), o
 * matchmaking e o conjunto de servidores de jogo.
 *
 * Regras de segurança aplicadas aqui (o cliente nunca é confiável):
 * - toda mensagem é validada (tipo e campos) e tem limite de tamanho;
 * - limites por conexão (mensagens/s), por IP (entradas por minuto) e por
 *   conta (pedidos de amizade, convites);
 * - grupos só com amigos; só o líder entra na fila; visual e título só se
 *   desbloqueados; resultados só chegam dos servidores de jogo (nunca do
 *   cliente) e contam uma vez por partida;
 * - registro de auditoria para entradas, amizades, filas, partidas e abusos.
 */

export interface ClientLink {
  readonly id: number
  readonly ip: string
  send(msg: ServerMessage): void
  close(reason: string): void
}

export interface PlatformOptions {
  store: PlatformStore
  secret: string
  regions?: RegionInfo[]
  matchmaker?: Partial<MatchmakerOptions>
  pool?: Omit<PoolOptions, 'secret'>
  logger?: HostLogger
  clock?: () => number
  /** Validade dos bilhetes de entrada (ms). */
  ticketTtlMs?: number
  /** Quanto tempo o grupo espera quem caiu da plataforma (ms). */
  partyGraceMs?: number
  /** Liga os temporizadores (matchmaking a cada segundo, presença). Testes chamam step(). */
  autoStart?: boolean
}

export const DEFAULT_REGIONS: RegionInfo[] = [
  { id: 'sa', name: 'América do Sul' },
  { id: 'na', name: 'América do Norte' },
  { id: 'eu', name: 'Europa' },
]

const MAX_MESSAGE_BYTES = 4096

class UserError extends Error {}

interface LinkState {
  link: ClientLink
  userId: number | null
  session: string | null
}

interface Party {
  id: string
  leader: number
  members: number[]
  invited: Set<number>
}

const silent: HostLogger = { info() {}, warn() {} }

export class PlatformService {
  readonly store: PlatformStore
  readonly pool: GameServerPool
  readonly matchmaker: Matchmaker
  readonly regions: RegionInfo[]
  private readonly secret: string
  private readonly log: HostLogger
  private readonly clock: () => number
  private readonly opts: PlatformOptions
  private readonly links = new Map<number, LinkState>()
  /** Quem está online, pela conta. */
  private readonly online = new Map<number, LinkState>()
  private readonly parties = new Map<string, Party>()
  private readonly partyOf = new Map<number, string>()
  /** Fila em que cada pessoa está (id da entrada do matchmaking). */
  private readonly queuedAs = new Map<number, string>()
  /** Partida em andamento por conta (bilhete para voltar). */
  private readonly activeMatch = new Map<number, MatchTicket>()
  private readonly presence = new Map<number, Presence>()
  private readonly leaving = new Map<number, ReturnType<typeof setTimeout>>()
  private readonly msgLimit: RateLimiter
  private readonly loginLimit: RateLimiter
  private readonly socialLimit: RateLimiter
  private readonly timers: ReturnType<typeof setInterval>[] = []
  private nextParty = 1
  private lastBusyNotice = 0
  /** Encerrado: conexões que ainda fecharem depois disto são ignoradas. */
  private closed = false

  constructor(opts: PlatformOptions) {
    this.opts = opts
    this.store = opts.store
    this.secret = opts.secret
    this.log = opts.logger ?? silent
    this.clock = opts.clock ?? Date.now
    this.regions = opts.regions ?? DEFAULT_REGIONS
    this.matchmaker = new Matchmaker(opts.matchmaker)
    this.pool = new GameServerPool({ maxServers: 8, logger: this.log, clock: this.clock, ...opts.pool, secret: opts.secret }, {
      onResult: (s, r) => this.onResult(s, r),
      onMatchEnd: (s, m) => this.onMatchEnd(s, m),
      onReleased: (s) => this.onReleased(s),
    })
    this.msgLimit = new RateLimiter(40, 20, this.clock)
    this.loginLimit = new RateLimiter(10, 1 / 6, this.clock)
    this.socialLimit = new RateLimiter(15, 1 / 4, this.clock)
    if (opts.autoStart !== false) {
      const t1 = setInterval(() => this.step(), 1000)
      const t2 = setInterval(() => this.refreshPresence(), 3000)
      for (const t of [t1, t2]) (t as { unref?: () => void }).unref?.()
      this.timers.push(t1, t2)
    }
  }

  get onlineCount(): number {
    return this.online.size
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    for (const t of this.timers) clearInterval(t)
    for (const t of this.leaving.values()) clearTimeout(t)
    const links = [...this.links.values()]
    this.links.clear()
    this.online.clear()
    for (const st of links) st.link.close('Plataforma encerrada')
    this.pool.close()
  }

  // ---- conexões ------------------------------------------------------------------

  open(link: ClientLink): void {
    if (this.closed) {
      link.close('Plataforma encerrada')
      return
    }
    this.links.set(link.id, { link, userId: null, session: null })
  }

  closeLink(linkId: number): void {
    const st = this.links.get(linkId)
    if (!st) return
    this.links.delete(linkId)
    if (st.userId !== null && this.online.get(st.userId) === st) this.goOffline(st.userId)
  }

  private goOffline(userId: number): void {
    this.online.delete(userId)
    this.cancelQueue(userId, 'Busca cancelada: alguém do grupo saiu')
    // o grupo espera um pouco (queda de rede, página recarregando)
    const grace = this.opts.partyGraceMs ?? 30_000
    if (this.partyOf.has(userId)) {
      const t = setTimeout(() => {
        this.leaving.delete(userId)
        if (!this.online.has(userId)) this.leaveParty(userId)
      }, grace)
      ;(t as { unref?: () => void }).unref?.()
      this.leaving.set(userId, t)
    }
    this.refreshPresence()
  }

  /** Mensagem de texto de um link. Erros do cliente voltam como `error`; nada é engolido. */
  message(linkId: number, raw: string): void {
    const st = this.links.get(linkId)
    if (!st) return
    if (raw.length > MAX_MESSAGE_BYTES) {
      this.abuse(st, 'mensagem grande demais')
      return
    }
    if (!this.msgLimit.take(`l${linkId}`)) {
      this.abuse(st, 'mensagens demais por segundo')
      return
    }
    let msg: ClientMessage
    try {
      msg = JSON.parse(raw) as ClientMessage
    } catch {
      this.abuse(st, 'JSON inválido')
      return
    }
    if (typeof msg !== 'object' || msg === null || typeof msg.t !== 'string') {
      this.abuse(st, 'mensagem sem tipo')
      return
    }
    const rid = Number.isInteger(msg.rid) ? (msg.rid as number) : undefined
    try {
      const data = this.handle(st, msg)
      if (rid !== undefined) st.link.send({ t: 'ok', rid, data })
    } catch (err) {
      if (err instanceof UserError) st.link.send({ t: 'error', rid, message: err.message })
      else {
        this.log.warn(`erro tratando "${msg.t}": ${err instanceof Error ? err.stack ?? err.message : err}`)
        st.link.send({ t: 'error', rid, message: 'Erro interno da plataforma' })
      }
    }
  }

  private abuse(st: LinkState, why: string): void {
    this.store.audit('abuse', st.userId, st.link.ip, why)
    st.link.send({ t: 'error', message: `Conexão encerrada: ${why}` })
    st.link.close(why)
    this.closeLink(st.link.id)
  }

  private handle(st: LinkState, m: ClientMessage): unknown {
    if (m.t === 'ping') return { now: this.clock() }
    if (m.t === 'login') return this.login(st, str(m.name, 64), num(m.version))
    if (m.t === 'resume') return this.resume(st, str(m.session, 128), num(m.version))
    const uid = st.userId
    if (uid === null) throw new UserError('Entre com seu nome primeiro')
    switch (m.t) {
      case 'logout':
        return this.logout(st)
      case 'friendAdd':
        return this.friendAdd(uid, str(m.name, 64))
      case 'friendAccept':
        return this.friendAccept(uid, int(m.id))
      case 'friendDecline':
        this.store.dropRequest(uid, int(m.id))
        this.pushFriends(uid, int(m.id))
        return null
      case 'friendRemove':
        this.store.removeFriend(uid, int(m.id))
        this.store.audit('amizade-removida', uid, st.link.ip, String(m.id))
        this.pushFriends(uid, int(m.id))
        return null
      case 'partyInvite':
        return this.partyInvite(uid, int(m.id))
      case 'partyAccept':
        return this.partyAccept(uid, str(m.partyId, 32))
      case 'partyDecline':
        return this.partyDecline(uid, str(m.partyId, 32))
      case 'partyLeave':
        this.leaveParty(uid)
        return null
      case 'partyKick':
        return this.partyKick(uid, int(m.id))
      case 'queue':
        return this.queue(uid, int(m.teamSize), str(m.region, 8), m.fill !== false)
      case 'queueCancel':
        this.cancelQueue(uid, 'Busca cancelada')
        return null
      case 'roomCreate':
        return this.roomCreate(uid)
      case 'roomJoin':
        return this.roomJoin(uid, str(m.code, 16))
      case 'setSkin':
        return this.setSkin(uid, int(m.skin))
      case 'setTitle':
        return this.setTitle(uid, str(m.id, 32))
      case 'history':
        return this.store.history(uid)
      case 'leaderboard':
        return this.store.leaderboard()
      case 'profile':
        return this.publicProfile(str(m.name, 64))
      default:
        throw new UserError(`Pedido desconhecido: ${String((m as { t: unknown }).t).slice(0, 20)}`)
    }
  }

  // ---- entrada ------------------------------------------------------------------

  private login(st: LinkState, rawName: string, version: number): null {
    if (version !== PLATFORM_VERSION) throw new UserError(`Versão do jogo desatualizada (plataforma ${PLATFORM_VERSION}, jogo ${version}). Recarregue a página.`)
    if (!this.loginLimit.take(st.link.ip)) {
      this.store.audit('login-limitado', null, st.link.ip)
      throw new UserError('Tentativas demais. Espere um minuto.')
    }
    const name = sanitizeName(rawName)
    if (Array.from(rawName.trim()).length < MIN_NAME_CHARS || Array.from(name).length < MIN_NAME_CHARS) throw new UserError(`Use um nome com pelo menos ${MIN_NAME_CHARS} letras`)
    const { userId, created, session } = this.store.loginByName(name)
    this.store.audit(created ? 'conta-criada' : 'entrada', userId, st.link.ip, name)
    this.attach(st, userId, session, created)
    return null
  }

  private resume(st: LinkState, session: string, version: number): null {
    if (version !== PLATFORM_VERSION) throw new UserError(`Versão do jogo desatualizada (plataforma ${PLATFORM_VERSION}, jogo ${version}). Recarregue a página.`)
    if (!this.loginLimit.take(`r${st.link.ip}`)) throw new UserError('Tentativas demais. Espere um minuto.')
    const userId = this.store.resumeSession(session)
    if (userId === null) throw new UserError('Sessão expirada: entre com seu nome')
    this.store.audit('retorno', userId, st.link.ip)
    this.attach(st, userId, session, false)
    return null
  }

  private attach(st: LinkState, userId: number, session: string, created: boolean): void {
    if (st.userId !== null && st.userId !== userId) this.detach(st)
    const prev = this.online.get(userId)
    if (prev && prev !== st) {
      prev.link.send({ t: 'kicked', reason: 'Sua conta entrou em outro lugar' })
      prev.userId = null
      prev.link.close('conta em outro lugar')
    }
    const t = this.leaving.get(userId)
    if (t) clearTimeout(t)
    this.leaving.delete(userId)
    st.userId = userId
    st.session = session
    this.online.set(userId, st)
    const me = this.store.profile(userId)!
    const match = this.activeMatch.get(userId) ?? null
    st.link.send({
      t: 'welcome', session, created, me, friends: this.friendList(userId), requests: this.store.friendRequests(userId), party: this.partyState(userId),
      queue: this.queueState(userId), challenges: this.store.challenges(userId, dayKey(this.clock())), regions: this.regions, online: this.online.size,
      match: match && this.pool.get(match.path.split('/').pop()!) ? match : null,
    })
    this.refreshPresence()
  }

  private logout(st: LinkState): null {
    const uid = st.userId!
    if (st.session) this.store.endSession(st.session)
    this.store.audit('saida', uid, st.link.ip)
    this.detach(st)
    return null
  }

  private detach(st: LinkState): void {
    const uid = st.userId
    if (uid === null) return
    st.userId = null
    st.session = null
    if (this.online.get(uid) === st) {
      this.online.delete(uid)
      this.cancelQueue(uid, 'Busca cancelada: alguém do grupo saiu')
      this.leaveParty(uid)
      this.refreshPresence()
    }
  }

  private push(userId: number, msg: ServerPush): void {
    this.online.get(userId)?.link.send(msg)
  }

  // ---- presença e amigos ---------------------------------------------------------------

  presenceOf(userId: number): Presence {
    if (!this.online.has(userId)) return 'offline'
    const srv = this.pool.whereIs(userId)
    if (srv) return srv.kind === 'privado' ? 'room' : 'match'
    if (this.queuedAs.has(userId)) return 'searching'
    return 'online'
  }

  private friendList(userId: number): FriendEntry[] {
    const out: FriendEntry[] = []
    for (const id of this.store.friendIds(userId)) {
      const b = this.store.brief(id)
      if (b) out.push({ id, name: b.name, level: b.level, presence: this.presenceOf(id) })
    }
    const order: Record<Presence, number> = { match: 0, room: 0, searching: 1, online: 1, offline: 2 }
    return out.sort((a, b) => order[a.presence] - order[b.presence] || a.name.localeCompare(b.name))
  }

  private pushFriends(...userIds: number[]): void {
    for (const id of userIds) {
      if (!this.online.has(id)) continue
      this.push(id, { t: 'friends', friends: this.friendList(id), requests: this.store.friendRequests(id) })
    }
  }

  private lastOnlineCount = -1

  /** Recalcula a presença de quem está online e avisa amigos e grupo das mudanças. */
  refreshPresence(): void {
    if (this.online.size !== this.lastOnlineCount) {
      this.lastOnlineCount = this.online.size
      for (const st of this.online.values()) st.link.send({ t: 'online', count: this.online.size })
    }
    const changed: number[] = []
    const ids = new Set([...this.online.keys(), ...this.presence.keys()])
    for (const id of ids) {
      const p = this.presenceOf(id)
      if (this.presence.get(id) === p) continue
      if (p === 'offline') this.presence.delete(id)
      else this.presence.set(id, p)
      changed.push(id)
    }
    if (changed.length === 0) return
    const notify = new Set<number>()
    const parties = new Set<string>()
    for (const id of changed) {
      for (const f of this.store.friendIds(id)) if (this.online.has(f)) notify.add(f)
      const pid = this.partyOf.get(id)
      if (pid) parties.add(pid)
    }
    for (const f of notify) this.push(f, { t: 'friends', friends: this.friendList(f), requests: this.store.friendRequests(f) })
    for (const pid of parties) this.pushParty(pid)
  }

  private friendAdd(uid: number, name: string): { result: string } {
    if (!this.socialLimit.take(`f${uid}`)) throw new UserError('Pedidos demais. Espere um pouco.')
    const other = this.store.userIdByName(name.trim())
    if (other === null) throw new UserError(`Ninguém se chama "${name.trim().slice(0, 16)}"`)
    if (other === uid) throw new UserError('Esse é você')
    const result = this.store.requestFriend(uid, other)
    this.store.audit('amizade-' + result, uid, '', String(other))
    this.pushFriends(uid, other)
    const me = this.store.brief(uid)!
    if (result === 'sent') this.push(other, { t: 'notice', text: `${me.name} quer ser seu amigo`, level: 'info' })
    if (result === 'accepted') this.push(other, { t: 'notice', text: `Você e ${me.name} agora são amigos`, level: 'info' })
    return { result }
  }

  private friendAccept(uid: number, from: number): null {
    if (!this.store.acceptFriend(uid, from)) throw new UserError('Pedido de amizade não encontrado')
    this.store.audit('amizade-aceita', uid, '', String(from))
    this.pushFriends(uid, from)
    const me = this.store.brief(uid)!
    this.push(from, { t: 'notice', text: `${me.name} aceitou seu pedido de amizade`, level: 'info' })
    return null
  }

  private publicProfile(name: string): PublicProfile {
    const id = this.store.userIdByName(name)
    const p = id !== null ? this.store.profile(id) : null
    if (!p) throw new UserError('Jogador não encontrado')
    return { id: p.id, name: p.name, level: p.level, skin: p.skin, title: p.title, presence: this.presenceOf(p.id), stats: p.stats }
  }

  // ---- grupos ---------------------------------------------------------------------------

  private partyState(userId: number): PartyState | null {
    const pid = this.partyOf.get(userId)
    const party = pid ? this.parties.get(pid) : undefined
    if (!party) return null
    return {
      id: party.id, leader: party.leader, invited: [...party.invited],
      members: party.members.map((id) => {
        const b = this.store.brief(id)!
        return { id, name: b.name, level: b.level, skin: b.skin, presence: this.presenceOf(id) }
      }),
    }
  }

  private pushParty(pid: string): void {
    const party = this.parties.get(pid)
    if (!party) return
    for (const id of party.members) this.push(id, { t: 'party', party: this.partyState(id) })
  }

  private partyInvite(uid: number, target: number): null {
    if (!this.socialLimit.take(`p${uid}`)) throw new UserError('Convites demais. Espere um pouco.')
    if (target === uid) throw new UserError('Esse é você')
    if (!this.store.areFriends(uid, target)) throw new UserError('Só dá para convidar amigos')
    if (!this.online.has(target)) throw new UserError('Esse amigo não está online')
    let pid = this.partyOf.get(uid)
    let party = pid ? this.parties.get(pid) : undefined
    if (party && party.leader !== uid) throw new UserError('Só o líder do grupo convida')
    if (party?.members.includes(target)) throw new UserError('Já está no seu grupo')
    if (party && party.members.length >= MAX_PARTY) throw new UserError(`O grupo já tem ${MAX_PARTY} pessoas`)
    if (!party) {
      pid = `g${this.nextParty++}`
      party = { id: pid, leader: uid, members: [uid], invited: new Set() }
      this.parties.set(pid, party)
      this.partyOf.set(uid, pid)
      this.cancelQueue(uid, 'Busca cancelada: grupo formado')
    }
    party.invited.add(target)
    const me = this.store.brief(uid)!
    this.push(target, { t: 'partyInvite', partyId: party.id, from: { id: uid, name: me.name } })
    this.store.audit('grupo-convite', uid, '', `${party.id} → ${target}`)
    this.pushParty(party.id)
    return null
  }

  private partyAccept(uid: number, pid: string): null {
    const party = this.parties.get(pid)
    if (!party || !party.invited.has(uid)) throw new UserError('Convite não encontrado ou já expirou')
    if (party.members.length >= MAX_PARTY) throw new UserError('O grupo está cheio')
    if (this.partyOf.get(uid) !== pid) this.leaveParty(uid)
    this.cancelQueue(uid, 'Busca cancelada: você entrou em um grupo')
    this.cancelQueue(party.leader, 'Busca cancelada: alguém entrou no grupo')
    party.invited.delete(uid)
    party.members.push(uid)
    this.partyOf.set(uid, pid)
    this.store.audit('grupo-entrou', uid, '', pid)
    this.pushParty(pid)
    return null
  }

  private partyDecline(uid: number, pid: string): null {
    const party = this.parties.get(pid)
    if (party?.invited.delete(uid)) {
      const me = this.store.brief(uid)!
      this.push(party.leader, { t: 'notice', text: `${me.name} recusou o convite`, level: 'info' })
      this.pushParty(pid)
    }
    return null
  }

  private partyKick(uid: number, target: number): null {
    const pid = this.partyOf.get(uid)
    const party = pid ? this.parties.get(pid) : undefined
    if (!party || party.leader !== uid) throw new UserError('Só o líder tira alguém do grupo')
    if (target === uid || !party.members.includes(target)) throw new UserError('Essa pessoa não está no grupo')
    this.push(target, { t: 'notice', text: 'Você foi retirado do grupo', level: 'info' })
    this.leaveParty(target)
    return null
  }

  private leaveParty(uid: number): void {
    const pid = this.partyOf.get(uid)
    if (!pid) return
    const party = this.parties.get(pid)
    this.partyOf.delete(uid)
    if (!party) return
    this.cancelQueue(party.leader, 'Busca cancelada: alguém saiu do grupo')
    party.members = party.members.filter((m) => m !== uid)
    this.push(uid, { t: 'party', party: null })
    this.store.audit('grupo-saiu', uid, '', pid)
    if (party.members.length <= 1) {
      // grupo de um não é grupo
      for (const m of party.members) {
        this.partyOf.delete(m)
        this.push(m, { t: 'party', party: null })
      }
      this.parties.delete(pid)
      return
    }
    if (party.leader === uid) party.leader = party.members[0]
    this.pushParty(pid)
  }

  // ---- fila ------------------------------------------------------------------------------

  private groupOf(uid: number): { id: string; members: number[]; leader: number } {
    const pid = this.partyOf.get(uid)
    const party = pid ? this.parties.get(pid) : undefined
    return party ? { id: party.id, members: [...party.members], leader: party.leader } : { id: `u${uid}`, members: [uid], leader: uid }
  }

  private queue(uid: number, teamSize: number, region: string, fill: boolean): null {
    if (!(teamSize >= 1 && teamSize <= MAX_TEAM_SIZE)) throw new UserError('Modo inválido')
    if (!this.regions.some((r) => r.id === region)) throw new UserError('Região desconhecida')
    const g = this.groupOf(uid)
    if (g.leader !== uid) throw new UserError('Só o líder do grupo inicia a busca')
    if (g.members.length > teamSize) throw new UserError(`O grupo tem ${g.members.length} pessoas: escolha equipes de pelo menos ${g.members.length}`)
    if (this.queuedAs.has(uid)) throw new UserError('Já está procurando partida')
    for (const m of g.members) {
      if (!this.online.has(m)) throw new UserError('Alguém do grupo está offline')
      if (this.pool.whereIs(m)) throw new UserError('Alguém do grupo ainda está numa partida')
    }
    const mmr = g.members.reduce((s, m) => s + this.store.mmr(m), 0) / g.members.length
    this.matchmaker.enqueue({ id: g.id, members: g.members, mmr, teamSize, region, fill, since: this.clock() })
    for (const m of g.members) this.queuedAs.set(m, g.id)
    this.store.audit('fila', uid, '', `${g.id} equipes de ${teamSize} ${region} (${g.members.length})`)
    this.pushQueue(g.members)
    this.refreshPresence()
    return null
  }

  private cancelQueue(uid: number, why: string): void {
    const qid = this.queuedAs.get(uid)
    if (!qid) return
    const e = this.matchmaker.dequeue(qid)
    const members = e?.members ?? [uid]
    for (const m of members) {
      this.queuedAs.delete(m)
      this.push(m, { t: 'queue', queue: null })
      if (m !== uid) this.push(m, { t: 'notice', text: why, level: 'info' })
    }
    this.refreshPresence()
  }

  private queueState(uid: number): QueueState | null {
    const qid = this.queuedAs.get(uid)
    const e = qid ? this.matchmaker.get(qid) : undefined
    if (!e) return null
    return { searching: true, teamSize: e.teamSize, region: e.region, waitedMs: this.clock() - e.since, inQueue: this.matchmaker.waiting(e.teamSize, e.region) }
  }

  private pushQueue(members: number[]): void {
    for (const m of members) this.push(m, { t: 'queue', queue: this.queueState(m) })
  }

  /** Um passo do matchmaking (a cada segundo): forma partidas, aloca servidores, entrega bilhetes. */
  step(): void {
    const now = this.clock()
    for (const fm of this.matchmaker.tick(now)) {
      const server = this.pool.createPublic(fm.teamSize, fm.region, fm.humans, fm.bots)
      if (!server) {
        // sem servidor livre: voltam para a fila, sem perder o lugar
        for (const e of fm.entries) this.matchmaker.enqueue(e)
        if (now - this.lastBusyNotice > 10_000) {
          this.lastBusyNotice = now
          for (const e of fm.entries) for (const m of e.members) this.push(m, { t: 'notice', text: 'Todos os servidores estão ocupados; você continua na fila', level: 'info' })
        }
        continue
      }
      server.avgMmr = fm.avgMmr
      server.matchId = this.store.createMatch('publico', server.host.map.def.id, fm.teamSize, fm.region)
      this.log.info(`partida ${server.matchId} em ${server.id}: ${fm.humans} pessoas + ${fm.bots} bots, equipes de ${fm.teamSize} (${fm.region})`)
      this.store.audit('partida-formada', null, '', `${server.matchId} ${server.id} ${fm.humans}+${fm.bots}`)
      fm.teams.forEach((team, t) => {
        for (const uid of team) {
          this.queuedAs.delete(uid)
          const ticket = this.ticketFor(uid, server, fm.teamSize > 1 ? t : -1)
          const match: MatchTicket = { path: server.path, ticket, kind: 'publico', teamSize: fm.teamSize }
          this.activeMatch.set(uid, match)
          this.push(uid, { t: 'queue', queue: null })
          this.push(uid, { t: 'matchFound', match })
        }
      })
    }
    // quem está na fila vê o tempo e quantos esperam
    for (const [uid] of this.queuedAs) this.push(uid, { t: 'queue', queue: this.queueState(uid) })
    this.pool.sweep()
  }

  private ticketFor(uid: number, server: GameServer, team: number): string {
    const p = this.store.profile(uid)!
    server.invited.add(uid)
    return signTicket(this.secret, { uid: String(uid), name: p.name, skin: p.skin, team, srv: server.id, exp: this.clock() + (this.opts.ticketTtlMs ?? 3 * 3600_000) })
  }

  // ---- salas privadas ---------------------------------------------------------------------

  private newCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = ''
      for (let k = 0; k < ROOM_CODE_LENGTH; k++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)]
      if (!this.pool.byCode(code)) return code
    }
    throw new UserError('Não foi possível gerar um código de sala')
  }

  private roomCreate(uid: number): MatchTicket {
    if (this.queuedAs.has(uid)) throw new UserError('Cancele a busca antes de criar uma sala')
    if (!this.socialLimit.take(`r${uid}`, 3)) throw new UserError('Salas demais em pouco tempo. Espere um pouco.')
    const code = this.newCode()
    const server = this.pool.createRoom(code, this.regions[0].id, String(uid))
    if (!server) throw new UserError('Todos os servidores estão ocupados. Tente de novo em instantes.')
    this.store.audit('sala-criada', uid, '', `${code} ${server.id}`)
    const match: MatchTicket = { path: server.path, ticket: this.ticketFor(uid, server, -1), kind: 'privado', teamSize: 1, code }
    this.activeMatch.set(uid, match)
    // o grupo recebe o código
    const g = this.groupOf(uid)
    const me = this.store.brief(uid)!
    for (const m of g.members) if (m !== uid) this.push(m, { t: 'roomInvite', code, from: { id: uid, name: me.name } })
    return match
  }

  private roomJoin(uid: number, raw: string): MatchTicket {
    const code = normalizeRoomCode(raw)
    if (code.length !== ROOM_CODE_LENGTH) throw new UserError(`O código tem ${ROOM_CODE_LENGTH} letras e números`)
    if (!this.socialLimit.take(`j${uid}`)) throw new UserError('Tentativas demais. Espere um pouco.')
    const server = this.pool.byCode(code)
    if (!server) {
      this.store.audit('sala-inexistente', uid, '', code)
      throw new UserError('Sala não encontrada (o código pode ter expirado)')
    }
    if (this.queuedAs.has(uid)) this.cancelQueue(uid, 'Busca cancelada: alguém do grupo entrou numa sala')
    const match: MatchTicket = { path: server.path, ticket: this.ticketFor(uid, server, -1), kind: 'privado', teamSize: 1, code }
    this.activeMatch.set(uid, match)
    return match
  }

  // ---- cosméticos -------------------------------------------------------------------------

  private setSkin(uid: number, skin: number): null {
    const p = this.store.profile(uid)!
    if (SKIN_UNLOCK_LEVEL[skin] === undefined) throw new UserError('Visual inexistente')
    if (!skinUnlocked(skin, p.level)) throw new UserError(`Visual bloqueado: chegue ao nível ${SKIN_UNLOCK_LEVEL[skin]}`)
    this.store.setSkin(uid, skin)
    this.push(uid, { t: 'me', me: this.store.profile(uid)! })
    return null
  }

  private setTitle(uid: number, id: string): null {
    const p = this.store.profile(uid)!
    const t = titleById(id)
    if (!t) throw new UserError('Título inexistente')
    if (!t.unlocked(p.level, p.stats.wins)) throw new UserError(`Título bloqueado (${t.how})`)
    this.store.setTitle(uid, id)
    this.push(uid, { t: 'me', me: this.store.profile(uid)! })
    return null
  }

  // ---- resultados (vindos dos servidores de jogo) -------------------------------------------

  private ensureMatchRow(server: GameServer, teamSize: number): number {
    if (server.matchId === null) server.matchId = this.store.createMatch(server.kind, server.host.map.def.id, teamSize, server.region)
    return server.matchId
  }

  private onResult(server: GameServer, r: PlayerResult): void {
    const uid = Number(r.uid)
    if (!r.uid || !Number.isInteger(uid) || !server.invited.has(uid)) return
    const matchId = this.ensureMatchRow(server, r.teamSize)
    const before = this.store.profile(uid)
    if (!before) return
    const perf: MatchPerformance = { place: r.place, teams: r.teams, kills: r.kills, damage: r.damage, seconds: r.seconds, victory: r.victory, chests: r.chests, built: r.built, harvested: r.harvested }
    const xp = matchXp(perf)
    // habilidade só muda em partidas públicas
    const delta = server.kind === 'publico' ? mmrDelta(this.store.mmr(uid), server.avgMmr || this.store.mmr(uid), r.place, r.teams) : 0
    const at = this.clock()
    const fresh = this.store.recordResult({ matchId, userId: uid, place: r.place, teams: r.teams, kills: r.kills, damage: r.damage, seconds: r.seconds, victory: r.victory, chests: r.chests, built: r.built, harvested: r.harvested, xp: xp.total, mmrDelta: delta, at })
    if (!fresh) return
    // desafios do dia
    const day = dayKey(at)
    let challengeXp = 0
    const completed: string[] = []
    for (const c of dailyChallenges(day)) {
      if (this.store.advanceChallenge(uid, day, c.id, challengeGain(c.stat, perf), c.goal)) {
        challengeXp += c.xp
        completed.push(c.text)
      }
    }
    if (challengeXp > 0) this.store.addXp(uid, challengeXp)
    const after = this.store.profile(uid)!
    this.store.audit('resultado', uid, '', `partida ${matchId}: ${r.place}/${r.teams}, ${r.kills} elim., ${xp.total + challengeXp} XP`)
    this.push(uid, {
      t: 'reward',
      reward: { matchId, place: r.place, teams: r.teams, victory: r.victory, xp, challengeXp, completed, levelBefore: levelFromXp(before.xp).level, levelAfter: levelFromXp(after.xp).level, mmrDelta: delta },
    })
    this.push(uid, { t: 'me', me: after })
    this.push(uid, { t: 'challenges', challenges: this.store.challenges(uid, day) })
  }

  private onMatchEnd(server: GameServer, s: MatchSummary): void {
    const matchId = this.ensureMatchRow(server, s.teamSize)
    this.store.endMatch(matchId, s.teams, s.humans, s.bots, s.winners)
    this.log.info(`partida ${matchId} (${server.id}) terminou: venceu ${s.winners.join(', ') || '—'}`)
    // sala privada: a próxima partida da sala é outra linha
    if (server.kind === 'privado') server.matchId = null
  }

  private onReleased(server: GameServer): void {
    for (const [uid, m] of this.activeMatch) if (m.path === server.path) this.activeMatch.delete(uid)
    this.refreshPresence()
  }

  /** Números para /api/online/status. */
  status(): { online: number; searching: number; servers: { id: string; kind: string; players: number; phase: number; code: boolean; tickMs: number; alive: number }[]; maxServers: number; users: number; matches: number } {
    const totals = this.store.totals()
    return {
      online: this.online.size,
      searching: this.matchmaker.size,
      servers: [...this.pool.servers.values()].map((s) => ({ id: s.id, kind: s.kind, players: s.host.playerCount, phase: s.host.phase, code: !!s.code, tickMs: Number(s.host.tickMs.toFixed(3)), alive: s.host.sim.aliveCount })),
      maxServers: this.opts.pool?.maxServers ?? 8,
      ...totals,
    }
  }
}

function str(v: unknown, max: number): string {
  if (typeof v !== 'string') throw new UserError('Campo de texto inválido')
  return v.slice(0, max)
}

function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new UserError('Campo numérico inválido')
  return v
}

function int(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new UserError('Campo numérico inválido')
  return v
}
