import * as THREE from 'three'
import { BUILD_MATERIALS } from '../../shared/config/building'
import { pieceHealth, pieceMaxHealth, type BuildingWorld, type Piece } from '../../shared/building/buildings'
import { pieceObbs, type PieceSpec } from '../../shared/building/grid'
import type { Obb } from '../../shared/world/obb'
import { buildPanelTexture } from './textures'

/**
 * Desenho das construções: cada peça é feita de 1–2 caixas (as MESMAS OBBs
 * da colisão), desenhadas com um cubo unitário instanciado — uma chamada de
 * desenho por material, mais uma para as peças ainda em construção
 * (translúcidas, ganhando opacidade com o progresso por meio da cor).
 *
 * As instâncias só são refeitas quando o conjunto muda (versão) ou quando
 * alguma peça termina de ser erguida.
 */

const MAX_INSTANCES = 4096
const BUILDING_COLOR = new THREE.Color(0x8fd3ff)
const GHOST_OK = 0x4fc3ff
const GHOST_BAD = 0xff4f4f

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ')
const tmpP = new THREE.Vector3()
const tmpS = new THREE.Vector3()
const tmpC = new THREE.Color()

function obbMatrix(o: Obb, out: THREE.Matrix4): THREE.Matrix4 {
  tmpE.set(o.pitch, o.yaw, 0, 'YXZ')
  tmpQ.setFromEuler(tmpE)
  tmpP.set(o.cx, o.cy, o.cz)
  tmpS.set(o.hx * 2, o.hy * 2, o.hz * 2)
  return out.compose(tmpP, tmpQ, tmpS)
}

export class BuildingsView {
  private readonly group = new THREE.Group()
  private readonly solid: THREE.InstancedMesh[] = []
  private readonly building: THREE.InstancedMesh
  private readonly ghost: THREE.Mesh[] = []
  private readonly ghostMat: THREE.MeshBasicMaterial
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1)
  private readonly textures: THREE.Texture[] = []
  private readonly materials: THREE.Material[] = []
  private version = -1
  /** Tick em que a próxima peça em construção termina (para refazer as instâncias). */
  private nextDoneTick = Infinity
  private lastTick = 0

  constructor(scene: THREE.Scene, private readonly world: BuildingWorld, private readonly tickRate: number) {
    this.group.name = 'construcoes'
    scene.add(this.group)
    BUILD_MATERIALS.forEach((m, k) => {
      const map = buildPanelTexture(k)
      this.textures.push(map)
      const mat = new THREE.MeshStandardMaterial({ map, roughness: k === 2 ? 0.45 : 0.85, metalness: k === 2 ? 0.55 : 0 })
      mat.name = `construcao-${m.name}`
      this.materials.push(mat)
      const mesh = new THREE.InstancedMesh(this.geometry, mat, MAX_INSTANCES)
      mesh.count = 0
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
      mesh.name = `construcao-${m.name}`
      this.solid.push(mesh)
      this.group.add(mesh)
    })
    const buildMat = new THREE.MeshStandardMaterial({ map: this.textures[0], transparent: true, opacity: 0.55, roughness: 0.6, depthWrite: false, emissive: 0x1d4f80, emissiveIntensity: 0.6 })
    this.materials.push(buildMat)
    this.building = new THREE.InstancedMesh(this.geometry, buildMat, MAX_INSTANCES)
    this.building.count = 0
    this.building.frustumCulled = false
    this.building.name = 'construcao-em-andamento'
    this.group.add(this.building)

    this.ghostMat = new THREE.MeshBasicMaterial({ color: GHOST_OK, transparent: true, opacity: 0.32, depthWrite: false })
    this.materials.push(this.ghostMat)
    for (let k = 0; k < 2; k++) {
      const g = new THREE.Mesh(this.geometry, this.ghostMat)
      g.visible = false
      g.renderOrder = 10
      g.name = 'fantasma'
      this.ghost.push(g)
      this.group.add(g)
    }
  }

  /** Fantasma da peça que será construída (null = esconde). */
  setGhost(spec: PieceSpec | null, valid: boolean): void {
    const obbs = spec ? pieceObbs(spec) : []
    this.ghostMat.color.setHex(valid ? GHOST_OK : GHOST_BAD)
    this.ghost.forEach((g, k) => {
      const o = obbs[k]
      g.visible = !!o
      if (!o) return
      obbMatrix(o, g.matrix)
      g.matrix.decompose(g.position, g.quaternion, g.scale)
      // um pouco maior que a peça para não brigar com ela no z-buffer
      g.scale.multiplyScalar(1.01)
    })
  }

  update(serverTick: number, version: number): void {
    this.lastTick = serverTick
    if (version === this.version && serverTick < this.nextDoneTick) return
    this.version = version
    this.rebuild(serverTick)
  }

  /** Vida (0–1) de uma peça para o HUD. */
  healthFraction(p: Piece): number {
    return Math.max(0, pieceHealth(p, this.lastTick, this.tickRate)) / pieceMaxHealth(p.material)
  }

  private rebuild(tick: number): void {
    const counts = this.solid.map(() => 0)
    let nb = 0
    this.nextDoneTick = Infinity
    for (const p of this.world.byId.values()) {
      const m = BUILD_MATERIALS[p.material]
      const doneTick = p.builtAt + m.buildTime * this.tickRate
      const inProgress = tick < doneTick
      if (inProgress) this.nextDoneTick = Math.min(this.nextDoneTick, doneTick)
      // dano escurece a peça (até 45%)
      const life = Math.max(0, pieceHealth(p, tick, this.tickRate)) / m.maxHealth
      const shade = inProgress ? 1 : 0.55 + 0.45 * Math.min(1, life + (p.damage === 0 ? 1 : 0))
      for (const o of pieceObbs(p.spec)) {
        obbMatrix(o, tmpM)
        if (inProgress) {
          if (nb >= MAX_INSTANCES) continue
          this.building.setMatrixAt(nb, tmpM)
          this.building.setColorAt(nb, tmpC.copy(BUILDING_COLOR))
          nb++
        } else {
          const mesh = this.solid[p.material]
          const k = counts[p.material]
          if (k >= MAX_INSTANCES) continue
          mesh.setMatrixAt(k, tmpM)
          mesh.setColorAt(k, tmpC.setScalar(shade))
          counts[p.material]++
        }
      }
    }
    this.solid.forEach((mesh, k) => {
      mesh.count = counts[k]
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
    this.building.count = nb
    this.building.instanceMatrix.needsUpdate = true
    if (this.building.instanceColor) this.building.instanceColor.needsUpdate = true
  }

  /** Quantas peças estão desenhadas (para testes). */
  get drawn(): number {
    return this.solid.reduce((n, m) => n + m.count, 0) + this.building.count
  }

  dispose(): void {
    this.group.removeFromParent()
    this.geometry.dispose()
    for (const m of this.materials) m.dispose()
    for (const t of this.textures) t.dispose()
    for (const m of this.solid) m.dispose()
    this.building.dispose()
  }
}
