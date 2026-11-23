import * as THREE from 'three'
import { airshipPosition, type AirshipRoute } from '../../shared/match/zone'

/**
 * O dirigível que atravessa o mapa no começo da partida: balão alongado,
 * gôndola, lemes e hélices (modelo procedural; troca por GLTF mantendo a
 * frente em −Z). Segue a rota pelo tick do servidor.
 */
export class AirshipView {
  private readonly root = new THREE.Group()
  private readonly props: THREE.Object3D[] = []
  private readonly geometries: THREE.BufferGeometry[] = []
  private readonly materials: THREE.Material[] = []
  private readonly pos = { x: 0, y: 0, z: 0 }

  constructor(scene: THREE.Scene) {
    const hull = this.mat(new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: 0.7 }))
    const band = this.mat(new THREE.MeshStandardMaterial({ color: 0xd8572f, roughness: 0.6 }))
    const dark = this.mat(new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.5, metalness: 0.4 }))
    const glass = this.mat(new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xff9a3a, emissiveIntensity: 0.8, roughness: 0.2 }))
    const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      this.geometries.push(g)
      const mesh = new THREE.Mesh(g, m)
      mesh.position.set(x, y, z)
      mesh.castShadow = true
      this.root.add(mesh)
      return mesh
    }
    // balão: esfera alongada em Z
    add(new THREE.SphereGeometry(1, 32, 18).scale(9, 8, 30), hull, 0, 8, 0)
    for (const z of [-14, 0, 14]) add(new THREE.TorusGeometry(1, 0.05, 6, 40).scale(Math.sqrt(1 - (z / 30) ** 2) * 9.05, Math.sqrt(1 - (z / 30) ** 2) * 8.05, 1), band, 0, 8, z)
    // gôndola com janelas acesas
    add(new THREE.BoxGeometry(6, 3.2, 16), dark, 0, -1.6, 2)
    for (let k = 0; k < 6; k++) {
      add(new THREE.BoxGeometry(0.1, 1, 1.4), glass, 3.05, -1.4, -4 + k * 2.4)
      add(new THREE.BoxGeometry(0.1, 1, 1.4), glass, -3.05, -1.4, -4 + k * 2.4)
    }
    // lemes em cruz na traseira
    add(new THREE.BoxGeometry(0.4, 9, 6), band, 0, 8, 26)
    add(new THREE.BoxGeometry(14, 0.4, 6), band, 0, 8, 26)
    // hélices
    for (const x of [-7, 7]) {
      add(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 10).rotateX(Math.PI / 2), dark, x, 0.5, 8)
      const p = new THREE.Group()
      p.position.set(x, 0.5, 9.4)
      for (let b = 0; b < 3; b++) {
        const g = new THREE.BoxGeometry(0.4, 3.2, 0.12)
        this.geometries.push(g)
        const blade = new THREE.Mesh(g, dark)
        blade.rotation.z = (b / 3) * Math.PI * 2
        p.add(blade)
      }
      this.root.add(p)
      this.props.push(p)
    }
    this.root.name = 'dirigivel'
    this.root.visible = false
    scene.add(this.root)
  }

  private mat<T extends THREE.Material>(m: T): T {
    this.materials.push(m)
    return m
  }

  /** Posição do dirigível (para a câmera de quem está a bordo). */
  get position(): { x: number; y: number; z: number } {
    return this.pos
  }

  update(route: AirshipRoute | null, serverTick: number, dt: number): void {
    // visível durante a rota e mais alguns segundos (segue reto e some)
    if (!route || serverTick > route.endTick + 30 * 20 || serverTick < route.startTick - 30) {
      this.root.visible = false
      return
    }
    const span = Math.max(1, route.endTick - route.startTick)
    const extra = Math.max(0, serverTick - route.endTick) / span
    airshipPosition(route, Math.min(serverTick, route.endTick), this.pos)
    this.pos.x += (route.x1 - route.x0) * extra
    this.pos.z += (route.z1 - route.z0) * extra
    this.root.visible = true
    // quem está a bordo fica no convés, acima do balão
    this.root.position.set(this.pos.x, this.pos.y - 22, this.pos.z)
    this.root.rotation.y = Math.atan2(-(route.x1 - route.x0), -(route.z1 - route.z0))
    for (const p of this.props) p.rotation.z += dt * 14
  }

  dispose(): void {
    this.root.removeFromParent()
    for (const g of this.geometries) g.dispose()
    for (const m of this.materials) m.dispose()
  }
}
