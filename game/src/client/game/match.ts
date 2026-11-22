import * as THREE from 'three'
import { MOVE } from '../../shared/config/movement'
import { RARITIES, itemDef, itemLabel, weaponDef } from '../../shared/config/items'
import { loadMap, regionAt } from '../../shared/maps'
import type { GameMap } from '../../shared/maps/types'
import { clamp, lerp, wrapAngle } from '../../shared/math/scalar'
import { CharFlag } from '../../shared/movement/character'
import { Cause, type EntityState, type GameEvent, type InputCommand, type InventoryAction, type Snapshot } from '../../shared/net/protocol'
import { pickInteractable } from '../../shared/player/interact'
import { currentSpread, type PlayerEvent, type PlayerState } from '../../shared/player/player'
import { createWorldHit } from '../../shared/world/collision-world'
import { AudioEngine, shotSoundFor } from '../audio/audio'
import { ThirdPersonCamera } from '../camera/third-person-camera'
import { CharacterModel, SKINS, type PoseInput } from '../character/character-model'
import type { InputManager } from '../input/input'
import { RemoteEntity, ServerClock } from '../net/interpolation'
import { Predictor } from '../net/prediction'
import { NetSession } from '../net/session'
import type { Transport } from '../net/transport'
import { WorldView } from '../render/world-view'
import { QUALITY, type Settings } from '../settings'
import type { Hud } from '../ui/hud'
import { FullMapView, MinimapView, gridRef, renderMapImage } from '../ui/minimap'
import { Effects } from './effects'
import { WorldItemsView } from './world-items'

/**
 * Uma partida em andamento do ponto de vista do cliente.
 *
 * Ciclo por quadro:
 *  1. lê a entrada; a câmera gira imediatamente (taxa de quadros);
 *  2. a cada tick fixo (30/s) cria um comando, prevê o resultado local
 *     (movimento, arma, consumíveis) e o envia;
 *  3. eventos do servidor (tiros, acertos, dano, itens, baús, explosões,
 *     eliminações) viram efeitos, sons e HUD;
 *  4. desenha o jogador local interpolado entre ticks previstos e os remotos
 *     ~100 ms no passado; atualiza câmera, sombras, HUD e renderiza.
 */

/** Atraso de interpolação dos remotos (ms): ~3 snapshots a 30 Hz. */
const INTERP_DELAY_MS = 100
const REMOTE_TIMEOUT_MS = 2500
const MAX_TICKS_PER_FRAME = 5

/** Personagem remoto sendo desenhado (pode sumir e voltar com a gerência de interesse). */
interface Remote {
  entity: RemoteEntity
  model: CharacterModel | null
  name: string
  skin: number
}

/** Identidade de um jogador conectado (vem de PlayerInfo; some só com PlayerLeft). */
interface RosterEntry {
  name: string
  skin: number
}

export interface MatchDeps {
  renderer: THREE.WebGLRenderer
  input: InputManager
  hud: Hud
  settings: Settings
  audio: AudioEngine
}

export interface DebugState {
  tick: number
  x: number
  y: number
  z: number
  speed: number
  flags: number
  grounded: boolean
  remotes: number
  remotePositions: { id: number; name: string; x: number; y: number; z: number }[]
  pingMs: number
  corrections: number
  pending: number
  yaw: number
  pitch: number
  mode: string
  mapId: string
  alive: boolean
  health: number
  shield: number
  selected: number
  slots: { item: number; rarity: number; count: number; ammo: number }[]
  kills: number
  hits: number
  lastHit: { damage: number; head: boolean; targetKind: number } | null
  damageTaken: number
  prompt: string | null
  items: number
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
const tmpA = new THREE.Vector3()
const tmpB = new THREE.Vector3()
const tmpSize = new THREE.Vector2()

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
}

export class Match {
  readonly session: NetSession
  readonly tickRate: number
  readonly dt: number
  readonly map: GameMap
  readonly world: WorldView
  readonly cam: ThirdPersonCamera
  readonly predictor: Predictor
  readonly playerId: number
  readonly modeLabel: string
  private local: CharacterModel
  private localSkin = 0
  private readonly remotes = new Map<number, Remote>()
  private readonly roster = new Map<number, RosterEntry>()
  private readonly clock = new ServerClock()
  private readonly items: WorldItemsView
  private readonly effects: Effects
  private readonly minimap: MinimapView
  private readonly fullmap: FullMapView
  private readonly hit = createWorldHit()
  private yaw = 0
  private pitch = 0
  private accumulator = 0
  private tickScale = 1
  private serverTick = 0
  private elapsed = 0
  private fps = 60
  private lastFrameAt = 0
  private ended = false
  private selectedSlot = 0
  private kills = 0
  private aliveCount = 1
  private readonly startedAt = performance.now()
  private death: { killer: number; respawnAt: number | null } | null = null
  private hits = 0
  private lastHit: DebugState['lastHit'] = null
  private damageTaken = 0
  private prompt: string | null = null
  private readonly focus = new THREE.Vector3()
  private readonly pose: PoseInput = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, flags: 0 }
  private readonly sampled: EntityState = { id: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, vx: 0, vy: 0, vz: 0, weapon: 255, rarity: 0 }
  private readonly localEvents: PlayerEvent[] = []
  onClosed: ((reason: string) => void) | null = null

  /** Conecta, carrega o mapa e a cena, e espera o primeiro estado do servidor. */
  static async start(transport: Transport, deps: MatchDeps, name: string, progress: (step: string) => void): Promise<Match> {
    const session = new NetSession(transport)
    try {
      progress('Conectando ao servidor…')
      const welcome = await session.handshake(name)
      progress(`Gerando o mapa "${welcome.mapId}"…`)
      await nextFrame()
      const map = loadMap(welcome.mapId)
      progress('Preparando gráficos…')
      await nextFrame()
      const match = new Match(session, map, deps, welcome.playerId, welcome.tickRate, transport.kind === 'local' ? 'Offline' : transport.label)
      deps.renderer.compile(match.world.scene, match.cam.camera)
      progress('Sincronizando com o servidor…')
      await match.waitForFirstState()
      return match
    } catch (err) {
      session.close()
      throw err
    }
  }

  private constructor(session: NetSession, map: GameMap, private readonly deps: MatchDeps, playerId: number, tickRate: number, modeLabel: string) {
    this.session = session
    this.map = map
    this.playerId = playerId
    this.tickRate = tickRate
    this.dt = 1 / tickRate
    this.modeLabel = modeLabel
    const quality = QUALITY[deps.settings.quality]
    this.world = new WorldView(map, deps.renderer, quality)
    const size = deps.renderer.getSize(new THREE.Vector2())
    this.cam = new ThirdPersonCamera(size.x / Math.max(1, size.y), deps.settings.fov, quality.drawDistance)
    this.predictor = new Predictor(map.world, this.dt, playerId)
    this.local = new CharacterModel(SKINS[0])
    this.world.scene.add(this.local.root)
    this.items = new WorldItemsView(this.world.scene, map)
    this.effects = new Effects(this.world.scene, map.world, deps.hud.fx)
    const image = renderMapImage(map)
    this.minimap = new MinimapView(image, map)
    deps.hud.minimapSlot.replaceChildren(this.minimap.el)
    this.fullmap = new FullMapView(image, map)
    deps.hud.el.append(this.fullmap.el)

    session.setHandlers({
      onSnapshot: (s, at) => this.onSnapshot(s, at),
      onPlayerInfo: (id, n, skin) => this.onPlayerInfo(id, n, skin),
      onPlayerLeft: (id) => {
        this.roster.delete(id)
        this.removeRemote(id)
      },
      onEvents: (events) => this.onEvents(events),
      onClosed: (reason) => {
        if (this.ended) return
        this.ended = true
        this.onClosed?.(reason)
      },
    })
    session.startPing()
  }

  private waitForFirstState(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const t0 = performance.now()
      const check = () => {
        if (this.predictor.initialized) {
          this.yaw = this.predictor.state.char.yaw
          this.pitch = 0
          this.selectedSlot = this.predictor.state.selected
          resolve()
        } else if (this.ended || this.session.closedReason) reject(new Error(this.session.closedReason ?? 'Conexão encerrada'))
        else if (performance.now() - t0 > timeoutMs) reject(new Error('O servidor não enviou o estado inicial'))
        else setTimeout(check, 20)
      }
      check()
    })
  }

  // ---- rede ---------------------------------------------------------------

  private onSnapshot(s: Snapshot, at: number): void {
    this.clock.observe(s.tick, this.tickRate, at)
    this.serverTick = s.tick
    this.aliveCount = s.alive
    this.kills = s.kills
    if (s.self) this.predictor.reconcile(s.self, s.ackSeq)
    // Fila do servidor crescendo = relógio do cliente adiantado: desacelera um pouco.
    this.tickScale = s.queued > 2 ? 0.97 : 1
    const serverMs = (s.tick * 1000) / this.tickRate
    for (const e of s.entities) this.remote(e.id).entity.push(serverMs, e)
  }

  private remote(id: number): Remote {
    let r = this.remotes.get(id)
    if (!r) {
      const info = this.roster.get(id)
      r = { entity: new RemoteEntity(id), model: null, name: info?.name ?? `Jogador ${id}`, skin: info?.skin ?? id % SKINS.length }
      this.remotes.set(id, r)
    }
    return r
  }

  private nameOf(id: number): string {
    if (id === this.playerId) return 'Você'
    return this.roster.get(id)?.name ?? `Jogador ${id}`
  }

  private onPlayerInfo(id: number, name: string, skin: number): void {
    this.roster.set(id, { name, skin })
    if (id === this.playerId && skin !== this.localSkin) {
      // o visual do próprio personagem também é decidido pelo servidor
      this.local.dispose()
      this.local = new CharacterModel(SKINS[skin % SKINS.length])
      this.localSkin = skin
      this.world.scene.add(this.local.root)
    }
    const r = this.remotes.get(id)
    if (!r || id === this.playerId) return
    r.name = name
    if (r.skin !== skin && r.model) {
      // visual mudou: recria o modelo no próximo quadro
      r.model.dispose()
      r.model = null
    }
    r.skin = skin
    r.model?.setName(name)
  }

  private removeRemote(id: number): void {
    const r = this.remotes.get(id)
    if (!r) return
    r.model?.dispose()
    this.remotes.delete(id)
  }

  private onEvents(events: GameEvent[]): void {
    const hud = this.deps.hud
    const audio = this.deps.audio
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          const r = this.remotes.get(e.shooter)
          const from = r?.model ? r.model.muzzleWorld(tmpA) : tmpA.set(e.ox, e.oy, e.oz)
          for (const end of e.ends) {
            tmpB.set(end.x, end.y, end.z)
            this.effects.tracer(from, tmpB)
            if (end.hit === 1) this.effects.impact(tmpB, 'world')
            else if (end.hit === 2) this.effects.impact(tmpB, 'flesh')
          }
          this.effects.muzzleFlash(from)
          audio.play(shotSoundFor(e.item), { pos: from })
          break
        }
        case 'hit': {
          this.hits++
          this.lastHit = { damage: e.damage, head: e.head, targetKind: e.targetKind }
          hud.hitMarker(e.head, e.eliminated)
          this.effects.damageNumber(tmpA.set(e.x, e.y, e.z), e.damage, e.head ? 'head' : e.shield ? 'shield' : 'body')
          audio.play(e.head ? 'headshot' : 'hit')
          if (e.broke) audio.play('shieldbreak')
          break
        }
        case 'damaged': {
          this.damageTaken += e.amount
          const s = this.predictor.state.char
          const angle = wrapAngle(Math.atan2(-(e.fromX - s.x), -(e.fromZ - s.z)) - this.yaw)
          hud.damageFrom(-angle)
          audio.play('hurt')
          break
        }
        case 'eliminated': {
          const cause = e.cause === Cause.Fall ? 'queda' : e.cause === Cause.Void ? 'fora do mapa' : itemDef(e.cause)?.name ?? '—'
          const killer = e.killer ? `<b>${escapeHtml(this.nameOf(e.killer))}</b> ` : ''
          hud.killFeed(`${killer}<span class="feed-cause">${escapeHtml(cause)}</span> <b>${escapeHtml(this.nameOf(e.victim))}</b>`, e.victim === this.playerId || e.killer === this.playerId)
          if (e.victim === this.playerId) {
            this.death = { killer: e.killer, respawnAt: e.respawnIn > 0 ? performance.now() + e.respawnIn * 1000 : null }
            hud.setDeath({
              text: e.killer ? `por <b>${escapeHtml(this.nameOf(e.killer))}</b> (${escapeHtml(cause)})` : `(${escapeHtml(cause)})`,
              respawnAt: this.death.respawnAt,
              spectating: e.killer && e.killer !== this.playerId ? this.nameOf(e.killer) : null,
            })
            audio.play('eliminated')
          } else if (e.killer === this.playerId) {
            hud.banner(`Eliminou ${this.nameOf(e.victim)}`, 'kill')
            audio.play('eliminated')
          }
          break
        }
        case 'itemRemove': {
          if (e.by === this.playerId) {
            const it = this.items.items.get(e.id)
            if (it) {
              const def = itemDef(it.item)
              const n = def?.kind === 'weapon' ? '' : ` ×${it.count}`
              hud.pickupToast(`+ ${itemLabel(it.item, def?.kind === 'weapon' ? it.rarity : undefined)}${n}`, def?.kind === 'consumable' ? def.rarity : it.rarity)
            }
            audio.play('pickup')
          }
          this.items.apply(e)
          break
        }
        case 'chestOpen': {
          this.items.apply(e)
          const p = this.items.chestPosition(e.chest)
          if (p && e.by !== 0) audio.play('chest', { pos: p })
          break
        }
        case 'projSpawn':
          this.effects.spawnProjectile(e.id, e.item, e.x, e.y, e.z, e.vx, e.vy, e.vz)
          if (e.owner !== this.playerId) audio.play(weaponDef(e.item) ? 'shot-launcher' : 'throw', { pos: tmpA.set(e.x, e.y, e.z) })
          break
        case 'explosion':
          this.effects.removeProjectile(e.id)
          tmpA.set(e.x, e.y, e.z)
          this.effects.explosion(tmpA, e.radius)
          audio.play('explosion', { pos: tmpA })
          break
        case 'respawn':
          if (e.player === this.playerId) {
            this.death = null
            hud.setDeath(null)
            hud.banner('De volta ao jogo')
          }
          break
        default:
          this.items.apply(e)
      }
    }
  }

  /** Efeitos imediatos do que o próprio jogador previu (sem esperar o servidor). */
  private playLocalEvents(events: readonly PlayerEvent[]): void {
    const audio = this.deps.audio
    for (const e of events) {
      if (e.type === 'shot') {
        const w = weaponDef(e.item)
        const from = this.local.muzzleWorld(tmpA)
        if (w && !w.projectile) {
          for (const r of e.rays) {
            const hitWorld = this.map.world.raycast(r.ox, r.oy, r.oz, r.dx, r.dy, r.dz, w.range, this.hit)
            const t = hitWorld ? this.hit.t : w.range
            tmpB.set(r.ox + r.dx * t, r.oy + r.dy * t, r.oz + r.dz * t)
            this.effects.tracer(from, tmpB)
            if (hitWorld) this.effects.impact(tmpB, 'world')
          }
        }
        this.effects.muzzleFlash(from, w?.category === 'shotgun' || w?.category === 'sniper' || w?.category === 'launcher')
        audio.play(shotSoundFor(e.item))
        if (w) {
          this.pitch = clamp(this.pitch + w.recoil * (0.6 + Math.random() * 0.4), -MOVE.maxPitch, MOVE.maxPitch)
          this.yaw += (Math.random() - 0.5) * w.recoil * 0.4
        }
      } else if (e.type === 'reload') audio.play('reload')
      else if (e.type === 'dry') audio.play('dry')
      else if (e.type === 'consumed') audio.play('heal')
      else if (e.type === 'throw') audio.play('throw')
      else if (e.type === 'fall') audio.play('hurt')
    }
  }

  // ---- API para a casca --------------------------------------------------

  get playerCount(): number {
    return Math.max(this.roster.size, 1 + this.remotes.size)
  }

  get state(): PlayerState {
    return this.predictor.state
  }

  setAspect(aspect: number): void {
    this.cam.setAspect(aspect)
  }

  applySettings(s: Settings): void {
    this.cam.setBaseFov(s.fov)
  }

  sendInventory(op: InventoryAction): void {
    this.session.sendInventory(op)
  }

  toggleMap(): void {
    this.fullmap.toggle()
  }

  private viewTick(now: number): number {
    return Math.max(0, ((this.clock.serverTimeMs(now) - INTERP_DELAY_MS) * this.tickRate) / 1000)
  }

  frame(frameDt: number, now: number): void {
    if (this.ended) return
    this.elapsed += frameDt
    // FPS medido pelo relógio real (o dt do quadro é limitado a 0,1 s)
    if (this.lastFrameAt > 0) this.fps = lerp(this.fps, 1000 / Math.max(now - this.lastFrameAt, 1), 0.1)
    this.lastFrameAt = now
    const state = this.predictor.state
    const inp = this.deps.input.sample(frameDt, (state.char.flags & CharFlag.Aiming) !== 0)
    this.yaw += inp.lookYaw
    this.pitch = clamp(this.pitch + inp.lookPitch, -MOVE.maxPitch, MOVE.maxPitch)
    if (inp.slot !== null) this.selectedSlot = inp.slot
    if (inp.slotStep !== 0) this.selectedSlot = (((this.selectedSlot + inp.slotStep) % 5) + 5) % 5

    // Ticks fixos de simulação/predição
    this.accumulator += frameDt * this.tickScale
    const cmds: InputCommand[] = []
    const viewTick = this.viewTick(now)
    while (this.accumulator >= this.dt) {
      if (cmds.length >= MAX_TICKS_PER_FRAME) {
        this.accumulator = 0
        break
      }
      cmds.push(this.predictor.predict({ forward: inp.forward, right: inp.right, yaw: this.yaw, pitch: this.pitch, buttons: inp.buttons, slot: this.selectedSlot, viewTick }))
      this.localEvents.push(...this.predictor.events)
      this.accumulator -= this.dt
    }
    if (cmds.length > 0) {
      this.deps.input.consumeTickLatch()
      this.session.sendInputs(cmds)
    }
    if (this.localEvents.length > 0) {
      this.playLocalEvents(this.localEvents)
      this.localEvents.length = 0
    }

    // Jogador local: entre os dois últimos ticks previstos + suavização de correções
    const alpha = this.accumulator / this.dt
    const prev = this.predictor.prev
    const off = this.predictor.offset
    const c = state.char
    this.predictor.decayOffset(frameDt)
    const p = this.pose
    p.x = lerp(prev.x, c.x, alpha) + off.x
    p.y = lerp(prev.y, c.y, alpha) + off.y
    p.z = lerp(prev.z, c.z, alpha) + off.z
    p.vx = c.vx
    p.vy = c.vy
    p.vz = c.vz
    p.yaw = this.yaw
    p.pitch = this.pitch
    p.flags = c.flags
    const slot = state.slots[state.selected]
    this.local.root.visible = state.alive
    this.local.setHeld(slot.item, slot.rarity)
    this.local.update(p, frameDt)

    // Remotos: interpolados no passado
    const serverNow = this.clock.serverTimeMs(now)
    const renderMs = serverNow - INTERP_DELAY_MS
    for (const [id, r] of this.remotes) {
      if (r.entity.lastSeen > 0 && serverNow - r.entity.lastSeen > REMOTE_TIMEOUT_MS) {
        this.removeRemote(id)
        continue
      }
      if (!r.entity.sample(renderMs, this.sampled)) continue
      if (!r.model) {
        r.model = new CharacterModel(SKINS[r.skin % SKINS.length])
        r.model.setName(r.name)
        this.world.scene.add(r.model.root)
      }
      r.model.setHeld(this.sampled.weapon, this.sampled.rarity)
      r.model.update(this.sampled, frameDt)
    }

    // Câmera: o próprio personagem, ou quem eliminou você (espectador)
    let camTarget: { x: number; y: number; z: number } = p
    let camFlags = c.flags
    if (!state.alive && this.death) {
      const killer = this.death.killer ? this.remotes.get(this.death.killer)?.model : null
      if (killer) {
        camTarget = killer.root.position
        camFlags = CharFlag.Grounded
      }
    }
    const w = weaponDef(slot.item)
    this.cam.setAimFov(w ? w.aimFov : null)
    this.cam.update(camTarget, camFlags, this.yaw, this.pitch, this.map.world, frameDt)
    this.focus.set(camTarget.x, camTarget.y, camTarget.z)
    this.world.update(this.focus, this.cam.camera, this.elapsed)
    this.items.update(frameDt, this.focus, this.elapsed)
    const size = this.deps.renderer.getSize(tmpSize)
    this.effects.update(frameDt, this.cam.camera, size.x, size.y)
    const f = this.cam.forward
    this.deps.audio.setListener(this.cam.camera.position.x, this.cam.camera.position.y, this.cam.camera.position.z, f.x, f.y, f.z)
    this.updateHud(size.y)
    this.deps.renderer.render(this.world.scene, this.cam.camera)
  }

  private updateHud(viewHeight: number): void {
    const state = this.predictor.state
    const s = state.char
    const f = s.flags
    const hs = Math.hypot(s.vx, s.vz)
    const region = regionAt(this.map, s.x, s.z)
    const swimming = (f & CharFlag.Swimming) !== 0
    const rtt = this.session.rttMs
    const local = this.session.transport.kind === 'local'
    const heading = ((-this.yaw * 180) / Math.PI) % 360
    const slot = state.slots[state.selected]
    const def = itemDef(slot.item)
    const w = def?.kind === 'weapon' ? def : null

    // Mira dinâmica: abertura real da dispersão projetada na tela
    const fovRad = (this.cam.camera.fov * Math.PI) / 180
    const spreadPx = w ? (Math.tan(currentSpread(state, w)) / Math.tan(fovRad / 2)) * (viewHeight / 2) : 6
    const aiming = (f & CharFlag.Aiming) !== 0

    // Aviso de interação (mesma escolha que o servidor fará)
    this.prompt = null
    if (state.alive) {
      const pick = pickInteractable(s, this.items.interactablesNear(s.x, s.z))
      if (pick?.kind === 'chest') this.prompt = '<kbd>E</kbd> Abrir baú'
      else if (pick) {
        const it = this.items.items.get(pick.id)
        if (it) {
          const idef = itemDef(it.item)
          const color = `#${(RARITIES[idef?.kind === 'consumable' ? idef.rarity : it.rarity]?.color ?? 0xffffff).toString(16).padStart(6, '0')}`
          const n = idef?.kind === 'weapon' ? '' : ` ×${it.count}`
          this.prompt = `<kbd>E</kbd> Pegar <b style="color:${color}">${escapeHtml(itemLabel(it.item, idef?.kind === 'weapon' ? it.rarity : undefined))}</b>${n}`
        }
      }
    }

    let progress: { label: string; value: number } | null = null
    if (w && state.reloadTimer > 0) progress = { label: 'Recarregando', value: 1 - state.reloadTimer / (w.reloadTime * (RARITIES[slot.rarity]?.reload ?? 1)) }
    else if (def?.kind === 'consumable' && state.useTimer > 0) progress = { label: `Usando ${def.name}`, value: 1 - state.useTimer / def.useTime }

    const mm = state.alive ? s : this.focus
    this.minimap.update(mm.x, mm.z, heading, region?.name ?? '')
    this.fullmap.update(mm.x, mm.z, heading)

    this.deps.hud.update({
      fps: this.fps,
      pingMs: local ? 0 : rtt,
      modeLabel: this.modeLabel,
      connection: local || rtt < 120 ? 'ok' : rtt < 250 ? 'warn' : 'bad',
      players: this.playerCount,
      aliveCount: this.aliveCount,
      kills: this.kills,
      matchTime: (performance.now() - this.startedAt) / 1000,
      region: region?.name ?? (swimming ? 'Mar aberto' : 'Campo aberto'),
      mapName: this.map.def.name,
      grid: gridRef(this.map, s.x, s.z),
      heading,
      speed: hs,
      flags: {
        grounded: (f & CharFlag.Grounded) !== 0,
        crouched: (f & CharFlag.Crouched) !== 0,
        sliding: (f & CharFlag.Sliding) !== 0,
        sprinting: (f & CharFlag.Sprinting) !== 0,
        aiming,
        swimming,
      },
      spread: Math.max(2, Math.min(60, spreadPx)),
      health: state.health,
      shield: state.shield,
      slots: state.slots,
      selected: state.selected,
      reserve: w ? state.ammo[w.ammoType] : -1,
      materials: state.materials,
      progress,
      prompt: this.prompt,
      scoped: aiming && w?.category === 'sniper',
      debug: {
        modo: this.modeLabel,
        mapa: this.map.def.id,
        'tick servidor': this.serverTick,
        'ping (ms)': local ? 'local' : rtt.toFixed(0),
        fps: this.fps.toFixed(0),
        posição: `${s.x.toFixed(2)} ${s.y.toFixed(2)} ${s.z.toFixed(2)}`,
        velocidade: `${hs.toFixed(2)} m/s · vy ${s.vy.toFixed(2)}`,
        pendentes: this.predictor.pendingCount,
        correções: this.predictor.corrections,
        'último erro': `${(this.predictor.lastError * 100).toFixed(1)} cm`,
        entidades: this.remotes.size,
        'itens no chão': this.items.items.size,
        'rede in/out': `${(this.session.bytesIn / 1024).toFixed(0)} / ${(this.session.bytesOut / 1024).toFixed(0)} KiB`,
        'draw calls': this.deps.renderer.info.render.calls,
        triângulos: this.deps.renderer.info.render.triangles,
      },
    }, this.deps.settings.showFps)
  }

  debugState(): DebugState {
    const st = this.predictor.state
    const s = st.char
    const remotePositions: DebugState['remotePositions'] = []
    for (const [id, r] of this.remotes) if (r.model) remotePositions.push({ id, name: r.name, x: r.model.root.position.x, y: r.model.root.position.y, z: r.model.root.position.z })
    return {
      tick: this.serverTick,
      x: s.x,
      y: s.y,
      z: s.z,
      speed: Math.hypot(s.vx, s.vz),
      flags: s.flags,
      grounded: (s.flags & CharFlag.Grounded) !== 0,
      remotes: this.remotes.size,
      remotePositions,
      pingMs: this.session.rttMs,
      corrections: this.predictor.corrections,
      pending: this.predictor.pendingCount,
      yaw: this.yaw,
      pitch: this.pitch,
      mode: this.modeLabel,
      mapId: this.map.def.id,
      alive: st.alive,
      health: st.health,
      shield: st.shield,
      selected: st.selected,
      slots: st.slots.map((x) => ({ ...x })),
      kills: this.kills,
      hits: this.hits,
      lastHit: this.lastHit,
      damageTaken: this.damageTaken,
      prompt: this.prompt,
      items: this.items.items.size,
    }
  }

  dispose(): void {
    this.ended = true
    this.session.close()
    for (const id of [...this.remotes.keys()]) this.removeRemote(id)
    this.local.dispose()
    this.items.dispose()
    this.effects.dispose()
    this.minimap.el.remove()
    this.fullmap.el.remove()
    this.deps.hud.setDeath(null)
    this.world.dispose()
  }
}
