import { AMMO_TYPES, MATERIAL_TYPES, NO_ITEM } from '../config/items'
import { MOVE } from '../config/movement'
import { TAU, clamp } from '../math/scalar'
import { BUTTONS_MASK, CHARACTER_STATE_FIELDS, type CharacterState } from '../movement/character'
import { SLOT_COUNT, createPlayerState, type PlayerCommand, type PlayerState } from '../player/player'
import { BinaryReader, BinaryWriter, ProtocolError } from './binary'

/**
 * Protocolo de rede (binário). O mesmo formato trafega por WebSocket (LAN,
 * online) e por postMessage (servidor local no Web Worker, modo offline).
 *
 * Cliente → servidor: só INTENÇÕES (comandos de entrada e ações de
 * inventário). O servidor executa a simulação e devolve o estado oficial.
 */

export const PROTOCOL_VERSION = 2

export const C2S = { Hello: 1, Input: 2, Ping: 3, Inventory: 4 } as const
export const S2C = { Welcome: 10, Snapshot: 11, Pong: 12, PlayerInfo: 13, PlayerLeft: 14, Kick: 15, Events: 16 } as const

export const MAX_NAME_LENGTH = 16
export const MAX_COMMANDS_PER_MESSAGE = 16

/** Causas de dano/eliminação além dos ids de armas. */
export const Cause = { Fall: 250, Void: 251, Zone: 252 } as const

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

export interface Snapshot {
  tick: number
  ackSeq: number
  queued: number
  /** Jogadores vivos na partida. */
  alive: number
  /** Eliminações do destinatário. */
  kills: number
  self: PlayerState | null
  entities: EntityState[]
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
  | { type: 'eliminated'; victim: number; killer: number; cause: number; respawnIn: number }
  | { type: 'itemSpawn'; id: number; item: number; rarity: number; count: number; ammo: number; x: number; y: number; z: number }
  | { type: 'itemRemove'; id: number; by: number }
  | { type: 'chestOpen'; chest: number; by: number }
  | { type: 'projSpawn'; id: number; item: number; owner: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }
  | { type: 'explosion'; id: number; item: number; x: number; y: number; z: number; radius: number }
  | { type: 'target'; id: number; health: number; down: boolean }
  | { type: 'respawn'; player: number }

export const TargetKind = { Player: 0, Dummy: 1 } as const

export interface WelcomeMessage {
  type: 'welcome'
  version: number
  playerId: number
  mapId: string
  tickRate: number
  tick: number
  serverName: string
}

export type InventoryAction = { action: 'drop'; slot: number } | { action: 'swap'; a: number; b: number }

export type ClientMessage =
  | { type: 'hello'; version: number; name: string }
  | { type: 'input'; commands: InputCommand[] }
  | { type: 'ping'; time: number }
  | { type: 'inventory'; op: InventoryAction }

export type ServerMessage =
  | WelcomeMessage
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'pong'; time: number; tick: number }
  | { type: 'playerInfo'; id: number; name: string; skin: number }
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
    slot: clamp(c.slot | 0, 0, SLOT_COUNT - 1),
    viewTick: quantViewTick(c.viewTick) / 8,
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
    slot: clamp(Number.isInteger(c.slot) ? c.slot : 0, 0, SLOT_COUNT - 1),
    viewTick: Math.max(0, finite(c.viewTick)),
  }
}

// ---------------------------------------------------------------------------
// Cliente → servidor

export function encodeHello(name: string): Uint8Array {
  return new BinaryWriter(32).u8(C2S.Hello).u16(PROTOCOL_VERSION).string(name).finish()
}

export function encodeInputs(commands: readonly InputCommand[]): Uint8Array {
  if (commands.length > MAX_COMMANDS_PER_MESSAGE) throw new ProtocolError('comandos demais em uma mensagem')
  const w = new BinaryWriter(8 + commands.length * 17).u8(C2S.Input).u8(commands.length)
  for (const c of commands) {
    w.u32(c.seq >>> 0).i8(quantAxis(c.forward)).i8(quantAxis(c.right)).u16(quantYaw(c.yaw)).i16(quantPitch(c.pitch))
      .u16(c.buttons & BUTTONS_MASK).u8(clamp(c.slot | 0, 0, SLOT_COUNT - 1)).u32(quantViewTick(c.viewTick))
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
      msg = { type: 'hello', version: r.u16(), name: r.string(128) }
      break
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
          slot: Math.min(r.u8(), SLOT_COUNT - 1),
          viewTick: r.u32() / 8,
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
  w.f64(p.equipTimer).f64(p.fireCooldown).f64(p.reloadTimer).f64(p.useTimer).f64(p.bloom)
}

export function readPlayerState(r: BinaryReader): PlayerState {
  const p = createPlayerState()
  readCharacterState(r, p.char)
  p.alive = r.u8() === 1
  p.health = r.f64()
  p.shield = r.f64()
  p.selected = Math.min(r.u8(), SLOT_COUNT - 1)
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
  return p
}

// ---------------------------------------------------------------------------
// Servidor → cliente

export function encodeWelcome(m: Omit<WelcomeMessage, 'type'>): Uint8Array {
  return new BinaryWriter(64).u8(S2C.Welcome).u16(m.version).u16(m.playerId).string(m.mapId).u16(m.tickRate).u32(m.tick).string(m.serverName).finish()
}

/** Escreve o estado público de um jogador como entidade de snapshot. */
export function writeEntity(w: BinaryWriter, id: number, p: PlayerState): void {
  const s = p.char
  const slot = p.slots[p.selected]
  w.u16(id).f32(s.x).f32(s.y).f32(s.z).u16(quantYaw(s.yaw)).i16(quantPitch(s.pitch)).u16(s.flags)
    .i16(quantVel(s.vx)).i16(quantVel(s.vy)).i16(quantVel(s.vz)).u8(slot?.item ?? NO_ITEM).u8(slot?.rarity ?? 0)
}

/** Bytes por entidade em um snapshot (para estimativas de banda). */
export const ENTITY_BYTES = 28

export function beginSnapshot(tick: number, ackSeq: number, queued: number, alive: number, kills: number, self: PlayerState | null, entityCount: number): BinaryWriter {
  const w = new BinaryWriter(32 + (self ? 300 : 0) + entityCount * ENTITY_BYTES)
  w.u8(S2C.Snapshot).u32(tick).u32(ackSeq >>> 0).u8(Math.min(255, queued)).u16(alive).u16(kills).u8(self ? 1 : 0)
  if (self) writePlayerState(w, self)
  w.u16(entityCount)
  return w
}

export function encodePong(time: number, tick: number): Uint8Array {
  return new BinaryWriter(13).u8(S2C.Pong).f64(time).u32(tick).finish()
}

export function encodePlayerInfo(id: number, name: string, skin: number): Uint8Array {
  return new BinaryWriter(32).u8(S2C.PlayerInfo).u16(id).string(name).u8(skin).finish()
}

export function encodePlayerLeft(id: number): Uint8Array {
  return new BinaryWriter(3).u8(S2C.PlayerLeft).u16(id).finish()
}

export function encodeKick(reason: string): Uint8Array {
  return new BinaryWriter(64).u8(S2C.Kick).string(reason).finish()
}

const EV = { shot: 1, hit: 2, damaged: 3, eliminated: 4, itemSpawn: 5, itemRemove: 6, chestOpen: 7, projSpawn: 8, explosion: 9, target: 10, respawn: 11 } as const

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
      w.u16(e.victim).u16(e.killer).u8(e.cause).u8(Math.min(255, Math.round(e.respawnIn)))
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
      return { type: 'eliminated', victim: r.u16(), killer: r.u16(), cause: r.u8(), respawnIn: r.u8() }
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
      msg = { type: 'welcome', version: r.u16(), playerId: r.u16(), mapId: r.string(), tickRate: r.u16(), tick: r.u32(), serverName: r.string() }
      break
    case S2C.Snapshot: {
      const tick = r.u32()
      const ackSeq = r.u32()
      const queued = r.u8()
      const alive = r.u16()
      const kills = r.u16()
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
      msg = { type: 'snapshot', snapshot: { tick, ackSeq, queued, alive, kills, self, entities } }
      break
    }
    case S2C.Pong:
      msg = { type: 'pong', time: r.f64(), tick: r.u32() }
      break
    case S2C.PlayerInfo:
      msg = { type: 'playerInfo', id: r.u16(), name: r.string(), skin: r.u8() }
      break
    case S2C.PlayerLeft:
      msg = { type: 'playerLeft', id: r.u16() }
      break
    case S2C.Kick:
      msg = { type: 'kick', reason: r.string() }
      break
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
