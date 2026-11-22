import * as THREE from 'three'
import { DEG } from '../../shared/math/scalar'
import type { GameMap } from '../../shared/maps/types'
import type { QualityPreset } from '../settings'
import { MaterialLibrary } from './materials'
import { buildPropMeshes, type PropMeshes } from './props'
import { createSky } from './sky'
import { buildStaticMeshes } from './static-geometry'
import { buildTerrainMeshes } from './terrain-mesh'
import { textTexture, waterNormalTexture } from './textures'

/**
 * Cena do mundo: céu, luz do sol com sombras que acompanham o jogador,
 * neblina, relevo, estruturas, vegetação, água e placas.
 */
export class WorldView {
  readonly scene = new THREE.Scene()
  readonly materials = new MaterialLibrary()
  private readonly sun: THREE.DirectionalLight
  private readonly sunDir: THREE.Vector3
  private readonly sky: THREE.Mesh
  private readonly water: THREE.Mesh
  private readonly waterNormal: THREE.Texture
  private readonly disposables: { dispose(): void }[] = []
  private readonly envTarget: THREE.WebGLRenderTarget
  private readonly shadowRange: number
  private readonly props: PropMeshes

  constructor(readonly map: GameMap, renderer: THREE.WebGLRenderer, quality: QualityPreset) {
    const atm = map.def.atmosphere
    const az = atm.sunAzimuth * DEG
    const el = atm.sunElevation * DEG
    // azimute 0 = norte (-Z), 90 = leste (+X)
    this.sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize()
    const skyTop = new THREE.Color(atm.skyTop)
    const horizon = new THREE.Color(atm.skyHorizon)

    this.sky = createSky(skyTop, horizon, this.sunDir)
    this.scene.add(this.sky)
    this.scene.background = horizon.clone()
    this.scene.fog = new THREE.FogExp2(horizon.clone(), atm.fogDensity * quality.fogScale)

    // Ambiente PMREM a partir do próprio céu (reflexos e luz indireta)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envScene = new THREE.Scene()
    envScene.add(createSky(skyTop, horizon, this.sunDir))
    this.envTarget = pmrem.fromScene(envScene, 0.02)
    this.scene.environment = this.envTarget.texture
    this.scene.environmentIntensity = 0.55
    pmrem.dispose()

    const hemi = new THREE.HemisphereLight(skyTop.clone().lerp(new THREE.Color(0xffffff), 0.4), new THREE.Color(0x5a5040), 0.55)
    this.scene.add(hemi)

    this.sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.95, 0.86), 2.7)
    this.shadowRange = quality.shadowRange
    if (quality.shadows) {
      this.sun.castShadow = true
      this.sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize)
      const r = quality.shadowRange
      const cam = this.sun.shadow.camera
      cam.left = -r
      cam.right = r
      cam.top = r
      cam.bottom = -r
      cam.near = 1
      cam.far = 400
      this.sun.shadow.bias = -0.0004
      this.sun.shadow.normalBias = 0.03
    }
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    for (const mesh of buildTerrainMeshes(map.terrain, map.def.biome, map.def.waterLevel, this.materials.terrain())) this.add(mesh)
    for (const mesh of buildStaticMeshes(map.boxes, this.materials)) this.add(mesh)
    this.props = buildPropMeshes(map.props, this.materials)
    for (const mesh of this.props.meshes) this.add(mesh)

    // Água: plano extenso até o horizonte com normais animadas
    this.waterNormal = waterNormalTexture()
    this.waterNormal.repeat.set(220, 220)
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x1f5f7a,
      roughness: 0.06,
      metalness: 0.1,
      transparent: true,
      opacity: 0.84,
      normalMap: this.waterNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
    })
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), waterMat)
    this.water.position.y = map.def.waterLevel
    this.water.receiveShadow = true
    this.water.name = 'agua'
    this.add(this.water)

    this.buildLabels()
  }

  private add(obj: THREE.Mesh | THREE.InstancedMesh): void {
    this.scene.add(obj)
    this.disposables.push(obj.geometry)
    if (obj instanceof THREE.InstancedMesh) this.disposables.push(obj)
  }

  private buildLabels(): void {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x2a2e35, roughness: 0.6 })
    this.disposables.push(postMat)
    for (const l of this.map.labels) {
      const { texture, aspect } = textTexture(l.text, { accent: '#ff7a2f' })
      const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, fog: true })
      const w = l.size * aspect
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(w, l.size), mat)
      plate.position.set(l.x, l.y, l.z)
      plate.rotation.y = l.yaw
      plate.name = `placa-${l.text}`
      this.scene.add(plate)
      this.disposables.push(texture, mat, plate.geometry)
      const ground = this.map.terrain.heightAt(l.x, l.z)
      const postH = l.y - l.size / 2 - ground
      if (postH > 0.6 && postH < 6) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, postH, 0.08), postMat)
        post.position.set(l.x, ground + postH / 2, l.z - Math.cos(l.yaw) * 0.05)
        post.castShadow = true
        this.scene.add(post)
        this.disposables.push(post.geometry)
      }
    }
  }

  /** Adereço quebrado (árvore cortada, rocha minerada, caixote destruído). */
  hideProp(index: number): void {
    this.props.hide(index)
  }

  /** Chamar a cada quadro com a posição do jogador e da câmera. */
  update(focus: THREE.Vector3, camera: THREE.Camera, elapsed: number): void {
    this.sky.position.copy(camera.position)
    // Sombras: câmera do sol centrada no jogador, presa à grade de texels para não tremeluzir
    const texel = (this.shadowRange * 2) / this.sun.shadow.mapSize.x
    const fx = Math.round(focus.x / texel) * texel
    const fz = Math.round(focus.z / texel) * texel
    this.sun.target.position.set(fx, focus.y, fz)
    this.sun.position.set(fx + this.sunDir.x * 150, focus.y + this.sunDir.y * 150, fz + this.sunDir.z * 150)
    this.sun.target.updateMatrixWorld()
    this.waterNormal.offset.set((elapsed * 0.004) % 1, (elapsed * 0.0027) % 1)
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.materials.dispose()
    this.waterNormal.dispose()
    ;(this.water.material as THREE.Material).dispose()
    ;(this.sky.material as THREE.Material).dispose()
    this.sky.geometry.dispose()
    this.envTarget.dispose()
    this.scene.clear()
  }
}
