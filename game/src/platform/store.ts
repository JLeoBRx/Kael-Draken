import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import type { ChallengeProgress, FriendRequest, HistoryEntry, LeaderRow, MyProfile, PlayerStats } from '../shared/platform/messages'
import { nameKey } from '../shared/platform/messages'
import { START_MMR, dailyChallenges, levelFromXp } from '../shared/progression'

/**
 * Persistência da plataforma (SQLite embutido no Node, `node:sqlite`): contas,
 * sessões, estatísticas, amigos, histórico de partidas, desafios e registro
 * de auditoria. Tudo síncrono e em transações curtas — o processo da
 * plataforma é o único que escreve.
 *
 * Por que SQLite e não PostgreSQL: roda sem instalar nada (o mesmo comando
 * que sobe a plataforma cria o banco), cabe num servidor pequeno e aguenta
 * milhares de escritas por segundo. A interface abaixo é a única porta de
 * acesso; trocar por PostgreSQL é reimplementar esta classe.
 */

const SCHEMA_VERSION = 1

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  skin INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT 'recruta',
  mmr REAL NOT NULL DEFAULT ${START_MMR}
);
CREATE TABLE IF NOT EXISTS stats (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  top10 INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  deaths INTEGER NOT NULL DEFAULT 0,
  damage INTEGER NOT NULL DEFAULT 0,
  chests INTEGER NOT NULL DEFAULT 0,
  built INTEGER NOT NULL DEFAULT 0,
  harvested INTEGER NOT NULL DEFAULT 0,
  seconds INTEGER NOT NULL DEFAULT 0,
  best_place INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  last_used INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS friends (
  user_id INTEGER NOT NULL REFERENCES users(id),
  friend_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS friend_requests (
  from_id INTEGER NOT NULL REFERENCES users(id),
  to_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_id, to_id)
);
CREATE INDEX IF NOT EXISTS friend_requests_to ON friend_requests(to_id);
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  map_id TEXT NOT NULL,
  team_size INTEGER NOT NULL,
  region TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  teams INTEGER NOT NULL DEFAULT 0,
  humans INTEGER NOT NULL DEFAULT 0,
  bots INTEGER NOT NULL DEFAULT 0,
  winners TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS match_players (
  match_id INTEGER NOT NULL REFERENCES matches(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  place INTEGER NOT NULL,
  teams INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  damage INTEGER NOT NULL,
  seconds INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  victory INTEGER NOT NULL,
  mmr_delta REAL NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (match_id, user_id)
);
CREATE INDEX IF NOT EXISTS match_players_user ON match_players(user_id, at);
CREATE TABLE IF NOT EXISTS challenges (
  user_id INTEGER NOT NULL REFERENCES users(id),
  day TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, challenge_id)
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  user_id INTEGER,
  ip TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS audit_at ON audit(at);
`

/** Sessões sem uso por mais que isto deixam de valer. */
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000

interface UserRow {
  id: number
  name: string
  created_at: number
  xp: number
  skin: number
  title: string
  mmr: number
}

export interface MatchRecordInput {
  matchId: number
  userId: number
  place: number
  teams: number
  kills: number
  damage: number
  seconds: number
  victory: boolean
  chests: number
  built: number
  harvested: number
  xp: number
  mmrDelta: number
  at: number
}

export class PlatformStore {
  readonly db: DatabaseSync
  private readonly st: Record<string, StatementSync> = {}

  /** `path`: arquivo do banco, ou ':memory:' (testes). */
  constructor(path: string, private readonly clock: () => number = Date.now) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;')
    this.db.exec(SCHEMA)
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('schema') as { value: string } | undefined
    if (!row) this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schema', String(SCHEMA_VERSION))
    else if (Number(row.value) > SCHEMA_VERSION) throw new Error(`banco de dados de uma versão mais nova (esquema ${row.value}; esta plataforma conhece até ${SCHEMA_VERSION})`)
  }

  private q(sql: string): StatementSync {
    return (this.st[sql] ??= this.db.prepare(sql))
  }

  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN')
    try {
      const out = fn()
      this.db.exec('COMMIT')
      return out
    } catch (err) {
      this.db.exec('ROLLBACK')
      throw err
    }
  }

  close(): void {
    this.db.close()
  }

  // ---- contas e sessões ------------------------------------------------------

  /** Entra pelo nome: a conta existe → é ela; senão é criada. */
  loginByName(name: string): { userId: number; created: boolean; session: string } {
    return this.tx(() => {
      const now = this.clock()
      const key = nameKey(name)
      const found = this.q('SELECT id FROM users WHERE name_key = ?').get(key) as { id: number } | undefined
      let userId: number
      let created = false
      if (found) {
        userId = found.id
        this.q('UPDATE users SET last_seen = ? WHERE id = ?').run(now, userId)
      } else {
        const r = this.q('INSERT INTO users (name, name_key, created_at, last_seen) VALUES (?, ?, ?, ?)').run(name, key, now, now)
        userId = Number(r.lastInsertRowid)
        this.q('INSERT INTO stats (user_id) VALUES (?)').run(userId)
        created = true
      }
      const session = randomBytes(24).toString('base64url')
      this.q('INSERT INTO sessions (token, user_id, created_at, last_used) VALUES (?, ?, ?, ?)').run(session, userId, now, now)
      return { userId, created, session }
    })
  }

  /** Volta pela sessão salva (null se não existe ou venceu). */
  resumeSession(token: string): number | null {
    const now = this.clock()
    const row = this.q('SELECT user_id, last_used FROM sessions WHERE token = ?').get(token) as { user_id: number; last_used: number } | undefined
    if (!row) return null
    if (now - row.last_used > SESSION_TTL_MS) {
      this.q('DELETE FROM sessions WHERE token = ?').run(token)
      return null
    }
    this.q('UPDATE sessions SET last_used = ? WHERE token = ?').run(now, token)
    this.q('UPDATE users SET last_seen = ? WHERE id = ?').run(now, row.user_id)
    return row.user_id
  }

  endSession(token: string): void {
    this.q('DELETE FROM sessions WHERE token = ?').run(token)
  }

  userIdByName(name: string): number | null {
    const row = this.q('SELECT id FROM users WHERE name_key = ?').get(nameKey(name)) as { id: number } | undefined
    return row?.id ?? null
  }

  private user(id: number): UserRow | null {
    return (this.q('SELECT id, name, created_at, xp, skin, title, mmr FROM users WHERE id = ?').get(id) as UserRow | undefined) ?? null
  }

  stats(userId: number): PlayerStats {
    const r = this.q('SELECT * FROM stats WHERE user_id = ?').get(userId) as Record<string, number> | undefined
    return {
      matches: r?.matches ?? 0, wins: r?.wins ?? 0, top10: r?.top10 ?? 0, kills: r?.kills ?? 0, deaths: r?.deaths ?? 0, damage: r?.damage ?? 0,
      chests: r?.chests ?? 0, built: r?.built ?? 0, harvested: r?.harvested ?? 0, seconds: r?.seconds ?? 0, bestPlace: r?.best_place ?? 0,
    }
  }

  profile(userId: number): MyProfile | null {
    const u = this.user(userId)
    if (!u) return null
    return { id: u.id, name: u.name, xp: u.xp, level: levelFromXp(u.xp).level, skin: u.skin, title: u.title, mmr: Math.round(u.mmr), createdAt: u.created_at, stats: this.stats(u.id) }
  }

  /** Nome e nível (listas de amigos, grupo). */
  brief(userId: number): { id: number; name: string; level: number; skin: number } | null {
    const u = this.user(userId)
    return u ? { id: u.id, name: u.name, level: levelFromXp(u.xp).level, skin: u.skin } : null
  }

  mmr(userId: number): number {
    return this.user(userId)?.mmr ?? START_MMR
  }

  setSkin(userId: number, skin: number): void {
    this.q('UPDATE users SET skin = ? WHERE id = ?').run(skin, userId)
  }

  setTitle(userId: number, title: string): void {
    this.q('UPDATE users SET title = ? WHERE id = ?').run(title, userId)
  }

  addXp(userId: number, xp: number): void {
    this.q('UPDATE users SET xp = xp + ? WHERE id = ?').run(Math.max(0, Math.round(xp)), userId)
  }

  // ---- amigos -----------------------------------------------------------------

  friendIds(userId: number): number[] {
    return (this.q('SELECT friend_id FROM friends WHERE user_id = ? ORDER BY created_at').all(userId) as { friend_id: number }[]).map((r) => r.friend_id)
  }

  areFriends(a: number, b: number): boolean {
    return !!this.q('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?').get(a, b)
  }

  friendRequests(userId: number): FriendRequest[] {
    const incoming = this.q('SELECT from_id AS id FROM friend_requests WHERE to_id = ? ORDER BY created_at').all(userId) as { id: number }[]
    const outgoing = this.q('SELECT to_id AS id FROM friend_requests WHERE from_id = ? ORDER BY created_at').all(userId) as { id: number }[]
    const out: FriendRequest[] = []
    for (const [list, inc] of [[incoming, true], [outgoing, false]] as const) {
      for (const r of list) {
        const b = this.brief(r.id)
        if (b) out.push({ id: b.id, name: b.name, level: b.level, incoming: inc })
      }
    }
    return out
  }

  /**
   * Pedido de amizade. Se o outro já tinha pedido, vira amizade na hora.
   * Devolve o que aconteceu.
   */
  requestFriend(from: number, to: number): 'sent' | 'accepted' | 'already' | 'pending' {
    return this.tx(() => {
      if (this.areFriends(from, to)) return 'already'
      if (this.q('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').get(to, from)) {
        this.makeFriends(from, to)
        return 'accepted'
      }
      if (this.q('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').get(from, to)) return 'pending'
      this.q('INSERT INTO friend_requests (from_id, to_id, created_at) VALUES (?, ?, ?)').run(from, to, this.clock())
      return 'sent'
    })
  }

  /** Aceita um pedido recebido; false se não havia pedido. */
  acceptFriend(userId: number, from: number): boolean {
    return this.tx(() => {
      if (!this.q('SELECT 1 FROM friend_requests WHERE from_id = ? AND to_id = ?').get(from, userId)) return false
      this.makeFriends(userId, from)
      return true
    })
  }

  private makeFriends(a: number, b: number): void {
    const now = this.clock()
    this.q('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').run(a, b, b, a)
    this.q('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').run(a, b, now)
    this.q('INSERT OR IGNORE INTO friends (user_id, friend_id, created_at) VALUES (?, ?, ?)').run(b, a, now)
  }

  /** Recusa um pedido recebido ou cancela um enviado. */
  dropRequest(userId: number, other: number): void {
    this.q('DELETE FROM friend_requests WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').run(other, userId, userId, other)
  }

  removeFriend(a: number, b: number): void {
    this.q('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)').run(a, b, b, a)
  }

  // ---- partidas ---------------------------------------------------------------

  createMatch(kind: 'publico' | 'privado', mapId: string, teamSize: number, region: string): number {
    const r = this.q('INSERT INTO matches (kind, map_id, team_size, region, started_at) VALUES (?, ?, ?, ?, ?)').run(kind, mapId, teamSize, region, this.clock())
    return Number(r.lastInsertRowid)
  }

  endMatch(matchId: number, teams: number, humans: number, bots: number, winners: string[]): void {
    this.q('UPDATE matches SET ended_at = ?, teams = ?, humans = ?, bots = ?, winners = ? WHERE id = ?').run(this.clock(), teams, humans, bots, winners.join(', ').slice(0, 400), matchId)
  }

  matchKind(matchId: number): { kind: 'publico' | 'privado'; teamSize: number; mapId: string } | null {
    const r = this.q('SELECT kind, team_size, map_id FROM matches WHERE id = ?').get(matchId) as { kind: 'publico' | 'privado'; team_size: number; map_id: string } | undefined
    return r ? { kind: r.kind, teamSize: r.team_size, mapId: r.map_id } : null
  }

  /**
   * Grava o resultado de uma pessoa (uma vez por partida): linha do
   * histórico, estatísticas acumuladas, XP e habilidade. Devolve false se já
   * estava gravado (resultado repetido não conta duas vezes).
   */
  recordResult(r: MatchRecordInput): boolean {
    return this.tx(() => {
      if (this.q('SELECT 1 FROM match_players WHERE match_id = ? AND user_id = ?').get(r.matchId, r.userId)) return false
      this.q('INSERT INTO match_players (match_id, user_id, place, teams, kills, damage, seconds, xp, victory, mmr_delta, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(r.matchId, r.userId, r.place, r.teams, r.kills, Math.round(r.damage), Math.round(r.seconds), r.xp, r.victory ? 1 : 0, r.mmrDelta, r.at)
      this.q(`UPDATE stats SET matches = matches + 1, wins = wins + ?, top10 = top10 + ?, kills = kills + ?, deaths = deaths + ?, damage = damage + ?,
        chests = chests + ?, built = built + ?, harvested = harvested + ?, seconds = seconds + ?,
        best_place = CASE WHEN best_place = 0 OR ? < best_place THEN ? ELSE best_place END WHERE user_id = ?`)
        .run(r.victory ? 1 : 0, r.place <= 10 ? 1 : 0, r.kills, r.victory ? 0 : 1, Math.round(r.damage), r.chests, r.built, r.harvested, Math.round(r.seconds), r.place, r.place, r.userId)
      this.q('UPDATE users SET xp = xp + ?, mmr = MAX(0, mmr + ?) WHERE id = ?').run(r.xp, r.mmrDelta, r.userId)
      return true
    })
  }

  history(userId: number, limit = 20): HistoryEntry[] {
    const rows = this.q(`SELECT mp.match_id, m.kind, mp.at, mp.place, mp.teams, m.team_size, mp.kills, mp.damage, mp.seconds, mp.xp, mp.victory, m.map_id
      FROM match_players mp JOIN matches m ON m.id = mp.match_id WHERE mp.user_id = ? ORDER BY mp.at DESC, mp.match_id DESC LIMIT ?`).all(userId, limit) as Record<string, number | string>[]
    return rows.map((r) => ({
      matchId: Number(r.match_id), kind: r.kind as 'publico' | 'privado', at: Number(r.at), place: Number(r.place), teams: Number(r.teams), teamSize: Number(r.team_size),
      kills: Number(r.kills), damage: Number(r.damage), seconds: Number(r.seconds), xp: Number(r.xp), victory: Number(r.victory) === 1, mapId: String(r.map_id),
    }))
  }

  leaderboard(limit = 20): LeaderRow[] {
    const rows = this.q(`SELECT u.name, u.xp, s.wins, s.kills, s.matches FROM users u JOIN stats s ON s.user_id = u.id
      WHERE s.matches > 0 ORDER BY s.wins DESC, s.kills DESC, u.xp DESC LIMIT ?`).all(limit) as { name: string; xp: number; wins: number; kills: number; matches: number }[]
    return rows.map((r) => ({ name: r.name, level: levelFromXp(r.xp).level, wins: r.wins, kills: r.kills, matches: r.matches }))
  }

  // ---- desafios ----------------------------------------------------------------

  /** Desafios do dia com o progresso desta pessoa. */
  challenges(userId: number, day: string): ChallengeProgress[] {
    const rows = this.q('SELECT challenge_id, progress, done FROM challenges WHERE user_id = ? AND day = ?').all(userId, day) as { challenge_id: string; progress: number; done: number }[]
    const byId = new Map(rows.map((r) => [r.challenge_id, r]))
    return dailyChallenges(day).map((c) => {
      const r = byId.get(c.id)
      return { id: c.id, text: c.text, goal: c.goal, xp: c.xp, progress: Math.min(c.goal, r?.progress ?? 0), done: r?.done === 1 }
    })
  }

  /** Soma progresso; devolve os desafios concluídos agora (o XP é dado pelo chamador). */
  advanceChallenge(userId: number, day: string, id: string, gain: number, goal: number): boolean {
    if (gain <= 0) return false
    return this.tx(() => {
      const r = this.q('SELECT progress, done FROM challenges WHERE user_id = ? AND day = ? AND challenge_id = ?').get(userId, day, id) as { progress: number; done: number } | undefined
      if (r?.done === 1) return false
      const progress = Math.min(goal, (r?.progress ?? 0) + gain)
      const done = progress >= goal ? 1 : 0
      this.q('INSERT INTO challenges (user_id, day, challenge_id, progress, done) VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, day, challenge_id) DO UPDATE SET progress = excluded.progress, done = excluded.done')
        .run(userId, day, id, progress, done)
      return done === 1
    })
  }

  // ---- auditoria ----------------------------------------------------------------

  audit(kind: string, userId: number | null, ip: string, detail = ''): void {
    this.q('INSERT INTO audit (at, user_id, ip, kind, detail) VALUES (?, ?, ?, ?, ?)').run(this.clock(), userId, ip.slice(0, 64), kind, detail.slice(0, 500))
  }

  auditLog(limit = 50): { at: number; userId: number | null; ip: string; kind: string; detail: string }[] {
    const rows = this.q('SELECT at, user_id, ip, kind, detail FROM audit ORDER BY id DESC LIMIT ?').all(limit) as { at: number; user_id: number | null; ip: string; kind: string; detail: string }[]
    return rows.map((r) => ({ at: r.at, userId: r.user_id, ip: r.ip, kind: r.kind, detail: r.detail }))
  }

  /** Números gerais (painel de operação). */
  totals(): { users: number; matches: number } {
    const u = this.q('SELECT COUNT(*) AS n FROM users').get() as { n: number }
    const m = this.q('SELECT COUNT(*) AS n FROM matches WHERE ended_at IS NOT NULL').get() as { n: number }
    return { users: u.n, matches: m.n }
  }
}

