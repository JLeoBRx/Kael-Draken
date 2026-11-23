import { BUILD, BuildKind, encodeBuild } from '../../../shared/config/building'
import { MATERIAL_MAX, NO_ITEM, RARITIES, itemDef, weaponDef, type WeaponDef } from '../../../shared/config/items'
import { aimFrame, createAimFrame } from '../../../shared/combat/aim'
import { MatchPhase, distanceOutside } from '../../../shared/match/zone'
import type { Rng } from '../../../shared/math/rng'
import { AIRBORNE_FLAGS, Buttons, CharFlag, copyCharacterState, createCharacterState } from '../../../shared/movement/character'
import type { InputCommand } from '../../../shared/net/protocol'
import { PICKAXE_SLOT, SLOT_COUNT, ammoCap } from '../../../shared/player/player'
import { createWorldHit } from '../../../shared/world/collision-world'
import type { BattleRoyale } from '../battle-royale'
import type { SimPlayer, Simulation } from '../simulation'
import type { NavGrid, NavPoint } from './nav-grid'
import type { BotProfile } from './profiles'

/**
 * Cérebro de um bot. A cada tick produz um InputCommand — exatamente o que um
 * jogador enviaria — e o servidor o aplica pelas mesmas regras de todos.
 *
 * Camadas:
 *  1. Percepção (a cada 5 ticks): quem está à vista (distância, campo de
 *     visão, linha de visão), quem atirou nele.
 *  2. Decisão (a cada 10 ticks): prioridade entre zona, combate, fuga,
 *     cura, saque, coleta e exploração.
 *  3. Execução (todo tick): caminho (A* na grade de navegação), desvio de
 *     travamentos, mira com tempo de reação e erro, tiro, construção.
 */

export interface BotContext {
  sim: Simulation
  nav: NavGrid
  br: BattleRoyale | null
  /** Pede orçamento para uma busca de caminho neste tick. */
  pathBudget(): boolean
}

type Goal = 'idle' | 'explore' | 'loot' | 'fight' | 'flee' | 'heal' | 'zone' | 'harvest' | 'breakout'

interface LootTarget {
  kind: 'item' | 'chest' | 'prop'
  id: number
  x: number
  y: number
  z: number
  since: number
}

const THINK_EVERY = 10
const PERCEIVE_EVERY = 5
const SEE_ALWAYS = 9
const hit = createWorldHit()
const frame = createAimFrame()
const scratch = createCharacterState(0, 0, 0)

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

/** Quão bom é cada tipo de arma a uma distância (0–1). */
function suitability(w: WeaponDef, dist: number): number {
  switch (w.category) {
    case 'shotgun': return dist < 9 ? 1 : dist < 16 ? 0.45 : 0.1
    case 'smg': return dist < 18 ? 0.85 : dist < 30 ? 0.5 : 0.2
    case 'rifle': return dist < 6 ? 0.55 : dist < 70 ? 0.9 : 0.6
    case 'sniper': return dist < 15 ? 0.2 : dist < 40 ? 0.6 : 1
    case 'pistol': return dist < 25 ? 0.5 : 0.25
    case 'launcher': return dist > 8 && dist < 60 ? 0.55 : 0.05
    default: return 0
  }
}

/** Faixa de distância preferida no combate por tipo de arma. */
function preferredRange(w: WeaponDef | null): [number, number] {
  if (!w) return [1.3, 2.3] // picareta: nem colado (o golpe sai do ombro), nem longe
  switch (w.category) {
    case 'shotgun': return [3, 8]
    case 'smg': return [5, 16]
    case 'rifle': return [12, 40]
    case 'sniper': return [35, 120]
    case 'launcher': return [15, 45]
    default: return [6, 20]
  }
}

export class Bot {
  goal: Goal = 'idle'
  private seq = 0
  private yaw: number
  private pitch = 0
  private readonly offset: number
  // movimento
  private path: NavPoint[] | null = null
  private pathIndex = 0
  private pathTarget: NavPoint | null = null
  private pathTick = -1000
  private moveTarget: NavPoint | null = null
  private stuckX = 0
  private stuckZ = 0
  private stuckTick = 0
  /** Menor distância ao destino (para medir progresso). */
  private bestDist = Infinity
  private lastBest = Infinity
  private stuckCount = 0
  private wantsMove = false
  private exploreTarget: NavPoint | null = null
  private exploreUntil = 0
  // inimigo
  private enemy: SimPlayer | null = null
  private enemySeenTick = -1000
  private enemyVisible = false
  private enemyX = 0
  private enemyY = 0
  private enemyZ = 0
  private reactionUntil = 0
  private trackStart = 0
  private aimOffYaw = 0
  private aimOffPitch = 0
  private aimOffUntil = 0
  private aimHead = false
  private strafeDir = 1
  private strafeUntil = 0
  private fireToggle = false
  private buildTicks = 0
  private lastBuildTick = -1000
  private lastDamageSeen = -1000
  // saque e coleta
  private loot: LootTarget | null = null
  /** Árvore/rocha/caixote sendo coletado. */
  private prop: LootTarget | null = null
  private readonly blacklist = new Map<string, number>()
  private healStarted = -1
  private fleeUntil = 0
  private breakoutUntil = 0
  // dirigível
  private landing: NavPoint | null = null
  private jumpAlong = Infinity
  private lastHealth = 100

  constructor(readonly sp: SimPlayer, private readonly ctx: BotContext, readonly profile: BotProfile, private readonly rng: Rng) {
    this.yaw = sp.p.char.yaw
    this.offset = rng.int(0, THINK_EVERY)
  }

  /** Comando deste tick (null se o bot está fora do jogo). */
  command(): InputCommand | null {
    const sp = this.sp
    const p = sp.p
    if (!p.alive || sp.spectator) {
      this.reset()
      return null
    }
    const sim = this.ctx.sim
    const tick = sim.tick
    const c = p.char
    const cmd: InputCommand = { seq: ++this.seq, forward: 0, right: 0, yaw: this.yaw, pitch: this.pitch, buttons: 0, slot: p.selected, viewTick: tick, build: 0 }
    if (c.flags & CharFlag.Riding) return this.airship(cmd)
    if (c.flags & (CharFlag.Skydiving | CharFlag.Gliding)) return this.skydive(cmd)
    this.landing = null

    const phase = this.ctx.br?.phase ?? MatchPhase.Training
    if (p.health < this.lastHealth) this.lastDamageSeen = tick
    this.lastHealth = p.health
    if ((tick + this.offset) % PERCEIVE_EVERY === 0) this.perceive(phase)
    if ((tick + this.offset) % THINK_EVERY === 0) this.decide(phase)

    this.wantsMove = false
    this.moveTarget = null
    let lookX = NaN
    let lookY = NaN
    let lookZ = NaN
    switch (this.goal) {
      case 'fight': {
        const r = this.fight(cmd)
        if (r) [lookX, lookY, lookZ] = r
        break
      }
      case 'heal':
        this.heal(cmd)
        break
      case 'loot': {
        const r = this.doLoot(cmd)
        if (r) [lookX, lookY, lookZ] = r
        break
      }
      case 'harvest': {
        const r = this.harvest(cmd)
        if (r) [lookX, lookY, lookZ] = r
        break
      }
      case 'breakout': {
        const r = this.breakout(cmd)
        if (r) [lookX, lookY, lookZ] = r
        break
      }
      case 'flee':
      case 'zone':
      case 'explore':
        this.travel()
        break
      case 'idle':
        break
    }

    // Andar: segue o caminho até moveTarget
    let mx = 0
    let mz = 0
    const target = this.moveTarget as NavPoint | null
    if (target) {
      this.bestDist = Math.min(this.bestDist, Math.hypot(target.x - c.x, target.z - c.z))
      const dir = this.steer(target)
      if (dir) {
        mx = dir[0]
        mz = dir[1]
        this.wantsMove = true
      }
    }
    // Olhar: alvo explícito ou a direção do movimento
    let wantYaw = this.yaw
    let wantPitch = 0
    if (!Number.isNaN(lookX)) {
      const a = this.solveAim(lookX, lookY, lookZ)
      wantYaw = a.yaw
      wantPitch = a.pitch
      if (this.goal === 'fight') {
        wantYaw += this.aimOffYaw
        wantPitch += this.aimOffPitch
      }
    } else if (mx !== 0 || mz !== 0) {
      wantYaw = Math.atan2(-mx, -mz)
    }
    this.turn(wantYaw, wantPitch, sim.dt)
    cmd.yaw = this.yaw
    cmd.pitch = this.pitch
    if (mx !== 0 || mz !== 0) {
      const sy = Math.sin(this.yaw)
      const cy = Math.cos(this.yaw)
      cmd.forward += -mx * sy - mz * cy
      cmd.right += mx * cy - mz * sy
      const calm = this.goal !== 'fight' && this.goal !== 'heal'
      if (calm && cmd.forward > 0.7) cmd.buttons |= Buttons.Sprint
    }
    this.checkStuck(cmd, tick)
    return cmd
  }

  private reset(): void {
    this.enemy = null
    this.loot = null
    this.prop = null
    this.path = null
    this.goal = 'idle'
    this.healStarted = -1
    this.buildTicks = 0
    this.lastHealth = 100
  }

  // ---- dirigível e queda livre ------------------------------------------

  private airship(cmd: InputCommand): InputCommand {
    const br = this.ctx.br
    const c = this.sp.p.char
    const route = br?.route
    if (!route) return cmd
    const dx = route.x1 - route.x0
    const dz = route.z1 - route.z0
    const len = Math.hypot(dx, dz) || 1
    const ux = dx / len
    const uz = dz / len
    if (!this.landing) {
      this.landing = this.pickLanding(route.x0, route.z0, ux, uz, len)
      const along = (this.landing.x - route.x0) * ux + (this.landing.z - route.z0) * uz
      const side = Math.abs((this.landing.x - route.x0) * -uz + (this.landing.z - route.z0) * ux)
      // salta antes do ponto mais próximo, tanto mais quanto mais longe da rota
      this.jumpAlong = along - 30 - side * 0.35 + this.rng.range(-25, 25)
    }
    const along = (c.x - route.x0) * ux + (c.z - route.z0) * uz
    if (along >= this.jumpAlong) cmd.buttons |= Buttons.Jump
    return cmd
  }

  /** Um ponto com loot perto da rota, dentro da primeira zona. */
  private pickLanding(x0: number, z0: number, ux: number, uz: number, len: number): NavPoint {
    const map = this.ctx.sim.map
    const spots = map.lootSpots
    for (let k = 0; k < 30 && spots.length > 0; k++) {
      const s = spots[this.rng.int(0, spots.length)]
      const along = (s.x - x0) * ux + (s.z - z0) * uz
      const side = Math.abs((s.x - x0) * -uz + (s.z - z0) * ux)
      if (along < 60 || along > len - 40 || side > 380) continue
      if (!this.ctx.nav.walkableAt(s.x, s.z)) continue
      return { x: s.x + this.rng.range(-6, 6), z: s.z + this.rng.range(-6, 6) }
    }
    const t = this.rng.range(0.2, 0.8) * len
    return { x: x0 + ux * t, z: z0 + uz * t }
  }

  private skydive(cmd: InputCommand): InputCommand {
    const c = this.sp.p.char
    const target = this.landing ?? { x: c.x, z: c.z }
    const dx = target.x - c.x
    const dz = target.z - c.z
    const d = Math.hypot(dx, dz)
    this.yaw = Math.atan2(-dx, -dz)
    // mergulha enquanto está longe; perto, só desce
    this.pitch = d > 90 && c.flags & CharFlag.Skydiving ? -1.2 : 0
    cmd.yaw = this.yaw
    cmd.pitch = this.pitch
    cmd.forward = d > 4 ? Math.min(1, d / 20) : 0
    return cmd
  }

  // ---- percepção ----------------------------------------------------------

  private canSee(q: SimPlayer, dist: number): boolean {
    const a = this.sp.p.char
    const b = q.p.char
    const ox = a.x
    const oy = a.y + 1.5
    const oz = a.z
    const tx = b.x - ox
    const ty = b.y + 1.1 - oy
    const tz = b.z - oz
    const len = Math.hypot(tx, ty, tz)
    if (len < 0.01) return true
    if (dist > SEE_ALWAYS) {
      // campo de visão (pela direção do olhar)
      const fx = -Math.sin(this.yaw)
      const fz = -Math.cos(this.yaw)
      const h = Math.hypot(tx, tz) || 1
      if ((tx * fx + tz * fz) / h < this.profile.fovCos) return false
    }
    return !this.ctx.sim.map.world.raycast(ox, oy, oz, tx / len, ty / len, tz / len, len - 0.4, hit)
  }

  private perceive(phase: number): void {
    const sim = this.ctx.sim
    const me = this.sp
    const c = me.p.char
    if (phase === MatchPhase.Warmup || phase === MatchPhase.Ended) {
      this.enemy = null
      return
    }
    let best: SimPlayer | null = null
    let bestD = Infinity
    const attacker = sim.tick - me.lastAttackTick < sim.tickRate * 2 ? sim.players.get(me.lastAttacker) ?? null : null
    for (const q of sim.players.values()) {
      if (q === me || !q.p.alive || q.spectator || q.team === me.team || q.p.char.flags & CharFlag.Riding) continue
      const dx = q.p.char.x - c.x
      const dz = q.p.char.z - c.z
      const d = Math.hypot(dx, dz, q.p.char.y - c.y)
      const range = q === attacker ? this.profile.viewDistance * 1.6 : this.profile.viewDistance
      if (d > range || d >= bestD) continue
      // quem atirou nele é notado mesmo fora do campo de visão (vira para ele)
      if (q === attacker) {
        if (!this.canSee(q, SEE_ALWAYS)) {
          if (!this.enemy) {
            this.enemy = q
            this.enemySeenTick = sim.tick - sim.tickRate
            this.enemyX = q.p.char.x
            this.enemyY = q.p.char.y
            this.enemyZ = q.p.char.z
          }
          continue
        }
      } else if (!this.canSee(q, d)) continue
      best = q
      bestD = d
    }
    if (best) {
      if (best !== this.enemy || !this.enemyVisible) {
        // tempo de reação ao (re)ver alguém
        this.reactionUntil = sim.tick + Math.round(this.profile.reaction * this.rng.range(0.75, 1.35) * sim.tickRate)
        this.trackStart = sim.tick
        this.aimHead = this.rng.chance(this.profile.headChance)
      }
      this.enemy = best
      this.enemyVisible = true
      this.enemySeenTick = sim.tick
      this.enemyX = best.p.char.x
      this.enemyY = best.p.char.y
      this.enemyZ = best.p.char.z
    } else {
      this.enemyVisible = false
      if (this.enemy && (!this.enemy.p.alive || sim.tick - this.enemySeenTick > sim.tickRate * 6)) this.enemy = null
    }
  }

  // ---- decisão ------------------------------------------------------------

  private weaponSlots(): number[] {
    const p = this.sp.p
    const out: number[] = []
    for (let k = 0; k < SLOT_COUNT; k++) {
      const w = weaponDef(p.slots[k].item)
      if (w && (p.slots[k].ammo > 0 || p.ammo[w.ammoType] > 0)) out.push(k)
    }
    return out
  }

  private healSlot(): number {
    const p = this.sp.p
    let best = -1
    let bestScore = 0
    for (let k = 0; k < SLOT_COUNT; k++) {
      const d = itemDef(p.slots[k].item)
      if (d?.kind !== 'consumable' || d.throwable) continue
      let score = 0
      if (d.heal > 0 && p.health < d.healCap && p.health < this.profile.healBelow + 15) score = d.heal * (p.health < 50 ? 2 : 1)
      if (d.shield > 0 && p.shield < d.shieldCap && p.shield < 60) score = Math.max(score, d.shield * 0.8)
      if (score > bestScore) {
        bestScore = score
        best = k
      }
    }
    return best
  }

  private decide(phase: number): void {
    const sim = this.ctx.sim
    const tick = sim.tick
    const p = this.sp.p
    const c = p.char
    if (phase === MatchPhase.Warmup || phase === MatchPhase.Ended) {
      this.goal = 'explore'
      return
    }
    if (this.goal === 'breakout' && tick < this.breakoutUntil) return
    if (this.goal === 'heal' && this.healStarted >= 0 && p.useTimer > 0) return
    if (this.buildTicks > 0) return
    const br = this.ctx.br
    const zone = br?.zone()
    const outside = zone ? distanceOutside(zone, c.x, c.z) > -3 : false
    const st = br?.stage
    const nextOutside = st ? Math.hypot(c.x - st.toX, c.z - st.toZ) > st.toR * 0.85 : false
    const shrinkingSoon = st ? tick > st.shrinkStart - 25 * sim.tickRate : false
    const armed = this.weaponSlots().length > 0
    const enemyFresh = this.enemy && tick - this.enemySeenTick < sim.tickRate * 3
    const enemyDist = this.enemy ? Math.hypot(this.enemyX - c.x, this.enemyZ - c.z) : Infinity
    const hp = p.health + p.shield
    const heal = this.healSlot()

    const e = this.enemy
    const enemyArmed = !!e && e.p.selected < SLOT_COUNT && !!weaponDef(e.p.slots[e.p.selected].item)

    if (outside && !(enemyFresh && enemyDist < 15 && armed)) this.goal = 'zone'
    else if (tick < this.fleeUntil) this.goal = 'flee'
    else if (enemyFresh && armed) {
      // curar atrás de cobertura quando o inimigo sumiu de vista e está longe
      this.goal = hp < 30 && heal >= 0 && enemyDist > 25 && !this.enemyVisible ? 'heal' : 'fight'
    } else if (enemyFresh && enemyDist < 12 && this.meleeWorthIt(enemyArmed, enemyDist)) {
      this.goal = 'fight' // na picareta: foi atacado, é o fim da partida, ou não há o que pegar por perto
    }
    else if (enemyFresh && enemyArmed && enemyDist < 35 && this.enemyVisible) {
      this.goal = 'flee'
      this.fleeUntil = tick + sim.tickRate * 3
    } else if (heal >= 0 && (p.health < this.profile.healBelow || p.shield < 50) && tick - this.lastDamageSeen > sim.tickRate * 2) this.goal = 'heal'
    else if (nextOutside && shrinkingSoon) this.goal = 'zone'
    else if (this.findLoot()) this.goal = 'loot'
    else if (this.wantsMaterials() && this.findProp()) this.goal = 'harvest'
    else this.goal = 'explore'
    if (this.goal !== 'heal') this.healStarted = -1
  }

  // ---- combate ------------------------------------------------------------

  /** Vale a pena brigar na picareta? */
  private meleeWorthIt(enemyArmed: boolean, dist: number): boolean {
    const sim = this.ctx.sim
    const e = this.enemy
    if (e && this.sp.lastAttacker === e.id && sim.tick - this.sp.lastAttackTick < sim.tickRate * 2) return true
    const st = this.ctx.br?.stage
    if (st && st.index >= 5) return true
    if (enemyArmed || dist > 3.5) return false
    // os dois desarmados e colados: só se não houver loot por perto
    const c = this.sp.p.char
    return !(this.findLoot() && this.loot && Math.hypot(this.loot.x - c.x, this.loot.z - c.z) < 40)
  }

  private bestWeapon(dist: number): number {
    const p = this.sp.p
    let best = -1
    let bestScore = 0
    for (const k of this.weaponSlots()) {
      const w = weaponDef(p.slots[k].item)!
      const rar = RARITIES[p.slots[k].rarity]?.damage ?? 1
      const loaded = p.slots[k].ammo > 0 ? 1 : 0.6
      const score = suitability(w, dist) * rar * loaded
      if (score > bestScore) {
        bestScore = score
        best = k
      }
    }
    return best
  }

  private bestMaterial(): number {
    const m = this.sp.p.materials
    let best = -1
    for (let k = 0; k < 3; k++) if (m[k] >= BUILD.cost && (best < 0 || m[k] > m[best])) best = k
    return best
  }

  private fight(cmd: InputCommand): [number, number, number] | null {
    const sim = this.ctx.sim
    const tick = sim.tick
    const e = this.enemy
    const p = this.sp.p
    const c = p.char
    if (!e || !e.p.alive) {
      this.goal = 'explore'
      return null
    }
    const ec = e.p.char
    if (this.enemyVisible) {
      this.enemyX = ec.x
      this.enemyY = ec.y
      this.enemyZ = ec.z
    }
    const dist = Math.hypot(this.enemyX - c.x, this.enemyY - c.y, this.enemyZ - c.z)
    // Parede quando toma tiro (constrói virado para o inimigo)
    if (this.buildTicks > 0) {
      this.buildTicks--
      const mat = this.bestMaterial()
      if (mat >= 0) {
        cmd.build = encodeBuild(BuildKind.Wall, 0, mat)
        if (this.buildTicks % 2 === 0) cmd.buttons |= Buttons.Fire
      }
      return [this.enemyX, this.enemyY + 1.1, this.enemyZ]
    }
    if (this.profile.buildChance > 0 && tick - this.lastDamageSeen < 8 && tick - this.lastBuildTick > sim.tickRate * 3 && dist > 7 && this.bestMaterial() >= 0) {
      this.lastBuildTick = tick
      if (this.rng.chance(this.profile.buildChance)) {
        this.buildTicks = 4
        return [this.enemyX, this.enemyY + 1.1, this.enemyZ]
      }
    }

    const slot = this.bestWeapon(dist)
    const w = slot >= 0 ? weaponDef(p.slots[slot].item)! : null
    cmd.slot = slot >= 0 ? slot : PICKAXE_SLOT

    // Distância: aproxima, recua ou circula
    const [near, far] = preferredRange(w)
    const ex = this.enemyX - c.x
    const ez = this.enemyZ - c.z
    const h = Math.hypot(ex, ez) || 1
    if (tick >= this.strafeUntil) {
      this.strafeDir = this.rng.chance(0.5) ? 1 : -1
      this.strafeUntil = tick + Math.round(this.rng.range(0.6, 1.4) * sim.tickRate)
    }
    if (dist > far || !this.enemyVisible) {
      this.moveTarget = { x: this.enemyX, z: this.enemyZ }
    } else {
      // perpendicular ao inimigo + ajuste de distância
      const side = this.strafeDir
      let mx = (-ez / h) * side
      let mz = (ex / h) * side
      if (dist < near) {
        mx -= (ex / h) * 0.8
        mz -= (ez / h) * 0.8
      } else if (dist > (near + far) / 2) {
        mx += (ex / h) * 0.5
        mz += (ez / h) * 0.5
      }
      this.moveTarget = { x: c.x + mx * 4, z: c.z + mz * 4 }
      if (this.profile.jumpRate > 0 && this.rng.chance(this.profile.jumpRate / sim.tickRate)) cmd.buttons |= Buttons.Jump
    }

    // Mira: erro que diminui enquanto acompanha o alvo; maior se ele corre
    if (tick >= this.aimOffUntil) {
      const settle = 1 + 1.5 * Math.exp(-(tick - this.trackStart) / sim.tickRate)
      const speed = Math.hypot(ec.vx, ec.vz)
      const err = this.profile.aimError * settle * (1 + speed / 7)
      this.aimOffYaw = this.rng.range(-err, err)
      this.aimOffPitch = this.rng.range(-err, err) * 0.6
      this.aimOffUntil = tick + Math.round(this.rng.range(0.25, 0.55) * sim.tickRate)
    }
    const ty = this.enemyY + (this.aimHead && dist < 60 ? 1.55 : 1.05) * (ec.flags & CharFlag.Crouched ? 0.65 : 1)

    // Tiro: alvo à vista, reação vencida e mira perto do alvo
    if (this.enemyVisible && tick >= this.reactionUntil && p.equipTimer <= 0) {
      if (w && dist > 10 && w.category !== 'shotgun') cmd.buttons |= Buttons.Aim
      const a = this.solveAim(this.enemyX, ty, this.enemyZ)
      const tol = Math.atan2(0.5, Math.max(dist, 1)) + this.profile.aimError * 1.5
      const off = Math.abs(wrap(a.yaw - this.yaw)) + Math.abs(a.pitch - this.pitch) * 0.7
      const inRange = w ? dist < w.range * 0.9 : dist < 2.8
      if (off < tol + Math.abs(this.aimOffYaw) && inRange) {
        if (!w || w.automatic) cmd.buttons |= Buttons.Fire
        else {
          this.fireToggle = !this.fireToggle
          if (this.fireToggle) cmd.buttons |= Buttons.Fire
        }
      }
    }
    return [this.enemyX, ty, this.enemyZ]
  }

  // ---- cura ---------------------------------------------------------------

  private heal(cmd: InputCommand): void {
    const p = this.sp.p
    const tick = this.ctx.sim.tick
    if (this.healStarted < 0) {
      const slot = this.healSlot()
      if (slot < 0) {
        this.goal = 'explore'
        return
      }
      cmd.slot = slot
      if (p.selected === slot && p.equipTimer <= 0) {
        cmd.buttons |= Buttons.Fire
        this.healStarted = tick
      }
      return
    }
    cmd.slot = p.selected
    if (p.useTimer <= 0 && tick - this.healStarted > 3) {
      this.healStarted = -1
      if (this.healSlot() < 0) this.goal = 'explore'
    }
  }

  // ---- saque --------------------------------------------------------------

  private key(kind: string, id: number): string {
    return `${kind}:${id}`
  }

  private blacklisted(kind: string, id: number): boolean {
    const until = this.blacklist.get(this.key(kind, id))
    return until !== undefined && until > this.ctx.sim.tick
  }

  private lootValue(item: number, rarity: number, count: number): number {
    const p = this.sp.p
    const def = itemDef(item)
    if (!def) return 0
    const free = p.slots.some((s) => s.item === NO_ITEM)
    switch (def.kind) {
      case 'weapon': {
        const weapons = p.slots.filter((s) => weaponDef(s.item))
        const usable = this.weaponSlots().length
        if (usable === 0) return 12 + rarity * 2 // desarmado (ou sem bala): qualquer arma serve
        if (weapons.some((s) => s.item === item && s.rarity >= rarity)) return 0
        if (free) return 10 + rarity * 2 - weapons.length * 1.5
        const worst = weapons.reduce((m, s) => Math.min(m, s.rarity), 9)
        return rarity > worst + 1 ? 4 : 0
      }
      case 'ammo': {
        const owned = p.slots.filter((s) => weaponDef(s.item)?.ammoType === def.ammoType)
        if (owned.length === 0) return 0
        const loaded = owned.reduce((n, s) => n + s.ammo, 0) + p.ammo[def.ammoType]
        if (loaded === 0) return 11 // arma sem bala: prioridade máxima
        return p.ammo[def.ammoType] < ammoCap(def.ammoType) * 0.6 ? 5 : 0
      }
      case 'consumable': {
        const stack = p.slots.find((s) => s.item === item && s.count < def.maxStack)
        if (def.throwable) return stack || free ? 1.5 : 0
        return stack || free ? 5 : 0
      }
      case 'material':
        return p.materials[def.material] < MATERIAL_MAX * 0.4 ? 2 + Math.min(count, 60) / 30 : 0
      default:
        return 0
    }
  }

  private reachable(x: number, y: number, z: number): boolean {
    const nav = this.ctx.nav
    const i = nav.cellX(x)
    const j = nav.cellZ(z)
    return y - nav.ground[j * nav.n + i] < 1.4
  }

  private findLoot(): boolean {
    const sim = this.ctx.sim
    const c = this.sp.p.char
    const zone = this.ctx.br?.zone()
    if (this.loot && this.stillThere(this.loot) && !this.blacklisted(this.loot.kind, this.loot.id)) return true
    let best: LootTarget | null = null
    let bestScore = 0
    const R = 60
    for (const it of sim.items.values()) {
      const d = Math.hypot(it.x - c.x, it.z - c.z)
      if (d > R || this.blacklisted('item', it.id) || !this.reachable(it.x, it.y, it.z)) continue
      if (zone && distanceOutside(zone, it.x, it.z) > 0) continue
      const v = this.lootValue(it.item, it.rarity, it.count)
      const score = v / (6 + d)
      if (v > 0 && score > bestScore) {
        bestScore = score
        best = { kind: 'item', id: it.id, x: it.x, y: it.y, z: it.z, since: sim.tick }
      }
    }
    const chests = sim.map.chests
    for (let k = 0; k < chests.length; k++) {
      if (sim.chestOpened[k]) continue
      const ch = chests[k]
      const d = Math.hypot(ch.x - c.x, ch.z - c.z)
      if (d > R || this.blacklisted('chest', k) || !this.reachable(ch.x, ch.y, ch.z)) continue
      if (zone && distanceOutside(zone, ch.x, ch.z) > 0) continue
      const score = 9 / (6 + d)
      if (score > bestScore) {
        bestScore = score
        best = { kind: 'chest', id: k, x: ch.x, y: ch.y, z: ch.z, since: sim.tick }
      }
    }
    this.loot = best
    return !!best
  }

  private stillThere(t: LootTarget): boolean {
    const sim = this.ctx.sim
    if (t.kind === 'item') return sim.items.has(t.id)
    if (t.kind === 'chest') return !sim.chestOpened[t.id]
    return !sim.destroyedProps.has(t.id)
  }

  private doLoot(cmd: InputCommand): [number, number, number] | null {
    const sim = this.ctx.sim
    const t = this.loot
    const c = this.sp.p.char
    const p = this.sp.p
    if (!t || !this.stillThere(t)) {
      this.loot = null
      this.goal = 'explore'
      return null
    }
    const d = Math.hypot(t.x - c.x, t.z - c.z)
    if (sim.tick - t.since > sim.tickRate * (6 + Math.hypot(t.x - c.x, t.z - c.z) / 3) && sim.tick - t.since > sim.tickRate * 12) {
      this.blacklist.set(this.key(t.kind, t.id), sim.tick + sim.tickRate * 60)
      this.loot = null
      return null
    }
    const reach = t.kind === 'chest' ? 1.9 : 1.4
    if (d > reach) {
      this.moveTarget = { x: t.x, z: t.z }
      return null
    }
    // Perto: olha para o item/baú e interage (com o inventário cheio, troca a pior arma)
    if (t.kind === 'item') {
      const it = sim.items.get(t.id)
      if (it && weaponDef(it.item) && !p.slots.some((s) => s.item === NO_ITEM)) {
        let worst = 0
        for (let k = 1; k < SLOT_COUNT; k++) if (p.slots[k].rarity < p.slots[worst].rarity || !weaponDef(p.slots[k].item)) worst = k
        cmd.slot = worst
      } else if (p.selected === PICKAXE_SLOT && it && weaponDef(it.item)) cmd.slot = PICKAXE_SLOT
    }
    this.fireToggle = !this.fireToggle
    if (this.fireToggle && p.equipTimer <= 0) cmd.buttons |= Buttons.Use
    if (sim.tick - t.since > sim.tickRate * 8 && d < reach) {
      // não conseguiu pegar (outro chegou antes, ou está fora de alcance)
      this.blacklist.set(this.key(t.kind, t.id), sim.tick + sim.tickRate * 60)
      this.loot = null
    }
    return [t.x, t.y + (t.kind === 'chest' ? 0.4 : 0.1), t.z]
  }

  // ---- coleta de materiais -------------------------------------------------

  private wantsMaterials(): boolean {
    if (!this.profile.harvests) return false
    const m = this.sp.p.materials
    return m[0] + m[1] + m[2] < 60
  }

  private findProp(): boolean {
    const sim = this.ctx.sim
    const c = this.sp.p.char
    if (this.prop && this.stillThere(this.prop) && !this.blacklisted('prop', this.prop.id)) return true
    const props = sim.map.props
    let best = -1
    let bestD = 22
    for (let k = 0; k < props.length; k++) {
      const pr = props[k]
      if (Math.abs(pr.x - c.x) > bestD || Math.abs(pr.z - c.z) > bestD) continue
      if (pr.kind === 'bush' || sim.destroyedProps.has(k)) continue
      const d = Math.hypot(pr.x - c.x, pr.z - c.z)
      if (d < bestD && !this.blacklisted('prop', k)) {
        bestD = d
        best = k
      }
    }
    if (best < 0) return false
    const pr = props[best]
    this.prop = { kind: 'prop', id: best, x: pr.x, y: pr.y, z: pr.z, since: sim.tick }
    return true
  }

  private harvest(cmd: InputCommand): [number, number, number] | null {
    const sim = this.ctx.sim
    const t = this.prop
    const c = this.sp.p.char
    if (!t || !this.stillThere(t) || !this.wantsMaterials() || sim.tick - t.since > sim.tickRate * 12) {
      if (t && this.stillThere(t)) this.blacklist.set(this.key('prop', t.id), sim.tick + sim.tickRate * 90)
      this.prop = null
      this.goal = 'explore'
      return null
    }
    const d = Math.hypot(t.x - c.x, t.z - c.z)
    cmd.slot = PICKAXE_SLOT
    if (d > 2.0) {
      this.moveTarget = { x: t.x, z: t.z }
      return null
    }
    if (this.sp.p.selected === PICKAXE_SLOT) cmd.buttons |= Buttons.Fire
    return [t.x, t.y + 1.0, t.z]
  }

  /** Preso por uma construção: quebra com a picareta. */
  private breakout(cmd: InputCommand): [number, number, number] | null {
    const c = this.sp.p.char
    if (this.ctx.sim.tick >= this.breakoutUntil) {
      this.goal = 'explore'
      return null
    }
    cmd.slot = PICKAXE_SLOT
    if (this.sp.p.selected === PICKAXE_SLOT) cmd.buttons |= Buttons.Fire
    const fx = -Math.sin(this.yaw)
    const fz = -Math.cos(this.yaw)
    return [c.x + fx * 2, c.y + 1.2, c.z + fz * 2]
  }

  // ---- deslocamento ---------------------------------------------------------

  private travel(): void {
    const sim = this.ctx.sim
    const c = this.sp.p.char
    const br = this.ctx.br
    const tick = sim.tick
    if (this.goal === 'zone' && br) {
      const st = br.stage
      const zone = br.zone()
      if (st && zone) {
        const outside = distanceOutside(zone, c.x, c.z) > -3
        // fora da zona atual: rumo ao centro dela; senão, para dentro da próxima
        const cx = outside ? zone.x : st.toX
        const cz = outside ? zone.z : st.toZ
        const r = outside ? zone.r : st.toR
        if (!this.exploreTarget || tick >= this.exploreUntil || Math.hypot(this.exploreTarget.x - cx, this.exploreTarget.z - cz) > r * 0.7) {
          this.exploreTarget = this.randomPointIn(cx, cz, r * 0.5)
          this.exploreUntil = tick + sim.tickRate * 20
        }
        this.moveTarget = this.exploreTarget
        return
      }
    }
    if (this.goal === 'flee' && this.enemy) {
      const ex = c.x - this.enemyX
      const ez = c.z - this.enemyZ
      const d = Math.hypot(ex, ez) || 1
      this.moveTarget = { x: c.x + (ex / d) * 12, z: c.z + (ez / d) * 12 }
      return
    }
    // explorar: pontos de loot (ou qualquer lugar) dentro da zona
    if (!this.exploreTarget || tick >= this.exploreUntil || Math.hypot(this.exploreTarget.x - c.x, this.exploreTarget.z - c.z) < 3) {
      this.exploreTarget = this.pickExplore()
      this.exploreUntil = tick + sim.tickRate * 45
    }
    this.moveTarget = this.exploreTarget
  }

  private randomPointIn(cx: number, cz: number, r: number): NavPoint {
    const nav = this.ctx.nav
    for (let k = 0; k < 20; k++) {
      const a = this.rng.range(0, Math.PI * 2)
      const d = Math.sqrt(this.rng.next()) * r
      const x = cx + Math.cos(a) * d
      const z = cz + Math.sin(a) * d
      if (nav.walkableAt(x, z) && nav.cost[nav.cellZ(z) * nav.n + nav.cellX(x)] === 1) return { x, z }
    }
    return { x: cx, z: cz }
  }

  private pickExplore(): NavPoint {
    const sim = this.ctx.sim
    const c = this.sp.p.char
    const zone = this.ctx.br?.zone()
    const spots = sim.map.lootSpots
    const phase = this.ctx.br?.phase ?? MatchPhase.Training
    if (phase === MatchPhase.Warmup) return this.randomPointIn(c.x, c.z, 25)
    for (let k = 0; k < 12 && spots.length > 0; k++) {
      const s = spots[this.rng.int(0, spots.length)]
      const d = Math.hypot(s.x - c.x, s.z - c.z)
      if (d < 8 || d > 220) continue
      if (zone && distanceOutside(zone, s.x, s.z) > -10) continue
      if (!this.reachable(s.x, s.y, s.z)) continue
      return { x: s.x, z: s.z }
    }
    if (zone) return this.randomPointIn(zone.x, zone.z, zone.r * 0.6)
    return this.randomPointIn(c.x, c.z, 80)
  }

  /** Direção (unitária no plano) para ir até `t`, seguindo o A* quando preciso. */
  private steer(t: NavPoint): [number, number] | null {
    const sim = this.ctx.sim
    const nav = this.ctx.nav
    const c = this.sp.p.char
    const dx = t.x - c.x
    const dz = t.z - c.z
    const d = Math.hypot(dx, dz)
    if (d < 0.6) return null
    // perto e em linha reta livre: vai direto
    if (d < 10 && nav.lineWalkable(c.x, c.z, t.x, t.z)) {
      this.path = null
      return [dx / d, dz / d]
    }
    const stale = !this.path || !this.pathTarget || Math.hypot(this.pathTarget.x - t.x, this.pathTarget.z - t.z) > 4 || sim.tick - this.pathTick > sim.tickRate * 8
    if (this.pathTarget && Math.hypot(this.pathTarget.x - t.x, this.pathTarget.z - t.z) > 4) {
      this.bestDist = Infinity
      this.lastBest = Infinity
    }
    if (stale && this.ctx.pathBudget()) {
      this.path = nav.findPath(c.x, c.z, t.x, t.z, 12000)
      this.pathIndex = 0
      this.pathTarget = { x: t.x, z: t.z }
      this.pathTick = sim.tick
    }
    const path = this.path
    if (path && path.length > 0) {
      while (this.pathIndex < path.length - 1 && Math.hypot(path[this.pathIndex].x - c.x, path[this.pathIndex].z - c.z) < 1.5) this.pathIndex++
      const wp = path[Math.min(this.pathIndex, path.length - 1)]
      const wx = wp.x - c.x
      const wz = wp.z - c.z
      const wd = Math.hypot(wx, wz)
      if (wd > 0.3) return [wx / wd, wz / wd]
      if (this.pathIndex >= path.length - 1) this.path = null
    }
    return [dx / d, dz / d]
  }

  private checkStuck(cmd: InputCommand, tick: number): void {
    const c = this.sp.p.char
    const sim = this.ctx.sim
    if (tick - this.stuckTick < 30) return
    const moved = Math.hypot(c.x - this.stuckX, c.z - this.stuckZ)
    // Progresso = chegar mais perto do destino (andar em círculos não conta)
    const progressed = this.lastBest - this.bestDist > 1 || this.goal === 'fight'
    this.lastBest = this.bestDist
    this.stuckX = c.x
    this.stuckZ = c.z
    this.stuckTick = tick
    if (!this.wantsMove || (moved > 0.8 && progressed) || c.flags & AIRBORNE_FLAGS) {
      this.stuckCount = 0
      return
    }
    this.stuckCount++
    if (this.stuckCount === 1 || this.stuckCount === 3) cmd.buttons |= Buttons.Jump
    if (this.stuckCount === 2) {
      // algo construído na frente? quebra
      const fx = -Math.sin(this.yaw)
      const fz = -Math.cos(this.yaw)
      if (sim.map.world.raycast(c.x, c.y + 1.0, c.z, fx, 0, fz, 2.5, hit) && hit.colliderId >= 0 && sim.buildings.pieceOfCollider(hit.colliderId)) {
        this.goal = 'breakout'
        this.breakoutUntil = tick + sim.tickRate * 3
        return
      }
      this.path = null
      this.pathTick = -1000
    }
    if (this.stuckCount >= 4) {
      // desiste do destino atual
      const t = this.goal === 'harvest' ? this.prop : this.goal === 'loot' ? this.loot : null
      if (t) this.blacklist.set(this.key(t.kind, t.id), tick + sim.tickRate * 60)
      if (this.goal === 'harvest') this.prop = null
      else if (this.goal === 'loot') this.loot = null
      this.exploreTarget = this.randomPointIn(c.x, c.z, 20)
      this.exploreUntil = tick + sim.tickRate * 10
      this.path = null
      this.stuckCount = 0
    }
  }

  // ---- mira -------------------------------------------------------------------

  /** Yaw/pitch que põem a mira (raio do ombro) sobre o ponto. */
  private solveAim(tx: number, ty: number, tz: number): { yaw: number; pitch: number } {
    const s = copyCharacterState(this.sp.p.char, scratch)
    let yaw = Math.atan2(-(tx - s.x), -(tz - s.z))
    let pitch = 0
    for (let k = 0; k < 3; k++) {
      s.yaw = yaw
      s.pitch = pitch
      aimFrame(s, frame)
      yaw = Math.atan2(-(tx - frame.ox), -(tz - frame.oz))
      pitch = Math.atan2(ty - frame.oy, Math.hypot(tx - frame.ox, tz - frame.oz))
    }
    return { yaw, pitch: Math.max(-1.4, Math.min(1.4, pitch)) }
  }

  private turn(wantYaw: number, wantPitch: number, dt: number): void {
    const max = this.profile.turnRate * dt
    const dy = wrap(wantYaw - this.yaw)
    this.yaw = wrap(this.yaw + Math.max(-max, Math.min(max, dy)))
    const dp = wantPitch - this.pitch
    this.pitch += Math.max(-max, Math.min(max, dp))
  }

  /** Para depuração e testes. */
  debug(): { goal: Goal; enemy: number; loot: string | null } {
    const t = this.goal === 'harvest' ? this.prop : this.loot
    return { goal: this.goal, enemy: this.enemy?.id ?? 0, loot: t ? `${t.kind}:${t.id}` : null }
  }
}

