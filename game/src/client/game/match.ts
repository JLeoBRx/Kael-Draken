import * as THREE from 'three'
import { MOVE } from '../../shared/config/movement'
import { loadMap, regionAt } from '../../shared/maps'
import type { GameMap } from '../../shared/maps/types'
import { clamp, lerp } from '../../shared/math/scalar'
import { CharFlag } from '../../shared/movement/character'
import type { EntityState, InputCommand, Snapshot } from '../../shared/net/protocol'
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

/**
 * Uma partida em andamento do ponto de vista do cliente.
 *
 * Ciclo por quadro:
 *  1. lê a entrada; a câmera gira imediatamente (taxa de quadros);
 *  2. a cada tick fixo (30/s) cria um comando, prevê o movimento local e o envia;
 *  3. desenha o jogador local interpolado entre os dois últimos ticks
 *     previstos e os remotos ~100 ms no passado, entre snapshots;
 *  4. atualiza câmera, sombras, HUD e renderiza.
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
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

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
  private yaw = 0
  private pitch = 0
  private accumulator = 0
  private tickScale = 1
  private serverTick = 0
  private elapsed = 0
  private fps = 60
  private lastFrameAt = 0
  private ended = false
  private readonly focus = new THREE.Vector3()
  private readonly pose: PoseInput = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, flags: 0 }
  private readonly sampled: EntityState = { id: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, vx: 0, vy: 0, vz: 0 }
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
    this.predictor = new Predictor(map.world, this.dt)
    this.local = new CharacterModel(SKINS[0])
    this.world.scene.add(this.local.root)

    session.setHandlers({
      onSnapshot: (s, at) => this.onSnapshot(s, at),
      onPlayerInfo: (id, n, skin) => this.onPlayerInfo(id, n, skin),
      onPlayerLeft: (id) => {
        this.roster.delete(id)
        this.removeRemote(id)
      },
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
          this.yaw = this.predictor.state.yaw
          this.pitch = 0
          resolve()
        } else if (this.ended || this.session.closedReason) reject(new Error(this.session.closedReason ?? 'Conexão encerrada'))
        else if (performance.now() - t0 > timeoutMs) reject(new Error('O servidor não enviou o estado inicial'))
        else setTimeout(check, 20)
      }
      check()
    })
  }

  private onSnapshot(s: Snapshot, at: number): void {
    this.clock.observe(s.tick, this.tickRate, at)
    this.serverTick = s.tick
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

  get playerCount(): number {
    return Math.max(this.roster.size, 1 + this.remotes.size)
  }

  setAspect(aspect: number): void {
    this.cam.setAspect(aspect)
  }

  applySettings(s: Settings): void {
    this.cam.setBaseFov(s.fov)
  }

  frame(frameDt: number, now: number): void {
    if (this.ended) return
    this.elapsed += frameDt
    // FPS medido pelo relógio real (o dt do quadro é limitado a 0,1 s)
    if (this.lastFrameAt > 0) this.fps = lerp(this.fps, 1000 / Math.max(now - this.lastFrameAt, 1), 0.1)
    this.lastFrameAt = now
    const state = this.predictor.state
    const inp = this.deps.input.sample(frameDt, (state.flags & CharFlag.Aiming) !== 0)
    this.yaw += inp.lookYaw
    this.pitch = clamp(this.pitch + inp.lookPitch, -MOVE.maxPitch, MOVE.maxPitch)

    // Ticks fixos de simulação/predição
    this.accumulator += frameDt * this.tickScale
    const cmds: InputCommand[] = []
    while (this.accumulator >= this.dt) {
      if (cmds.length >= MAX_TICKS_PER_FRAME) {
        this.accumulator = 0
        break
      }
      cmds.push(this.predictor.predict({ forward: inp.forward, right: inp.right, yaw: this.yaw, pitch: this.pitch, buttons: inp.buttons }))
      this.accumulator -= this.dt
    }
    if (cmds.length > 0) {
      this.deps.input.consumeTickLatch()
      this.session.sendInputs(cmds)
    }

    // Jogador local: entre os dois últimos ticks previstos + suavização de correções
    const alpha = this.accumulator / this.dt
    const prev = this.predictor.prev
    const off = this.predictor.offset
    this.predictor.decayOffset(frameDt)
    const p = this.pose
    p.x = lerp(prev.x, state.x, alpha) + off.x
    p.y = lerp(prev.y, state.y, alpha) + off.y
    p.z = lerp(prev.z, state.z, alpha) + off.z
    p.vx = state.vx
    p.vy = state.vy
    p.vz = state.vz
    p.yaw = this.yaw
    p.pitch = this.pitch
    p.flags = state.flags
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
      r.model.update(this.sampled, frameDt)
    }

    this.cam.update(p, state.flags, this.yaw, this.pitch, this.map.world, frameDt)
    this.focus.set(p.x, p.y, p.z)
    this.world.update(this.focus, this.cam.camera, this.elapsed)
    this.updateHud()
    this.deps.renderer.render(this.world.scene, this.cam.camera)
  }

  private updateHud(): void {
    const s = this.predictor.state
    const f = s.flags
    const hs = Math.hypot(s.vx, s.vz)
    const region = regionAt(this.map, s.x, s.z)
    const swimming = (f & CharFlag.Swimming) !== 0
    const rtt = this.session.rttMs
    const local = this.session.transport.kind === 'local'
    const heading = ((-this.yaw * 180) / Math.PI) % 360
    this.deps.hud.update({
      fps: this.fps,
      pingMs: local ? 0 : rtt,
      modeLabel: this.modeLabel,
      connection: local || rtt < 120 ? 'ok' : rtt < 250 ? 'warn' : 'bad',
      players: this.playerCount,
      region: region?.name ?? (swimming ? 'Mar aberto' : 'Campo aberto'),
      mapName: this.map.def.name,
      heading,
      x: s.x,
      y: s.y,
      z: s.z,
      speed: hs,
      flags: {
        grounded: (f & CharFlag.Grounded) !== 0,
        crouched: (f & CharFlag.Crouched) !== 0,
        sliding: (f & CharFlag.Sliding) !== 0,
        sprinting: (f & CharFlag.Sprinting) !== 0,
        aiming: (f & CharFlag.Aiming) !== 0,
        swimming,
      },
      spread: (f & CharFlag.Aiming ? 2 : 6) + Math.min(hs, 10) * 1.2 + (f & CharFlag.Grounded ? 0 : 8),
      debug: {
        modo: this.modeLabel,
        'tick servidor': this.serverTick,
        'ping (ms)': local ? 'local' : rtt.toFixed(0),
        'fps': this.fps.toFixed(0),
        posição: `${s.x.toFixed(2)} ${s.y.toFixed(2)} ${s.z.toFixed(2)}`,
        'velocidade': `${hs.toFixed(2)} m/s · vy ${s.vy.toFixed(2)}`,
        'pendentes': this.predictor.pendingCount,
        'correções': this.predictor.corrections,
        'último erro': `${(this.predictor.lastError * 100).toFixed(1)} cm`,
        'entidades': this.remotes.size,
        'rede in/out': `${(this.session.bytesIn / 1024).toFixed(0)} / ${(this.session.bytesOut / 1024).toFixed(0)} KiB`,
        'draw calls': this.deps.renderer.info.render.calls,
        'triângulos': this.deps.renderer.info.render.triangles,
      },
    }, this.deps.settings.showFps)
  }

  debugState(): DebugState {
    const s = this.predictor.state
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
    }
  }

  dispose(): void {
    this.ended = true
    this.session.close()
    for (const id of [...this.remotes.keys()]) this.removeRemote(id)
    this.local.dispose()
    this.world.dispose()
  }
}
