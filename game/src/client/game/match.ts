import * as THREE from 'three'
import { MOVE } from '../../shared/config/movement'
import { BUILD, BUILD_KIND_NAMES, BUILD_MATERIALS, BuildKind, PICKAXE, encodeBuild } from '../../shared/config/building'
import { ITEM, MATERIAL_INFO, NO_ITEM, RARITIES, itemDef, itemLabel, weaponDef } from '../../shared/config/items'
import { pieceMaxHealth } from '../../shared/building/buildings'
import { buildTarget, type PieceSpec } from '../../shared/building/grid'
import { loadMap, regionAt } from '../../shared/maps'
import type { GameMap } from '../../shared/maps/types'
import { clamp, lerp, wrapAngle } from '../../shared/math/scalar'
import { Buttons, CharFlag, copyCharacterState, createCharacterState } from '../../shared/movement/character'
import { GameMode, MatchPhase, distanceOutside, zoneCircleAt, type AirshipRoute, type ZoneCircle, type ZoneStage } from '../../shared/match/zone'
import { Cause, TargetKind, type EntityState, type GameEvent, type InputCommand, type InventoryAction, type Snapshot, type TeamMate, type WelcomeMessage } from '../../shared/net/protocol'
import { pickInteractable } from '../../shared/player/interact'
import { PICKAXE_SLOT, SLOT_COUNT, currentSpread, type PlayerEvent, type PlayerState } from '../../shared/player/player'
import { Surface, createWorldHit } from '../../shared/world/collision-world'
import { AudioEngine, shotSoundFor } from '../audio/audio'
import { ThirdPersonCamera } from '../camera/third-person-camera'
import { CharacterModel, SKINS, type PoseInput } from '../character/character-model'
import type { InputManager } from '../input/input'
import { RemoteEntity, ServerClock } from '../net/interpolation'
import { Predictor } from '../net/prediction'
import { NetSession } from '../net/session'
import { AirshipView } from '../render/airship-view'
import { BuildingsView } from '../render/buildings-view'
import { ZoneView } from '../render/zone-view'
import { WorldView } from '../render/world-view'
import { QUALITY, type Settings } from '../settings'
import type { BattleHud, Hud, MatchResult } from '../ui/hud'
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
 *
 * Construção (Fase 3): Q/Z/V/T entram no modo construção (a mesma tecla
 * sai; teclas de espaço também). No modo, o comando leva a peça, a rotação e
 * o material; o botão de tiro ergue a peça (prevista na hora, confirmada pelo
 * servidor) e um fantasma azul/vermelho mostra onde ela vai ficar.
 */

/** Atraso de interpolação dos remotos (ms): ~3 snapshots a 30 Hz. */
const INTERP_DELAY_MS = 100
const REMOTE_TIMEOUT_MS = 2500
const MAX_TICKS_PER_FRAME = 5
/** Ordem da roda do mouse: picareta e depois os 5 espaços. */
const WHEEL_ORDER = [PICKAXE_SLOT, 0, 1, 2, 3, 4]
const BUILD_ORDER: number[] = [BuildKind.Wall, BuildKind.Floor, BuildKind.Ramp, BuildKind.Roof]
/** Alcance da leitura de vida da construção sob a mira (m). */
const TARGET_RANGE = 40

interface BuildMode {
  kind: number
  rot: number
  material: number
}

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
  team: number
}

export interface MatchDeps {
  renderer: THREE.WebGLRenderer
  input: InputManager
  hud: Hud
  settings: Settings
  audio: AudioEngine
  /** Tela dividida: área (px CSS) desta visão no canvas. */
  viewport?: () => { x: number; y: number; w: number; h: number }
  /** Este jogador define o ouvinte do áudio posicional (padrão: sim). */
  listener?: boolean
}

export interface DebugState {
  playerId: number
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
  /** Peças de construção conhecidas pelo cliente (confirmadas + previstas). */
  pieces: number
  predictedPieces: number
  rejectedPieces: number
  /** Peças desenhadas. */
  drawnPieces: number
  build: { kind: number; rot: number; material: number; ghost: PieceSpec | null; blocked: string | null } | null
  materials: number[]
  destroyedProps: number
  harvested: number
  target: { name: string; health: number; max: number } | null
  /** GameMode e fase (MatchPhase) */
  gameMode: number
  phase: number
  zone: ZoneCircle | null
  outsideZone: boolean
  airship: boolean
  result: MatchResult | null
  spectating: string | null
  team: number
  mates: { id: number; name: string; health: number; shield: number; alive: boolean }[]
}

function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
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
  private readonly buildings: BuildingsView
  private readonly zoneView: ZoneView
  private readonly airship: AirshipView
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
  private buildMode: BuildMode | null = null
  private lastMaterial = 0
  private prevAimHeld = false
  private ghost: PieceSpec | null = null
  private ghostBlocked: string | null = null
  private target: DebugState['target'] = null
  private prevSlotItems: number[] = []
  private destroyedProps = 0
  private harvested = 0
  private lastCollapseSound = 0
  /** Índice do adereço → colisor (para removê-lo quando quebra). */
  private readonly propCollider = new Map<number, number>()
  private readonly ghostChar = createCharacterState(0, 0, 0)
  // battle royale
  readonly gameMode: number
  private phase: number = MatchPhase.Training
  private phaseEnd = 0
  private stage: ZoneStage | null = null
  private route: AirshipRoute | null = null
  private zoneNow: ZoneCircle | null = null
  private readonly zoneScratch: ZoneCircle = { x: 0, z: 0, r: 0 }
  private participants = 0
  private damageDealt = 0
  private startedTick = -1
  private result: MatchResult | null = null
  private spectateId = 0
  private mates: TeamMate[] = []
  /** Fim da partida para este jogador (vitória ou eliminação). */
  onResult: ((r: MatchResult) => void) | null = null
  onClosed: ((reason: string) => void) | null = null

  /**
   * Carrega o mapa e a cena para a partida anunciada em `welcome` e espera o
   * primeiro estado do servidor. A sessão é de quem chamou (a casca): ela
   * continua viva quando a partida termina e todos voltam à sala de espera.
   */
  static async start(session: NetSession, welcome: WelcomeMessage, deps: MatchDeps, progress: (step: string) => void): Promise<Match> {
    progress(`Gerando o mapa "${welcome.mapId}"…`)
    await nextFrame()
    const map = loadMap(welcome.mapId)
    progress('Preparando gráficos…')
    await nextFrame()
    const t = session.transport
    const match = new Match(session, map, deps, welcome.playerId, welcome.tickRate, t.kind === 'local' ? 'Offline' : t.label, welcome.mode)
    deps.renderer.compile(match.world.scene, match.cam.camera)
    progress('Sincronizando com o servidor…')
    try {
      await match.waitForFirstState()
    } catch (err) {
      match.dispose(false)
      throw err
    }
    return match
  }

  private constructor(session: NetSession, map: GameMap, private readonly deps: MatchDeps, playerId: number, tickRate: number, modeLabel: string, gameMode: number) {
    this.gameMode = gameMode
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
    this.buildings = new BuildingsView(this.world.scene, this.predictor.builds.buildings, tickRate)
    this.zoneView = new ZoneView(this.world.scene)
    this.airship = new AirshipView(this.world.scene)
    for (const [collider, index] of map.propColliders) this.propCollider.set(index, collider)
    this.effects = new Effects(this.world.scene, map.world, deps.hud.fx)
    const image = renderMapImage(map)
    this.minimap = new MinimapView(image, map)
    deps.hud.minimapSlot.replaceChildren(this.minimap.el)
    this.fullmap = new FullMapView(image, map)
    deps.hud.el.append(this.fullmap.el)

    session.setHandlers({
      onSnapshot: (s, at) => this.onSnapshot(s, at),
      onPlayerInfo: (id, n, skin, team) => this.onPlayerInfo(id, n, skin, team),
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
    this.predictor.builds.serverTick = s.tick
    this.phase = s.phase
    this.phaseEnd = s.phaseEnd
    if (s.phase === MatchPhase.Airship) this.participants = Math.max(this.participants, s.alive)
    this.mates = s.mates
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

  /** Equipe deste jogador (no solo, só ele). */
  get myTeam(): number {
    return this.roster.get(this.playerId)?.team ?? -1
  }

  private isMate(id: number): boolean {
    return id !== this.playerId && this.myTeam >= 0 && this.roster.get(id)?.team === this.myTeam && this.teamMode
  }

  private get teamMode(): boolean {
    let mine = 0
    for (const r of this.roster.values()) if (r.team === this.myTeam) mine++
    return mine > 1
  }

  private onPlayerInfo(id: number, name: string, skin: number, team: number): void {
    const prevTeam = this.roster.get(id)?.team
    this.roster.set(id, { name, skin, team })
    if (id === this.playerId && prevTeam !== team) {
      // minha equipe mudou: refaz as placas de todo mundo
      for (const [rid, r] of this.remotes) r.model?.setName(r.name, this.isMate(rid))
    }
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
    r.model?.setName(name, this.isMate(id))
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
    this.predictor.builds.serverTick = this.estimatedServerTick(performance.now())
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          const r = this.remotes.get(e.shooter)
          if (e.item === ITEM.Pickaxe) {
            // golpe de picareta de outro jogador
            r?.model?.swing()
            const end = e.ends[0]
            tmpB.set(end.x, end.y, end.z)
            audio.play('swing', { pos: tmpB })
            if (end.hit === 1) this.strikeFx(tmpB, e.ox, e.oy, e.oz, true)
            break
          }
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
          const structure = e.targetKind === TargetKind.Structure
          if (e.targetKind === TargetKind.Player) this.damageDealt += e.damage
          hud.hitMarker(e.head, e.eliminated && !structure)
          this.effects.damageNumber(tmpA.set(e.x, e.y, e.z), e.damage, structure ? 'build' : e.head ? 'head' : e.shield ? 'shield' : 'body')
          if (!structure) audio.play(e.head ? 'headshot' : 'hit')
          if (e.broke) audio.play('shieldbreak')
          break
        }
        case 'piecePlaced': {
          const p = this.predictor.builds.apply(e)
          // a própria peça já tocou o som na predição; peças antigas (sincronização) chegam caladas
          if (p && e.builder !== this.playerId && e.age === 0) audio.play('build', { pos: tmpA.set((p.minX + p.maxX) / 2, (p.minY + p.maxY) / 2, (p.minZ + p.maxZ) / 2) })
          break
        }
        case 'pieceDamaged':
          this.predictor.builds.apply(e)
          break
        case 'pieceRemoved': {
          const p = this.predictor.builds.apply(e)
          if (!p) break
          tmpA.set(p.minX, p.minY, p.minZ)
          tmpB.set(p.maxX, p.maxY, p.maxZ)
          this.effects.debris(tmpA, tmpB, p.material, e.collapse ? 0.6 : 1)
          tmpA.lerp(tmpB, 0.5)
          const now = performance.now()
          if (!e.collapse) audio.play('break', { pos: tmpA })
          else if (now - this.lastCollapseSound > 250) {
            this.lastCollapseSound = now
            audio.play('collapse', { pos: tmpA })
          }
          break
        }
        case 'propDestroyed':
          this.breakProp(e.prop, true)
          break
        case 'harvest': {
          this.harvested += e.amount
          this.effects.floatText(tmpA.set(e.x, e.y, e.z), `+${e.amount} ${MATERIAL_INFO[e.material]?.name ?? ''}`, `harvest m${e.material}`)
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
          const cause = e.cause === Cause.Fall ? 'queda' : e.cause === Cause.Void ? 'fora do mapa' : e.cause === Cause.Zone ? 'zona' : e.cause === Cause.Quit ? 'saiu' : e.cause === ITEM.Pickaxe ? 'picareta' : itemDef(e.cause)?.name ?? '—'
          const killer = e.killer ? `<b>${escapeHtml(this.nameOf(e.killer))}</b> ` : ''
          hud.killFeed(`${killer}<span class="feed-cause">${escapeHtml(cause)}</span> <b>${escapeHtml(this.nameOf(e.victim))}</b>`, e.victim === this.playerId || e.killer === this.playerId)
          if (e.victim === this.playerId) {
            this.death = { killer: e.killer, respawnAt: e.respawnIn > 0 ? performance.now() + e.respawnIn * 1000 : null }
            this.spectateId = e.killer
            hud.setDeath({
              text: e.killer ? `por <b>${escapeHtml(this.nameOf(e.killer))}</b> (${escapeHtml(cause)})` : `(${escapeHtml(cause)})`,
              respawnAt: this.death.respawnAt,
              spectating: e.killer && e.killer !== this.playerId ? this.nameOf(e.killer) : null,
            })
            audio.play('eliminated')
            if (e.place > 0) this.finish(e.place === 1, e.place)
            else if (this.gameMode === GameMode.BattleRoyale && this.teamMode) {
              // a equipe continua: assiste um colega
              const mate = [...this.remotes.keys()].find((id) => this.isMate(id))
              if (mate) this.spectateId = mate
              hud.banner('Sua equipe continua na disputa')
            }
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
        case 'zone':
          this.stage = e
          break
        case 'airship':
          this.route = e
          this.startedTick = e.startTick
          break
        case 'matchEnd':
          if (e.winner && (e.winner === this.playerId || (this.teamMode && e.team === this.myTeam))) this.finish(true, 1)
          else if (e.winner) hud.banner(this.teamMode ? `A equipe de ${this.nameOf(e.winner)} venceu` : `${this.nameOf(e.winner)} venceu`, 'kill')
          break
        case 'teamOut':
          if (e.team === this.myTeam) this.finish(e.place === 1, e.place)
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
      } else if (e.type === 'swing') {
        this.local.swing()
        audio.play('swing')
        // lascas imediatas onde a picareta acerta (o material/dano vêm do servidor)
        if (this.map.world.raycast(e.ox, e.oy, e.oz, e.dx, e.dy, e.dz, PICKAXE.reach, this.hit)) {
          tmpB.set(this.hit.x, this.hit.y, this.hit.z)
          this.strikeFx(tmpB, e.ox, e.oy, e.oz, false)
        }
      } else if (e.type === 'build') audio.play('build')
      else if (e.type === 'reload') audio.play('reload')
      else if (e.type === 'dry') audio.play('dry')
      else if (e.type === 'consumed') audio.play('heal')
      else if (e.type === 'throw') audio.play('throw')
      else if (e.type === 'fall') audio.play('hurt')
    }
  }

  /** Resultado da partida para este jogador (uma vez). */
  private finish(victory: boolean, place: number): void {
    if (this.result || this.gameMode !== GameMode.BattleRoyale) return
    const seconds = this.startedTick >= 0 ? Math.max(0, (this.serverTick - this.startedTick) / this.tickRate) : 0
    this.result = { victory, place, total: Math.max(this.participants, place), kills: this.kills, damage: this.damageDealt, seconds }
    if (victory) this.deps.audio.play('chest')
    this.deps.hud.setDeath(null)
    this.onResult?.(this.result)
  }

  /** Texto da faixa de fase/zona do HUD. */
  private battleHud(state: PlayerState): BattleHud | null {
    if (this.gameMode !== GameMode.BattleRoyale) return null
    const tick = this.estimatedServerTick(performance.now())
    const c = state.char
    const secs = (t: number) => fmtClock((t - tick) / this.tickRate)
    let title = ''
    let timer: string | null = null
    let hint: string | null = null
    switch (this.phase) {
      case MatchPhase.Warmup:
        title = 'A partida começa em'
        timer = this.phaseEnd > 0 ? secs(this.phaseEnd) : null
        hint = 'Aquecimento: sem dano'
        break
      case MatchPhase.Airship:
      case MatchPhase.Playing: {
        const st = this.stage
        if (c.flags & CharFlag.Riding) {
          title = 'Dirigível'
          timer = this.route ? secs(this.route.endTick) : null
          hint = '<kbd>Espaço</kbd> saltar'
        } else if (st && tick < st.shrinkStart) {
          title = st.index === 0 ? 'A zona fecha em' : 'A zona fecha de novo em'
          timer = secs(st.shrinkStart)
        } else if (st && tick < st.shrinkEnd) {
          title = 'A zona está fechando'
          timer = secs(st.shrinkEnd)
        } else title = 'Zona final'
        if (c.flags & CharFlag.Skydiving) hint = '<kbd>Espaço</kbd> abrir o planador'
        break
      }
      case MatchPhase.Ended:
        title = this.result?.victory ? 'Vitória!' : 'Fim de partida'
        break
    }
    const z = this.zoneNow
    const d = z && state.alive ? distanceOutside(z, c.x, c.z) : null
    const falling = (c.flags & (CharFlag.Skydiving | CharFlag.Gliding)) !== 0
    return {
      title,
      timer,
      zoneDistance: d,
      outside: d !== null && d > 0,
      hint,
      altitude: falling ? c.y - Math.max(this.map.terrain.heightAt(c.x, c.z), this.map.def.waterLevel) : null,
    }
  }

  /** Quem assistir: um colega vivo, quem eliminou, senão qualquer um ainda em jogo. */
  private spectateTarget(): CharacterModel | null {
    if (!this.isMate(this.spectateId)) {
      const mate = this.mates.find((m) => m.alive && this.remotes.get(m.id)?.model)
      if (mate) this.spectateId = mate.id
    }
    const pick = this.remotes.get(this.spectateId)?.model
    if (pick) return pick
    for (const [id, r] of this.remotes) {
      if (r.model) {
        this.spectateId = id
        return r.model
      }
    }
    return null
  }

  /** Assistir o próximo jogador (clique no modo espectador). */
  spectateNext(): void {
    const ids = [...this.remotes.keys()]
    if (ids.length === 0) return
    const k = ids.indexOf(this.spectateId)
    this.spectateId = ids[(k + 1) % ids.length]
  }

  /** Lascas e som de um golpe de picareta, conforme o material atingido. */
  private strikeFx(pos: THREE.Vector3, ox: number, oy: number, oz: number, positional: boolean): void {
    let dx = pos.x - ox
    let dy = pos.y - oy
    let dz = pos.z - oz
    const d = Math.hypot(dx, dy, dz) || 1
    dx /= d
    dy /= d
    dz /= d
    let material = 1
    if (this.map.world.raycast(ox, oy, oz, dx, dy, dz, d + 0.3, this.hit) && this.hit.colliderId >= 0) {
      const id = this.hit.colliderId
      const piece = this.predictor.builds.buildings.pieceOfCollider(id)
      const prop = this.map.propColliders.get(id)
      if (piece) material = piece.material
      else if (prop !== undefined) material = this.map.props[prop].kind === 'rock' ? 1 : 0
      else {
        const surface = this.map.world.get(id)?.surface
        material = surface === Surface.Wood ? 0 : surface === Surface.Metal ? 2 : 1
      }
    }
    this.effects.chips(pos, material)
    this.deps.audio.play(material === 0 ? 'chop' : material === 1 ? 'mine' : 'clank', positional ? { pos } : undefined)
  }

  /** Adereço quebrado no servidor: some da cena e da colisão local (predição). */
  private breakProp(index: number, fx: boolean): void {
    const collider = this.propCollider.get(index)
    if (collider === undefined) return
    this.propCollider.delete(index)
    this.map.world.remove(collider)
    this.map.propColliders.delete(collider)
    this.world.hideProp(index)
    this.destroyedProps++
    const prop = this.map.props[index]
    if (!fx || !prop) return
    const c = this.predictor.state.char
    if (Math.hypot(prop.x - c.x, prop.z - c.z) > 90) return
    const r = prop.kind === 'rock' ? 0.8 : prop.kind === 'crate' ? 0.6 : 0.5
    const h = prop.kind === 'rock' ? 1 : prop.kind === 'crate' ? 1 : 4
    tmpA.set(prop.x - r, prop.y, prop.z - r)
    tmpB.set(prop.x + r, prop.y + h * prop.scale, prop.z + r)
    this.effects.debris(tmpA, tmpB, prop.kind === 'rock' ? 1 : 0, prop.kind === 'crate' ? 0.6 : 1)
    this.deps.audio.play('break', { pos: tmpA.lerp(tmpB, 0.5) })
  }

  private estimatedServerTick(now: number): number {
    return Math.round((this.clock.serverTimeMs(now) * this.tickRate) / 1000)
  }

  /** Teclas de construção, troca de espaço e material (antes dos ticks do quadro). */
  private handleBuildInput(inp: ReturnType<InputManager['sample']>, state: PlayerState): void {
    if (!state.alive) {
      this.buildMode = null
      return
    }
    if (inp.slot !== null) {
      this.selectedSlot = inp.slot
      this.buildMode = null
    }
    if (inp.build !== null) {
      const current = this.buildMode?.kind ?? 0
      const next = inp.build === -1 ? (current === 0 ? BUILD_ORDER[0] : BUILD_ORDER[BUILD_ORDER.indexOf(current) + 1] ?? 0) : inp.build === current ? 0 : inp.build
      this.buildMode = next ? { kind: next, rot: this.buildMode?.rot ?? 0, material: this.buildMode?.material ?? this.lastMaterial } : null
    }
    if (inp.slotStep !== 0) {
      if (this.buildMode) {
        // no modo construção a roda troca a peça
        const k = BUILD_ORDER.indexOf(this.buildMode.kind)
        this.buildMode.kind = BUILD_ORDER[(((k + inp.slotStep) % BUILD_ORDER.length) + BUILD_ORDER.length) % BUILD_ORDER.length]
      } else {
        const k = Math.max(0, WHEEL_ORDER.indexOf(this.selectedSlot))
        this.selectedSlot = WHEEL_ORDER[(((k + inp.slotStep) % WHEEL_ORDER.length) + WHEEL_ORDER.length) % WHEEL_ORDER.length]
      }
    }
    const aimHeld = (inp.buttons & Buttons.Aim) !== 0
    if (this.buildMode) {
      if (inp.rotate) this.buildMode.rot = (this.buildMode.rot + 1) & 3
      if (inp.cycleMaterial || (aimHeld && !this.prevAimHeld)) {
        // próximo material (prefere um que dê para pagar)
        for (let k = 1; k <= BUILD_MATERIALS.length; k++) {
          const m = (this.buildMode.material + k) % BUILD_MATERIALS.length
          if (state.materials[m] >= BUILD.cost || k === BUILD_MATERIALS.length) {
            this.buildMode.material = m
            break
          }
        }
      }
      this.lastMaterial = this.buildMode.material
      // mirar e recarregar não existem no modo construção (R gira, botão direito troca material)
      inp.buttons &= ~(Buttons.Aim | Buttons.Reload)
    } else if (inp.cycleMaterial) {
      this.lastMaterial = (this.lastMaterial + 1) % BUILD_MATERIALS.length
    }
    this.prevAimHeld = aimHeld
    // Pegou uma arma com a picareta na mão: já empunha
    const items = state.slots.map((x) => x.item)
    if (!this.buildMode && this.selectedSlot === PICKAXE_SLOT && this.prevSlotItems.length === SLOT_COUNT) {
      const k = items.findIndex((it, i) => it !== NO_ITEM && this.prevSlotItems[i] === NO_ITEM && weaponDef(it))
      if (k >= 0) this.selectedSlot = k
    }
    this.prevSlotItems = items
  }

  /** Fantasma da peça (mesmo alvo que a simulação usará) e motivo de bloqueio. */
  private updateGhost(state: PlayerState): void {
    const mode = this.buildMode
    if (!mode || !state.alive) {
      this.ghost = null
      this.ghostBlocked = null
      this.buildings.setGhost(null, true)
      return
    }
    const c = copyCharacterState(state.char, this.ghostChar)
    c.yaw = this.yaw
    c.pitch = this.pitch
    const bw = this.predictor.builds.buildings
    const spec = buildTarget(c, mode.kind, mode.rot, (i, j, k, d) => bw.hasRamp(i, j, k, d))
    this.ghost = spec
    this.ghostBlocked = bw.canPlace(spec)
    const affordable = state.materials[mode.material] >= BUILD.cost
    // lugar já ocupado: a própria peça já está lá (o motivo aparece no HUD)
    this.buildings.setGhost(this.ghostBlocked === 'Ocupado' ? null : spec, this.ghostBlocked === null && affordable)
  }

  /** Construção sob a mira (vida para o HUD). */
  private updateTarget(): void {
    this.target = null
    const cam = this.cam.camera.position
    const f = this.cam.forward
    if (!this.map.world.raycast(cam.x, cam.y, cam.z, f.x, f.y, f.z, TARGET_RANGE, this.hit) || this.hit.colliderId < 0) return
    const p = this.predictor.builds.buildings.pieceOfCollider(this.hit.colliderId)
    if (!p) return
    const max = pieceMaxHealth(p.material)
    this.target = { name: `${BUILD_KIND_NAMES[p.spec.kind]} de ${BUILD_MATERIALS[p.material].name.toLowerCase()}`, health: this.buildings.healthFraction(p) * max, max }
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
    this.handleBuildInput(inp, state)
    const mode = this.buildMode
    const build = mode ? encodeBuild(mode.kind, mode.rot, mode.material) : 0
    this.predictor.builds.serverTick = this.estimatedServerTick(now)

    // Ticks fixos de simulação/predição
    this.accumulator += frameDt * this.tickScale
    const cmds: InputCommand[] = []
    const viewTick = this.viewTick(now)
    while (this.accumulator >= this.dt) {
      if (cmds.length >= MAX_TICKS_PER_FRAME) {
        this.accumulator = 0
        break
      }
      cmds.push(this.predictor.predict({ forward: inp.forward, right: inp.right, yaw: this.yaw, pitch: this.pitch, buttons: inp.buttons, slot: this.selectedSlot, viewTick, build }))
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
    const slot = state.selected === PICKAXE_SLOT ? { item: ITEM.Pickaxe, rarity: 0 } : state.slots[state.selected]
    this.local.root.visible = state.alive
    // no modo construção as mãos ficam livres (a peça é o "item")
    if (this.buildMode) this.local.setHeld(NO_ITEM, 0)
    else this.local.setHeld(slot.item, slot.rarity)
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
        r.model.setName(r.name, this.isMate(id))
        this.world.scene.add(r.model.root)
      }
      r.model.setHeld(this.sampled.weapon, this.sampled.rarity)
      r.model.update(this.sampled, frameDt)
    }

    // Câmera: o próprio personagem, ou alguém em jogo (espectador)
    let camTarget: { x: number; y: number; z: number } = p
    let camFlags = c.flags
    if (!state.alive) {
      const other = this.spectateTarget()
      if (other) {
        camTarget = other.root.position
        camFlags = CharFlag.Grounded
      }
    }
    const w = this.buildMode ? undefined : weaponDef(slot.item)
    this.cam.setAimFov(w ? w.aimFov : null)
    this.cam.update(camTarget, camFlags, this.yaw, this.pitch, this.map.world, frameDt)
    this.focus.set(camTarget.x, camTarget.y, camTarget.z)
    this.world.update(this.focus, this.cam.camera, this.elapsed)
    this.items.update(frameDt, this.focus, this.elapsed)
    const serverTickNow = this.estimatedServerTick(now)
    this.buildings.update(serverTickNow, this.predictor.builds.version)
    this.zoneNow = this.stage ? zoneCircleAt(this.stage, serverTickNow, this.zoneScratch) : null
    this.zoneView.update(this.zoneNow, this.map.def.waterLevel, this.elapsed)
    this.airship.update(this.route, serverTickNow, frameDt)
    const overlay = this.gameMode === GameMode.BattleRoyale
      ? { zone: this.zoneNow, next: this.stage ? { x: this.stage.toX, z: this.stage.toZ, r: this.stage.toR } : null, route: this.phase <= MatchPhase.Airship || (c.flags & CharFlag.Riding) !== 0 ? this.route : null }
      : null
    this.minimap.battle = overlay
    this.fullmap.battle = overlay
    this.updateGhost(state)
    this.updateTarget()
    // Tela dividida: cada jogador desenha só na sua metade
    const vp = this.deps.viewport?.()
    const size = vp ? tmpSize.set(vp.w, vp.h) : this.deps.renderer.getSize(tmpSize)
    this.effects.update(frameDt, this.cam.camera, size.x, size.y)
    const f = this.cam.forward
    if (this.deps.listener !== false) this.deps.audio.setListener(this.cam.camera.position.x, this.cam.camera.position.y, this.cam.camera.position.z, f.x, f.y, f.z)
    this.updateHud(size.y)
    const r = this.deps.renderer
    if (vp) {
      r.setScissorTest(true)
      r.setViewport(vp.x, vp.y, vp.w, vp.h)
      r.setScissor(vp.x, vp.y, vp.w, vp.h)
    }
    r.render(this.world.scene, this.cam.camera)
    if (vp) r.setScissorTest(false)
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
    const slot = state.selected === PICKAXE_SLOT ? null : state.slots[state.selected]
    const def = slot && !this.buildMode ? itemDef(slot.item) : undefined
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
    if (w && slot && state.reloadTimer > 0) progress = { label: 'Recarregando', value: 1 - state.reloadTimer / (w.reloadTime * (RARITIES[slot.rarity]?.reload ?? 1)) }
    else if (def?.kind === 'consumable' && state.useTimer > 0) progress = { label: `Usando ${def.name}`, value: 1 - state.useTimer / def.useTime }

    const mm = state.alive ? s : this.focus
    const matePos: { x: number; z: number }[] = []
    for (const [id, r] of this.remotes) if (r.model && this.isMate(id)) matePos.push({ x: r.model.root.position.x, z: r.model.root.position.z })
    this.minimap.mates = matePos
    this.fullmap.mates = matePos
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
      build: this.buildMode && state.alive ? { kind: this.buildMode.kind, material: this.buildMode.material, blocked: this.ghostBlocked } : null,
      target: this.target,
      br: this.battleHud(state),
      team: this.teamMode ? this.mates.map((m) => ({ name: this.nameOf(m.id), health: m.health, shield: m.shield, alive: m.alive })) : null,
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
        construções: `${this.predictor.builds.buildings.count} (${this.buildings.drawn} caixas) · recusadas ${this.predictor.builds.rejected}`,
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
      playerId: this.playerId,
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
      pieces: this.predictor.builds.buildings.count,
      predictedPieces: [...this.predictor.builds.buildings.byId.values()].filter((p) => p.predicted).length,
      rejectedPieces: this.predictor.builds.rejected,
      drawnPieces: this.buildings.drawn,
      build: this.buildMode ? { ...this.buildMode, ghost: this.ghost, blocked: this.ghostBlocked } : null,
      materials: [...st.materials],
      destroyedProps: this.destroyedProps,
      harvested: this.harvested,
      target: this.target,
      gameMode: this.gameMode,
      phase: this.phase,
      zone: this.zoneNow ? { ...this.zoneNow } : null,
      outsideZone: !!this.zoneNow && distanceOutside(this.zoneNow, s.x, s.z) > 0,
      airship: (s.flags & CharFlag.Riding) !== 0,
      result: this.result,
      spectating: st.alive ? null : this.remotes.get(this.spectateId)?.name ?? null,
      team: this.myTeam,
      mates: this.mates.map((m) => ({ ...m, name: this.nameOf(m.id) })),
    }
  }

  /** `closeSession` falso: a conexão continua (volta à sala de espera). */
  dispose(closeSession = true): void {
    this.ended = true
    if (closeSession) this.session.close()
    else this.session.detachMatch()
    for (const id of [...this.remotes.keys()]) this.removeRemote(id)
    this.local.dispose()
    this.items.dispose()
    this.buildings.dispose()
    this.zoneView.dispose()
    this.airship.dispose()
    this.effects.dispose()
    this.minimap.el.remove()
    this.fullmap.el.remove()
    this.deps.hud.setDeath(null)
    this.world.dispose()
  }
}
