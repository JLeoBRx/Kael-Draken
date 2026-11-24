import * as THREE from 'three'
import { itemDef, weaponDef, type ProjectileDef } from '../../shared/config/items'
import { stepProjectile, type ProjectileState } from '../../shared/combat/projectile'
import { Surface, createWorldHit, type CollisionWorld } from '../../shared/world/collision-world'
import { DecalPool, ParticlePool, type ParticleSpec } from '../render/particles'

/**
 * Efeitos visuais: traçantes, clarão do cano, poeira/faíscas de impacto pela
 * superfície, marcas de tiro, explosões (bola de fogo, coluna de fumaça,
 * faíscas, onda de choque e tremor da câmera), poeira de passos e quedas,
 * respingos, projéteis em voo e números de dano. Tudo com pools fixos —
 * nada é alocado por tiro.
 */

interface Tracer {
  mesh: THREE.Mesh
  life: number
}

interface Blast {
  mesh: THREE.Mesh
  life: number
  radius: number
}

interface Flying {
  mesh: THREE.Object3D
  s: ProjectileState
  def: ProjectileDef
}

interface DamageNumber {
  el: HTMLElement
  pos: THREE.Vector3
  life: number
}

/** Cor (linear) das lascas por material: madeira, pedra, metal. */
const DEBRIS_COLORS: [number, number, number][] = [[0.62, 0.42, 0.22], [0.55, 0.54, 0.5], [0.66, 0.7, 0.74]]
const TRACERS = 64
/** Cor da poeira de impacto por superfície (linear). */
const SURFACE_DUST: Record<number, [number, number, number]> = {
  [Surface.Terrain]: [0.32, 0.27, 0.2],
  [Surface.Concrete]: [0.5, 0.49, 0.46],
  [Surface.Wood]: [0.42, 0.3, 0.18],
  [Surface.Metal]: [0.45, 0.46, 0.48],
  [Surface.Brick]: [0.5, 0.3, 0.22],
  [Surface.Rock]: [0.45, 0.44, 0.41],
  [Surface.Foliage]: [0.2, 0.32, 0.12],
}
const tmpV = new THREE.Vector3()
const up = new THREE.Vector3(0, 1, 0)

export class Effects {
  private readonly tracers: Tracer[] = []
  private tracerCursor = 0
  private readonly glow: ParticlePool
  private readonly smoke: ParticlePool
  private readonly decals: DecalPool
  private readonly hit = createWorldHit()
  /** Tremor de câmera acumulado (explosões perto); a partida lê e aplica. */
  shake = 0
  private readonly blasts: Blast[] = []
  private readonly flash: THREE.PointLight
  private flashLife = 0
  private readonly muzzle: THREE.Sprite
  private muzzleLife = 0
  private readonly projectiles = new Map<number, Flying>()
  private readonly numbers: DamageNumber[] = []
  private readonly disposables: { dispose(): void }[] = []

  /** Multiplicador da quantidade de partículas (qualidade). */
  private readonly detail: number

  constructor(private readonly scene: THREE.Scene, private readonly world: CollisionWorld, private readonly overlay: HTMLElement, particleScale = 1) {
    const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe7a8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
    const tracerGeo = new THREE.BoxGeometry(0.025, 0.025, 1).translate(0, 0, -0.5)
    this.disposables.push(tracerMat, tracerGeo)
    for (let k = 0; k < TRACERS; k++) {
      const mesh = new THREE.Mesh(tracerGeo, tracerMat.clone())
      mesh.visible = false
      mesh.frustumCulled = false
      scene.add(mesh)
      this.tracers.push({ mesh, life: 0 })
      this.disposables.push(mesh.material as THREE.Material)
    }

    const scale = Math.max(0.2, particleScale)
    this.glow = new ParticlePool(scene, Math.round(900 * scale), 'brilho')
    this.smoke = new ParticlePool(scene, Math.round(700 * scale), 'fumaca')
    this.decals = new DecalPool(scene, Math.round(160 * scale))
    this.detail = scale
    this.flash = new THREE.PointLight(0xffb36b, 0, 14, 2)
    scene.add(this.flash)
    const muzzleTex = makeFlashTexture()
    const muzzleMat = new THREE.SpriteMaterial({ map: muzzleTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })
    this.muzzle = new THREE.Sprite(muzzleMat)
    this.muzzle.visible = false
    scene.add(this.muzzle)
    this.disposables.push(muzzleTex, muzzleMat)
  }

  tracer(from: THREE.Vector3, to: THREE.Vector3, color = 0xffe7a8): void {
    const t = this.tracers[this.tracerCursor++ % TRACERS]
    const len = from.distanceTo(to)
    if (len < 0.5) return
    t.mesh.position.copy(from)
    t.mesh.lookAt(to)
    t.mesh.scale.set(1, 1, len)
    ;(t.mesh.material as THREE.MeshBasicMaterial).color.setHex(color)
    t.mesh.visible = true
    t.life = 0.08
  }

  muzzleFlash(pos: THREE.Vector3, big = false): void {
    this.muzzle.position.copy(pos)
    this.muzzle.scale.setScalar(big ? 0.9 : 0.45)
    this.muzzle.material.rotation = Math.random() * Math.PI
    this.muzzle.visible = true
    this.muzzleLife = 0.05
    this.flash.position.copy(pos)
    this.flash.intensity = big ? 30 : 14
    this.flashLife = 0.06
  }

  private n(count: number): number {
    return Math.max(1, Math.round(count * this.detail))
  }

  private puff(p: ParticleSpec): void {
    this.smoke.spawn(p)
  }

  private spark(p: ParticleSpec): void {
    this.glow.spawn(p)
  }

  /**
   * Impacto de bala. No mundo, com a origem do tiro, acha a superfície
   * (normal e material): poeira da cor certa, faíscas no metal e marca de tiro.
   */
  impact(pos: THREE.Vector3, kind: 'world' | 'flesh', origin?: THREE.Vector3): void {
    if (kind === 'flesh') {
      for (let k = 0; k < this.n(8); k++) {
        this.spark({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2.5, vz: (Math.random() - 0.5) * 3, life: 0.25 + Math.random() * 0.2, size: 0.09, sizeEnd: 0.02, r: 1.6, g: 0.85, b: 0.35, gravity: 6, drag: 2 })
      }
      this.puff({ x: pos.x, y: pos.y, z: pos.z, vy: 0.4, life: 0.5, size: 0.25, sizeEnd: 0.6, r: 0.9, g: 0.7, b: 0.45, alpha: 0.35 })
      return
    }
    let nx = 0
    let ny = 1
    let nz = 0
    let surface: number = Surface.Terrain
    if (origin) {
      const dx = pos.x - origin.x
      const dy = pos.y - origin.y
      const dz = pos.z - origin.z
      const len = Math.hypot(dx, dy, dz)
      if (len > 0.01 && this.world.raycast(origin.x, origin.y, origin.z, dx / len, dy / len, dz / len, len + 0.3, this.hit)) {
        nx = this.hit.nx
        ny = this.hit.ny
        nz = this.hit.nz
        surface = this.hit.surface
        this.decals.add(this.hit.x, this.hit.y, this.hit.z, nx, ny, nz, surface === Surface.Terrain ? 0.22 : 0.13)
      }
    }
    const c = SURFACE_DUST[surface] ?? SURFACE_DUST[Surface.Terrain]
    for (let k = 0; k < this.n(3); k++) {
      const sp = 0.6 + Math.random() * 1.4
      this.puff({ x: pos.x, y: pos.y, z: pos.z, vx: nx * sp + (Math.random() - 0.5) * 0.6, vy: ny * sp + Math.random() * 0.4, vz: nz * sp + (Math.random() - 0.5) * 0.6, life: 0.6 + Math.random() * 0.5, size: 0.18, sizeEnd: 0.65, r: c[0], g: c[1], b: c[2], alpha: 0.75, drag: 3, gravity: 0.6, spin: (Math.random() - 0.5) * 2 })
    }
    const sparks = surface === Surface.Metal ? 8 : surface === Surface.Concrete || surface === Surface.Rock || surface === Surface.Brick ? 3 : 0
    for (let k = 0; k < this.n(sparks); k++) {
      const sp = 2 + Math.random() * 4
      this.spark({ x: pos.x, y: pos.y, z: pos.z, vx: nx * sp + (Math.random() - 0.5) * 3, vy: ny * sp + Math.random() * 2, vz: nz * sp + (Math.random() - 0.5) * 3, life: 0.15 + Math.random() * 0.25, size: 0.05, sizeEnd: 0.01, r: 2.2, g: 1.5, b: 0.6, gravity: 9, drag: 1 })
    }
  }

  explosion(pos: THREE.Vector3, radius: number, camera?: THREE.Camera): void {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
    mesh.position.copy(pos)
    mesh.scale.setScalar(0.2)
    this.scene.add(mesh)
    this.blasts.push({ mesh, life: 0.35, radius: radius * 0.7 })
    // bola de fogo: núcleo claro que vira laranja e sobe
    for (let k = 0; k < this.n(26); k++) {
      const a = Math.random() * Math.PI * 2
      const e = (Math.random() - 0.2) * Math.PI * 0.5
      const sp = (1 + Math.random() * 2.5) * radius * 0.6
      this.spark({ x: pos.x, y: pos.y + 0.3, z: pos.z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 1.5, vz: Math.sin(a) * Math.cos(e) * sp, life: 0.35 + Math.random() * 0.35, size: radius * 0.45, sizeEnd: radius * 0.9, r: 1.7, g: 0.62, b: 0.16, drag: 4, gravity: -2, spin: (Math.random() - 0.5) * 3 })
    }
    // faíscas e estilhaços
    for (let k = 0; k < this.n(30); k++) {
      const a = Math.random() * Math.PI * 2
      const sp = 6 + Math.random() * 10
      this.spark({ x: pos.x, y: pos.y + 0.2, z: pos.z, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 8, vz: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.7, size: 0.08, sizeEnd: 0.02, r: 2.5, g: 1.6, b: 0.6, gravity: 12, drag: 0.6 })
    }
    // coluna de fumaça escura que sobe e se espalha
    for (let k = 0; k < this.n(22); k++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * radius * 0.5
      const g = 0.08 + Math.random() * 0.08
      this.puff({ x: pos.x + Math.cos(a) * r, y: pos.y + Math.random() * radius * 0.6, z: pos.z + Math.sin(a) * r, vx: Math.cos(a) * 1.2, vy: 1.5 + Math.random() * 2.5, vz: Math.sin(a) * 1.2, life: 2.2 + Math.random() * 2, size: radius * 0.5, sizeEnd: radius * 1.6, r: g, g: g, b: g * 1.05, alpha: 0.85, drag: 0.8, gravity: -0.4, spin: (Math.random() - 0.5) * 0.8 })
    }
    // onda de poeira no chão
    for (let k = 0; k < this.n(16); k++) {
      const a = (k / 16) * Math.PI * 2
      this.puff({ x: pos.x, y: pos.y + 0.2, z: pos.z, vx: Math.cos(a) * radius * 2.2, vy: 0.3, vz: Math.sin(a) * radius * 2.2, life: 0.9 + Math.random() * 0.4, size: radius * 0.35, sizeEnd: radius * 0.9, r: 0.42, g: 0.37, b: 0.3, alpha: 0.55, drag: 3 })
    }
    this.flash.position.copy(pos)
    this.flash.intensity = 160
    this.flash.distance = radius * 7
    this.flashLife = 0.22
    if (camera) {
      const d = camera.position.distanceTo(pos)
      this.shake = Math.min(1.5, this.shake + Math.max(0, 1 - d / (radius * 8)) * 1.2)
    }
  }

  /** Poeira de passos fortes, pouso e deslize. */
  dust(x: number, y: number, z: number, amount: number, color: [number, number, number] = [0.36, 0.31, 0.24]): void {
    for (let k = 0; k < this.n(Math.ceil(4 * amount)); k++) {
      const a = Math.random() * Math.PI * 2
      const sp = 0.6 + Math.random() * 1.2 * amount
      this.puff({ x: x + Math.cos(a) * 0.2, y: y + 0.08, z: z + Math.sin(a) * 0.2, vx: Math.cos(a) * sp, vy: 0.3 + Math.random() * 0.4, vz: Math.sin(a) * sp, life: 0.6 + Math.random() * 0.5, size: 0.25, sizeEnd: 0.8 * Math.max(0.6, amount), r: color[0], g: color[1], b: color[2], alpha: 0.5, drag: 3, spin: (Math.random() - 0.5) * 1.5 })
    }
  }

  /** Respingo na água. */
  splash(x: number, y: number, z: number, amount: number): void {
    for (let k = 0; k < this.n(Math.ceil(10 * amount)); k++) {
      const a = Math.random() * Math.PI * 2
      const sp = 0.5 + Math.random() * 1.5 * amount
      this.puff({ x, y: y + 0.05, z, vx: Math.cos(a) * sp, vy: 1.5 + Math.random() * 3 * amount, vz: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.4, size: 0.12, sizeEnd: 0.35, r: 0.85, g: 0.92, b: 0.95, alpha: 0.7, gravity: 9, drag: 0.5 })
    }
  }

  spawnProjectile(id: number, item: number, x: number, y: number, z: number, vx: number, vy: number, vz: number): void {
    const def = weaponDef(item)?.projectile ?? (itemDef(item)?.kind === 'consumable' ? (itemDef(item) as { throwable: ProjectileDef | null }).throwable : null)
    if (!def) return
    const grenade = def.fuse > 0
    const mesh: THREE.Object3D = grenade
      ? new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), new THREE.MeshStandardMaterial({ color: 0x55603a, roughness: 0.6, emissive: 0x330000 }))
      : new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4d5a3c, emissive: 0xff6a20, emissiveIntensity: 0.4 }))
    mesh.position.set(x, y, z)
    this.scene.add(mesh)
    this.projectiles.set(id, { mesh, s: { x, y, z, vx, vy, vz, age: 0 }, def })
  }

  removeProjectile(id: number): void {
    const p = this.projectiles.get(id)
    if (!p) return
    this.scene.remove(p.mesh)
    const m = p.mesh as THREE.Mesh
    m.geometry?.dispose()
    ;(m.material as THREE.Material | undefined)?.dispose()
    this.projectiles.delete(id)
  }

  /** Lascas e poeira de construção quebrando/desabando, na cor do material. */
  debris(min: THREE.Vector3, max: THREE.Vector3, material: number, amount = 1): void {
    const color = DEBRIS_COLORS[material] ?? DEBRIS_COLORS[0]
    for (let k = 0; k < this.n(Math.round(16 * amount)); k++) {
      const x = min.x + Math.random() * (max.x - min.x)
      const y = min.y + Math.random() * (max.y - min.y)
      const z = min.z + Math.random() * (max.z - min.z)
      const v = 0.75 + Math.random() * 0.4
      this.puff({ x, y, z, vx: (Math.random() - 0.5) * 2, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 2, life: 0.9 + Math.random() * 0.8, size: 0.35, sizeEnd: 1.2, r: color[0] * v, g: color[1] * v, b: color[2] * v, alpha: 0.6, drag: 2, gravity: 0.5, spin: (Math.random() - 0.5) * 1.5 })
    }
    for (let k = 0; k < this.n(Math.round(14 * amount)); k++) {
      const x = min.x + Math.random() * (max.x - min.x)
      const y = min.y + Math.random() * (max.y - min.y)
      const z = min.z + Math.random() * (max.z - min.z)
      // lascas: pequenas e opacas, caem rápido
      this.puff({ x, y, z, vx: (Math.random() - 0.5) * 4, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 4, life: 0.6 + Math.random() * 0.5, size: 0.09, sizeEnd: 0.07, r: color[0], g: color[1], b: color[2], alpha: 1, gravity: 12, drag: 0.3, spin: (Math.random() - 0.5) * 12 })
    }
  }

  /** Lascas de um golpe de picareta (madeira, pedra ou metal). */
  chips(pos: THREE.Vector3, material: number): void {
    const color = DEBRIS_COLORS[material] ?? DEBRIS_COLORS[0]
    for (let k = 0; k < this.n(7); k++) {
      this.puff({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 3, life: 0.45 + Math.random() * 0.3, size: 0.07, sizeEnd: 0.05, r: color[0], g: color[1], b: color[2], alpha: 1, gravity: 12, drag: 0.4, spin: (Math.random() - 0.5) * 10 })
    }
    this.puff({ x: pos.x, y: pos.y, z: pos.z, vy: 0.3, life: 0.7, size: 0.2, sizeEnd: 0.6, r: color[0] * 0.8, g: color[1] * 0.8, b: color[2] * 0.8, alpha: 0.4, drag: 2 })
    if (material === 2) for (let k = 0; k < this.n(5); k++) this.spark({ x: pos.x, y: pos.y, z: pos.z, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 5, life: 0.2 + Math.random() * 0.2, size: 0.05, sizeEnd: 0.01, r: 2.2, g: 1.5, b: 0.6, gravity: 10 })
  }

  /** Texto flutuante (ex.: "+8 Madeira" ao coletar). */
  floatText(pos: THREE.Vector3, text: string, cls: string): void {
    const el = document.createElement('div')
    el.className = `dmg ${cls}`
    el.textContent = text
    this.overlay.append(el)
    this.numbers.push({ el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.4, 0)), life: 1.0 })
  }

  damageNumber(pos: THREE.Vector3, amount: number, kind: 'body' | 'head' | 'shield' | 'build'): void {
    const el = document.createElement('div')
    el.className = `dmg ${kind}`
    el.textContent = String(amount)
    this.overlay.append(el)
    this.numbers.push({ el, pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.3, 0)), life: 0.9 })
  }

  update(dt: number, camera: THREE.Camera, width: number, height: number): void {
    for (const t of this.tracers) {
      if (t.life <= 0) continue
      t.life -= dt
      const m = t.mesh.material as THREE.MeshBasicMaterial
      m.opacity = Math.max(0, t.life / 0.08) * 0.9
      if (t.life <= 0) t.mesh.visible = false
    }
    if (this.muzzleLife > 0) {
      this.muzzleLife -= dt
      if (this.muzzleLife <= 0) this.muzzle.visible = false
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt
      this.flash.intensity *= Math.exp(-dt * 30)
      if (this.flashLife <= 0) {
        this.flash.intensity = 0
        this.flash.distance = 14
      }
    }
    // partículas e tremor
    this.glow.update(dt)
    this.smoke.update(dt)
    this.shake *= Math.exp(-dt * 6)
    // explosões
    for (let k = this.blasts.length - 1; k >= 0; k--) {
      const b = this.blasts[k]
      b.life -= dt
      const t = 1 - b.life / 0.35
      b.mesh.scale.setScalar(0.2 + b.radius * Math.min(1, t * 2.5))
      ;(b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - t))
      if (b.life <= 0) {
        this.scene.remove(b.mesh)
        b.mesh.geometry.dispose()
        ;(b.mesh.material as THREE.Material).dispose()
        this.blasts.splice(k, 1)
      }
    }
    // projéteis: simulação visual com o mesmo passo do servidor (sem colisão com jogadores)
    const res = { exploded: false, x: 0, y: 0, z: 0 }
    for (const p of this.projectiles.values()) {
      if (p.s.age > 9) continue
      const steps = Math.max(1, Math.ceil(dt / (1 / 60)))
      for (let k = 0; k < steps; k++) stepProjectile(p.s, p.def, this.world, dt / steps, res)
      p.mesh.position.set(p.s.x, p.s.y, p.s.z)
      tmpV.set(p.s.vx, p.s.vy, p.s.vz)
      if (tmpV.lengthSq() > 0.01) p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), tmpV.normalize())
      // rastro do foguete: fumaça clara e um fio de fogo
      if (p.def.fuse <= 0) {
        this.puff({ x: p.s.x, y: p.s.y, z: p.s.z, vy: 0.3, life: 0.9 + Math.random() * 0.5, size: 0.25, sizeEnd: 0.9, r: 0.6, g: 0.58, b: 0.55, alpha: 0.55, drag: 1.5, spin: (Math.random() - 0.5) * 2 })
        this.spark({ x: p.s.x, y: p.s.y, z: p.s.z, life: 0.08, size: 0.22, sizeEnd: 0.08, r: 2.5, g: 1.2, b: 0.4 })
      }
    }
    // números de dano
    for (let k = this.numbers.length - 1; k >= 0; k--) {
      const d = this.numbers[k]
      d.life -= dt
      d.pos.y += dt * 0.8
      tmpV.copy(d.pos).project(camera)
      const visible = tmpV.z < 1 && d.life > 0
      if (visible) {
        d.el.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * width}px, ${(-tmpV.y * 0.5 + 0.5) * height}px) translate(-50%, -50%)`
        d.el.style.opacity = String(Math.min(1, d.life * 2.5))
      } else d.el.style.opacity = '0'
      if (d.life <= 0) {
        d.el.remove()
        this.numbers.splice(k, 1)
      }
    }
  }

  dispose(): void {
    for (const id of [...this.projectiles.keys()]) this.removeProjectile(id)
    for (const b of this.blasts) {
      this.scene.remove(b.mesh)
      b.mesh.geometry.dispose()
      ;(b.mesh.material as THREE.Material).dispose()
    }
    for (const d of this.numbers) d.el.remove()
    for (const d of this.disposables) d.dispose()
    this.glow.dispose()
    this.smoke.dispose()
    this.decals.dispose()
    void up
  }
}

function makeFlashTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,230,1)')
  g.addColorStop(0.3, 'rgba(255,200,90,0.9)')
  g.addColorStop(1, 'rgba(255,120,20,0)')
  ctx.fillStyle = g
  ctx.beginPath()
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2
    const r = k % 2 === 0 ? 32 : 12
    ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r)
  }
  ctx.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
