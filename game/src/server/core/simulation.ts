import { ITEM, NO_ITEM, damageAt, itemDef, weaponDef, type ProjectileDef } from '../../shared/config/items'
import { muzzlePoint } from '../../shared/combat/aim'
import { createHitbox, hitboxAt, hitboxCenter, rayHitbox, segmentHitsHitbox, type HitResult } from '../../shared/combat/hitboxes'
import { splashDamage, stepProjectile, type ProjectileState } from '../../shared/combat/projectile'
import type { GameMap } from '../../shared/maps/types'
import { Rng } from '../../shared/math/rng'
import { clamp } from '../../shared/math/scalar'
import { Buttons, createCharacterState } from '../../shared/movement/character'
import { Cause, TargetKind, sanitizeCommand, type GameEvent, type InputCommand, type InventoryAction, type ShotEnd } from '../../shared/net/protocol'
import { chestInteractable, itemInteractable, pickInteractable, type Interactable } from '../../shared/player/interact'
import { pickupItem, swapSlots, takeSlot, type WorldItem } from '../../shared/player/inventory'
import { createPlayerState, stepPlayer, type PlayerEvent, type PlayerState } from '../../shared/player/player'
import { createWorldHit } from '../../shared/world/collision-world'
import { rollChest, rollFloor, type LootDrop } from './loot'

/**
 * Simulação autoritativa da partida. Só o servidor (dedicado, host LAN ou o
 * Worker do modo offline) executa esta classe; o resultado dela é a verdade.
 *
 * - Movimento, armas e consumíveis: `stepPlayer` (o mesmo código da predição).
 * - Acertos: só aqui, com compensação de latência (o alvo é voltado no tempo
 *   para o instante que o atirador estava vendo, até 1 s).
 * - Dano, eliminações, loot, baús, projéteis e bonecos de treino: só aqui.
 *
 * Proteção contra "speed hack": um balde de fichas por jogador limita os
 * comandos aplicados ao ritmo real do servidor (1 ficha por tick, rajada
 * máxima de MAX_TOKENS ticks). Comandos acima disso esperam na fila.
 */

export const MAX_TOKENS = 8
export const MAX_QUEUE = 64
const HISTORY = 48
const DUMMY_HEALTH = 200

export interface MatchRules {
  /** Renascer após eliminação (modo treino/sandbox). */
  respawn: boolean
  respawnDelay: number
  /** Semente do loot desta partida. */
  seed: number
}

export const SANDBOX_RULES: MatchRules = { respawn: true, respawnDelay: 5, seed: 1 }

/** Posições passadas de um jogador (para compensação de latência). */
class PoseHistory {
  private readonly ticks = new Int32Array(HISTORY).fill(-1)
  private readonly x = new Float64Array(HISTORY)
  private readonly y = new Float64Array(HISTORY)
  private readonly z = new Float64Array(HISTORY)
  private readonly flags = new Int32Array(HISTORY)

  record(tick: number, s: { x: number; y: number; z: number; flags: number }): void {
    const k = tick % HISTORY
    this.ticks[k] = tick
    this.x[k] = s.x
    this.y[k] = s.y
    this.z[k] = s.z
    this.flags[k] = s.flags
  }

  clear(): void {
    this.ticks.fill(-1)
  }

  /** Pose no tick fracionário `t`. Devolve false se não houver registro. */
  sample(t: number, out: { x: number; y: number; z: number; flags: number }): boolean {
    const t0 = Math.floor(t)
    const a = t0 % HISTORY
    const b = (t0 + 1) % HISTORY
    const hasA = t0 >= 0 && this.ticks[a] === t0
    const hasB = this.ticks[b] === t0 + 1
    if (hasA && hasB) {
      const f = t - t0
      out.x = this.x[a] + (this.x[b] - this.x[a]) * f
      out.y = this.y[a] + (this.y[b] - this.y[a]) * f
      out.z = this.z[a] + (this.z[b] - this.z[a]) * f
      out.flags = f < 0.5 ? this.flags[a] : this.flags[b]
      return true
    }
    const k = hasA ? a : hasB ? b : -1
    if (k < 0) return false
    out.x = this.x[k]
    out.y = this.y[k]
    out.z = this.z[k]
    out.flags = this.flags[k]
    return true
  }
}

export interface SimPlayer {
  id: number
  name: string
  skin: number
  p: PlayerState
  queue: InputCommand[]
  /** Último comando aplicado. */
  lastSeq: number
  /** Maior sequência já aceita na fila. */
  lastQueuedSeq: number
  tokens: number
  droppedCommands: number
  kills: number
  lastAttacker: number
  lastAttackTick: number
  /** Tick de renascimento (-1 = não renasce). */
  respawnTick: number
  history: PoseHistory
}

export interface Dummy {
  id: number
  x: number
  y: number
  z: number
  yaw: number
  health: number
  downUntil: number
  lastHitTick: number
}

interface LiveProjectile {
  id: number
  owner: number
  item: number
  def: ProjectileDef
  s: ProjectileState
}

/** Evento com destinatários: `to` (só um jogador), `except` (todos menos um) ou todos. */
export interface RoutedEvent {
  ev: GameEvent
  to?: number
  except?: number
}

export class Simulation {
  readonly map: GameMap
  readonly tickRate: number
  readonly dt: number
  readonly rules: MatchRules
  tick = 0
  readonly players = new Map<number, SimPlayer>()
  readonly items = new Map<number, WorldItem>()
  readonly chestOpened: boolean[]
  readonly dummies: Dummy[]
  readonly projectiles = new Map<number, LiveProjectile>()
  /** Eventos gerados no tick atual (o GameHost distribui e limpa). */
  events: RoutedEvent[] = []
  private nextId = 1
  private nextItemId = 1
  private nextProjId = 1
  private spawnCursor = 0
  private readonly rng: Rng
  private readonly itemSpot = new Map<number, number>()
  private readonly refillAt = new Map<number, number>()
  private readonly hit = createWorldHit()
  private readonly hit2 = createWorldHit()
  private readonly hb = createHitbox()
  private readonly hr: HitResult = { t: 0, head: false }
  private readonly pose = { x: 0, y: 0, z: 0, flags: 0 }
  private readonly playerEvents: PlayerEvent[] = []

  constructor(map: GameMap, tickRate: number, rules: Partial<MatchRules> = {}) {
    this.map = map
    this.tickRate = tickRate
    this.dt = 1 / tickRate
    this.rules = { ...SANDBOX_RULES, ...rules }
    this.rng = new Rng(map.def.seed ^ (this.rules.seed * 0x9e3779b1))
    this.chestOpened = map.chests.map(() => false)
    this.dummies = map.targets.map((t, id) => ({ id, x: t.x, y: t.y, z: t.z, yaw: t.yaw, health: DUMMY_HEALTH, downUntil: -1, lastHitTick: -1000 }))
    this.populateLoot()
  }

  private emit(ev: GameEvent, route: { to?: number; except?: number } = {}): void {
    this.events.push({ ev, ...route })
  }

  // ---- jogadores ---------------------------------------------------------

  private allocateId(): number {
    for (let k = 0; k < 0xfffe; k++) {
      const id = this.nextId
      this.nextId = this.nextId >= 0xfffe ? 1 : this.nextId + 1
      if (!this.players.has(id)) return id
    }
    throw new Error('Sem ids de jogador disponíveis')
  }

  /** Estado inicial sobre a primeira superfície abaixo do próximo ponto de surgimento. */
  spawnState(): PlayerState {
    const sp = this.map.spawns[this.spawnCursor++ % this.map.spawns.length]
    const top = this.map.terrain.highest + 20
    const y = this.map.world.raycast(sp.x, top, sp.z, 0, -1, 0, top + 50, this.hit) ? this.hit.y : this.map.terrain.heightAt(sp.x, sp.z)
    return createPlayerState(createCharacterState(sp.x, y + 0.02, sp.z, sp.yaw))
  }

  addPlayer(name: string, skin = 0): SimPlayer {
    const id = this.allocateId()
    const p: SimPlayer = {
      id, name, skin,
      p: this.spawnState(),
      queue: [],
      lastSeq: 0,
      lastQueuedSeq: 0,
      tokens: MAX_TOKENS,
      droppedCommands: 0,
      kills: 0,
      lastAttacker: 0,
      lastAttackTick: -1000,
      respawnTick: -1,
      history: new PoseHistory(),
    }
    this.players.set(id, p)
    return p
  }

  removePlayer(id: number): void {
    this.players.delete(id)
  }

  get aliveCount(): number {
    let n = 0
    for (const p of this.players.values()) if (p.p.alive) n++
    return n
  }

  enqueue(id: number, commands: readonly InputCommand[]): void {
    const p = this.players.get(id)
    if (!p) return
    for (const raw of commands) {
      if (raw.seq <= p.lastQueuedSeq) continue
      p.queue.push(sanitizeCommand(raw))
      p.lastQueuedSeq = raw.seq
    }
    while (p.queue.length > MAX_QUEUE) {
      p.queue.shift()
      p.droppedCommands++
    }
  }

  inventoryAction(id: number, op: InventoryAction): void {
    const sp = this.players.get(id)
    if (!sp || !sp.p.alive) return
    if (op.action === 'swap') {
      swapSlots(sp.p, op.a, op.b)
      return
    }
    const slot = takeSlot(sp.p, op.slot)
    if (!slot) return
    const c = sp.p.char
    this.spawnItem({ item: slot.item, rarity: slot.rarity, count: slot.count, ammo: slot.ammo }, c.x - Math.sin(c.yaw) * 1.2, c.y, c.z - Math.cos(c.yaw) * 1.2)
  }

  // ---- tick ---------------------------------------------------------------

  step(): void {
    for (const sp of this.players.values()) {
      if (!sp.p.alive) {
        while (sp.queue.length > 0) sp.lastSeq = sp.queue.shift()!.seq
        if (sp.respawnTick >= 0 && this.tick >= sp.respawnTick) this.respawn(sp)
        continue
      }
      sp.tokens = Math.min(sp.tokens + 1, MAX_TOKENS)
      while (sp.queue.length > 0 && sp.tokens >= 1) {
        const c = sp.queue.shift()!
        sp.tokens -= 1
        this.applyCommand(sp, c)
        sp.lastSeq = c.seq
        if (!sp.p.alive) {
          while (sp.queue.length > 0) sp.lastSeq = sp.queue.shift()!.seq
          break
        }
      }
    }
    this.stepProjectiles()
    this.stepDummies()
    this.stepRefills()
    this.tick++
    for (const sp of this.players.values()) if (sp.p.alive) sp.history.record(this.tick, sp.p.char)
  }

  private applyCommand(sp: SimPlayer, c: InputCommand): void {
    const prev = sp.p.char.prevButtons
    const evs = this.playerEvents
    evs.length = 0
    stepPlayer(sp.p, c, this.map.world, this.dt, sp.id, evs)
    for (const e of evs) {
      if (e.type === 'shot') this.resolveShot(sp, e.item, e.rarity, e.rays, c.viewTick)
      else if (e.type === 'throw') {
        const def = itemDef(e.item)
        if (def?.kind === 'consumable' && def.throwable) this.spawnProjectile(sp, e.item, def.throwable, e.x, e.y, e.z, e.vx, e.vy, e.vz)
      } else if (e.type === 'fall' && sp.p.health <= 0) {
        this.eliminate(sp, this.recentAttacker(sp), Cause.Fall)
      }
      if (!sp.p.alive) return
    }
    if (sp.p.char.y < this.map.def.waterLevel - 40) {
      this.eliminate(sp, this.recentAttacker(sp), Cause.Void)
      return
    }
    if ((c.buttons & ~prev) & Buttons.Use) this.interact(sp)
  }

  private recentAttacker(sp: SimPlayer): number {
    return this.tick - sp.lastAttackTick < this.tickRate * 10 ? sp.lastAttacker : 0
  }

  // ---- tiros --------------------------------------------------------------

  private resolveShot(sp: SimPlayer, item: number, rarity: number, rays: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }[], viewTick: number): void {
    const w = weaponDef(item)
    if (!w || rays.length === 0) return
    if (w.projectile) {
      const r = rays[0]
      const v = w.projectile.speed
      this.spawnProjectile(sp, item, w.projectile, r.ox + r.dx * 0.8, r.oy + r.dy * 0.8, r.oz + r.dz * 0.8, r.dx * v, r.dy * v, r.dz * v)
      return
    }
    const world = this.map.world
    // Compensação de latência: o servidor volta os alvos ao tick que o atirador via.
    const rewind = clamp(viewTick, this.tick - this.tickRate, this.tick)
    const muzzle = muzzlePoint(sp.p.char)
    const ends: ShotEnd[] = []
    const acc = new Map<string, { kind: number; id: number; dmg: number; head: boolean; x: number; y: number; z: number }>()
    for (const r of rays) {
      let best = w.range
      let kind = -1
      let target = 0
      let head = false
      let hitWorld = false
      if (world.raycast(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, w.range, this.hit)) {
        best = this.hit.t
        hitWorld = true
      }
      for (const q of this.players.values()) {
        if (q === sp || !q.p.alive) continue
        if (!q.history.sample(rewind, this.pose)) Object.assign(this.pose, { x: q.p.char.x, y: q.p.char.y, z: q.p.char.z, flags: q.p.char.flags })
        hitboxAt(this.pose.x, this.pose.y, this.pose.z, this.pose.flags, this.hb)
        if (rayHitbox(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, best, this.hb, this.hr) && this.hr.t < best) {
          best = this.hr.t
          kind = TargetKind.Player
          target = q.id
          head = this.hr.head
        }
      }
      for (const d of this.dummies) {
        if (d.downUntil >= 0) continue
        hitboxAt(d.x, d.y, d.z, 0, this.hb)
        if (rayHitbox(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, best, this.hb, this.hr) && this.hr.t < best) {
          best = this.hr.t
          kind = TargetKind.Dummy
          target = d.id
          head = this.hr.head
        }
      }
      let ex = r.ox + r.dx * best
      let ey = r.oy + r.dy * best
      let ez = r.oz + r.dz * best
      // Nada de atirar "pela câmera": o caminho da arma até o impacto também precisa estar livre.
      const mx = ex - muzzle.x
      const my = ey - muzzle.y
      const mz = ez - muzzle.z
      const md = Math.sqrt(mx * mx + my * my + mz * mz)
      if (md > 0.6 && world.raycast(muzzle.x, muzzle.y, muzzle.z, mx / md, my / md, mz / md, md - 0.05, this.hit2)) {
        ex = this.hit2.x
        ey = this.hit2.y
        ez = this.hit2.z
        kind = -1
        hitWorld = true
      }
      ends.push({ x: ex, y: ey, z: ez, hit: kind >= 0 ? 2 : hitWorld ? 1 : 0 })
      if (kind >= 0) {
        const key = `${kind}:${target}`
        const dmg = damageAt(w, rarity, best) * (head ? w.headshot : 1)
        const a = acc.get(key)
        if (a) {
          a.dmg += dmg
          a.head ||= head
        } else acc.set(key, { kind, id: target, dmg, head, x: ex, y: ey, z: ez })
      }
    }
    const r0 = rays[0]
    this.emit({ type: 'shot', shooter: sp.id, item, ox: r0.ox, oy: r0.oy, oz: r0.oz, ends }, { except: sp.id })
    for (const a of acc.values()) {
      const amount = Math.max(1, Math.round(a.dmg))
      if (a.kind === TargetKind.Player) {
        const q = this.players.get(a.id)
        if (!q) continue
        const res = this.applyDamage(q, amount, sp, item, muzzle.x, muzzle.z)
        if (res) this.emit({ type: 'hit', targetKind: a.kind, target: a.id, damage: amount, head: a.head, ...res, x: a.x, y: a.y, z: a.z }, { to: sp.id })
      } else {
        const res = this.damageDummy(this.dummies[a.id], amount)
        this.emit({ type: 'hit', targetKind: a.kind, target: a.id, damage: amount, head: a.head, shield: false, broke: false, eliminated: res, x: a.x, y: a.y, z: a.z }, { to: sp.id })
      }
    }
  }

  /** Aplica dano (escudo primeiro). Devolve os detalhes ou null se o alvo já estava fora. */
  applyDamage(victim: SimPlayer, amount: number, attacker: SimPlayer | null, cause: number, fromX: number, fromZ: number): { shield: boolean; broke: boolean; eliminated: boolean } | null {
    const p = victim.p
    if (!p.alive || amount <= 0) return null
    const shieldBefore = p.shield
    const toShield = Math.min(p.shield, amount)
    p.shield -= toShield
    p.health = Math.max(0, p.health - (amount - toShield))
    if (attacker && attacker !== victim) {
      victim.lastAttacker = attacker.id
      victim.lastAttackTick = this.tick
    }
    this.emit({ type: 'damaged', amount, fromX, fromZ, cause }, { to: victim.id })
    let eliminated = false
    if (p.health <= 0) {
      this.eliminate(victim, attacker && attacker !== victim ? attacker.id : this.recentAttacker(victim), cause)
      eliminated = true
    }
    return { shield: toShield > 0, broke: shieldBefore > 0 && p.shield <= 0, eliminated }
  }

  private eliminate(victim: SimPlayer, killerId: number, cause: number): void {
    const p = victim.p
    if (!p.alive) return
    p.alive = false
    p.health = 0
    p.shield = 0
    p.char.vx = p.char.vy = p.char.vz = 0
    // Tudo o que carregava cai no chão, em volta do corpo
    const drops: LootDrop[] = []
    for (const s of p.slots) {
      if (s.item !== NO_ITEM) drops.push({ item: s.item, rarity: s.rarity, count: s.count, ammo: s.ammo })
      Object.assign(s, { item: NO_ITEM, rarity: 0, count: 0, ammo: 0 })
    }
    const ammoItems = [ITEM.AmmoLight, ITEM.AmmoMedium, ITEM.AmmoHeavy, ITEM.AmmoShells, ITEM.AmmoRockets]
    p.ammo.forEach((n, k) => { if (n > 0) drops.push({ item: ammoItems[k], rarity: 0, count: n, ammo: 0 }) })
    const mats = [ITEM.Wood, ITEM.Stone, ITEM.Metal]
    p.materials.forEach((n, k) => { if (n > 0) drops.push({ item: mats[k], rarity: 0, count: n, ammo: 0 }) })
    p.ammo.fill(0)
    p.materials.fill(0)
    p.reloadTimer = p.useTimer = 0
    drops.forEach((d, k) => {
      const a = (k / Math.max(1, drops.length)) * Math.PI * 2
      this.spawnItem(d, p.char.x + Math.cos(a) * 1.1, p.char.y, p.char.z + Math.sin(a) * 1.1)
    })
    const killer = this.players.get(killerId)
    if (killer && killer !== victim) killer.kills++
    victim.respawnTick = this.rules.respawn ? this.tick + Math.round(this.rules.respawnDelay * this.tickRate) : -1
    victim.history.clear()
    this.emit({ type: 'eliminated', victim: victim.id, killer: killer && killer !== victim ? killer.id : 0, cause, respawnIn: this.rules.respawn ? this.rules.respawnDelay : 0 })
  }

  private respawn(sp: SimPlayer): void {
    sp.p = this.spawnState()
    sp.respawnTick = -1
    sp.lastAttacker = 0
    sp.history.clear()
    this.emit({ type: 'respawn', player: sp.id })
  }

  // ---- bonecos de treino --------------------------------------------------

  private damageDummy(d: Dummy, amount: number): boolean {
    d.health -= amount
    d.lastHitTick = this.tick
    if (d.health > 0) return false
    d.health = 0
    d.downUntil = this.tick + this.tickRate * 3
    this.emit({ type: 'target', id: d.id, health: 0, down: true })
    return true
  }

  private stepDummies(): void {
    for (const d of this.dummies) {
      if (d.downUntil >= 0 && this.tick >= d.downUntil) {
        d.downUntil = -1
        d.health = DUMMY_HEALTH
        this.emit({ type: 'target', id: d.id, health: d.health, down: false })
      } else if (d.downUntil < 0 && d.health < DUMMY_HEALTH && this.tick - d.lastHitTick > this.tickRate * 3) {
        d.health = DUMMY_HEALTH
      }
    }
  }

  // ---- itens e baús -------------------------------------------------------

  /** Altura do chão para soltar um item perto de (x, y, z). */
  private groundAt(x: number, y: number, z: number): number {
    const w = this.map.world
    const g = w.raycast(x, y + 1.2, z, 0, -1, 0, 10, this.hit2) ? this.hit2.y : w.terrain.heightAt(x, z)
    return Math.max(g, this.map.def.waterLevel) + 0.02
  }

  spawnItem(drop: LootDrop, x: number, y: number, z: number, spot = -1, exactY = false): WorldItem {
    let id = this.nextItemId
    while (this.items.has(id)) id = id >= 0xfffe ? 1 : id + 1
    this.nextItemId = id >= 0xfffe ? 1 : id + 1
    const b = this.map.world.bound
    x = clamp(x, -b, b)
    z = clamp(z, -b, b)
    const it: WorldItem = { id, item: drop.item, rarity: drop.rarity, count: drop.count, ammo: drop.ammo, x, y: exactY ? y : this.groundAt(x, y, z), z }
    this.items.set(id, it)
    if (spot >= 0) this.itemSpot.set(id, spot)
    this.emit({ type: 'itemSpawn', id, item: it.item, rarity: it.rarity, count: it.count, ammo: it.ammo, x: it.x, y: it.y, z: it.z })
    return it
  }

  private removeItem(id: number, by: number): void {
    if (!this.items.delete(id)) return
    const spot = this.itemSpot.get(id)
    if (spot !== undefined) {
      this.itemSpot.delete(id)
      const refill = this.map.lootSpots[spot]?.refill ?? 0
      if (refill > 0) this.refillAt.set(spot, this.tick + Math.round(refill * this.tickRate))
    }
    this.emit({ type: 'itemRemove', id, by })
  }

  private spawnSpot(index: number): void {
    const s = this.map.lootSpots[index]
    const drops = s.fixed ? [fixedDrop(s.fixed)] : rollFloor(this.rng, s.tier)
    drops.forEach((d, k) => this.spawnItem(d, s.x + k * 0.6, s.y, s.z, k === 0 ? index : -1, true))
  }

  private populateLoot(): void {
    for (let k = 0; k < this.map.lootSpots.length; k++) this.spawnSpot(k)
    this.events = []
  }

  private stepRefills(): void {
    for (const [spot, at] of this.refillAt) {
      if (this.tick >= at) {
        this.refillAt.delete(spot)
        this.spawnSpot(spot)
      }
    }
  }

  /** Item ou baú ao alcance que "Interagir" afetaria. */
  interactableFor(sp: SimPlayer): Interactable | null {
    const c = sp.p.char
    const cands: Interactable[] = []
    for (const it of this.items.values()) {
      if (Math.abs(it.x - c.x) < 3 && Math.abs(it.z - c.z) < 3) cands.push(itemInteractable(it.id, it.x, it.y, it.z))
    }
    this.map.chests.forEach((ch, i) => {
      if (!this.chestOpened[i] && Math.abs(ch.x - c.x) < 3 && Math.abs(ch.z - c.z) < 3) cands.push(chestInteractable(i, ch.x, ch.y, ch.z))
    })
    return pickInteractable(c, cands)
  }

  private interact(sp: SimPlayer): void {
    const pick = this.interactableFor(sp)
    if (!pick) return
    if (pick.kind === 'item') {
      const it = this.items.get(pick.id)
      if (!it) return
      const res = pickupItem(sp.p, it)
      if (res.taken <= 0 && !res.swapped) return
      this.removeItem(it.id, sp.id)
      if (res.taken < it.count) this.spawnItem({ ...it, count: it.count - res.taken }, it.x, it.y, it.z, -1, true)
      if (res.swapped) this.spawnItem({ item: res.swapped.item, rarity: res.swapped.rarity, count: res.swapped.count, ammo: res.swapped.ammo }, it.x + 0.4, it.y, it.z + 0.4)
    } else {
      this.openChest(sp, pick.id)
    }
  }

  private openChest(sp: SimPlayer, index: number): void {
    if (this.chestOpened[index]) return
    this.chestOpened[index] = true
    const ch = this.map.chests[index]
    this.emit({ type: 'chestOpen', chest: index, by: sp.id })
    const drops = rollChest(this.rng, ch.tier)
    // espalha em leque na frente do baú (frente = +Z local)
    drops.forEach((d, k) => {
      const a = ch.yaw + (k - (drops.length - 1) / 2) * 0.5
      this.spawnItem(d, ch.x + Math.sin(a) * 1.1, ch.y + 0.5, ch.z + Math.cos(a) * 1.1)
    })
  }

  // ---- projéteis ----------------------------------------------------------

  private spawnProjectile(owner: SimPlayer, item: number, def: ProjectileDef, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    let id = this.nextProjId
    while (this.projectiles.has(id)) id = id >= 0xfffe ? 1 : id + 1
    this.nextProjId = id >= 0xfffe ? 1 : id + 1
    this.projectiles.set(id, { id, owner: owner.id, item, def, s: { x, y, z, vx, vy, vz, age: 0 } })
    this.emit({ type: 'projSpawn', id, item, owner: owner.id, x, y, z, vx, vy, vz })
  }

  private stepProjectiles(): void {
    const res = { exploded: false, x: 0, y: 0, z: 0 }
    for (const pr of [...this.projectiles.values()]) {
      const px = pr.s.x
      const py = pr.s.y
      const pz = pr.s.z
      stepProjectile(pr.s, pr.def, this.map.world, this.dt, res)
      if (!res.exploded && pr.def.fuse <= 0) {
        // impacto direto em personagens (foguete)
        for (const q of this.players.values()) {
          if (!q.p.alive || (q.id === pr.owner && pr.s.age < 0.3)) continue
          hitboxAt(q.p.char.x, q.p.char.y, q.p.char.z, q.p.char.flags, this.hb)
          if (segmentHitsHitbox(px, py, pz, pr.s.x, pr.s.y, pr.s.z, this.hb, this.hr)) {
            const len = Math.hypot(pr.s.x - px, pr.s.y - py, pr.s.z - pz)
            const f = this.hr.t / len
            Object.assign(res, { exploded: true, x: px + (pr.s.x - px) * f, y: py + (pr.s.y - py) * f, z: pz + (pr.s.z - pz) * f })
            break
          }
        }
        for (const d of this.dummies) {
          if (res.exploded || d.downUntil >= 0) continue
          hitboxAt(d.x, d.y, d.z, 0, this.hb)
          if (segmentHitsHitbox(px, py, pz, pr.s.x, pr.s.y, pr.s.z, this.hb, this.hr)) Object.assign(res, { exploded: true, x: px, y: py, z: pz })
        }
      }
      if (res.exploded) this.explode(pr, res.x, res.y, res.z)
    }
  }

  private explode(pr: LiveProjectile, x: number, y: number, z: number): void {
    this.projectiles.delete(pr.id)
    const def = pr.def
    this.emit({ type: 'explosion', id: pr.id, item: pr.item, x, y, z, radius: def.splashRadius })
    const owner = this.players.get(pr.owner) ?? null
    const world = this.map.world
    const blocked = (cx: number, cy: number, cz: number, dist: number) => {
      if (dist < 0.3) return false
      const dx = (cx - x) / dist
      const dy = (cy - y) / dist
      const dz = (cz - z) / dist
      return world.raycast(x, y, z, dx, dy, dz, dist, this.hit2) && this.hit2.t < dist - 0.3
    }
    for (const q of [...this.players.values()]) {
      if (!q.p.alive || q.id === pr.owner) continue // sem dano em si mesmo
      const c = hitboxCenter(hitboxAt(q.p.char.x, q.p.char.y, q.p.char.z, q.p.char.flags, this.hb))
      const dist = Math.hypot(c.x - x, c.y - y, c.z - z)
      if (dist >= def.splashRadius || blocked(c.x, c.y, c.z, dist)) continue
      const amount = Math.round(splashDamage(def, dist))
      const res = this.applyDamage(q, amount, owner, pr.item, x, z)
      if (res && owner) this.emit({ type: 'hit', targetKind: TargetKind.Player, target: q.id, damage: amount, head: false, ...res, x: c.x, y: c.y, z: c.z }, { to: owner.id })
    }
    for (const d of this.dummies) {
      if (d.downUntil >= 0) continue
      const c = hitboxCenter(hitboxAt(d.x, d.y, d.z, 0, this.hb))
      const dist = Math.hypot(c.x - x, c.y - y, c.z - z)
      if (dist >= def.splashRadius || blocked(c.x, c.y, c.z, dist)) continue
      const amount = Math.round(splashDamage(def, dist))
      const down = this.damageDummy(d, amount)
      if (owner) this.emit({ type: 'hit', targetKind: TargetKind.Dummy, target: d.id, damage: amount, head: false, shield: false, broke: false, eliminated: down, x: c.x, y: c.y, z: c.z }, { to: owner.id })
    }
  }

  // ---- sincronização inicial ---------------------------------------------

  /** Estado do mundo para um cliente que acabou de entrar. */
  worldSyncEvents(): GameEvent[] {
    const out: GameEvent[] = []
    for (const it of this.items.values()) out.push({ type: 'itemSpawn', id: it.id, item: it.item, rarity: it.rarity, count: it.count, ammo: it.ammo, x: it.x, y: it.y, z: it.z })
    this.chestOpened.forEach((open, chest) => { if (open) out.push({ type: 'chestOpen', chest, by: 0 }) })
    for (const d of this.dummies) if (d.downUntil >= 0) out.push({ type: 'target', id: d.id, health: 0, down: true })
    for (const pr of this.projectiles.values()) out.push({ type: 'projSpawn', id: pr.id, item: pr.item, owner: pr.owner, x: pr.s.x, y: pr.s.y, z: pr.s.z, vx: pr.s.vx, vy: pr.s.vy, vz: pr.s.vz })
    return out
  }
}

function fixedDrop(f: { item: number; rarity: number; count: number }): LootDrop {
  const w = weaponDef(f.item)
  return { item: f.item, rarity: f.rarity, count: f.count, ammo: w ? w.magSize : 0 }
}
