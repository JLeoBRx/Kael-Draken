import type { Rng } from '../math/rng'

/**
 * Modos e fases da partida, e a zona segura (a "nuvem de cinzas" que fecha o
 * mapa). O servidor sorteia a zona; cliente e servidor calculam o círculo de
 * qualquer tick com a mesma função (`zoneCircleAt`).
 */

export const GameMode = { Training: 0, BattleRoyale: 1 } as const
export const GAME_MODE_NAMES: Record<number, string> = { 0: 'Treino', 1: 'Battle royale' }

export const MatchPhase = {
  /** Treino livre (renascimento). */
  Training: 0,
  /** Aquecimento antes da partida: sem dano, sem loot. */
  Warmup: 1,
  /** Todos no dirigível; cada um salta quando quiser. */
  Airship: 2,
  /** Partida em andamento. */
  Playing: 3,
  /** Há um vencedor (ou ninguém sobrou). */
  Ended: 4,
} as const

export interface ZoneCircle {
  x: number
  z: number
  r: number
}

/** Uma etapa: espera com o círculo `from`, depois encolhe até `to`. */
export interface ZoneStage {
  index: number
  fromX: number
  fromZ: number
  fromR: number
  toX: number
  toZ: number
  toR: number
  /** Tick em que começa a encolher e em que termina. */
  shrinkStart: number
  shrinkEnd: number
  /** Dano por segundo fora da zona nesta etapa (direto na vida). */
  dps: number
}

export interface ZonePlanStep {
  /** Espera antes de encolher (s). */
  wait: number
  /** Duração do encolhimento (s). */
  shrink: number
  /** Raio final como fração do raio inicial. */
  radius: number
  dps: number
}

/** Fechamento padrão (~9 min depois da partida começar). */
export const ZONE_PLAN: readonly ZonePlanStep[] = [
  { wait: 70, shrink: 60, radius: 0.6, dps: 1 },
  { wait: 50, shrink: 50, radius: 0.36, dps: 2 },
  { wait: 40, shrink: 40, radius: 0.2, dps: 4 },
  { wait: 35, shrink: 35, radius: 0.1, dps: 7 },
  { wait: 25, shrink: 30, radius: 0.045, dps: 10 },
  { wait: 20, shrink: 25, radius: 0.015, dps: 15 },
  // último círculo bem pequeno (não zero): quem sobrar ali precisa se enfrentar
  { wait: 15, shrink: 30, radius: 0.008, dps: 25 },
]

export function zoneCircleAt(stage: ZoneStage, tick: number, out: ZoneCircle = { x: 0, z: 0, r: 0 }): ZoneCircle {
  const span = stage.shrinkEnd - stage.shrinkStart
  const t = span <= 0 ? (tick >= stage.shrinkEnd ? 1 : 0) : Math.min(1, Math.max(0, (tick - stage.shrinkStart) / span))
  out.x = stage.fromX + (stage.toX - stage.fromX) * t
  out.z = stage.fromZ + (stage.toZ - stage.fromZ) * t
  out.r = stage.fromR + (stage.toR - stage.fromR) * t
  return out
}

/** Distância até a borda da zona (negativa = dentro). */
export function distanceOutside(c: ZoneCircle, x: number, z: number): number {
  return Math.hypot(x - c.x, z - c.z) - c.r
}

/**
 * Sorteia as etapas da zona: cada círculo novo fica inteiro dentro do
 * anterior e com o centro em terra firme (`isLand`).
 */
export function planZone(
  start: ZoneCircle,
  startTick: number,
  tickRate: number,
  speed: number,
  rng: Rng,
  isLand: (x: number, z: number) => boolean,
  plan: readonly ZonePlanStep[] = ZONE_PLAN,
): ZoneStage[] {
  const stages: ZoneStage[] = []
  let from: ZoneCircle = { ...start }
  let tick = startTick
  const s = Math.max(0.05, speed)
  plan.forEach((step, index) => {
    const r = start.r * step.radius
    let to: ZoneCircle = { x: from.x, z: from.z, r }
    const room = from.r - r
    for (let k = 0; k < 40 && room > 0; k++) {
      const a = rng.range(0, Math.PI * 2)
      const d = Math.sqrt(rng.next()) * room * 0.9
      const x = from.x + Math.cos(a) * d
      const z = from.z + Math.sin(a) * d
      if (isLand(x, z) || k === 39) {
        to = { x, z, r }
        break
      }
    }
    const shrinkStart = tick + Math.round((step.wait / s) * tickRate)
    const shrinkEnd = shrinkStart + Math.round((step.shrink / s) * tickRate)
    stages.push({ index, fromX: from.x, fromZ: from.z, fromR: from.r, toX: to.x, toZ: to.z, toR: to.r, shrinkStart, shrinkEnd, dps: step.dps })
    from = to
    tick = shrinkEnd
  })
  return stages
}

/** Rota do dirigível: atravessa o mapa passando perto do centro. */
export interface AirshipRoute {
  x0: number
  z0: number
  x1: number
  z1: number
  y: number
  startTick: number
  endTick: number
}

export const AIRSHIP_SPEED = 32

export function airshipPosition(route: AirshipRoute, tick: number, out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): { x: number; y: number; z: number } {
  const span = Math.max(1, route.endTick - route.startTick)
  const t = Math.min(1, Math.max(0, (tick - route.startTick) / span))
  out.x = route.x0 + (route.x1 - route.x0) * t
  out.y = route.y
  out.z = route.z0 + (route.z1 - route.z0) * t
  return out
}

export function planAirship(bound: number, highest: number, startTick: number, tickRate: number, rng: Rng): AirshipRoute {
  const a = rng.range(0, Math.PI * 2)
  const dx = Math.cos(a)
  const dz = Math.sin(a)
  // passa a até 25% do centro, de lado a lado
  const off = rng.range(-0.25, 0.25) * bound
  const cx = -dz * off
  const cz = dx * off
  const half = bound * 0.92
  const x0 = cx - dx * half
  const z0 = cz - dz * half
  const x1 = cx + dx * half
  const z1 = cz + dz * half
  const length = Math.hypot(x1 - x0, z1 - z0)
  const duration = length / AIRSHIP_SPEED
  return { x0, z0, x1, z1, y: Math.max(highest + 60, 110), startTick, endTick: startTick + Math.round(duration * tickRate) }
}
