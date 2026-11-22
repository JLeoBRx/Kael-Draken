import { AMMO_INFO, AMMO_TYPES, MATERIAL_TYPES, NO_ITEM, RARITIES, itemDef, type ConsumableDef, type WeaponDef } from '../config/items'
import { BUILD, PICKAXE, decodeBuild } from '../config/building'
import { aimFrame, createAimFrame } from '../combat/aim'
import { buildTarget, type PieceSpec } from '../building/grid'
import type { BuildingWorld } from '../building/buildings'
import { hash2i } from '../math/rng'
import { Buttons, CharFlag, copyCharacterState, createCharacterState, stepCharacter, type CharacterState, type MoveCommand } from '../movement/character'
import type { CollisionWorld } from '../world/collision-world'

/**
 * Estado de um jogador além do movimento: vida, escudo, inventário e estado da
 * arma. `stepPlayer` é determinístico e roda no servidor (autoridade) e no
 * cliente (predição do próprio jogador), como `stepCharacter`.
 *
 * O que depende de OUTROS jogadores (acertos, dano, coleta de itens do chão)
 * não está aqui: é decidido só pelo servidor a partir dos eventos gerados.
 */

export const SLOT_COUNT = 5
/** Índice de seleção da picareta (sempre disponível, fora dos 5 espaços). */
export const PICKAXE_SLOT = 5
/** Seleções possíveis: 5 espaços + picareta. */
export const SELECT_COUNT = 6
export const MAX_HEALTH = 100
export const MAX_SHIELD = 100
/** Velocidade de queda a partir da qual há dano (≈ 6 m de altura). */
export const FALL_SAFE_SPEED = 17
export const FALL_DAMAGE_PER_MS = 5
const THROW_COOLDOWN = 0.9
const CONSUMABLE_EQUIP = 0.25

export interface Slot {
  item: number
  rarity: number
  /** Quantidade (consumíveis); 1 para armas. */
  count: number
  /** Balas no pente (armas). */
  ammo: number
}

export interface PlayerCommand extends MoveCommand {
  seq: number
  /** Seleção desejada: espaços 0–4 ou PICKAXE_SLOT. */
  slot: number
  /** Modo construção (encodeBuild): 0 = desligado. */
  build: number
}

export interface PlayerState {
  char: CharacterState
  alive: boolean
  health: number
  shield: number
  selected: number
  slots: Slot[]
  ammo: number[]
  materials: number[]
  /** Tempo até a arma ficar pronta após trocar de espaço. */
  equipTimer: number
  /** Tempo até o próximo disparo permitido (pode ficar levemente negativo para manter a cadência). */
  fireCooldown: number
  /** > 0 durante a recarga (tempo restante). */
  reloadTimer: number
  /** > 0 durante o uso de consumível (tempo restante). */
  useTimer: number
  /** Dispersão extra acumulada por disparos seguidos (rad). */
  bloom: number
  /** Tempo até poder colocar outra peça. */
  buildCooldown: number
}

export interface ShotRay {
  ox: number
  oy: number
  oz: number
  dx: number
  dy: number
  dz: number
}

export type PlayerEvent =
  | { type: 'shot'; item: number; rarity: number; rays: ShotRay[] }
  | { type: 'throw'; item: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }
  | { type: 'reload'; item: number }
  | { type: 'dry'; item: number }
  | { type: 'consumed'; item: number }
  | { type: 'fall'; damage: number }
  | { type: 'build'; spec: PieceSpec; material: number }
  | { type: 'swing'; ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }

/**
 * Quem decide se uma peça pode ser colocada. Servidor: valida nas construções
 * oficiais e coloca. Cliente: valida na sua visão e coloca uma peça prevista.
 */
export interface BuildDelegate {
  readonly buildings: BuildingWorld
  /** true se a peça foi (ou já estava) colocada para este comando. */
  tryBuild(spec: PieceSpec, material: number, seq: number): boolean
}

export function emptySlot(): Slot {
  return { item: NO_ITEM, rarity: 0, count: 0, ammo: 0 }
}

export function createPlayerState(char: CharacterState = createCharacterState(0, 0, 0)): PlayerState {
  return {
    char,
    alive: true,
    health: MAX_HEALTH,
    shield: 0,
    selected: PICKAXE_SLOT,
    slots: Array.from({ length: SLOT_COUNT }, emptySlot),
    ammo: new Array(AMMO_TYPES).fill(0),
    materials: new Array(MATERIAL_TYPES).fill(0),
    equipTimer: 0,
    fireCooldown: 0,
    reloadTimer: 0,
    useTimer: 0,
    bloom: 0,
    buildCooldown: 0,
  }
}

export function copyPlayerState(src: PlayerState, dst: PlayerState): PlayerState {
  copyCharacterState(src.char, dst.char)
  dst.alive = src.alive
  dst.health = src.health
  dst.shield = src.shield
  dst.selected = src.selected
  for (let k = 0; k < SLOT_COUNT; k++) Object.assign(dst.slots[k], src.slots[k])
  for (let k = 0; k < AMMO_TYPES; k++) dst.ammo[k] = src.ammo[k]
  for (let k = 0; k < MATERIAL_TYPES; k++) dst.materials[k] = src.materials[k]
  dst.equipTimer = src.equipTimer
  dst.fireCooldown = src.fireCooldown
  dst.reloadTimer = src.reloadTimer
  dst.useTimer = src.useTimer
  dst.bloom = src.bloom
  dst.buildCooldown = src.buildCooldown
  return dst
}

export function clonePlayerState(src: PlayerState): PlayerState {
  return copyPlayerState(src, createPlayerState())
}

/** Espaço selecionado (null com a picareta na mão). */
export function selectedSlot(p: PlayerState): Slot | null {
  return p.selected < SLOT_COUNT ? p.slots[p.selected] : null
}

export function selectedWeapon(p: PlayerState): WeaponDef | null {
  const s = selectedSlot(p)
  if (!s) return null
  const it = itemDef(s.item)
  return it && it.kind === 'weapon' ? it : null
}

/** Dispersão atual da arma (rad), considerando postura, movimento e bloom. */
export function currentSpread(p: PlayerState, w: WeaponDef): number {
  const f = p.char.flags
  let s = f & CharFlag.Aiming ? w.spreadAim : w.spreadHip
  const hs = Math.hypot(p.char.vx, p.char.vz)
  if (hs > 0.5) s += w.spreadMove * Math.min(1, hs / 5.2)
  if (!(f & CharFlag.Grounded) && !(f & CharFlag.Swimming)) s += w.spreadAir
  if (f & CharFlag.Crouched && !(f & CharFlag.Sliding)) s *= 0.75
  return s + p.bloom
}

const frame = createAimFrame()

/**
 * Raios do disparo. O desvio de cada bala vem de um hash de (jogador,
 * comando, bala): cliente e servidor calculam o MESMO desvio, então o traçado
 * previsto na tela é o que o servidor vai validar.
 */
export function shotRays(p: PlayerState, w: WeaponDef, seq: number, playerId: number): ShotRay[] {
  const f = aimFrame(p.char, frame)
  const spread = currentSpread(p, w)
  const rays: ShotRay[] = []
  for (let k = 0; k < w.pellets; k++) {
    const a = (hash2i(seq, k * 2 + 1, playerId * 7919 + 17) / 4294967296) * Math.PI * 2
    // Escopeta: padrão mais uniforme (raio mínimo); demais: disco uniforme
    const u = hash2i(seq, k * 2 + 2, playerId * 7919 + 17) / 4294967296
    const r = Math.tan(spread * (w.pellets > 1 ? 0.35 + 0.65 * Math.sqrt(u) : Math.sqrt(u)))
    let dx = f.fx + (f.rx * Math.cos(a) + f.ux * Math.sin(a)) * r
    let dy = f.fy + f.uy * Math.sin(a) * r
    let dz = f.fz + (f.rz * Math.cos(a) + f.uz * Math.sin(a)) * r
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    dx /= len
    dy /= len
    dz /= len
    rays.push({ ox: f.ox, oy: f.oy, oz: f.oz, dx, dy, dz })
  }
  return rays
}

/** Pode usar este consumível agora (há o que curar/recarregar)? */
export function canConsume(p: PlayerState, c: ConsumableDef): boolean {
  if (c.throwable) return true
  return (c.heal > 0 && p.health < c.healCap) || (c.shield > 0 && p.shield < c.shieldCap)
}

function clearSlotIfEmpty(slot: Slot): void {
  if (slot.count <= 0) Object.assign(slot, emptySlot())
}

function startReload(p: PlayerState, w: WeaponDef, rarity: number): boolean {
  const slot = p.slots[p.selected]
  if (!slot || p.reloadTimer > 0 || slot.ammo >= w.magSize || p.ammo[w.ammoType] <= 0) return false
  p.reloadTimer = w.reloadTime * (RARITIES[rarity]?.reload ?? 1)
  return true
}

/**
 * Avança um jogador por um tick: movimento, dano de queda, troca de espaço,
 * recarga, disparo, consumíveis e arremessos. Eventos vão para `events`
 * (o servidor resolve acertos; o cliente toca efeitos).
 */
export function stepPlayer(p: PlayerState, cmd: PlayerCommand, world: CollisionWorld, dt: number, playerId: number, events: PlayerEvent[] | null, builder: BuildDelegate | null = null): void {
  if (!p.alive) return
  const prev = p.char.prevButtons
  stepCharacter(p.char, cmd, world, dt)
  const buttons = cmd.buttons
  const pressed = buttons & ~prev

  // Dano de queda (vai direto na vida, como em jogos do gênero)
  if (p.char.landImpact > FALL_SAFE_SPEED) {
    const dmg = (p.char.landImpact - FALL_SAFE_SPEED) * FALL_DAMAGE_PER_MS
    p.health = Math.max(0, p.health - dmg)
    events?.push({ type: 'fall', damage: dmg })
  }

  p.equipTimer = Math.max(0, p.equipTimer - dt)
  if (p.fireCooldown > -dt) p.fireCooldown -= dt
  else p.fireCooldown = -dt

  // Troca de espaço (0–4) ou picareta
  const want = cmd.slot | 0
  if (want >= 0 && want < SELECT_COUNT && want !== p.selected) {
    p.selected = want
    p.reloadTimer = 0
    p.useTimer = 0
    p.bloom = 0
    const it = want < SLOT_COUNT ? itemDef(p.slots[want].item) : undefined
    p.equipTimer = it?.kind === 'weapon' ? it.equipTime : CONSUMABLE_EQUIP
  }

  // Modo construção: o botão de tiro coloca peças; armas ficam guardadas
  p.buildCooldown = Math.max(0, p.buildCooldown - dt)
  const build = decodeBuild(cmd.build | 0)
  if (build.kind !== 0) {
    p.reloadTimer = 0
    p.useTimer = 0
    if (buttons & Buttons.Fire && p.buildCooldown <= 0 && builder && p.materials[build.material] >= BUILD.cost) {
      const spec = buildTarget(p.char, build.kind, build.rot, (i, j, k, d) => builder.buildings.hasRamp(i, j, k, d))
      if (builder.tryBuild(spec, build.material, cmd.seq)) {
        p.materials[build.material] -= BUILD.cost
        p.buildCooldown = BUILD.cooldown
        events?.push({ type: 'build', spec, material: build.material })
      }
    }
    return
  }

  // Picareta: golpes em ritmo fixo (o servidor decide o que foi atingido)
  if (p.selected === PICKAXE_SLOT) {
    if (buttons & Buttons.Fire && p.fireCooldown <= 0 && p.equipTimer <= 0) {
      p.fireCooldown = Math.max(p.fireCooldown, -dt) + PICKAXE.interval
      const f = aimFrame(p.char, frame)
      events?.push({ type: 'swing', ox: f.ox, oy: f.oy, oz: f.oz, dx: f.fx, dy: f.fy, dz: f.fz })
    }
    return
  }

  const slot = p.slots[p.selected]
  const def = itemDef(slot.item)

  if (def?.kind === 'weapon') {
    p.bloom = Math.max(0, p.bloom - def.bloomRecover * dt)
    if (p.reloadTimer > 0) {
      p.reloadTimer -= dt
      if (p.reloadTimer <= 0) {
        p.reloadTimer = 0
        const take = Math.min(def.magSize - slot.ammo, p.ammo[def.ammoType])
        slot.ammo += take
        p.ammo[def.ammoType] -= take
      }
    } else if (pressed & Buttons.Reload && startReload(p, def, slot.rarity)) {
      events?.push({ type: 'reload', item: def.id })
    }
    const wantFire = def.automatic ? (buttons & Buttons.Fire) !== 0 : (pressed & Buttons.Fire) !== 0
    if (wantFire && p.equipTimer <= 0 && p.reloadTimer <= 0 && p.fireCooldown <= 0) {
      if (slot.ammo > 0) {
        slot.ammo--
        p.fireCooldown = Math.max(p.fireCooldown, -dt) + def.fireInterval
        events?.push({ type: 'shot', item: def.id, rarity: slot.rarity, rays: shotRays(p, def, cmd.seq, playerId) })
        p.bloom = Math.min(def.bloomMax, p.bloom + def.bloomPerShot)
      } else if (startReload(p, def, slot.rarity)) {
        events?.push({ type: 'reload', item: def.id })
      } else if (pressed & Buttons.Fire) {
        events?.push({ type: 'dry', item: def.id })
      }
    }
    // Recarga automática quando o pente esvazia
    if (slot.ammo === 0 && p.reloadTimer <= 0 && p.fireCooldown <= 0 && startReload(p, def, slot.rarity)) {
      events?.push({ type: 'reload', item: def.id })
    }
  } else if (def?.kind === 'consumable') {
    if (def.throwable) {
      if (pressed & Buttons.Fire && p.fireCooldown <= 0 && p.equipTimer <= 0) {
        const f = aimFrame(p.char, frame)
        const sp = def.throwable.speed
        // lança um pouco acima da mira
        let vx = f.fx + f.ux * 0.18
        let vy = f.fy + f.uy * 0.18
        let vz = f.fz + f.uz * 0.18
        const len = Math.hypot(vx, vy, vz)
        vx = (vx / len) * sp + p.char.vx * 0.3
        vy = (vy / len) * sp
        vz = (vz / len) * sp + p.char.vz * 0.3
        events?.push({ type: 'throw', item: def.id, x: f.ox + f.fx * 0.4, y: f.oy + f.fy * 0.4, z: f.oz + f.fz * 0.4, vx, vy, vz })
        slot.count--
        clearSlotIfEmpty(slot)
        p.fireCooldown = THROW_COOLDOWN
      }
    } else if (p.useTimer > 0) {
      p.useTimer -= dt
      if (p.useTimer <= 0) {
        p.useTimer = 0
        if (def.heal > 0 && p.health < def.healCap) p.health = Math.min(def.healCap, p.health + def.heal)
        if (def.shield > 0 && p.shield < def.shieldCap) p.shield = Math.min(def.shieldCap, p.shield + def.shield)
        slot.count--
        clearSlotIfEmpty(slot)
        events?.push({ type: 'consumed', item: def.id })
      }
    } else if (pressed & Buttons.Fire && p.equipTimer <= 0 && canConsume(p, def)) {
      p.useTimer = def.useTime
    }
  } else {
    p.bloom = 0
  }
}

/** Limite de reserva por tipo de munição. */
export function ammoCap(type: number): number {
  return AMMO_INFO[type]?.max ?? 999
}
