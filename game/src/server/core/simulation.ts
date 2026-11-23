import { EXPLOSION_STRUCTURE_MULT, PICKAXE, PROP_HEALTH } from '../../shared/config/building'
import { ITEM, MATERIAL_MAX, Material, NO_ITEM, damageAt, itemDef, weaponDef, type ProjectileDef } from '../../shared/config/items'
import { BuildingWorld, pieceHealth, type Piece } from '../../shared/building/buildings'
import type { PieceSpec } from '../../shared/building/grid'
import { muzzlePoint } from '../../shared/combat/aim'
import { createHitbox, hitboxAt, hitboxCenter, rayHitbox, segmentHitsHitbox, type HitResult } from '../../shared/combat/hitboxes'
import { splashDamage, stepProjectile, type ProjectileState } from '../../shared/combat/projectile'
import type { GameMap } from '../../shared/maps/types'
import { Rng } from '../../shared/math/rng'
import { clamp } from '../../shared/math/scalar'
import { AIRBORNE_FLAGS, Buttons, CharFlag, createCharacterState } from '../../shared/movement/character'
import { Cause, TargetKind, sanitizeCommand, type GameEvent, type InputCommand, type InventoryAction, type ShotEnd } from '../../shared/net/protocol'
import { chestInteractable, itemInteractable, pickInteractable, type Interactable } from '../../shared/player/interact'
import { pickupItem, swapSlots, takeSlot, type WorldItem } from '../../shared/player/inventory'
import { MAX_HEALTH, createPlayerState, stepPlayer, type BuildDelegate, type PlayerEvent, type PlayerState } from '../../shared/player/player'
import { Surface, createWorldHit } from '../../shared/world/collision-world'
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
  /** Dano em jogadores (desligado no aquecimento). */
  damage: boolean
  /** Pegar itens e abrir baús (desligado no aquecimento). */
  interact: boolean
  /** Jogadores por equipe (1 = solo, 2 = dupla, 3 = trio, 4 = esquadrão). */
  teamSize: number
  /** Dano em colegas de equipe. */
  friendlyFire: boolean
}

export const SANDBOX_RULES: MatchRules = { respawn: true, respawnDelay: 5, seed: 1, damage: true, interact: true, teamSize: 1, friendlyFire: false }

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

interface TraceResult {
  t: number
  /** TargetKind (jogador/boneco) ou -1. */
  kind: number
  target: number
  head: boolean
  /** Colisor do mundo atingido (-1 = nenhum/relevo). */
  collider: number
  x: number
  y: number
  z: number
  /** 0 = nada, 1 = mundo, 2 = personagem/boneco. */
  hit: number
}

export interface SimPlayer {
  id: number
  name: string
  skin: number
  /** Controlado pelo servidor (bot). */
  bot: boolean
  /** Entrou com a partida em andamento: só assiste até a próxima. */
  spectator: boolean
  /** Equipe (no solo, cada um tem a sua). */
  team: number
  /** Equipe escolhida na sala de espera (-1 = tanto faz). */
  wantTeam: number
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
  /** Construções da partida (sobre o mesmo CollisionWorld do mapa). */
  readonly buildings: BuildingWorld
  private nextPieceId = 1
  private readonly damagedPieces = new Set<Piece>()
  private readonly propHealth = new Map<number, number>()
  /** Adereços quebrados (árvores, rochas, caixotes). */
  readonly destroyedProps = new Set<number>()
  private readonly boxByCollider = new Map<number, number>()
  private readonly boxYield = new Map<number, number>()
  /** Jogador cujo comando está sendo aplicado (para o delegado de construção). */
  private builder: SimPlayer | null = null
  private readonly buildDelegate: BuildDelegate

  constructor(map: GameMap, tickRate: number, rules: Partial<MatchRules> = {}) {
    this.map = map
    this.tickRate = tickRate
    this.dt = 1 / tickRate
    this.rules = { ...SANDBOX_RULES, ...rules }
    this.rng = new Rng(map.def.seed ^ (this.rules.seed * 0x9e3779b1))
    this.chestOpened = map.chests.map(() => false)
    this.dummies = map.targets.map((t, id) => ({ id, x: t.x, y: t.y, z: t.z, yaw: t.yaw, health: DUMMY_HEALTH, downUntil: -1, lastHitTick: -1000 }))
    this.buildings = new BuildingWorld(map.world)
    map.boxes.forEach((b, i) => this.boxByCollider.set(b.colliderId, i))
    this.buildDelegate = { buildings: this.buildings, tryBuild: (spec, mat, seq) => this.tryBuild(spec, mat, seq) }
    this.populateLoot()
  }

  emit(ev: GameEvent, route: { to?: number; except?: number } = {}): void {
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

  addPlayer(name: string, skin = 0, opts: { bot?: boolean; spectator?: boolean; team?: number } = {}): SimPlayer {
    const id = this.allocateId()
    const p: SimPlayer = {
      id, name, skin,
      bot: opts.bot ?? false,
      spectator: opts.spectator ?? false,
      team: id,
      wantTeam: opts.team ?? -1,
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
    if (p.spectator) {
      p.p.alive = false
      p.p.health = 0
    }
    this.players.set(id, p)
    return p
  }

  /** Prepara um jogador para a partida: estado zerado (o chamador o posiciona). */
  resetForMatch(sp: SimPlayer): void {
    sp.p = createPlayerState(createCharacterState(sp.p.char.x, sp.p.char.y, sp.p.char.z, sp.p.char.yaw))
    sp.spectator = false
    sp.kills = 0
    sp.lastAttacker = 0
    sp.lastAttackTick = -1000
    sp.respawnTick = -1
    sp.history.clear()
  }

  /** Remove todas as construções (fim do aquecimento). */
  clearBuildings(): void {
    for (const p of [...this.buildings.byId.values()]) {
      this.buildings.remove(p)
      this.emit({ type: 'pieceRemoved', id: p.id, collapse: false })
    }
    this.damagedPieces.clear()
  }

  removePlayer(id: number): void {
    this.players.delete(id)
  }

  /** Aumenta quando as equipes mudam (o anfitrião reenvia os nomes/equipes). */
  rosterVersion = 0
  /** Última equipe a sair e o último eliminado dela (vencem se todos caírem juntos). */
  lastOutTeam = -1
  lastOutPlayer = 0

  /**
   * Monta as equipes do tamanho das regras: primeiro quem escolheu equipe na
   * sala de espera (se couber), depois pessoas e por fim bots, completando as
   * equipes em ordem. No solo, cada jogador é a própria equipe.
   */
  assignTeams(): void {
    const size = Math.max(1, Math.floor(this.rules.teamSize))
    const players = [...this.players.values()].filter((p) => !p.spectator)
    if (size === 1) {
      for (const p of players) p.team = p.id
    } else {
      const count = new Map<number, number>()
      const placed = new Set<SimPlayer>()
      for (const p of players) {
        if (p.wantTeam < 0) continue
        const n = count.get(p.wantTeam) ?? 0
        if (n >= size) continue
        p.team = p.wantTeam
        count.set(p.wantTeam, n + 1)
        placed.add(p)
      }
      const rest = players.filter((p) => !placed.has(p)).sort((a, b) => Number(a.bot) - Number(b.bot) || a.id - b.id)
      let t = 0
      for (const p of rest) {
        while ((count.get(t) ?? 0) >= size) t++
        p.team = t
        count.set(t, (count.get(t) ?? 0) + 1)
      }
    }
    this.rosterVersion++
  }

  /** Equipes com alguém vivo (espectadores não contam). */
  aliveTeams(): Set<number> {
    const out = new Set<number>()
    for (const p of this.players.values()) if (p.p.alive && !p.spectator) out.add(p.team)
    return out
  }

  teammates(sp: SimPlayer): SimPlayer[] {
    const out: SimPlayer[] = []
    for (const p of this.players.values()) if (p !== sp && p.team === sp.team && !p.spectator) out.push(p)
    return out
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
    for (const p of this.damagedPieces) if (this.buildings.byId.get(p.id) === p) this.emit({ type: 'pieceDamaged', id: p.id, damage: p.damage })
    this.damagedPieces.clear()
    this.tick++
    for (const sp of this.players.values()) if (sp.p.alive) sp.history.record(this.tick, sp.p.char)
  }

  private applyCommand(sp: SimPlayer, c: InputCommand): void {
    const prev = sp.p.char.prevButtons
    const evs = this.playerEvents
    evs.length = 0
    this.builder = sp
    stepPlayer(sp.p, c, this.map.world, this.dt, sp.id, evs, this.buildDelegate)
    this.builder = null
    for (const e of evs) {
      if (e.type === 'shot') this.resolveShot(sp, e.item, e.rarity, e.rays, c.viewTick)
      else if (e.type === 'swing') this.resolveSwing(sp, e, c.viewTick)
      else if (e.type === 'throw') {
        const def = itemDef(e.item)
        if (def?.kind === 'consumable' && def.throwable) this.spawnProjectile(sp, e.item, def.throwable, e.x, e.y, e.z, e.vx, e.vy, e.vz)
      } else if (e.type === 'fall' && !this.rules.damage) {
        sp.p.health = MAX_HEALTH
      } else if (e.type === 'fall' && sp.p.health <= 0) {
        this.eliminate(sp, this.recentAttacker(sp), Cause.Fall)
      }
      if (!sp.p.alive) return
    }
    if (sp.p.char.y < this.map.def.waterLevel - 40) {
      this.eliminate(sp, this.recentAttacker(sp), Cause.Void)
      return
    }
    if ((c.buttons & ~prev) & Buttons.Use && this.rules.interact && !(sp.p.char.flags & AIRBORNE_FLAGS)) this.interact(sp)
  }

  private recentAttacker(sp: SimPlayer): number {
    return this.tick - sp.lastAttackTick < this.tickRate * 10 ? sp.lastAttacker : 0
  }

  // ---- tiros --------------------------------------------------------------

  /**
   * Traça um raio de tiro/golpe: mundo (relevo, mapa, construções), jogadores
   * voltados no tempo (`rewind`) e bonecos; depois exige caminho livre entre a
   * arma (peito) e o impacto.
   */
  private traceRay(sp: SimPlayer, r: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }, range: number, rewind: number, muzzle: { x: number; y: number; z: number }): TraceResult {
    const world = this.map.world
    const out: TraceResult = { t: range, kind: -1, target: 0, head: false, collider: -1, x: 0, y: 0, z: 0, hit: 0 }
    if (world.raycast(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, range, this.hit)) {
      out.t = this.hit.t
      out.collider = this.hit.colliderId
      out.hit = 1
    }
    for (const q of this.players.values()) {
      if (q === sp || !q.p.alive) continue
      if (!q.history.sample(rewind, this.pose)) Object.assign(this.pose, { x: q.p.char.x, y: q.p.char.y, z: q.p.char.z, flags: q.p.char.flags })
      hitboxAt(this.pose.x, this.pose.y, this.pose.z, this.pose.flags, this.hb)
      if (rayHitbox(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, out.t, this.hb, this.hr) && this.hr.t < out.t) {
        Object.assign(out, { t: this.hr.t, kind: TargetKind.Player, target: q.id, head: this.hr.head, collider: -1, hit: 2 })
      }
    }
    for (const d of this.dummies) {
      if (d.downUntil >= 0) continue
      hitboxAt(d.x, d.y, d.z, 0, this.hb)
      if (rayHitbox(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, out.t, this.hb, this.hr) && this.hr.t < out.t) {
        Object.assign(out, { t: this.hr.t, kind: TargetKind.Dummy, target: d.id, head: this.hr.head, collider: -1, hit: 2 })
      }
    }
    out.x = r.ox + r.dx * out.t
    out.y = r.oy + r.dy * out.t
    out.z = r.oz + r.dz * out.t
    // Nada de atirar "pela câmera": o caminho da arma até o impacto também precisa estar livre.
    const mx = out.x - muzzle.x
    const my = out.y - muzzle.y
    const mz = out.z - muzzle.z
    const md = Math.sqrt(mx * mx + my * my + mz * mz)
    if (md > 0.6 && world.raycast(muzzle.x, muzzle.y, muzzle.z, mx / md, my / md, mz / md, md - 0.05, this.hit2)) {
      Object.assign(out, { x: this.hit2.x, y: this.hit2.y, z: this.hit2.z, kind: -1, collider: this.hit2.colliderId, hit: 1, head: false })
    }
    return out
  }

  private resolveShot(sp: SimPlayer, item: number, rarity: number, rays: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }[], viewTick: number): void {
    const w = weaponDef(item)
    if (!w || rays.length === 0) return
    if (w.projectile) {
      const r = rays[0]
      const v = w.projectile.speed
      this.spawnProjectile(sp, item, w.projectile, r.ox + r.dx * 0.8, r.oy + r.dy * 0.8, r.oz + r.dz * 0.8, r.dx * v, r.dy * v, r.dz * v)
      return
    }
    // Compensação de latência: o servidor volta os alvos ao tick que o atirador via.
    const rewind = clamp(viewTick, this.tick - this.tickRate, this.tick)
    const muzzle = muzzlePoint(sp.p.char)
    const ends: ShotEnd[] = []
    const acc = new Map<string, { kind: number; id: number; dmg: number; head: boolean; x: number; y: number; z: number }>()
    for (const r of rays) {
      const res = this.traceRay(sp, r, w.range, rewind, muzzle)
      ends.push({ x: res.x, y: res.y, z: res.z, hit: res.hit })
      let kind = res.kind
      let target = res.target
      let dmg = damageAt(w, rarity, res.t) * (res.head ? w.headshot : 1)
      if (kind < 0 && res.collider >= 0) {
        const piece = this.buildings.pieceOfCollider(res.collider)
        if (!piece) continue
        kind = TargetKind.Structure
        target = piece.id
        dmg = damageAt(w, rarity, res.t)
      } else if (kind < 0) continue
      const key = `${kind}:${target}`
      const a = acc.get(key)
      if (a) {
        a.dmg += dmg
        a.head ||= res.head
      } else acc.set(key, { kind, id: target, dmg, head: res.head, x: res.x, y: res.y, z: res.z })
    }
    const r0 = rays[0]
    this.emit({ type: 'shot', shooter: sp.id, item, ox: r0.ox, oy: r0.oy, oz: r0.oz, ends }, { except: sp.id })
    for (const a of acc.values()) this.applyHit(sp, a.kind, a.id, Math.max(1, Math.round(a.dmg)), a.head, item, muzzle, a.x, a.y, a.z)
  }

  /** Aplica um acerto confirmado e avisa o autor. */
  private applyHit(sp: SimPlayer, kind: number, id: number, amount: number, head: boolean, cause: number, from: { x: number; z: number }, x: number, y: number, z: number): void {
    if (kind === TargetKind.Player) {
      const q = this.players.get(id)
      if (!q) return
      const res = this.applyDamage(q, amount, sp, cause, from.x, from.z)
      if (res) this.emit({ type: 'hit', targetKind: kind, target: id, damage: amount, head, ...res, x, y, z }, { to: sp.id })
    } else if (kind === TargetKind.Dummy) {
      const down = this.damageDummy(this.dummies[id], amount)
      this.emit({ type: 'hit', targetKind: kind, target: id, damage: amount, head, shield: false, broke: false, eliminated: down, x, y, z }, { to: sp.id })
    } else {
      const piece = this.buildings.byId.get(id)
      if (!piece) return
      const destroyed = this.damagePiece(piece, amount)
      this.emit({ type: 'hit', targetKind: kind, target: id, damage: amount, head: false, shield: false, broke: false, eliminated: destroyed, x, y, z }, { to: sp.id })
    }
  }

  /** Golpe de picareta: dano curto em jogadores e construções, coleta de material no resto. */
  private resolveSwing(sp: SimPlayer, e: { ox: number; oy: number; oz: number; dx: number; dy: number; dz: number }, viewTick: number): void {
    const rewind = clamp(viewTick, this.tick - this.tickRate, this.tick)
    const muzzle = muzzlePoint(sp.p.char)
    const res = this.traceRay(sp, e, PICKAXE.reach, rewind, muzzle)
    // Os outros veem o golpe (animação e lascas) pelo mesmo evento de disparo
    this.emit({ type: 'shot', shooter: sp.id, item: ITEM.Pickaxe, ox: e.ox, oy: e.oy, oz: e.oz, ends: [{ x: res.x, y: res.y, z: res.z, hit: res.hit }] }, { except: sp.id })
    if (res.kind === TargetKind.Player || res.kind === TargetKind.Dummy) {
      this.applyHit(sp, res.kind, res.target, PICKAXE.damagePlayer, false, ITEM.Pickaxe, muzzle, res.x, res.y, res.z)
      return
    }
    if (res.collider < 0) return
    const piece = this.buildings.pieceOfCollider(res.collider)
    if (piece) {
      this.applyHit(sp, TargetKind.Structure, piece.id, PICKAXE.damageStructure, false, ITEM.Pickaxe, muzzle, res.x, res.y, res.z)
      return
    }
    this.harvest(sp, res.collider, res.x, res.y, res.z)
  }

  // ---- construção ---------------------------------------------------------

  /** Coloca a peça para o jogador que está executando o comando (validação oficial). */
  private tryBuild(spec: PieceSpec, material: number, seq: number): boolean {
    const sp = this.builder
    if (!sp || this.buildings.canPlace(spec) !== null) return false
    let id = this.nextPieceId
    while (this.buildings.byId.has(id)) id = id >= 0xfffe ? 1 : id + 1
    this.nextPieceId = id >= 0xfffe ? 1 : id + 1
    this.buildings.add(spec, id, material, { builtAt: this.tick, builder: sp.id, seq })
    this.emit({ type: 'piecePlaced', id, ...spec, material, builder: sp.id, seq, age: 0, damage: 0 })
    return true
  }

  /** Dano em uma peça; devolve true se ela foi destruída. */
  damagePiece(p: Piece, amount: number): boolean {
    if (this.buildings.byId.get(p.id) !== p) return false
    p.damage += amount
    if (pieceHealth(p, this.tick, this.tickRate) <= 0) {
      this.destroyPiece(p)
      return true
    }
    this.damagedPieces.add(p)
    return false
  }

  /** Remove a peça e derruba o que ficou sem ligação com o chão. */
  private destroyPiece(p: Piece): void {
    const near = this.buildings.neighbors(p)
    this.buildings.remove(p)
    this.damagedPieces.delete(p)
    this.emit({ type: 'pieceRemoved', id: p.id, collapse: false })
    for (const f of this.buildings.unsupported(near)) {
      this.buildings.remove(f)
      this.damagedPieces.delete(f)
      this.emit({ type: 'pieceRemoved', id: f.id, collapse: true })
    }
  }

  private harvest(sp: SimPlayer, collider: number, x: number, y: number, z: number): void {
    let material: number
    let amount: number
    const propIndex = this.map.propColliders.get(collider)
    if (propIndex !== undefined) {
      const prop = this.map.props[propIndex]
      material = prop.kind === 'rock' ? Material.Stone : Material.Wood
      amount = PICKAXE.harvest[material]
      const hp = (this.propHealth.get(propIndex) ?? PROP_HEALTH[prop.kind] ?? 100) - PICKAXE.damageStructure
      if (hp <= 0) this.destroyProp(propIndex, collider)
      else this.propHealth.set(propIndex, hp)
    } else {
      const box = this.boxByCollider.get(collider)
      if (box === undefined) return
      const surface = this.map.world.get(collider)?.surface
      material = surface === Surface.Wood ? Material.Wood : surface === Surface.Metal ? Material.Metal : Material.Stone
      const left = this.boxYield.get(box) ?? PICKAXE.staticYield
      amount = Math.min(left, PICKAXE.harvest[material])
      this.boxYield.set(box, left - amount)
    }
    const got = Math.min(amount, MATERIAL_MAX - sp.p.materials[material])
    if (got <= 0) return
    sp.p.materials[material] += got
    this.emit({ type: 'harvest', material, amount: got, x, y, z }, { to: sp.id })
  }

  private destroyProp(index: number, collider: number): void {
    this.map.world.remove(collider)
    this.map.propColliders.delete(collider)
    this.propHealth.delete(index)
    this.destroyedProps.add(index)
    this.emit({ type: 'propDestroyed', prop: index })
  }

  /** Aplica dano (escudo primeiro). Devolve os detalhes ou null se o alvo já estava fora. */
  applyDamage(victim: SimPlayer, amount: number, attacker: SimPlayer | null, cause: number, fromX: number, fromZ: number, ignoreShield = false): { shield: boolean; broke: boolean; eliminated: boolean } | null {
    const p = victim.p
    // a bordo do dirigível ninguém leva dano
    if (!p.alive || amount <= 0 || !this.rules.damage || p.char.flags & CharFlag.Riding) return null
    // colegas de equipe só se ferem com fogo amigo ligado
    if (attacker && attacker !== victim && attacker.team === victim.team && !this.rules.friendlyFire) return null
    const shieldBefore = p.shield
    const toShield = ignoreShield ? 0 : Math.min(p.shield, amount)
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
    // Colocação (battle royale): a equipe sai quando o último dela cai;
    // a colocação é o número de equipes ainda vivas + 1
    const alive = this.aliveTeams()
    const wiped = !this.rules.respawn && !alive.has(victim.team)
    const place = wiped ? alive.size + 1 : 0
    this.emit({ type: 'eliminated', victim: victim.id, killer: killer && killer !== victim ? killer.id : 0, cause, respawnIn: this.rules.respawn ? this.rules.respawnDelay : 0, place })
    if (wiped) {
      this.lastOutTeam = victim.team
      this.lastOutPlayer = victim.id
      this.emit({ type: 'teamOut', team: victim.team, place })
    }
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
    // Construções no raio (dano multiplicado: explosivos derrubam paredes)
    const near = new Set<Piece>()
    const r = def.splashRadius
    for (const c of world.queryAabb(x - r, y - r, z - r, x + r, y + r, z + r, [])) {
      const p = this.buildings.pieceOfCollider(c.id)
      if (p) near.add(p)
    }
    for (const p of near) {
      const dx = Math.max(p.minX - x, 0, x - p.maxX)
      const dy = Math.max(p.minY - y, 0, y - p.maxY)
      const dz = Math.max(p.minZ - z, 0, z - p.maxZ)
      const dist = Math.hypot(dx, dy, dz)
      if (dist < r) this.damagePiece(p, Math.round(splashDamage(def, dist) * EXPLOSION_STRUCTURE_MULT))
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
    for (const p of this.buildings.byId.values()) {
      out.push({ type: 'piecePlaced', id: p.id, ...p.spec, material: p.material, builder: p.builder, seq: 0, age: this.tick - p.builtAt, damage: p.damage })
    }
    for (const prop of this.destroyedProps) out.push({ type: 'propDestroyed', prop })
    return out
  }
}

function fixedDrop(f: { item: number; rarity: number; count: number }): LootDrop {
  const w = weaponDef(f.item)
  return { item: f.item, rarity: f.rarity, count: f.count, ammo: w ? w.magSize : 0 }
}
