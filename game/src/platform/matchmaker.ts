/**
 * Matchmaking das partidas públicas.
 *
 * Uma fila por (tamanho de equipe, região). Cada entrada é um grupo (ou uma
 * pessoa sozinha) com a habilidade média dos membros. A cada passo, a
 * entrada mais antiga de cada fila é a âncora: entram com ela as entradas
 * de habilidade próxima — a janela começa em `mmrWindow` e alarga com a
 * espera da âncora. A partida sai quando junta `maxHumans` pessoas, ou
 * quando a âncora esperou `maxWaitMs` (com pelo menos `minHumans`); o resto
 * do lobby é completado com bots até `lobbySize`.
 *
 * Equipes: grupos ficam juntos; com "preencher", grupos menores que a equipe
 * dividem equipe com outros (o que sobrar de vaga o servidor completa com bots).
 */

export interface QueueEntry {
  /** Id do grupo, ou "u<id>" para quem está sozinho. */
  id: string
  members: number[]
  mmr: number
  teamSize: number
  region: string
  /** Completar a equipe com desconhecidos. */
  fill: boolean
  /** Quando entrou na fila (ms). */
  since: number
}

export interface FormedMatch {
  teamSize: number
  region: string
  /** Pessoas agrupadas por equipe (índice = equipe no servidor). */
  teams: number[][]
  entries: QueueEntry[]
  humans: number
  bots: number
  avgMmr: number
}

export interface MatchmakerOptions {
  /** Pessoas no máximo por partida. */
  maxHumans: number
  /** Total do lobby (pessoas + bots). */
  lobbySize: number
  /** Espera da âncora até começar com quem houver. */
  maxWaitMs: number
  minHumans: number
  /** Diferença de habilidade aceita no início e quanto alarga por segundo. */
  mmrWindow: number
  mmrWidenPerSecond: number
}

export const DEFAULT_MATCHMAKER: MatchmakerOptions = { maxHumans: 24, lobbySize: 24, maxWaitMs: 20_000, minHumans: 1, mmrWindow: 150, mmrWidenPerSecond: 25 }

export class Matchmaker {
  readonly opts: MatchmakerOptions
  private readonly entries = new Map<string, QueueEntry>()

  constructor(opts: Partial<MatchmakerOptions> = {}) {
    this.opts = { ...DEFAULT_MATCHMAKER, ...opts }
    if (this.opts.lobbySize < this.opts.maxHumans) this.opts.lobbySize = this.opts.maxHumans
  }

  enqueue(e: QueueEntry): void {
    if (e.members.length === 0 || e.members.length > e.teamSize) throw new Error('grupo maior que a equipe')
    this.entries.set(e.id, e)
  }

  /** Tira da fila; devolve a entrada (se estava). */
  dequeue(id: string): QueueEntry | undefined {
    const e = this.entries.get(id)
    this.entries.delete(id)
    return e
  }

  get(id: string): QueueEntry | undefined {
    return this.entries.get(id)
  }

  /** Pessoas esperando na mesma fila. */
  waiting(teamSize: number, region: string): number {
    let n = 0
    for (const e of this.entries.values()) if (e.teamSize === teamSize && e.region === region) n += e.members.length
    return n
  }

  get size(): number {
    let n = 0
    for (const e of this.entries.values()) n += e.members.length
    return n
  }

  /** Forma as partidas que já podem sair; as entradas usadas saem da fila. */
  tick(now: number): FormedMatch[] {
    const groups = new Map<string, QueueEntry[]>()
    for (const e of this.entries.values()) {
      const key = `${e.teamSize}|${e.region}`
      const g = groups.get(key)
      if (g) g.push(e)
      else groups.set(key, [e])
    }
    const out: FormedMatch[] = []
    for (const list of groups.values()) {
      list.sort((a, b) => a.since - b.since || a.id.localeCompare(b.id))
      while (list.length > 0) {
        const m = this.tryForm(list, now)
        if (!m) break
        for (const e of m.entries) {
          this.entries.delete(e.id)
          list.splice(list.indexOf(e), 1)
        }
        out.push(m)
      }
    }
    return out
  }

  private tryForm(list: QueueEntry[], now: number): FormedMatch | null {
    const o = this.opts
    const anchor = list[0]
    const waited = now - anchor.since
    const window = o.mmrWindow + (o.mmrWidenPerSecond * Math.max(0, waited)) / 1000
    const take: QueueEntry[] = []
    let humans = 0
    for (const e of list) {
      if (Math.abs(e.mmr - anchor.mmr) > window) continue
      if (humans + e.members.length > o.maxHumans) continue
      take.push(e)
      humans += e.members.length
      if (humans >= o.maxHumans) break
    }
    const ready = humans >= o.maxHumans || (waited >= o.maxWaitMs && humans >= o.minHumans)
    if (!ready) return null
    const teams = packTeams(take, anchor.teamSize)
    const avgMmr = take.reduce((s, e) => s + e.mmr * e.members.length, 0) / Math.max(1, humans)
    return { teamSize: anchor.teamSize, region: anchor.region, teams, entries: take, humans, bots: Math.max(0, o.lobbySize - humans), avgMmr }
  }
}

/**
 * Distribui os grupos em equipes: maiores primeiro; quem aceita preencher
 * entra numa equipe com vaga de outro grupo que também aceita.
 */
export function packTeams(entries: readonly QueueEntry[], teamSize: number): number[][] {
  const teams: { members: number[]; open: boolean }[] = []
  const sorted = [...entries].sort((a, b) => b.members.length - a.members.length || a.since - b.since)
  for (const e of sorted) {
    if (teamSize === 1) {
      for (const m of e.members) teams.push({ members: [m], open: false })
      continue
    }
    const room = e.fill ? teams.find((t) => t.open && t.members.length + e.members.length <= teamSize) : undefined
    if (room) room.members.push(...e.members)
    else teams.push({ members: [...e.members], open: e.fill })
  }
  return teams.map((t) => t.members)
}
