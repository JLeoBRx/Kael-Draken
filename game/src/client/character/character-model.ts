import * as THREE from 'three'
import { clamp, damp, dampAngle, wrapAngle } from '../../shared/math/scalar'
import { CharFlag } from '../../shared/movement/character'
import { ITEM, itemDef } from '../../shared/config/items'
import { buildItemModel, buildPickaxeModel, buildWeaponModel } from '../render/item-models'
import { textTexture } from '../render/textures'
import { instantiateCharacter } from './character-assets'
import { GAIT_CLIPS, SWING_TIME, type BoneName, type ClipName } from './rig'

/**
 * Personagem com esqueleto e animação por clipes (AnimationMixer):
 *
 * - Camada de baixo (corpo, quadril, coluna, pernas): mistura de parado,
 *   andar, correr e disparar pela velocidade; agachado; e por cima, deslize,
 *   no ar, nado, queda livre e planador, com transições suaves.
 * - Camada dos braços: soltos/balançando, segurando arma, mirando,
 *   picareta e o golpe (clipe de uma vez); nado, queda livre e planador
 *   mandam também nos braços.
 * - Clipes de passada tocam pela FASE da passada (que anda com a velocidade
 *   real), então andar e correr se misturam sem os pés escorregarem.
 * - Por cima dos clipes: a mira (pitch) inclina coluna, cabeça e braços, e o
 *   quadril vira para o lado do deslocamento.
 *
 * Os clipes e a malha vêm de character-assets (GLB ou gerado em código).
 */

export interface CharacterSkin {
  name: string
  suit: number
  armor: number
  accent: number
  visor: number
  dark: number
}

/** Boneco de treino do estande de tiro. */
export const DUMMY_SKIN: CharacterSkin = { name: 'Boneco', suit: 0xd9d4c7, armor: 0xd8572f, accent: 0xffffff, visor: 0x2a2a2a, dark: 0x5b4636 }

export const SKINS: readonly CharacterSkin[] = [
  { name: 'Vanguarda', suit: 0x2f3b4a, armor: 0xe8743b, accent: 0x2fd3c4, visor: 0x1c2a33, dark: 0x1b1f24 },
  { name: 'Brasa', suit: 0x3a2b2b, armor: 0xc9423a, accent: 0xffb347, visor: 0x2a1a1a, dark: 0x1d1414 },
  { name: 'Musgo', suit: 0x3b4632, armor: 0x8aa05a, accent: 0xf2e86d, visor: 0x1f2a1a, dark: 0x161b12 },
  { name: 'Geada', suit: 0x3d4a5c, armor: 0xd6e4ef, accent: 0x6cc8ff, visor: 0x18324a, dark: 0x1a222c },
  { name: 'Areia', suit: 0x5a4a38, armor: 0xd8b77a, accent: 0xff7a2f, visor: 0x3a2c1c, dark: 0x251d14 },
  { name: 'Neon', suit: 0x262338, armor: 0x7c5cff, accent: 0x39f5a8, visor: 0x14112a, dark: 0x120f1e },
  { name: 'Cobalto', suit: 0x1f2f4f, armor: 0x2f6fd6, accent: 0xffd23f, visor: 0x0f1a30, dark: 0x0d1424 },
  { name: 'Grafite', suit: 0x2b2d31, armor: 0x6d737c, accent: 0xff4f6d, visor: 0x15171a, dark: 0x111214 },
]

/** Entrada da animação: o mesmo para o jogador local e os remotos. */
export interface PoseInput {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Yaw da mira (câmera). */
  yaw: number
  pitch: number
  flags: number
}

/** Clipes que mexem também nos braços (a camada dos braços cede a eles). */
const FULL_BODY: readonly ClipName[] = ['nado', 'queda-livre', 'planar']

export class CharacterModel {
  readonly root = new THREE.Group()
  private readonly object: THREE.Object3D
  private readonly mixer: THREE.AnimationMixer
  private readonly actions = new Map<ClipName, THREE.AnimationAction>()
  private readonly bones = {} as Record<BoneName, THREE.Bone>
  private readonly ownMaterials: THREE.Material[] = []
  private readonly geometries: THREE.BufferGeometry[] = []
  private nameplate: THREE.Sprite | null = null
  /** Arma/item na mão (preso ao peito, apontado para a mira). */
  private held: THREE.Object3D | null = null
  private heldKey = ''
  private heldIsWeapon = false
  private heldIsTool = false
  private holdW = 0
  private toolW = 0
  /** Progresso do golpe de picareta (0–1; ≥ 1 = parado). */
  private swingT = 1

  // estado da animação
  private phase = 0
  private speed = 0
  private crouchW = 0
  private slideW = 0
  private airW = 0
  private aimW = 0
  private swimW = 0
  private skyW = 0
  private glideW = 0
  private sprintW = 0
  private readonly glider: THREE.Group
  private bodyYaw = 0
  private legYaw = 0
  private initialized = false
  private readonly weights = new Map<ClipName, number>()

  constructor(readonly skin: CharacterSkin) {
    const inst = instantiateCharacter(skin)
    this.object = inst.object
    this.root.add(this.object)
    this.object.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones[o.name as BoneName] = o as THREE.Bone
    })
    this.mixer = new THREE.AnimationMixer(this.object)
    for (const clip of inst.clips) {
      const a = this.mixer.clipAction(clip)
      a.setEffectiveWeight(0)
      a.play()
      // tudo é posicionado à mão (fase da passada, progresso do golpe), menos a respiração
      a.timeScale = clip.name === 'parado' ? 1 : 0
      this.actions.set(clip.name as ClipName, a)
    }

    // Planador (aparece ao abrir): asa em arco sobre a cabeça, presa por cabos
    this.glider = new THREE.Group()
    const canopy = this.track(new THREE.MeshStandardMaterial({ color: skin.armor, roughness: 0.55, side: THREE.DoubleSide }))
    const stripe = this.track(new THREE.MeshStandardMaterial({ color: skin.accent, roughness: 0.5, side: THREE.DoubleSide }))
    const wing = this.geo(new THREE.CylinderGeometry(2.3, 2.3, 1.5, 20, 1, true, -1.0, 2.0).rotateX(Math.PI / 2).rotateZ(Math.PI / 2))
    const wingMesh = new THREE.Mesh(wing, canopy)
    wingMesh.position.y = 0.2
    const band = this.geo(new THREE.CylinderGeometry(2.32, 2.32, 0.3, 20, 1, true, -1.0, 2.0).rotateX(Math.PI / 2).rotateZ(Math.PI / 2))
    const bandMesh = new THREE.Mesh(band, stripe)
    bandMesh.position.y = 0.2
    this.glider.add(wingMesh, bandMesh)
    const cableMat = this.track(new THREE.MeshStandardMaterial({ color: 0x222222 }))
    for (const side of [-1, 1]) {
      const cable = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.012, 0.012, 1.9, 4)), cableMat)
      cable.position.set(side * 0.75, -0.75, 0)
      cable.rotation.z = side * 0.45
      this.glider.add(cable)
    }
    this.glider.position.set(0, 2.9, 0)
    this.glider.visible = false
    this.root.add(this.glider)
  }

  private track<T extends THREE.Material>(m: T): T {
    this.ownMaterials.push(m)
    return m
  }

  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.push(g)
    return g
  }

  /** Placa de nome; colegas de equipe aparecem em verde e por cima das paredes. */
  setName(name: string, teammate = false): void {
    if (this.nameplate) {
      this.root.remove(this.nameplate)
      this.nameplate.material.map?.dispose()
      this.nameplate.material.dispose()
    }
    const { texture, aspect } = textTexture(teammate ? `◆ ${name}` : name, { height: 64, bg: teammate ? 'rgba(20,90,50,0.75)' : 'rgba(10,12,16,0.6)', fg: teammate ? '#c9ffd9' : undefined })
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, depthTest: !teammate, toneMapped: false }))
    sprite.scale.set(0.32 * aspect, 0.32, 1)
    sprite.position.set(0, 2.25, 0)
    sprite.renderOrder = 10
    this.nameplate = sprite
    this.root.add(sprite)
  }

  private lodCounter = Math.floor(Math.random() * 3)
  private pendingDt = 0

  /**
   * Atualiza posição e animação. `dt` em segundos de quadro. `every` > 1:
   * animação só a cada N quadros (personagens longe), com o tempo acumulado;
   * a posição anda em todos.
   */
  update(p: PoseInput, dt: number, every = 1): void {
    if (every > 1 && this.initialized && ++this.lodCounter % every !== 0) {
      this.pendingDt += dt
      this.root.position.set(p.x, p.y, p.z)
      return
    }
    dt += this.pendingDt
    this.pendingDt = 0
    const grounded = (p.flags & CharFlag.Grounded) !== 0
    const crouched = (p.flags & CharFlag.Crouched) !== 0
    const sliding = (p.flags & CharFlag.Sliding) !== 0
    const swimming = (p.flags & CharFlag.Swimming) !== 0
    const aiming = (p.flags & CharFlag.Aiming) !== 0
    const hs = Math.hypot(p.vx, p.vz)
    if (!this.initialized) {
      this.bodyYaw = p.yaw
      this.initialized = true
    }

    this.root.position.set(p.x, p.y, p.z)
    this.speed = damp(this.speed, hs, 12, dt)
    this.crouchW = damp(this.crouchW, crouched && !sliding ? 1 : 0, 14, dt)
    this.slideW = damp(this.slideW, sliding ? 1 : 0, 16, dt)
    this.airW = damp(this.airW, !grounded && !swimming ? 1 : 0, 10, dt)
    this.aimW = damp(this.aimW, aiming ? 1 : 0, 14, dt)
    this.holdW = damp(this.holdW, this.heldIsWeapon ? 1 : 0, 10, dt)
    this.toolW = damp(this.toolW, this.heldIsTool ? 1 : 0, 10, dt)
    this.sprintW = damp(this.sprintW, p.flags & CharFlag.Sprinting ? 1 : 0, 8, dt)
    if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + dt / SWING_TIME)
    this.swimW = damp(this.swimW, swimming ? 1 : 0, 6, dt)
    const riding = (p.flags & CharFlag.Riding) !== 0
    this.skyW = damp(this.skyW, p.flags & CharFlag.Skydiving ? 1 : 0, 6, dt)
    this.glideW = damp(this.glideW, p.flags & CharFlag.Gliding ? 1 : 0, 6, dt)
    // a bordo do dirigível o personagem não aparece (está dentro)
    this.object.visible = !riding
    if (this.nameplate) this.nameplate.visible = !riding
    this.glider.visible = this.glideW > 0.02
    this.glider.scale.setScalar(Math.max(0.01, this.glideW))

    // Orientação: o corpo acompanha a mira; parado, só gira quando a diferença é grande
    const moving = hs > 0.4
    const diff = wrapAngle(p.yaw - this.bodyYaw)
    if (moving || aiming || Math.abs(diff) > 1.0) this.bodyYaw = dampAngle(this.bodyYaw, p.yaw, moving || aiming ? 14 : 5, dt)
    this.root.rotation.y = this.bodyYaw

    // Direção do movimento relativa ao corpo (pernas viram para o lado do deslocamento)
    let rel = 0
    let backwards = false
    if (moving && !sliding) {
      const moveYaw = Math.atan2(-p.vx, -p.vz)
      rel = wrapAngle(moveYaw - this.bodyYaw)
      if (Math.abs(rel) > Math.PI / 2 + 0.2) {
        backwards = true
        rel = wrapAngle(rel + Math.PI)
      }
    }
    this.legYaw = dampAngle(this.legYaw, clamp(rel, -0.9, 0.9), 10, dt)

    // fase da passada: anda com a velocidade real (dois passos por ciclo)
    const sp = this.speed
    const stride = 1.1 + clamp((sp - 1) / 7, 0, 1) * 1.3
    if (grounded || swimming) this.phase += ((sp / stride) * dt * (backwards ? -1 : 1) * (swimming ? 0.6 : 1)) / 2

    this.applyWeights(sp)
    const u = ((this.phase % 1) + 1) % 1
    for (const name of GAIT_CLIPS) {
      const a = this.actions.get(name)
      if (a) a.time = u * a.getClip().duration
    }
    const golpe = this.actions.get('golpe')
    if (golpe) golpe.time = Math.min(0.999, this.swingT) * golpe.getClip().duration
    this.mixer.update(dt)
    this.overlay(p)

    if (this.held && this.heldIsTool) {
      // na mão direita: o cabo sai do punho para a frente
      this.held.position.set(0, -0.27, 0)
      this.held.rotation.set(-0.25, 0, 0)
    } else if (this.held) {
      // transporte: apontada para a frente e um pouco para baixo; mirando: na linha da mira
      const a = this.aimW
      this.held.position.set(0.17 + 0.03 * (1 - a), -0.12 * (1 - a) + 0.07 * a, -0.24 - 0.06 * a)
      this.held.rotation.set(-0.45 * (1 - a) + p.pitch * 0.75 * a, 0.05 * (1 - a), 0)
    }
  }

  /** Pesos das duas camadas a partir dos estados suavizados (cada camada soma 1). */
  private applyWeights(sp: number): void {
    const W = this.weights
    W.clear()
    const add = (n: ClipName, w: number) => W.set(n, (W.get(n) ?? 0) + w)
    const scale = (k: number) => {
      for (const [n, w] of W) W.set(n, w * k)
    }
    // ---- camada de baixo: locomoção de pé ou agachado
    const walkT = clamp(sp / 2.2, 0, 1)
    const runT = clamp((sp - 2.4) / 2.6, 0, 1)
    const sprintT = runT * this.sprintW
    const stand = 1 - this.crouchW
    add('parado', stand * (1 - walkT))
    add('andar', stand * walkT * (1 - runT))
    add('correr', stand * walkT * runT * (1 - sprintT))
    add('disparar', stand * walkT * runT * sprintT)
    const cw = clamp(sp / 1.4, 0, 1)
    add('agachado', this.crouchW * (1 - cw))
    add('agachado-andar', this.crouchW * cw)
    // estados que tomam o lugar (cada um sobre o anterior)
    const over = (n: ClipName, w: number) => {
      if (w <= 0.001) return
      scale(1 - w)
      add(n, w)
    }
    over('deslize', this.slideW)
    over('ar', this.airW * (1 - this.slideW) * (1 - this.swimW))
    over('nado', this.swimW)
    over('queda-livre', this.skyW)
    over('planar', this.glideW)
    let fullBody = 0
    for (const n of FULL_BODY) fullBody += W.get(n) ?? 0
    const lower = new Map(W)

    // ---- camada dos braços
    W.clear()
    const swingArms = clamp(sp / 2.0, 0, 1) * (1 - this.crouchW * 0.6) * (1 - this.slideW)
    add('bracos-andar', swingArms * clamp(sp / 5, 0.35, 1))
    add('bracos-soltos', 1 - (W.get('bracos-andar') ?? 0))
    over('segurar-arma', this.holdW)
    const swinging = this.swingT < 1 ? 1 : 0
    over('picareta', this.toolW * (1 - swinging))
    over('golpe', this.toolW * swinging)
    over('mirar', this.aimW * (1 - this.toolW))
    scale(1 - fullBody)

    for (const [name, action] of this.actions) {
      const w = (lower.get(name) ?? 0) + (W.get(name) ?? 0)
      // clipe sem peso não é avaliado (com 17 clipes, a maioria está parada)
      action.enabled = w > 0.0005
      action.setEffectiveWeight(w)
    }
  }

  /** Ajustes por cima dos clipes: mira e giro do quadril. */
  private overlay(p: PoseInput): void {
    const b = this.bones
    const body = 1 - Math.max(this.swimW, this.skyW)
    if (b.quadril) b.quadril.rotateY(this.legYaw * (1 - this.slideW))
    if (b.coluna) {
      b.coluna.rotateY(-this.legYaw * 0.8 * (1 - this.slideW))
      b.coluna.rotateX(p.pitch * 0.25 * this.aimW * body)
    }
    if (b.pescoco) b.pescoco.rotateX(clamp(p.pitch, -0.9, 0.9) * 0.55 * body)
    const armPitch = clamp(p.pitch, -1.1, 1.1) * this.aimW * (1 - this.toolW) * body
    if (b.ombro_E) b.ombro_E.rotateX(armPitch)
    if (b.ombro_D) b.ombro_D.rotateX(armPitch)
  }

  /** Troca o que está na mão (arma ou consumível). `item` 255 = mãos vazias. */
  setHeld(item: number, rarity: number): void {
    const key = `${item}:${rarity}`
    if (key === this.heldKey) return
    this.heldKey = key
    if (this.held) {
      this.held.removeFromParent()
      this.held.traverse((o) => (o as THREE.Mesh).geometry?.dispose())
      this.held = null
    }
    const def = itemDef(item)
    this.heldIsWeapon = def?.kind === 'weapon'
    this.heldIsTool = item === ITEM.Pickaxe
    if (this.heldIsTool) {
      this.held = buildPickaxeModel()
      this.bones.cotovelo_D?.add(this.held)
      return
    }
    if (!def) return
    const obj = def.kind === 'weapon' ? buildWeaponModel(item, rarity) : buildItemModel(item, rarity)
    if (def.kind !== 'weapon') obj.scale.setScalar(0.7)
    this.held = obj
    this.bones.peito?.add(obj)
  }

  /** Golpe de picareta (animação; o efeito vem da simulação). */
  swing(): void {
    this.swingT = 0
  }

  /** Posição da boca do cano no mundo (ou do peito, sem arma). */
  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    if (this.held && this.heldIsWeapon && this.held.userData.muzzle) {
      this.root.updateMatrixWorld(true)
      return this.held.localToWorld(out.copy(this.held.userData.muzzle as THREE.Vector3))
    }
    const chest = this.bones.peito ?? this.root
    chest.updateMatrixWorld(true)
    return chest.localToWorld(out.set(0.2, 0.05, -0.3))
  }

  /** Para testes: peso atual de cada clipe. */
  clipWeights(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [n, a] of this.actions) if (a.getEffectiveWeight() > 0.001) out[n] = Number(a.getEffectiveWeight().toFixed(3))
    return out
  }

  dispose(): void {
    this.setHeld(255, 0)
    this.mixer.stopAllAction()
    this.mixer.uncacheRoot(this.object)
    for (const g of this.geometries) g.dispose()
    for (const m of this.ownMaterials) m.dispose()
    if (this.nameplate) {
      this.nameplate.material.map?.dispose()
      this.nameplate.material.dispose()
    }
    this.root.removeFromParent()
  }
}
