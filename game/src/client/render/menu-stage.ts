import * as THREE from 'three'
import { ITEM } from '../../shared/config/items'
import { CharFlag } from '../../shared/movement/character'
import { CharacterModel, SKINS } from '../character/character-model'
import { ParticlePool } from './particles'

/**
 * Vitrine do menu e do armário: o personagem com o visual escolhido sobre
 * uma plataforma, luz de estúdio (principal quente, recorte frio), brasas
 * subindo e a câmera balançando devagar. Desenhada no canvas do jogo,
 * atrás das telas (que deixam o lado direito transparente).
 */
export class MenuStage {
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100)
  private model: CharacterModel | null = null
  private skin = -1
  private readonly embers: ParticlePool
  private readonly disposables: { dispose(): void }[] = []
  private t = 0
  private emberTimer = 0
  /** Ângulo extra que a pessoa dá arrastando (armário). */
  turn = 0

  constructor() {
    this.scene.background = new THREE.Color(0x0b0f14)
    this.scene.fog = new THREE.Fog(0x0b0f14, 9, 22)
    const hemi = new THREE.HemisphereLight(0x7fa6c9, 0x1a120c, 0.6)
    const key = new THREE.DirectionalLight(0xffd2a8, 2.6)
    key.position.set(2.5, 4, 3)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.left = key.shadow.camera.bottom = -3
    key.shadow.camera.right = key.shadow.camera.top = 3
    const rim = new THREE.DirectionalLight(0x2fd3c4, 2.2)
    rim.position.set(-3, 2.5, -3)
    const fill = new THREE.PointLight(0xff7a2f, 6, 6, 2)
    fill.position.set(-1.2, 0.4, 1.2)
    this.scene.add(hemi, key, rim, fill)
    // plataforma hexagonal com anel aceso
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.24, 6), new THREE.MeshStandardMaterial({ color: 0x1c232c, roughness: 0.45, metalness: 0.6 }))
    base.position.y = -0.12
    base.receiveShadow = true
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.025, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff7a2f, emissive: 0xff7a2f, emissiveIntensity: 2.5 }))
    ring.rotation.x = Math.PI / 2
    ring.rotation.z = Math.PI / 6
    ring.position.y = 0.005
    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshStandardMaterial({ color: 0x0e1319, roughness: 0.9 }))
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.24
    floor.receiveShadow = true
    this.scene.add(base, ring, floor)
    for (const m of [base, ring, floor]) this.disposables.push(m.geometry, m.material as THREE.Material)
    this.embers = new ParticlePool(this.scene, 120, 'brilho')
  }

  setSkin(skin: number): void {
    if (skin === this.skin && this.model) return
    this.skin = skin
    this.model?.dispose()
    this.model = new CharacterModel(SKINS[((skin % SKINS.length) + SKINS.length) % SKINS.length])
    this.model.setHeld(ITEM.Rifle, 3)
    this.model.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true
    })
    this.scene.add(this.model.root)
  }

  /** Desenha a vitrine em todo o canvas (o personagem fica à direita). */
  render(renderer: THREE.WebGLRenderer, dt: number, width: number, height: number): void {
    if (!this.model) this.setSkin(0)
    this.t += dt
    const m = this.model!
    // parado com o fuzil, girando devagar (ou para onde a pessoa arrastou)
    const yaw = Math.PI + 0.45 + Math.sin(this.t * 0.25) * 0.25 + this.turn
    m.update({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw, pitch: -0.05, flags: CharFlag.Grounded }, dt)
    this.emberTimer -= dt
    while (this.emberTimer <= 0) {
      this.emberTimer += 0.08
      const a = Math.random() * Math.PI * 2
      const r = 0.6 + Math.random() * 2.5
      this.embers.spawn({ x: Math.cos(a) * r, y: Math.random() * 0.4, z: Math.sin(a) * r, vx: (Math.random() - 0.5) * 0.2, vy: 0.3 + Math.random() * 0.5, life: 3 + Math.random() * 2, size: 0.03 + Math.random() * 0.03, sizeEnd: 0.01, r: 2, g: 0.8, b: 0.25, drag: 0.2 })
    }
    this.embers.update(dt)
    const aspect = width / Math.max(1, height)
    this.camera.aspect = aspect
    // em telas largas, o personagem vai para a direita (o menu fica à esquerda)
    const shift = aspect > 1.2 ? -1.15 : 0
    this.camera.position.set(shift + Math.sin(this.t * 0.2) * 0.15, 1.25 + Math.sin(this.t * 0.31) * 0.04, 5.2)
    this.camera.lookAt(shift, 1.0, 0)
    this.camera.updateProjectionMatrix()
    renderer.setViewport(0, 0, width, height)
    renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.model?.dispose()
    this.embers.dispose()
    for (const d of this.disposables) d.dispose()
  }
}
