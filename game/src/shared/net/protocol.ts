import { MOVE } from '../config/movement'
import { TAU, clamp } from '../math/scalar'
import { BUTTONS_MASK, CHARACTER_STATE_FIELDS, createCharacterState, type CharacterState, type MoveCommand } from '../movement/character'
import { BinaryReader, BinaryWriter, ProtocolError } from './binary'

/**
 * Protocolo de rede (binário). O mesmo formato trafega por WebSocket (LAN,
 * online) e por postMessage (servidor local no Web Worker, modo offline).
 *
 * Cliente → servidor: só INTENÇÕES (comandos de entrada). O servidor executa
 * a simulação e devolve o estado oficial; o cliente nunca informa posição.
 */

export const PROTOCOL_VERSION = 1

export const C2S = { Hello: 1, Input: 2, Ping: 3 } as const
export const S2C = { Welcome: 10, Snapshot: 11, Pong: 12, PlayerInfo: 13, PlayerLeft: 14, Kick: 15 } as const

export const MAX_NAME_LENGTH = 16
export const MAX_COMMANDS_PER_MESSAGE = 16

export interface InputCommand extends MoveCommand {
  /** Sequência crescente por conexão; o servidor confirma a última processada. */
  seq: number
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
}

export interface Snapshot {
  tick: number
  /** Último comando do destinatário já aplicado pelo servidor. */
  ackSeq: number
  /** Comandos do destinatário aguardando na fila do servidor. */
  queued: number
  self: CharacterState | null
  entities: EntityState[]
}

export interface WelcomeMessage {
  type: 'welcome'
  version: number
  playerId: number
  mapId: string
  tickRate: number
  tick: number
  serverName: string
}

export type ClientMessage =
  | { type: 'hello'; version: number; name: string }
  | { type: 'input'; commands: InputCommand[] }
  | { type: 'ping'; time: number }

export type ServerMessage =
  | WelcomeMessage
  | { type: 'snapshot'; snapshot: Snapshot }
  | { type: 'pong'; time: number; tick: number }
  | { type: 'playerInfo'; id: number; name: string; skin: number }
  | { type: 'playerLeft'; id: number }
  | { type: 'kick'; reason: string }

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

/** Devolve o comando como o servidor o verá depois de decodificado. */
export function quantizeCommand(c: InputCommand): InputCommand {
  return {
    seq: c.seq >>> 0,
    forward: quantAxis(c.forward) / 127,
    right: quantAxis(c.right) / 127,
    yaw: dequantYaw(quantYaw(c.yaw)),
    pitch: dequantPitch(quantPitch(c.pitch)),
    buttons: c.buttons & BUTTONS_MASK,
  }
}

/** Normaliza um nome de jogador: sem caracteres de controle, até 16 caracteres. */
export function sanitizeName(raw: string): string {
  const cleaned = raw.replace(/[\p{C}<>]/gu, '').replace(/\s+/g, ' ').trim()
  const chars = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('')
  return chars.length > 0 ? chars : 'Jogador'
}

// ---------------------------------------------------------------------------
// Cliente → servidor

export function encodeHello(name: string): Uint8Array {
  return new BinaryWriter(32).u8(C2S.Hello).u16(PROTOCOL_VERSION).string(name).finish()
}

export function encodeInputs(commands: readonly InputCommand[]): Uint8Array {
  if (commands.length > MAX_COMMANDS_PER_MESSAGE) throw new ProtocolError('comandos demais em uma mensagem')
  const w = new BinaryWriter(8 + commands.length * 12).u8(C2S.Input).u8(commands.length)
  for (const c of commands) {
    w.u32(c.seq >>> 0).i8(quantAxis(c.forward)).i8(quantAxis(c.right)).u16(quantYaw(c.yaw)).i16(quantPitch(c.pitch)).u16(c.buttons & BUTTONS_MASK)
  }
  return w.finish()
}

export function encodePing(time: number): Uint8Array {
  return new BinaryWriter(9).u8(C2S.Ping).f64(time).finish()
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
        })
      }
      msg = { type: 'input', commands }
      break
    }
    case C2S.Ping:
      msg = { type: 'ping', time: r.f64() }
      break
    default:
      throw new ProtocolError(`tipo de mensagem desconhecido: ${type}`)
  }
  r.expectEnd()
  return msg
}

// ---------------------------------------------------------------------------
// Servidor → cliente

export function encodeWelcome(m: Omit<WelcomeMessage, 'type'>): Uint8Array {
  return new BinaryWriter(64).u8(S2C.Welcome).u16(m.version).u16(m.playerId).string(m.mapId).u16(m.tickRate).u32(m.tick).string(m.serverName).finish()
}

function writeCharacterState(w: BinaryWriter, s: CharacterState): void {
  for (const k of CHARACTER_STATE_FIELDS) w.f64(s[k])
}

function readCharacterState(r: BinaryReader): CharacterState {
  const s = createCharacterState(0, 0, 0)
  for (const k of CHARACTER_STATE_FIELDS) s[k] = r.f64()
  return s
}

/** Escreve o estado público de um personagem como entidade de snapshot. */
export function writeEntity(w: BinaryWriter, id: number, s: CharacterState): void {
  w.u16(id).f32(s.x).f32(s.y).f32(s.z).u16(quantYaw(s.yaw)).i16(quantPitch(s.pitch)).u16(s.flags)
    .i16(quantVel(s.vx)).i16(quantVel(s.vy)).i16(quantVel(s.vz))
}

/** Bytes por entidade em um snapshot (para estimativas de banda). */
export const ENTITY_BYTES = 26

export function beginSnapshot(tick: number, ackSeq: number, queued: number, self: CharacterState | null, entityCount: number): BinaryWriter {
  const w = new BinaryWriter(16 + (self ? CHARACTER_STATE_FIELDS.length * 8 : 0) + entityCount * ENTITY_BYTES)
  w.u8(S2C.Snapshot).u32(tick).u32(ackSeq >>> 0).u8(Math.min(255, queued)).u8(self ? 1 : 0)
  if (self) writeCharacterState(w, self)
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
      const self = r.u8() ? readCharacterState(r) : null
      const n = r.u16()
      const entities: EntityState[] = []
      for (let k = 0; k < n; k++) {
        entities.push({
          id: r.u16(), x: r.f32(), y: r.f32(), z: r.f32(),
          yaw: dequantYaw(r.u16()), pitch: dequantPitch(r.i16()), flags: r.u16(),
          vx: r.i16() / 100, vy: r.i16() / 100, vz: r.i16() / 100,
        })
      }
      msg = { type: 'snapshot', snapshot: { tick, ackSeq, queued, self, entities } }
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
    default:
      throw new ProtocolError(`tipo de mensagem desconhecido: ${type}`)
  }
  r.expectEnd()
  return msg
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
  }
}
