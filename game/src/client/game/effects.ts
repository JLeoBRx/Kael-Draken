import * as THREE from 'three'
import { itemDef, weaponDef, type ProjectileDef } from '../../shared/config/items'
import { stepProjectile, type ProjectileState } from '../../shared/combat/projectile'
import type { CollisionWorld } from '../../shared/world/collision-world'

/**
 * Efeitos visuais: traçantes, clarão do cano, poeira/faíscas de impacto,
 * explosões, projéteis em voo e números de dano. Tudo com pools fixos — nada
 * é alocado por tiro.
 */

interface Tracer {
  mesh: THREE.Mesh
  life: number
}

interface Particle {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  life: number
  max: number
  r: number
  g: number
  b: number
  size: number
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
const PARTICLES = 600
const tmpV = new THREE.Vector3()
const up = new THREE.Vector3(0, 1, 0)

export class Effects {
  private readonly tracers: Tracer[] = []
  private tracerCursor = 0
  private readonly particles: Particle[] = []
  private readonly points: THREE.Points
  private readonly pPos: Float32Array
  private readonly pCol: Float32Array
  private readonly pSize: Float32Array
  private readonly blasts: Blast[] = []
  private readonly flash: THREE.PointLight
  private flashLife = 0
  private readonly muzzle: THREE.Sprite
  private muzzleLife = 0
  private readonly projectiles = new Map<number, Flying>()
  private readonly numbers: DamageNumber[] = []
  private readonly disposables: { dispose(): void }[] = []

  constructor(private readonly scene: THREE.Scene, private readonly world: CollisionWorld, private readonly overlay: HTMLElement) {
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

    this.pPos = new Float32Array(PARTICLES * 3)
    this.pCol = new Float32Array(PARTICLES * 3)
    this.pSize = new Float32Array(PARTICLES)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3))
    g.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3))
    g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1))
    const pm = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * 300.0 / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vColor * (1.0 - d * 1.6), 1.0);
        }`,
    })
    this.points = new THREE.Points(g, pm)
    this.points.frustumCulled = false
    scene.add(this.points)
    this.disposables.push(g, pm)

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

  private spawnParticle(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number, size: number): void {
    if (this.particles.length >= PARTICLES) this.particles.shift()
    this.particles.push({ x, y, z, vx, vy, vz, life, max: life, r, g, b, size })
  }

  impact(pos: THREE.Vector3, kind: 'world' | 'flesh'): void {
    const n = kind === 'world' ? 7 : 5
    for (let k = 0; k < n; k++) {
      const s = kind === 'world' ? 1.6 : 2.2
      const bright = kind === 'world' ? [0.55, 0.5, 0.42] : [1.0, 0.75, 0.35]
      this.spawnParticle(pos.x, pos.y, pos.z, (Math.random() - 0.5) * s, Math.random() * s, (Math.random() - 0.5) * s, 0.35 + Math.random() * 0.25, bright[0], bright[1], bright[2], kind === 'world' ? 0.12 : 0.08)
    }
  }

  explosion(pos: THREE.Vector3, radius: number): void {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
    mesh.position.copy(pos)
    mesh.scale.setScalar(0.2)
    this.scene.add(mesh)
    this.blasts.push({ mesh, life: 0.45, radius })
    for (let k = 0; k < 60; k++) {
      const a = Math.random() * Math.PI * 2
      const e = Math.random() * Math.PI - Math.PI / 4
      const sp = 4 + Math.random() * radius * 2
      const fire = k < 35
      this.spawnParticle(pos.x, pos.y, pos.z, Math.cos(a) * Math.cos(e) * sp, Math.abs(Math.sin(e)) * sp + 1, Math.sin(a) * Math.cos(e) * sp,
        fire ? 0.4 + Math.random() * 0.3 : 0.9 + Math.random() * 0.6, fire ? 1 : 0.35, fire ? 0.55 : 0.33, fire ? 0.2 : 0.3, fire ? 0.35 : 0.6)
    }
    this.flash.position.copy(pos)
    this.flash.intensity = 120
    this.flash.distance = radius * 6
    this.flashLife = 0.18
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
    const n = Math.round(26 * amount)
    for (let k = 0; k < n; k++) {
      const x = min.x + Math.random() * (max.x - min.x)
      const y = min.y + Math.random() * (max.y - min.y)
      const z = min.z + Math.random() * (max.z - min.z)
      const v = 0.8 + Math.random() * 0.4
      this.spawnParticle(x, y, z, (Math.random() - 0.5) * 3, Math.random() * 3.5, (Math.random() - 0.5) * 3, 0.6 + Math.random() * 0.6, color[0] * v, color[1] * v, color[2] * v, 0.14 + Math.random() * 0.12)
    }
  }

  /** Lascas de um golpe de picareta (madeira, pedra ou metal). */
  chips(pos: THREE.Vector3, material: number): void {
    const color = DEBRIS_COLORS[material] ?? DEBRIS_COLORS[0]
    for (let k = 0; k < 8; k++) {
      this.spawnParticle(pos.x, pos.y, pos.z, (Math.random() - 0.5) * 2.4, Math.random() * 2.6, (Math.random() - 0.5) * 2.4, 0.35 + Math.random() * 0.3, color[0], color[1], color[2], 0.08)
    }
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
    // partículas
    let n = 0
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k]
      p.life -= dt
      if (p.life <= 0) {
        this.particles.splice(k, 1)
        continue
      }
      p.vy -= 6 * dt
      p.vx *= 1 - 2 * dt
      p.vz *= 1 - 2 * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
    }
    for (const p of this.particles) {
      const f = p.life / p.max
      this.pPos[n * 3] = p.x
      this.pPos[n * 3 + 1] = p.y
      this.pPos[n * 3 + 2] = p.z
      this.pCol[n * 3] = p.r * f
      this.pCol[n * 3 + 1] = p.g * f
      this.pCol[n * 3 + 2] = p.b * f
      this.pSize[n] = p.size * (1.4 - f * 0.4)
      n++
    }
    const g = this.points.geometry
    g.setDrawRange(0, n)
    g.attributes.position.needsUpdate = true
    g.attributes.color.needsUpdate = true
    g.attributes.size.needsUpdate = true
    // explosões
    for (let k = this.blasts.length - 1; k >= 0; k--) {
      const b = this.blasts[k]
      b.life -= dt
      const t = 1 - b.life / 0.45
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
      if (p.def.fuse <= 0 && Math.random() < 0.6) this.spawnParticle(p.s.x, p.s.y, p.s.z, 0, 0.3, 0, 0.5, 0.4, 0.38, 0.35, 0.25)
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
