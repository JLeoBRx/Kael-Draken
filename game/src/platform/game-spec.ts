import { GameHost, type HostLogger, type MatchSummary, type PlayerResult } from '../server/core/game-host'
import type { BattleRoyaleOptions } from '../server/core/battle-royale'
import { BOT_DIFFICULTIES, type BotDifficulty } from '../server/core/bots/profiles'
import { MAPS } from '../shared/maps'
import type { GameMap } from '../shared/maps/types'
import { GameMode } from '../shared/match/zone'
import { MAX_TEAM_SIZE } from '../shared/net/protocol'
import { ticketAuth } from './tickets'

/**
 * Descrição de um servidor de jogo que a plataforma pede: a mesma para os
 * servidores no próprio processo e para os nós remotos (que recebem isto em
 * JSON e montam o GameHost do lado de lá).
 */

export type ServerKind = 'publico' | 'privado'

export interface ServerSpec {
  kind: ServerKind
  mapId: string
  serverName: string
  teamSize: number
  bots: number
  botDifficulty: BotDifficulty
  /** Pessoas esperadas (partidas públicas: o aquecimento termina quando todas chegam). */
  expected: number
  /** Sala de espera (salas privadas: o dono configura e inicia). */
  lobby: boolean
  /** Conta dona da sala. */
  ownerUid?: string
  br: Partial<BattleRoyaleOptions>
  reconnectSeconds: number
  tickRate: number
}

export interface SpecHooks {
  onResult(r: PlayerResult): void
  onMatchEnd(s: MatchSummary): void
  /** Partida pública encerrada (o servidor pode ser liberado). */
  onFinished(): void
}

export interface HostContext {
  id: string
  secret: string
  clock: () => number
  logger?: HostLogger
  mapFactory?: (mapId: string) => GameMap
}

/** Confere uma descrição vinda da rede (nó remoto): nada é confiado sem checar. */
export function validSpec(v: unknown): v is ServerSpec {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  const int = (x: unknown, min: number, max: number) => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max
  return (s.kind === 'publico' || s.kind === 'privado')
    && typeof s.mapId === 'string' && !!MAPS[s.mapId]
    && typeof s.serverName === 'string' && s.serverName.length <= 64
    && int(s.teamSize, 1, MAX_TEAM_SIZE) && int(s.bots, 0, 99) && int(s.expected, 0, 100)
    && typeof s.botDifficulty === 'string' && (BOT_DIFFICULTIES as readonly string[]).includes(s.botDifficulty)
    && typeof s.lobby === 'boolean'
    && (s.ownerUid === undefined || (typeof s.ownerUid === 'string' && s.ownerUid.length <= 32))
    && typeof s.br === 'object' && s.br !== null
    && int(s.reconnectSeconds, 0, 600) && int(s.tickRate, 10, 60)
}

/** Monta o GameHost de uma descrição; só aceita bilhetes assinados para `ctx.id`. */
export function createGameHost(spec: ServerSpec, ctx: HostContext, hooks: SpecHooks): GameHost {
  const br = spec.br
  return new GameHost({
    mapId: spec.mapId, map: ctx.mapFactory?.(spec.mapId), mapFactory: ctx.mapFactory,
    tickRate: spec.tickRate, maxPlayers: 100, serverName: spec.serverName, logger: ctx.logger,
    mode: GameMode.BattleRoyale, bots: spec.bots, botDifficulty: spec.botDifficulty, teamSize: spec.teamSize,
    br: {
      ...(typeof br.warmup === 'number' ? { warmup: br.warmup } : {}),
      ...(typeof br.zoneSpeed === 'number' ? { zoneSpeed: br.zoneSpeed } : {}),
      ...(typeof br.endDelay === 'number' ? { endDelay: br.endDelay } : {}),
    },
    // pública: uma partida e acabou; sala: volta à sala de espera a cada fim
    autoRestart: false, lobby: spec.lobby,
    reconnectSeconds: spec.reconnectSeconds, ownerUid: spec.ownerUid,
    expected: spec.lobby ? undefined : spec.expected,
    auth: ticketAuth(ctx.secret, ctx.id, ctx.clock),
    onResult: hooks.onResult,
    onMatchEnd: hooks.onMatchEnd,
    onFinished: spec.lobby ? undefined : hooks.onFinished,
  })
}
