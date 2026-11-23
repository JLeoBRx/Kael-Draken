import * as THREE from 'three'
import { clamp, damp, dampAngle, lerp, wrapAngle } from '../../shared/math/scalar'
import { CharFlag } from '../../shared/movement/character'
import { ITEM, itemDef } from '../../shared/config/items'
import { buildItemModel, buildPickaxeModel, buildWeaponModel } from '../render/item-models'
import { textTexture } from '../render/textures'

/**
 * Personagem procedural ("Vanguarda"): corpo articulado em hierarquia de
 * juntas, com animação procedural de locomoção, agachar, deslizar, pular,
 * nadar e mirar.
 *
 * É um placeholder organizado: a interface pública (setPose/update) é o que
 * a partida usa; um modelo GLTF com esqueleto e animações (Fase 7)
 * implementa a mesma interface sem mudar o resto do jogo.
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
/** Duração da animação do golpe de picareta (s). */
const SWING_TIME = 0.42

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

type Joint = THREE.Object3D

function mat(color: number, roughness = 0.7, metalness = 0, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity: emissive ? 0.6 : 0 })
}

function capsule(r: number, len: number, m: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 10), m)
}

export class CharacterModel {
  readonly root = new THREE.Group()
  private readonly body = new THREE.Group()
  private readonly hips = new THREE.Group()
  private readonly spine = new THREE.Group()
  private readonly chest = new THREE.Group()
  private readonly neck = new THREE.Group()
  private readonly shoulder: [Joint, Joint]
  private readonly elbow: [Joint, Joint]
  private readonly hip: [Joint, Joint]
  private readonly knee: [Joint, Joint]
  private readonly materials: THREE.Material[] = []
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
  private readonly glider: THREE.Group
  private bodyYaw = 0
  private legYaw = 0
  private initialized = false

  constructor(readonly skin: CharacterSkin) {
    const suit = this.track(mat(skin.suit, 0.85))
    const armor = this.track(mat(skin.armor, 0.5, 0.1))
    const accent = this.track(mat(skin.accent, 0.4, 0, skin.accent))
    const visor = this.track(mat(skin.visor, 0.15, 0.6))
    const dark = this.track(mat(skin.dark, 0.8))

    this.root.add(this.body)
    this.body.add(this.hips)
    // Planador (aparece ao abrir): asa em arco sobre a cabeça, presa por cabos
    this.glider = new THREE.Group()
    const canopy = this.track(new THREE.MeshStandardMaterial({ color: skin.armor, roughness: 0.55, side: THREE.DoubleSide }))
    const stripe = this.track(new THREE.MeshStandardMaterial({ color: skin.accent, roughness: 0.5, side: THREE.DoubleSide }))
    const wing = new THREE.CylinderGeometry(2.3, 2.3, 1.5, 20, 1, true, -1.0, 2.0).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)
    this.geometries.push(wing)
    const wingMesh = new THREE.Mesh(wing, canopy)
    wingMesh.position.y = 0.2
    const band = new THREE.CylinderGeometry(2.32, 2.32, 0.3, 20, 1, true, -1.0, 2.0).rotateX(Math.PI / 2).rotateZ(Math.PI / 2)
    this.geometries.push(band)
    const bandMesh = new THREE.Mesh(band, stripe)
    bandMesh.position.y = 0.2
    this.glider.add(wingMesh, bandMesh)
    const cableMat = this.track(new THREE.MeshStandardMaterial({ color: 0x222222 }))
    for (const side of [-1, 1]) {
      const g = new THREE.CylinderGeometry(0.012, 0.012, 1.9, 4)
      this.geometries.push(g)
      const cable = new THREE.Mesh(g, cableMat)
      cable.position.set(side * 0.75, -0.75, 0)
      cable.rotation.z = side * 0.45
      this.glider.add(cable)
    }
    this.glider.position.set(0, 2.9, 0)
    this.glider.visible = false
    this.root.add(this.glider)
    this.hips.position.set(0, 0.98, 0)

    // Quadril e cinto
    this.addMesh(this.hips, new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.22), suit), 0, 0, 0)
    this.addMesh(this.hips, new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.24), dark), 0, 0.08, 0)
    this.addMesh(this.hips, new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.04), accent), 0, 0.08, -0.125)

    // Coluna → peito
    this.hips.add(this.spine)
    this.spine.position.set(0, 0.1, 0)
    this.spine.add(this.chest)
    this.chest.position.set(0, 0.2, 0)
    const torso = capsule(0.17, 0.22, suit)
    torso.scale.set(1.18, 1, 0.78)
    this.addMesh(this.chest, torso, 0, 0.02, 0)
    // colete
    this.addMesh(this.chest, new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.3), armor), 0, 0.04, 0)
    this.addMesh(this.chest, new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.02), accent), 0, 0.12, -0.155)
    // mochila
    this.addMesh(this.chest, new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.17), dark), 0, 0.02, 0.23)
    this.addMesh(this.chest, new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.04), accent), 0, 0.14, 0.32)
    this.addMesh(this.chest, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.34, 8).rotateZ(Math.PI / 2), armor), 0, -0.2, 0.25)

    // Cabeça com capacete e viseira
    this.chest.add(this.neck)
    this.neck.position.set(0, 0.25, 0)
    this.addMesh(this.neck, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), suit), 0, 0.03, 0)
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.145, 18, 14), armor)
    helmet.scale.set(1, 1.08, 1.05)
    this.addMesh(this.neck, helmet, 0, 0.16, 0)
    // faixa da esfera centrada em phi = 1,5π (frente, -Z), na altura dos olhos
    const visorMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 10, Math.PI * 1.12, Math.PI * 0.76, Math.PI * 0.34, Math.PI * 0.26), visor)
    visorMesh.scale.set(1.04, 1.08, 1.1)
    this.addMesh(this.neck, visorMesh, 0, 0.16, -0.012)
    this.addMesh(this.neck, new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.24), accent), 0, 0.3, 0.02)

    // Braços
    const makeArm = (side: 1 | -1): [Joint, Joint] => {
      const sh = new THREE.Group()
      sh.position.set(0.25 * side, 0.12, 0)
      this.chest.add(sh)
      this.addMesh(sh, new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), armor), 0, 0, 0)
      this.addMesh(sh, capsule(0.055, 0.2, suit), 0, -0.15, 0)
      const el = new THREE.Group()
      el.position.set(0, -0.29, 0)
      sh.add(el)
      this.addMesh(el, capsule(0.05, 0.18, suit), 0, -0.12, 0)
      this.addMesh(el, new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.11), armor), 0, -0.06, 0)
      this.addMesh(el, new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), dark), 0, -0.27, 0)
      return [sh, el]
    }
    const [shL, elL] = makeArm(-1)
    const [shR, elR] = makeArm(1)
    this.shoulder = [shL, shR]
    this.elbow = [elL, elR]

    // Pernas
    const makeLeg = (side: 1 | -1): [Joint, Joint] => {
      const hp = new THREE.Group()
      hp.position.set(0.105 * side, -0.04, 0)
      this.hips.add(hp)
      this.addMesh(hp, capsule(0.078, 0.28, suit), 0, -0.21, 0)
      this.addMesh(hp, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.06), dark), 0.07 * side, -0.2, 0)
      const kn = new THREE.Group()
      kn.position.set(0, -0.44, 0)
      hp.add(kn)
      this.addMesh(kn, new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.08), armor), 0, 0, -0.06)
      this.addMesh(kn, capsule(0.066, 0.28, suit), 0, -0.2, 0)
      this.addMesh(kn, new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.27), dark), 0, -0.43, -0.05)
      return [hp, kn]
    }
    const [hpL, knL] = makeLeg(-1)
    const [hpR, knR] = makeLeg(1)
    this.hip = [hpL, hpR]
    this.knee = [knL, knR]

    this.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
  }

  private track<T extends THREE.Material>(m: T): T {
    this.materials.push(m)
    return m
  }

  private addMesh(parent: THREE.Object3D, mesh: THREE.Mesh, x: number, y: number, z: number): void {
    mesh.position.set(x, y, z)
    parent.add(mesh)
    this.geometries.push(mesh.geometry)
  }

  /** Placa com o nome acima da cabeça (jogadores remotos). */
  setName(name: string): void {
    if (this.nameplate) {
      this.root.remove(this.nameplate)
      this.nameplate.material.map?.dispose()
      this.nameplate.material.dispose()
    }
    const { texture, aspect } = textTexture(name, { height: 64, bg: 'rgba(10,12,16,0.6)' })
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false, toneMapped: false }))
    sprite.scale.set(0.32 * aspect, 0.32, 1)
    sprite.position.set(0, 2.25, 0)
    sprite.renderOrder = 10
    this.nameplate = sprite
    this.root.add(sprite)
  }

  /** Atualiza posição e animação. `dt` em segundos de quadro. */
  update(p: PoseInput, dt: number): void {
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
    if (this.swingT < 1) this.swingT = Math.min(1, this.swingT + dt / SWING_TIME)
    this.swimW = damp(this.swimW, swimming ? 1 : 0, 6, dt)
    const riding = (p.flags & CharFlag.Riding) !== 0
    this.skyW = damp(this.skyW, p.flags & CharFlag.Skydiving ? 1 : 0, 6, dt)
    this.glideW = damp(this.glideW, p.flags & CharFlag.Gliding ? 1 : 0, 6, dt)
    // a bordo do dirigível o personagem não aparece (está dentro)
    this.body.visible = !riding
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

    const sp = this.speed
    const stride = 1.1 + clamp((sp - 1) / 7, 0, 1) * 1.3
    if (grounded || swimming) this.phase += (sp / stride) * Math.PI * dt * (backwards ? -1 : 1) * (swimming ? 0.6 : 1)
    const amp = clamp(sp / 5.2, 0, 1.3) * (1 - this.slideW) * (1 - this.swimW)
    const s = Math.sin(this.phase)
    const c = Math.cos(this.phase)

    // ---- pose base: locomoção
    let hipsY = 0.98 - Math.abs(c) * 0.035 * amp + 0.02 * amp
    let spineX = -0.1 * amp - (p.flags & CharFlag.Sprinting ? 0.12 : 0)
    const thigh = [s * 0.6 * amp, -s * 0.6 * amp]
    const kneeB = [-(Math.max(0, -c) * 1.1 * amp + 0.08), -(Math.max(0, c) * 1.1 * amp + 0.08)]
    const armX = [-s * 0.55 * amp, s * 0.55 * amp]
    // rotation.z: negativo afasta o braço esquerdo (-X) do corpo, positivo afasta o direito
    const armZ = [-0.12, 0.12]
    const elbowX = [0.25 + 0.5 * amp, 0.25 + 0.5 * amp]

    // ---- agachado
    const cw = this.crouchW
    hipsY -= 0.36 * cw
    spineX -= 0.35 * cw
    thigh[0] += 1.0 * cw
    thigh[1] += 1.0 * cw
    kneeB[0] -= 1.55 * cw
    kneeB[1] -= 1.55 * cw

    // ---- deslize: perna da frente esticada, tronco para trás
    const sw = this.slideW
    hipsY = hipsY * (1 - sw) + 0.42 * sw
    spineX = spineX * (1 - sw) + 0.45 * sw
    thigh[0] = thigh[0] * (1 - sw) + 1.35 * sw
    kneeB[0] = kneeB[0] * (1 - sw) - 0.15 * sw
    thigh[1] = thigh[1] * (1 - sw) + 0.55 * sw
    kneeB[1] = kneeB[1] * (1 - sw) - 1.7 * sw
    armZ[0] -= 0.7 * sw
    armZ[1] += 0.7 * sw

    // ---- no ar: pernas recolhidas, braços abertos
    const aw = this.airW * (1 - sw)
    const rising = clamp(p.vy / 6, -1, 1)
    thigh[0] += (0.55 + 0.2 * rising) * aw
    thigh[1] += (-0.05 + 0.2 * rising) * aw
    kneeB[0] -= 0.75 * aw
    kneeB[1] -= 0.4 * aw
    armZ[0] -= 0.45 * aw
    armZ[1] += 0.45 * aw

    // ---- nado: corpo deitado, braçadas
    const ww = this.swimW
    hipsY = hipsY * (1 - ww) + 0.75 * ww
    const stroke = Math.sin(this.phase * 1.2)
    armX[0] = armX[0] * (1 - ww) + (2.2 + stroke * 0.9) * ww
    armX[1] = armX[1] * (1 - ww) + (2.2 - stroke * 0.9) * ww
    thigh[0] += Math.sin(this.phase * 2.4) * 0.35 * ww
    thigh[1] -= Math.sin(this.phase * 2.4) * 0.35 * ww

    // ---- segurando arma (sem mirar): braços na posição de transporte
    const hw = this.holdW * (1 - ww) * (1 - sw * 0.6)
    armX[1] = armX[1] * (1 - hw) + 0.75 * hw
    armX[0] = armX[0] * (1 - hw) + 0.85 * hw
    armZ[1] = armZ[1] * (1 - hw) + 0.05 * hw
    armZ[0] = armZ[0] * (1 - hw) + 0.5 * hw
    elbowX[1] = elbowX[1] * (1 - hw) + 1.0 * hw
    elbowX[0] = elbowX[0] * (1 - hw) + 1.1 * hw

    // ---- picareta: apoiada no ombro; golpe = ergue, desce em arco e volta
    const tw = this.toolW * (1 - ww)
    if (tw > 0.001) {
      let sx = 0.55
      let ex = 1.25
      const u = this.swingT
      if (u < 1) {
        const pitchArm = clamp(p.pitch, -0.8, 0.8)
        if (u < 0.3) {
          const k = u / 0.3
          sx = lerp(0.55, 2.7, k)
          ex = lerp(1.25, 1.5, k)
        } else if (u < 0.55) {
          const k = (u - 0.3) / 0.25
          sx = lerp(2.7, 0.75 + pitchArm, k * k)
          ex = lerp(1.5, 0.15, k)
        } else {
          const k = (u - 0.55) / 0.45
          sx = lerp(0.75 + pitchArm, 0.55, k)
          ex = lerp(0.15, 1.25, k)
        }
        spineX -= Math.sin(Math.PI * Math.min(1, u / 0.6)) * 0.25 * tw
      }
      armX[1] = armX[1] * (1 - tw) + sx * tw
      armZ[1] = armZ[1] * (1 - tw) + 0.12 * tw
      elbowX[1] = elbowX[1] * (1 - tw) + ex * tw
    }

    // ---- mirando: braços à frente, acompanhando o pitch
    const mw = this.aimW * (1 - ww)
    const pitchArm = clamp(p.pitch, -1.1, 1.1)
    armX[1] = armX[1] * (1 - mw) + (1.45 + pitchArm) * mw
    armX[0] = armX[0] * (1 - mw) + (1.35 + pitchArm) * mw
    armZ[1] = armZ[1] * (1 - mw) - 0.1 * mw
    armZ[0] = armZ[0] * (1 - mw) + 0.45 * mw
    elbowX[1] = elbowX[1] * (1 - mw) + 0.2 * mw
    elbowX[0] = elbowX[0] * (1 - mw) + 0.65 * mw

    // ---- queda livre: de bruços, braços e pernas abertos
    const kw = this.skyW
    if (kw > 0.001) {
      armX[0] = armX[0] * (1 - kw) + 0.5 * kw
      armX[1] = armX[1] * (1 - kw) + 0.5 * kw
      armZ[0] = armZ[0] * (1 - kw) - 1.35 * kw
      armZ[1] = armZ[1] * (1 - kw) + 1.35 * kw
      elbowX[0] = elbowX[0] * (1 - kw) + 0.3 * kw
      elbowX[1] = elbowX[1] * (1 - kw) + 0.3 * kw
      thigh[0] = thigh[0] * (1 - kw) - 0.15 * kw
      thigh[1] = thigh[1] * (1 - kw) - 0.15 * kw
      kneeB[0] = kneeB[0] * (1 - kw) - 0.5 * kw
      kneeB[1] = kneeB[1] * (1 - kw) - 0.5 * kw
    }
    // ---- planando: braços para cima segurando o planador
    const gw = this.glideW
    if (gw > 0.001) {
      armX[0] = armX[0] * (1 - gw) + 2.8 * gw
      armX[1] = armX[1] * (1 - gw) + 2.8 * gw
      armZ[0] = armZ[0] * (1 - gw) - 0.35 * gw
      armZ[1] = armZ[1] * (1 - gw) + 0.35 * gw
      elbowX[0] = elbowX[0] * (1 - gw) + 0.2 * gw
      elbowX[1] = elbowX[1] * (1 - gw) + 0.2 * gw
      thigh[0] = thigh[0] * (1 - gw) + 0.25 * gw
      thigh[1] = thigh[1] * (1 - gw) + 0.1 * gw
    }

    // ---- aplica
    this.hips.position.y = hipsY
    this.body.rotation.x = -1.25 * ww - 1.3 * kw
    // de bruços na queda livre: gira em torno do meio do corpo
    this.body.position.y = 0.9 * kw
    this.hips.rotation.y = this.legYaw
    this.spine.rotation.y = -this.legYaw * 0.8
    this.spine.rotation.x = spineX + p.pitch * 0.25 * mw
    this.chest.rotation.y = 0
    this.neck.rotation.x = clamp(p.pitch, -0.9, 0.9) * 0.55 * (1 - ww) - spineX * 0.6 + 0.9 * ww
    for (let k = 0; k < 2; k++) {
      this.hip[k].rotation.x = thigh[k]
      this.knee[k].rotation.x = kneeB[k]
      this.shoulder[k].rotation.x = armX[k]
      this.shoulder[k].rotation.z = armZ[k]
      this.elbow[k].rotation.x = elbowX[k]
    }
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
      this.elbow[1].add(this.held)
      return
    }
    if (!def) return
    const obj = def.kind === 'weapon' ? buildWeaponModel(item, rarity) : buildItemModel(item, rarity)
    if (def.kind !== 'weapon') obj.scale.setScalar(0.7)
    this.held = obj
    this.chest.add(obj)
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
    this.chest.updateMatrixWorld(true)
    return this.chest.localToWorld(out.set(0.2, 0.05, -0.3))
  }

  dispose(): void {
    this.setHeld(255, 0)
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
    if (this.nameplate) {
      this.nameplate.material.map?.dispose()
      this.nameplate.material.dispose()
    }
    this.root.removeFromParent()
  }
}
