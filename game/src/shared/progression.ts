/**
 * Progressão (plataforma online): níveis, XP por partida, habilidade (MMR),
 * cosméticos desbloqueáveis e desafios diários. Compartilhado: o servidor da
 * plataforma calcula e grava; o cliente só mostra (barra de XP, o que falta
 * para o próximo visual, progresso dos desafios).
 */

export const MAX_LEVEL = 100

/** XP para ir do nível `level` ao seguinte. */
export function xpToNext(level: number): number {
  return Math.min(2500, 300 + 150 * (level - 1))
}

export interface LevelInfo {
  level: number
  /** XP dentro do nível atual. */
  into: number
  /** XP do nível atual até o próximo (0 no máximo). */
  needed: number
}

export function levelFromXp(xp: number): LevelInfo {
  let level = 1
  let rest = Math.max(0, Math.floor(xp))
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level)
    level++
  }
  return { level, into: level >= MAX_LEVEL ? 0 : rest, needed: level >= MAX_LEVEL ? 0 : xpToNext(level) }
}

/** O que uma pessoa fez numa partida (vem do servidor de jogo). */
export interface MatchPerformance {
  place: number
  teams: number
  kills: number
  damage: number
  seconds: number
  victory: boolean
  chests: number
  built: number
  harvested: number
}

export interface XpBreakdown {
  participation: number
  survival: number
  kills: number
  damage: number
  placement: number
  victory: number
  total: number
}

/** XP de uma partida: presença, tempo vivo, eliminações, dano, colocação e vitória. */
export function matchXp(m: MatchPerformance): XpBreakdown {
  const participation = 50
  const survival = Math.min(20, Math.floor(m.seconds / 60)) * 25
  const kills = m.kills * 60
  const damage = Math.floor(Math.min(m.damage, 5000) / 20)
  const span = Math.max(1, m.teams - 1)
  const placement = m.teams > 1 ? Math.round(300 * (1 - (Math.max(1, m.place) - 1) / span)) : 0
  const victory = m.victory ? 400 : 0
  return { participation, survival, kills, damage, placement, victory, total: participation + survival + kills + damage + placement + victory }
}

export const START_MMR = 1000

/**
 * Habilidade estilo Elo para partidas com muitas equipes: o resultado é a
 * fração das equipes que ficaram atrás (1 = venceu, 0 = primeira a sair) e a
 * expectativa vem da diferença para a média da partida.
 */
export function mmrDelta(mmr: number, lobbyAvg: number, place: number, teams: number, k = 32): number {
  if (teams < 2) return 0
  const score = 1 - (Math.max(1, place) - 1) / (teams - 1)
  const expected = 1 / (1 + 10 ** ((lobbyAvg - mmr) / 400))
  return Math.round(k * (score - expected) * 10) / 10
}

// ---- cosméticos ------------------------------------------------------------

/** Nível em que cada visual (índice do personagem) é liberado. */
export const SKIN_UNLOCK_LEVEL: readonly number[] = [1, 1, 3, 5, 8, 12, 16, 20]

export function skinUnlocked(skin: number, level: number): boolean {
  const need = SKIN_UNLOCK_LEVEL[skin]
  return need !== undefined && level >= need
}

export interface TitleDef {
  id: string
  name: string
  /** Como liberar (texto para a tela). */
  how: string
  unlocked: (level: number, wins: number) => boolean
}

export const TITLES: readonly TitleDef[] = [
  { id: 'recruta', name: 'Recruta', how: 'Inicial', unlocked: () => true },
  { id: 'explorador', name: 'Explorador', how: 'Nível 5', unlocked: (l) => l >= 5 },
  { id: 'sobrevivente', name: 'Sobrevivente', how: 'Nível 10', unlocked: (l) => l >= 10 },
  { id: 'vencedor', name: 'Vencedor', how: '1 vitória', unlocked: (_l, w) => w >= 1 },
  { id: 'veterano', name: 'Veterano', how: 'Nível 20', unlocked: (l) => l >= 20 },
  { id: 'imbativel', name: 'Imbatível', how: '10 vitórias', unlocked: (_l, w) => w >= 10 },
  { id: 'elite', name: 'Elite', how: 'Nível 35', unlocked: (l) => l >= 35 },
  { id: 'lenda', name: 'Lenda', how: 'Nível 50', unlocked: (l) => l >= 50 },
]

export function titleById(id: string): TitleDef | undefined {
  return TITLES.find((t) => t.id === id)
}

// ---- desafios diários -------------------------------------------------------

export type ChallengeStat = 'matches' | 'kills' | 'damage' | 'top10' | 'wins' | 'chests' | 'built' | 'harvested' | 'minutes'

export interface ChallengeDef {
  id: string
  text: string
  stat: ChallengeStat
  goal: number
  xp: number
}

export const CHALLENGES: readonly ChallengeDef[] = [
  { id: 'jogar-3', text: 'Jogue 3 partidas', stat: 'matches', goal: 3, xp: 250 },
  { id: 'eliminar-5', text: 'Elimine 5 adversários', stat: 'kills', goal: 5, xp: 350 },
  { id: 'dano-1000', text: 'Cause 1.000 de dano', stat: 'damage', goal: 1000, xp: 300 },
  { id: 'top10-2', text: 'Fique entre os 10 primeiros 2 vezes', stat: 'top10', goal: 2, xp: 300 },
  { id: 'vencer-1', text: 'Vença 1 partida', stat: 'wins', goal: 1, xp: 500 },
  { id: 'baus-8', text: 'Abra 8 baús', stat: 'chests', goal: 8, xp: 250 },
  { id: 'construir-40', text: 'Construa 40 peças', stat: 'built', goal: 40, xp: 250 },
  { id: 'coletar-300', text: 'Colete 300 materiais', stat: 'harvested', goal: 300, xp: 250 },
  { id: 'sobreviver-20', text: 'Sobreviva 20 minutos no total', stat: 'minutes', goal: 20, xp: 300 },
]

export const DAILY_CHALLENGES = 3

/** Dia (UTC) no formato AAAA-MM-DD. */
export function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Os desafios do dia: os mesmos para todos, sorteados pela data. */
export function dailyChallenges(day: string): ChallengeDef[] {
  let h = 2166136261
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  const pool = [...CHALLENGES]
  const out: ChallengeDef[] = []
  while (out.length < DAILY_CHALLENGES && pool.length > 0) {
    h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0
    out.push(pool.splice(h % pool.length, 1)[0])
  }
  return out
}

/** Quanto uma partida avança um desafio. */
export function challengeGain(stat: ChallengeStat, m: MatchPerformance): number {
  switch (stat) {
    case 'matches': return 1
    case 'kills': return m.kills
    case 'damage': return Math.round(m.damage)
    case 'top10': return m.place <= 10 ? 1 : 0
    case 'wins': return m.victory ? 1 : 0
    case 'chests': return m.chests
    case 'built': return m.built
    case 'harvested': return m.harvested
    case 'minutes': return Math.floor(m.seconds / 60)
  }
}
