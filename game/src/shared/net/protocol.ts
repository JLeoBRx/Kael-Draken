import { encodeBuild, decodeBuild } from '../config/building'
import { AMMO_TYPES, ITEM, MATERIAL_TYPES, NO_ITEM } from '../config/items'
import { MOVE } from '../config/movement'
import { TAU, clamp } from '../math/scalar'
import { BUTTONS_MASK, CHARACTER_STATE_FIELDS, type CharacterState } from '../movement/character'
import { PICKAXE_SLOT, SELECT_COUNT, createPlayerState, type PlayerCommand, type PlayerState } from '../player/player'
import type { AirshipRoute, ZoneStage } from '../match/zone'
import { BinaryReader, BinaryWriter, ProtocolError } from './binary'

/**
 * Protocolo de rede (binário). O mesmo formato trafega por WebSocket (LAN,
 * online) e por postMessage (servidor local no Web Worker, modo offline).
 *
 * Cliente → servidor: só INTENÇÕES (comandos de entrada e ações de
 * inventário). O servidor executa a simulação e devolve o estado oficial.
 */

export const PROTOCOL_VERSION = 5

export const C2S = { Hello: 1, Input: 2, Ping: 3, Inventory: 4, Lobby: 5 } as const
export const S2C = { Welcome: 10, Snapshot: 11, Pong: 12, PlayerInfo: 13, PlayerLeft: 14, Kick: 15, Events: 16, Lobby: 17 } as const

export const MAX_NAME_LENGTH = 16
export const MAX_COMMANDS_PER_MESSAGE = 16

/** Causas de dano/eliminação além dos ids de armas. */
export const Cause = { Fall: 250, Void: 251, Zone: 252 } as const

/** Motivo de desconexão quando o servidor recomeça a partida: o cliente reconecta sozinho. */
export const KICK_NEW_MATCH = 'Nova partida'

export interface InputCommand extends PlayerCommand {
  /**
   * Tick (fracionário) do servidor que o cliente estava DESENHANDO para os
   * outros jogadores quando criou o comando. Base da compensação de latência.
   */
  viewTick: number
}

/** Estado público de outro jogador (para interpolação e animação). */
export interface EntityState {
  id: number
  x: number
  y: number
  z: number
  yaw: number
  pitch: number
  flags: number
  vx: number
  vy: number
  vz: number
  weapon: number
  rarity: number
}

/** Estado de um colega de equipe (só para quem é da mesma equipe). */
export interface TeamMate {
  id: number
  health: number
  shield: number
  alive: boolean
}

export interface Snapshot {
  tick: number
  ackSeq: number
  queued: number
  /** Jogadores vivos na partida. */
  alive: number
  /** Eliminações do destinatário. */
  kills: number
  /** Fase da partida (MatchPhase) e tick em que ela muda (0 = sem prazo). */
  phase: number
  phaseEnd: number
  self: PlayerState | null
  entities: EntityState[]
  mates: TeamMate[]
}

export interface ShotEnd {
  x: number
  y: number
  z: number
  /** 0 = alcance máximo, 1 = mundo, 2 = personagem/alvo. */
  hit: number
}

export type GameEvent =
  | { type: 'shot'; shooter: number; item: number; ox: number; oy: number; oz: number; ends: ShotEnd[] }
  | { type: 'hit'; targetKind: number; target: number; damage: number; head: boolean; shield: boolean; broke: boolean; eliminated: boolean; x: number; y: number; z: number }
  | { type: 'damaged'; amount: number; fromX: number; fromZ: number; cause: number }
  | { type: 'eliminated'; victim: number; killer: number; cause: number; respawnIn: number; place: number }
  | { type: 'itemSpawn'; id: number; item: number; rarity: number; count: number; ammo: number; x: number; y: number; z: number }
  | { type: 'itemRemove'; id: number; by: number }
  | { type: 'chestOpen'; chest: number; by: number }
  | { type: 'projSpawn'; id: number; item: number; owner: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }
  | { type: 'explosion'; id: number; item: number; x: number; y: number; z: number; radius: number }
  | { type: 'target'; id: number; health: number; down: boolean }
  | { type: 'respawn'; player: number }
  | { type: 'piecePlaced'; id: number; kind: number; i: number; j: number; k: number; dir: number; material: number; builder: number; seq: number; age: number; damage: number }
  | { type: 'pieceDamaged'; id: number; damage: number }
  | { type: 'pieceRemoved'; id: number; collapse: boolean }
  | { type: 'propDestroyed'; prop: number }
  | { type: 'harvest'; material: number; amount: number; x: number; y: number; z: number }
  | ({ type: 'zone' } & ZoneStage)
  | ({ type: 'airship' } & AirshipRoute)
  | { type: 'matchEnd'; winner: number; team: number }
  | { type: 'teamOut'; team: number; place: number }

export const TargetKind = { Player: 0, Dummy: 1, Structure: 2 } as const

/** Peça inexistente vira "fora do modo construção"; material fora da faixa vira metal (decodeBuild). */
function normBuild(b: number): number {
  const d = decodeBuild(b | 0)
  return encodeBuild(d.kind, d.rot, d.material)
}

export interface WelcomeMessage {
  type: 'welcome'
  version: number
  playerId: number
  mapId: string
  tickRate: number
  tick: number
  serverName: string
  /** GameMode */
  mode: number
  /** Token para voltar ao mesmo personagem se a conexão cair. */
  token: string
}

/** Configuração da partida escolhida na sala de espera. */
export interface LobbyConfig {
  mapId: string
  /** GameMode */
  mode: number
  bots: number
  /** 0 fácil, 1 normal, 2 difícil */
  difficulty: number
  /** 1 solo, 2 dupla, 3 trio, 4 esquadrão */
  teamSize: number
  friendlyFire: boolean
  zoneSpeed: number
}

export interface LobbyMember {
  id: number
  name: string
  ready: boolean
  /** Equipe escolhida (-1 = automática) */
  team: number
  skin: number
}

export interface LobbyState {
  /** Id do destinatário na sala. */
  you: number
  /** Quem configura e inicia (o primeiro a entrar). */
  owner: number
  config: LobbyConfig
  /** Há uma partida em andamento (quem chega espera a próxima). */
  running: boolean
  runningAlive: number
  members: LobbyMember[]
}

export type LobbyAction =
  | { op: 'ready'; ready: boolean }
  | { op: 'team'; team: number }
  | { op: 'config'; config: LobbyConfig }
  | { op: 'start' }

export const MAX_TEAM_SIZE = 4
export const MAX_LOBBY_TEAMS = 25

export type InventoryAction = { action: 'drop'; slot: number } | { action: 'swap'; a: number; b: number }

export type ClientMessage =
  | { type: 'hello'; version: number; name: string; token: string }
  | { type: 'lobby'; action: LobbyAction }
  | { type: 'input'; commands: InputCommand[] }
  | { type: 'ping'; time: number }
  | { type: 'inventory'; op: InventoryAction }

export type ServerMessage =
  | WelcomeMessage
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'pong'; time: number; tick: number }
  | { type: 'playerInfo'; id: number; name: string; skin: number; team: number }
  | { type: 'lobby'; state: LobbyState }
  | { type: 'playerLeft'; id: number }
  | { type: 'kick'; reason: string }
  | { type: 'events'; events: GameEvent[] }

// ---------------------------------------------------------------------------
// Quantização (cliente e servidor precisam usar exatamente os mesmos valores)

function quantYaw(yaw: number): number {
  const a = ((yaw % TAU) + TAU) % TAU
  return Math.round((a / TAU) * 65536) & 0xffff
}
function dequantYaw(q: number): number {
  return (q / 65536) * TAU
}
function quantPitch(p: number): number {
  return Math.round((clamp(p, -Math.PI / 2, Math.PI / 2) / (Math.PI / 2)) * 32767)
}
function dequantPitch(q: number): number {
  return (q / 32767) * (Math.PI / 2)
}
function quantAxis(v: number): number {
  return Math.round(clamp(v, -1, 1) * 127)
}
function quantVel(v: number): number {
  return Math.round(clamp(v, -327, 327) * 100)
}
function quantViewTick(t: number): number {
  return Math.max(0, Math.min(0xffffffff, Math.round(t * 8)))
}

/** Devolve o comando como o servidor o verá depois de decodificado. */
export function quantizeCommand(c: InputCommand): InputCommand {
  return {
    seq: c.seq >>> 0,
    forward: quantAxis(c.forward) / 127,
    right: quantAxis(c.right) / 127,
    yaw: dequantYaw(quantYaw(c.yaw)),
    pitch: dequantPitch(quantPitch(c.pitch)),
    buttons: c.buttons & BUTTONS_MASK,
    slot: clamp(c.slot | 0, 0, SELECT_COUNT - 1),
    viewTick: quantViewTick(c.viewTick) / 8,
    build: normBuild(c.build),
  }
}

/** Normaliza um nome de jogador: sem caracteres de controle, até 16 caracteres. */
export function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/[\p{C}<>]/gu, '').replace(/\s+/g, ' ').trim()
  const chars = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('')
  return chars.length > 0 ? chars : 'Jogador'
}

/** Valores limite aceitos pelo servidor para um comando (defesa contra clientes adulterados). */
export function sanitizeCommand(c: InputCommand): InputCommand {
  const finite = (v: number) => (Number.isFinite(v) ? v : 0)
  return {
    seq: c.seq >>> 0,
    forward: clamp(finite(c.forward), -1, 1),
    right: clamp(finite(c.right), -1, 1),
    yaw: finite(c.yaw),
    pitch: clamp(finite(c.pitch), -MOVE.maxPitch, MOVE.maxPitch),
    buttons: c.buttons & BUTTONS_MASK,
    slot: clamp(Number.isInteger(c.slot) ? c.slot : 0, 0, SELECT_COUNT - 1),
    viewTick: Math.max(0, finite(c.viewTick)),
    build: normBuild(c.build),
  }
}

// ---------------------------------------------------------------------------
// Cliente → servidor

export function encodeHello(name: string, token = ''): Uint8Array {
  return new BinaryWriter(96).u8(C2S.Hello).u16(PROTOCOL_VERSION).string(name).string(token.slice(0, 64)).finish()
}

function writeLobbyConfig(w: BinaryWriter, c: LobbyConfig): void {
  w.string(c.mapId).u8(c.mode).u8(clamp(c.bots | 0, 0, 99)).u8(clamp(c.difficulty | 0, 0, 2)).u8(clamp(c.teamSize | 0, 1, MAX_TEAM_SIZE)).u8(c.friendlyFire ? 1 : 0).f32(c.zoneSpeed)
}

function readLobbyConfig(r: BinaryReader): LobbyConfig {
  return {
    mapId: r.string(64),
    mode: r.u8(),
    bots: Math.min(99, r.u8()),
    difficulty: Math.min(2, r.u8()),
    teamSize: clamp(r.u8(), 1, MAX_TEAM_SIZE),
    friendlyFire: r.u8() === 1,
    zoneSpeed: clamp(r.f32() || 1, 0.25, 10),
  }
}

export function encodeLobbyAction(a: LobbyAction): Uint8Array {
  const w = new BinaryWriter(64).u8(C2S.Lobby)
  switch (a.op) {
    case 'ready':
      w.u8(1).u8(a.ready ? 1 : 0)
      break
    case 'team':
      w.u8(2).i8(clamp(a.team | 0, -1, MAX_LOBBY_TEAMS - 1))
      break
    case 'config':
      w.u8(3)
      writeLobbyConfig(w, a.config)
      break
    case 'start':
      w.u8(4)
      break
  }
  return w.finish()
}

export function encodeLobbyState(st: LobbyState): Uint8Array {
  const w = new BinaryWriter(128 + st.members.length * 24).u8(S2C.Lobby).u16(st.you).u16(st.owner)
  writeLobbyConfig(w, st.config)
  w.u8(st.running ? 1 : 0).u16(st.runningAlive).u8(st.members.length)
  for (const m of st.members) w.u16(m.id).string(m.name).u8(m.ready ? 1 : 0).i8(m.team).u8(m.skin)
  return w.finish()
}

export function encodeInputs(commands: readonly InputCommand[]): Uint8Array {
  if (commands.length > MAX_COMMANDS_PER_MESSAGE) throw new ProtocolError('comandos demais em uma mensagem')
  const w = new BinaryWriter(8 + commands.length * 18).u8(C2S.Input).u8(commands.length)
  for (const c of commands) {
    w.u32(c.seq >>> 0).i8(quantAxis(c.forward)).i8(quantAxis(c.right)).u16(quantYaw(c.yaw)).i16(quantPitch(c.pitch))
      .u16(c.buttons & BUTTONS_MASK).u8(clamp(c.slot | 0, 0, SELECT_COUNT - 1)).u32(quantViewTick(c.viewTick)).u8(normBuild(c.build))
  }
  return w.finish()
}

export function encodePing(time: number): Uint8Array {
  return new BinaryWriter(9).u8(C2S.Ping).f64(time).finish()
}

export function encodeInventoryAction(op: InventoryAction): Uint8Array {
  const w = new BinaryWriter(4).u8(C2S.Inventory)
  if (op.action === 'drop') w.u8(1).u8(op.slot).u8(0)
  else w.u8(2).u8(op.a).u8(op.b)
  return w.finish()
}

export function decodeClientMessage(data: Uint8Array): ClientMessage {
  const r = new BinaryReader(data)
  const type = r.u8()
  let msg: ClientMessage
  switch (type) {
    case C2S.Hello:
      msg = { type: 'hello', version: r.u16(), name: r.string(128), token: r.string(64) }
      break
    case C2S.Lobby: {
      const op = r.u8()
      if (op === 1) msg = { type: 'lobby', action: { op: 'ready', ready: r.u8() === 1 } }
      else if (op === 2) msg = { type: 'lobby', action: { op: 'team', team: clamp(r.i8(), -1, MAX_LOBBY_TEAMS - 1) } }
      else if (op === 3) msg = { type: 'lobby', action: { op: 'config', config: readLobbyConfig(r) } }
      else if (op === 4) msg = { type: 'lobby', action: { op: 'start' } }
      else throw new ProtocolError('ação de sala desconhecida')
      break
    }
    case C2S.Input: {
      const n = r.u8()
      if (n > MAX_COMMANDS_PER_MESSAGE) throw new ProtocolError('comandos demais em uma mensagem')
      const commands: InputCommand[] = []
      for (let k = 0; k < n; k++) {
        commands.push({
          seq: r.u32(),
          forward: r.i8() / 127,
          right: r.i8() / 127,
          yaw: dequantYaw(r.u16()),
          pitch: dequantPitch(r.i16()),
          buttons: r.u16() & BUTTONS_MASK,
          slot: Math.min(r.u8(), SELECT_COUNT - 1),
          viewTick: r.u32() / 8,
          build: normBuild(r.u8()),
        })
      }
      msg = { type: 'input', commands }
      break
    }
    case C2S.Ping:
      msg = { type: 'ping', time: r.f64() }
      break
    case C2S.Inventory: {
      const action = r.u8()
      const a = r.u8()
      const b = r.u8()
      if (action === 1) msg = { type: 'inventory', op: { action: 'drop', slot: a } }
      else if (action === 2) msg = { type: 'inventory', op: { action: 'swap', a, b } }
      else throw new ProtocolError('ação de inventário desconhecida')
      break
    }
    default:
      throw new ProtocolError(`tipo de mensagem desconhecido: ${type}`)
  }
  r.expectEnd()
  return msg
}

// ---------------------------------------------------------------------------
// Estado do próprio jogador (completo, para reconciliação exata)

function writeCharacterState(w: BinaryWriter, s: CharacterState): void {
  for (const k of CHARACTER_STATE_FIELDS) w.f64(s[k])
}

function readCharacterState(r: BinaryReader, s: CharacterState): void {
  for (const k of CHARACTER_STATE_FIELDS) s[k] = r.f64()
}

export function writePlayerState(w: BinaryWriter, p: PlayerState): void {
  writeCharacterState(w, p.char)
  w.u8(p.alive ? 1 : 0).f64(p.health).f64(p.shield).u8(p.selected)
  for (const s of p.slots) w.u8(s.item).u8(s.rarity).u16(s.count).u16(s.ammo)
  for (let k = 0; k < AMMO_TYPES; k++) w.u16(p.ammo[k])
  for (let k = 0; k < MATERIAL_TYPES; k++) w.u16(p.materials[k])
  w.f64(p.equipTimer).f64(p.fireCooldown).f64(p.reloadTimer).f64(p.useTimer).f64(p.bloom).f64(p.buildCooldown)
}

export function readPlayerState(r: BinaryReader): PlayerState {
  const p = createPlayerState()
  readCharacterState(r, p.char)
  p.alive = r.u8() === 1
  p.health = r.f64()
  p.shield = r.f64()
  p.selected = Math.min(r.u8(), SELECT_COUNT - 1)
  for (const s of p.slots) {
    s.item = r.u8()
    s.rarity = r.u8()
    s.count = r.u16()
    s.ammo = r.u16()
  }
  for (let k = 0; k < AMMO_TYPES; k++) p.ammo[k] = r.u16()
  for (let k = 0; k < MATERIAL_TYPES; k++) p.materials[k] = r.u16()
  p.equipTimer = r.f64()
  p.fireCooldown = r.f64()
  p.reloadTimer = r.f64()
  p.useTimer = r.f64()
  p.bloom = r.f64()
  p.buildCooldown = r.f64()
  return p
}

// ---------------------------------------------------------------------------
// Servidor → cliente

export function encodeWelcome(m: Omit<WelcomeMessage, 'type'>): Uint8Array {
  return new BinaryWriter(128).u8(S2C.Welcome).u16(m.version).u16(m.playerId).string(m.mapId).u16(m.tickRate).u32(m.tick).string(m.serverName).u8(m.mode).string(m.token).finish()
}

/** Escreve o estado público de um jogador como entidade de snapshot. */
export function writeEntity(w: BinaryWriter, id: number, p: PlayerState): void {
  const s = p.char
  const slot = p.selected === PICKAXE_SLOT ? null : p.slots[p.selected]
  w.u16(id).f32(s.x).f32(s.y).f32(s.z).u16(quantYaw(s.yaw)).i16(quantPitch(s.pitch)).u16(s.flags)
    .i16(quantVel(s.vx)).i16(quantVel(s.vy)).i16(quantVel(s.vz)).u8(slot ? slot.item : p.selected === PICKAXE_SLOT ? ITEM.Pickaxe : NO_ITEM).u8(slot?.rarity ?? 0)
}

/** Bytes por entidade em um snapshot (para estimativas de banda). */
export const ENTITY_BYTES = 28

export function beginSnapshot(tick: number, ackSeq: number, queued: number, alive: number, kills: number, phase: number, phaseEnd: number, self: PlayerState | null, entityCount: number): BinaryWriter {
  const w = new BinaryWriter(40 + (self ? 330 : 0) + entityCount * ENTITY_BYTES)
  w.u8(S2C.Snapshot).u32(tick).u32(ackSeq >>> 0).u8(Math.min(255, queued)).u16(alive).u16(kills).u8(phase).u32(phaseEnd >>> 0).u8(self ? 1 : 0)
  if (self) writePlayerState(w, self)
  w.u16(entityCount)
  return w
}

export function encodePong(time: number, tick: number): Uint8Array {
  return new BinaryWriter(13).u8(S2C.Pong).f64(time).u32(tick).finish()
}

export function encodePlayerInfo(id: number, name: string, skin: number, team: number): Uint8Array {
  return new BinaryWriter(40).u8(S2C.PlayerInfo).u16(id).string(name).u8(skin).u16(team & 0xffff).finish()
}

/** Colegas de equipe do destinatário (depois das entidades do snapshot). */
export function writeMates(w: BinaryWriter, mates: readonly TeamMate[]): void {
  w.u8(mates.length)
  for (const m of mates) w.u16(m.id).u8(Math.max(0, Math.min(255, Math.ceil(m.health)))).u8(Math.max(0, Math.min(255, Math.ceil(m.shield)))).u8(m.alive ? 1 : 0)
}

export function encodePlayerLeft(id: number): Uint8Array {
  return new BinaryWriter(3).u8(S2C.PlayerLeft).u16(id).finish()
}

export function encodeKick(reason: string): Uint8Array {
  return new BinaryWriter(64).u8(S2C.Kick).string(reason).finish()
}

const EV = {
  shot: 1, hit: 2, damaged: 3, eliminated: 4, itemSpawn: 5, itemRemove: 6, chestOpen: 7, projSpawn: 8, explosion: 9, target: 10, respawn: 11,
  piecePlaced: 12, pieceDamaged: 13, pieceRemoved: 14, propDestroyed: 15, harvest: 16,
  zone: 17, airship: 18, matchEnd: 19, teamOut: 20,
} as const

function writeEvent(w: BinaryWriter, e: GameEvent): void {
  w.u8(EV[e.type])
  switch (e.type) {
    case 'shot':
      w.u16(e.shooter).u8(e.item).f32(e.ox).f32(e.oy).f32(e.oz).u8(e.ends.length)
      for (const p of e.ends) w.f32(p.x).f32(p.y).f32(p.z).u8(p.hit)
      break
    case 'hit':
      w.u8(e.targetKind).u16(e.target).u16(Math.min(65535, Math.round(e.damage)))
        .u8((e.head ? 1 : 0) | (e.shield ? 2 : 0) | (e.broke ? 4 : 0) | (e.eliminated ? 8 : 0)).f32(e.x).f32(e.y).f32(e.z)
      break
    case 'damaged':
      w.u16(Math.min(65535, Math.round(e.amount))).f32(e.fromX).f32(e.fromZ).u8(e.cause)
      break
    case 'eliminated':
      w.u16(e.victim).u16(e.killer).u8(e.cause).u8(Math.min(255, Math.round(e.respawnIn))).u8(Math.min(255, e.place))
      break
    case 'itemSpawn':
      w.u16(e.id).u8(e.item).u8(e.rarity).u16(e.count).u16(e.ammo).f32(e.x).f32(e.y).f32(e.z)
      break
    case 'itemRemove':
      w.u16(e.id).u16(e.by)
      break
    case 'chestOpen':
      w.u16(e.chest).u16(e.by)
      break
    case 'projSpawn':
      w.u16(e.id).u8(e.item).u16(e.owner).f32(e.x).f32(e.y).f32(e.z).f32(e.vx).f32(e.vy).f32(e.vz)
      break
    case 'explosion':
      w.u16(e.id).u8(e.item).f32(e.x).f32(e.y).f32(e.z).f32(e.radius)
      break
    case 'target':
      w.u8(e.id).u16(Math.max(0, Math.round(e.health))).u8(e.down ? 1 : 0)
      break
    case 'respawn':
      w.u16(e.player)
      break
    case 'piecePlaced':
      w.u16(e.id).u8(e.kind).i16(e.i).i16(e.j).i8(e.k).u8(e.dir).u8(e.material).u16(e.builder).u32(e.seq >>> 0).u16(Math.min(65535, e.age)).u16(Math.min(65535, Math.round(e.damage)))
      break
    case 'pieceDamaged':
      w.u16(e.id).u16(Math.min(65535, Math.round(e.damage)))
      break
    case 'pieceRemoved':
      w.u16(e.id).u8(e.collapse ? 1 : 0)
      break
    case 'propDestroyed':
      w.u16(e.prop)
      break
    case 'harvest':
      w.u8(e.material).u8(e.amount).f32(e.x).f32(e.y).f32(e.z)
      break
    case 'zone':
      w.u8(e.index).f32(e.fromX).f32(e.fromZ).f32(e.fromR).f32(e.toX).f32(e.toZ).f32(e.toR).u32(e.shrinkStart).u32(e.shrinkEnd).u8(e.dps)
      break
    case 'airship':
      w.f32(e.x0).f32(e.z0).f32(e.x1).f32(e.z1).f32(e.y).u32(e.startTick).u32(e.endTick)
      break
    case 'matchEnd':
      w.u16(e.winner).u16(e.team & 0xffff)
      break
    case 'teamOut':
      w.u16(e.team & 0xffff).u8(Math.min(255, e.place))
      break
  }
}

function readEvent(r: BinaryReader): GameEvent {
  const t = r.u8()
  switch (t) {
    case EV.shot: {
      const shooter = r.u16()
      const item = r.u8()
      const ox = r.f32()
      const oy = r.f32()
      const oz = r.f32()
      const n = r.u8()
      const ends: ShotEnd[] = []
      for (let k = 0; k < n; k++) ends.push({ x: r.f32(), y: r.f32(), z: r.f32(), hit: r.u8() })
      return { type: 'shot', shooter, item, ox, oy, oz, ends }
    }
    case EV.hit: {
      const targetKind = r.u8()
      const target = r.u16()
      const damage = r.u16()
      const f = r.u8()
      return { type: 'hit', targetKind, target, damage, head: !!(f & 1), shield: !!(f & 2), broke: !!(f & 4), eliminated: !!(f & 8), x: r.f32(), y: r.f32(), z: r.f32() }
    }
    case EV.damaged:
      return { type: 'damaged', amount: r.u16(), fromX: r.f32(), fromZ: r.f32(), cause: r.u8() }
    case EV.eliminated:
      return { type: 'eliminated', victim: r.u16(), killer: r.u16(), cause: r.u8(), respawnIn: r.u8(), place: r.u8() }
    case EV.itemSpawn:
      return { type: 'itemSpawn', id: r.u16(), item: r.u8(), rarity: r.u8(), count: r.u16(), ammo: r.u16(), x: r.f32(), y: r.f32(), z: r.f32() }
    case EV.itemRemove:
      return { type: 'itemRemove', id: r.u16(), by: r.u16() }
    case EV.chestOpen:
      return { type: 'chestOpen', chest: r.u16(), by: r.u16() }
    case EV.projSpawn:
      return { type: 'projSpawn', id: r.u16(), item: r.u8(), owner: r.u16(), x: r.f32(), y: r.f32(), z: r.f32(), vx: r.f32(), vy: r.f32(), vz: r.f32() }
    case EV.explosion:
      return { type: 'explosion', id: r.u16(), item: r.u8(), x: r.f32(), y: r.f32(), z: r.f32(), radius: r.f32() }
    case EV.target:
      return { type: 'target', id: r.u8(), health: r.u16(), down: r.u8() === 1 }
    case EV.respawn:
      return { type: 'respawn', player: r.u16() }
    case EV.piecePlaced:
      return { type: 'piecePlaced', id: r.u16(), kind: r.u8(), i: r.i16(), j: r.i16(), k: r.i8(), dir: r.u8(), material: r.u8(), builder: r.u16(), seq: r.u32(), age: r.u16(), damage: r.u16() }
    case EV.pieceDamaged:
      return { type: 'pieceDamaged', id: r.u16(), damage: r.u16() }
    case EV.pieceRemoved:
      return { type: 'pieceRemoved', id: r.u16(), collapse: r.u8() === 1 }
    case EV.propDestroyed:
      return { type: 'propDestroyed', prop: r.u16() }
    case EV.harvest:
      return { type: 'harvest', material: r.u8(), amount: r.u8(), x: r.f32(), y: r.f32(), z: r.f32() }
    case EV.zone:
      return { type: 'zone', index: r.u8(), fromX: r.f32(), fromZ: r.f32(), fromR: r.f32(), toX: r.f32(), toZ: r.f32(), toR: r.f32(), shrinkStart: r.u32(), shrinkEnd: r.u32(), dps: r.u8() }
    case EV.airship:
      return { type: 'airship', x0: r.f32(), z0: r.f32(), x1: r.f32(), z1: r.f32(), y: r.f32(), startTick: r.u32(), endTick: r.u32() }
    case EV.matchEnd:
      return { type: 'matchEnd', winner: r.u16(), team: r.u16() }
    case EV.teamOut:
      return { type: 'teamOut', team: r.u16(), place: r.u8() }
    default:
      throw new ProtocolError(`evento desconhecido: ${t}`)
  }
}

export function encodeEvents(events: readonly GameEvent[]): Uint8Array {
  const w = new BinaryWriter(16 + events.length * 24).u8(S2C.Events).u16(events.length)
  for (const e of events) writeEvent(w, e)
  return w.finish()
}

export function decodeServerMessage(data: Uint8Array): ServerMessage {
  const r = new BinaryReader(data)
  const type = r.u8()
  let msg: ServerMessage
  switch (type) {
    case S2C.Welcome:
      msg = { type: 'welcome', version: r.u16(), playerId: r.u16(), mapId: r.string(), tickRate: r.u16(), tick: r.u32(), serverName: r.string(), mode: r.u8(), token: r.string() }
      break
    case S2C.Snapshot: {
      const tick = r.u32()
      const ackSeq = r.u32()
      const queued = r.u8()
      const alive = r.u16()
      const kills = r.u16()
      const phase = r.u8()
      const phaseEnd = r.u32()
      const self = r.u8() ? readPlayerState(r) : null
      const n = r.u16()
      const entities: EntityState[] = []
      for (let k = 0; k < n; k++) {
        entities.push({
          id: r.u16(), x: r.f32(), y: r.f32(), z: r.f32(),
          yaw: dequantYaw(r.u16()), pitch: dequantPitch(r.i16()), flags: r.u16(),
          vx: r.i16() / 100, vy: r.i16() / 100, vz: r.i16() / 100,
          weapon: r.u8(), rarity: r.u8(),
        })
      }
      const nm = r.u8()
      const mates: TeamMate[] = []
      for (let k = 0; k < nm; k++) mates.push({ id: r.u16(), health: r.u8(), shield: r.u8(), alive: r.u8() === 1 })
      msg = { type: 'snapshot', snapshot: { tick, ackSeq, queued, alive, kills, phase, phaseEnd, self, entities, mates } }
      break
    }
    case S2C.Pong:
      msg = { type: 'pong', time: r.f64(), tick: r.u32() }
      break
    case S2C.PlayerInfo:
      msg = { type: 'playerInfo', id: r.u16(), name: r.string(), skin: r.u8(), team: r.u16() }
      break
    case S2C.PlayerLeft:
      msg = { type: 'playerLeft', id: r.u16() }
      break
    case S2C.Kick:
      msg = { type: 'kick', reason: r.string() }
      break
    case S2C.Lobby: {
      const you = r.u16()
      const owner = r.u16()
      const config = readLobbyConfig(r)
      const running = r.u8() === 1
      const runningAlive = r.u16()
      const n = r.u8()
      const members: LobbyMember[] = []
      for (let k = 0; k < n; k++) members.push({ id: r.u16(), name: r.string(), ready: r.u8() === 1, team: r.i8(), skin: r.u8() })
      msg = { type: 'lobby', state: { you, owner, config, running, runningAlive, members } }
      break
    }
    case S2C.Events: {
      const n = r.u16()
      const events: GameEvent[] = []
      for (let k = 0; k < n; k++) events.push(readEvent(r))
      msg = { type: 'events', events }
      break
    }
    default:
      throw new ProtocolError(`tipo de mensagem desconhecido: ${type}`)
  }
  r.expectEnd()
  return msg
}
