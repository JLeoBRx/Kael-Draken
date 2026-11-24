import type { XpBreakdown } from '../progression'

/**
 * Mensagens entre o cliente e a plataforma online (JSON sobre WebSocket em
 * /platform). A partida em si continua no protocolo binário, direto com o
 * servidor de jogo alocado (/game/<id>), com o bilhete assinado que a
 * plataforma entrega.
 *
 * Identificação só pelo nome: quem entra com um nome que já existe usa a
 * mesma conta (sem senha, por decisão do projeto). A sessão devolvida no
 * Welcome permite voltar sem digitar o nome de novo.
 */

export const PLATFORM_VERSION = 2

/** Onde cada pessoa está, como os amigos veem. */
export type Presence = 'offline' | 'online' | 'searching' | 'match' | 'room'

export interface PlayerStats {
  matches: number
  wins: number
  top10: number
  kills: number
  deaths: number
  damage: number
  chests: number
  built: number
  harvested: number
  seconds: number
  /** Melhor colocação (0 = nenhuma partida). */
  bestPlace: number
}

export interface MyProfile {
  id: number
  name: string
  xp: number
  level: number
  skin: number
  title: string
  mmr: number
  createdAt: number
  stats: PlayerStats
}

export interface PublicProfile {
  id: number
  name: string
  level: number
  skin: number
  title: string
  presence: Presence
  stats: PlayerStats
}

export interface FriendEntry {
  id: number
  name: string
  level: number
  presence: Presence
}

export interface FriendRequest {
  id: number
  name: string
  level: number
  /** true: pediu para mim; false: eu pedi. */
  incoming: boolean
}

export interface PartyMember {
  id: number
  name: string
  level: number
  skin: number
  presence: Presence
}

export interface PartyState {
  id: string
  leader: number
  members: PartyMember[]
  /** Convites pendentes (ids). */
  invited: number[]
}

export interface QueueState {
  searching: boolean
  teamSize: number
  region: string
  /** ms desde que o grupo entrou na fila. */
  waitedMs: number
  /** Pessoas na mesma fila (modo + região). */
  inQueue: number
}

export interface MatchTicket {
  /** Caminho do servidor de jogo no mesmo endereço (ex.: /game/3fa1c2-4). */
  path: string
  /** Endereço completo quando o servidor roda em outra máquina (nó remoto). */
  url?: string
  ticket: string
  kind: 'publico' | 'privado'
  teamSize: number
  /** Código da sala (privadas). */
  code?: string
}

export interface ChallengeProgress {
  id: string
  text: string
  goal: number
  progress: number
  xp: number
  done: boolean
}

export interface HistoryEntry {
  matchId: number
  kind: 'publico' | 'privado'
  at: number
  place: number
  teams: number
  teamSize: number
  kills: number
  damage: number
  seconds: number
  xp: number
  victory: boolean
  mapId: string
}

export interface LeaderRow {
  name: string
  level: number
  wins: number
  kills: number
  matches: number
}

export interface MatchReward {
  matchId: number
  place: number
  teams: number
  victory: boolean
  xp: XpBreakdown
  /** XP de desafios concluídos nesta partida. */
  challengeXp: number
  completed: string[]
  levelBefore: number
  levelAfter: number
  mmrDelta: number
}

export interface RegionInfo {
  id: string
  name: string
}

export type ClientRequest =
  | { t: 'login'; name: string; version: number }
  | { t: 'resume'; session: string; version: number }
  | { t: 'logout' }
  | { t: 'friendAdd'; name: string }
  | { t: 'friendAccept'; id: number }
  | { t: 'friendDecline'; id: number }
  | { t: 'friendRemove'; id: number }
  | { t: 'partyInvite'; id: number }
  | { t: 'partyAccept'; partyId: string }
  | { t: 'partyDecline'; partyId: string }
  | { t: 'partyLeave' }
  | { t: 'partyKick'; id: number }
  | { t: 'queue'; teamSize: number; region: string; fill: boolean }
  | { t: 'queueCancel' }
  | { t: 'roomCreate' }
  | { t: 'roomJoin'; code: string }
  | { t: 'setSkin'; skin: number }
  | { t: 'setTitle'; id: string }
  | { t: 'history' }
  | { t: 'leaderboard' }
  | { t: 'profile'; name: string }
  | { t: 'ping' }

/** Toda requisição pode levar `rid`; a resposta (ok/erro) volta com o mesmo. */
export type ClientMessage = ClientRequest & { rid?: number }

export type ServerPush =
  | {
    t: 'welcome'; session: string; created: boolean; me: MyProfile; friends: FriendEntry[]; requests: FriendRequest[]; party: PartyState | null
    queue: QueueState | null; challenges: ChallengeProgress[]; regions: RegionInfo[]; online: number
    /** Partida em andamento desta conta (para voltar depois de recarregar a página). */
    match: MatchTicket | null
  }
  | { t: 'me'; me: MyProfile }
  | { t: 'friends'; friends: FriendEntry[]; requests: FriendRequest[] }
  | { t: 'party'; party: PartyState | null }
  | { t: 'partyInvite'; partyId: string; from: { id: number; name: string } }
  | { t: 'queue'; queue: QueueState | null }
  | { t: 'matchFound'; match: MatchTicket }
  | { t: 'reward'; reward: MatchReward }
  | { t: 'challenges'; challenges: ChallengeProgress[] }
  | { t: 'notice'; text: string; level: 'info' | 'error' }
  | { t: 'roomInvite'; code: string; from: { id: number; name: string } }
  | { t: 'kicked'; reason: string }
  /** Pessoas online na plataforma (quando muda). */
  | { t: 'online'; count: number }

export type ServerMessage =
  | ServerPush
  | { t: 'ok'; rid: number; data?: unknown }
  | { t: 'error'; rid?: number; message: string }

export const MIN_NAME_CHARS = 3
export const MAX_PARTY = 4
/** Caracteres dos códigos de sala (sem 0/O, 1/I/L). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 6

/** Chave de unicidade do nome: sem diferença de maiúsculas, acentos de forma canônica, espaços simples. */
export function nameKey(name: string): string {
  return name.normalize('NFKC').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ').trim()
}

export function normalizeRoomCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, ROOM_CODE_LENGTH)
}
