/**
 * Histórico local de partidas (modo offline e também as online, enquanto as
 * contas e o banco de dados não chegam na Fase 6). Fica no navegador.
 */

export interface MatchRecord {
  /** ISO 8601 */
  date: string
  mapId: string
  mapName: string
  /** 'Offline' ou o nome do servidor */
  where: string
  place: number
  total: number
  kills: number
  damage: number
  seconds: number
  victory: boolean
}

export interface HistoryTotals {
  matches: number
  wins: number
  kills: number
  top5: number
  bestPlace: number | null
  damage: number
}

const KEY = 'ultima-chama:historico:v1'
const MAX = 50

function valid(r: unknown): r is MatchRecord {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return typeof o.date === 'string' && typeof o.mapId === 'string' && typeof o.place === 'number' && typeof o.total === 'number'
    && typeof o.kills === 'number' && typeof o.victory === 'boolean'
}

export function loadHistory(): MatchRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown
    return Array.isArray(raw) ? raw.filter(valid).slice(0, MAX) : []
  } catch {
    return []
  }
}

export function addToHistory(r: MatchRecord): MatchRecord[] {
  const list = [r, ...loadHistory()].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    // armazenamento indisponível: o resultado aparece, mas não fica salvo
  }
  return list
}

export function historyTotals(list: readonly MatchRecord[]): HistoryTotals {
  let best: number | null = null
  for (const r of list) best = best === null ? r.place : Math.min(best, r.place)
  return {
    matches: list.length,
    wins: list.filter((r) => r.victory).length,
    kills: list.reduce((n, r) => n + r.kills, 0),
    top5: list.filter((r) => r.place <= 5).length,
    bestPlace: best,
    damage: list.reduce((n, r) => n + (r.damage || 0), 0),
  }
}
