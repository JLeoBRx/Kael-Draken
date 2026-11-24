import * as THREE from 'three'
import { DEG } from '../../shared/math/scalar'
import type { GameMap } from '../../shared/maps/types'
import type { QualityPreset } from '../settings'
import { MaterialLibrary } from './materials'
import { buildPropMeshes, windUniform, type PropMeshes } from './props'
import { createSky, updateSky } from './sky'
import { buildStaticMeshes } from './static-geometry'
import { createTerrainMaterial } from './terrain-material'
import { buildTerrainMeshes, computeTerrainFields } from './terrain-mesh'
import { GrassField } from './grass'
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
  private readonly heightTex: THREE.DataTexture
  private readonly waterTime = { value: 0 }
  private readonly disposables: { dispose(): void }[] = []
  private readonly envTarget: THREE.WebGLRenderTarget
  private readonly shadowRange: number
  private readonly props: PropMeshes
  private readonly terrainMaterial: THREE.MeshStandardMaterial
  private readonly grass: GrassField | null

  constructor(readonly map: GameMap, renderer: THREE.WebGLRenderer, quality: QualityPreset) {
    const atm = map.def.atmosphere
    const az = atm.sunAzimuth * DEG
    const el = atm.sunElevation * DEG
    // azimute 0 = norte (-Z), 90 = leste (+X)
    this.sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize()
    const skyTop = new THREE.Color(atm.skyTop)
    const horizon = new THREE.Color(atm.skyHorizon)

    this.sky = createSky(skyTop, horizon, this.sunDir, { clouds: quality.clouds })
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

    this.terrainMaterial = createTerrainMaterial(quality.post === 'nenhum')
    const fields = computeTerrainFields(map.terrain, map.def.biome, map.def.waterLevel)
    for (const mesh of buildTerrainMeshes(map.terrain, fields, this.terrainMaterial)) this.add(mesh)
    this.grass = quality.grass > 0 ? new GrassField(map.terrain, fields, map.boxes, map.def.waterLevel, quality.grass, quality.grassRadius) : null
    if (this.grass) this.scene.add(this.grass.mesh)
    for (const mesh of buildStaticMeshes(map.boxes, this.materials)) this.add(mesh)
    this.props = buildPropMeshes(map.props, this.materials, quality.treeDetail)
    for (const mesh of this.props.meshes) this.add(mesh)

    // Água: plano extenso até o horizonte com normais animadas; cor pela
    // profundidade (raso turquesa → fundo azul-escuro) e espuma na beira
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
    const hf = map.terrain
    this.heightTex = new THREE.DataTexture(hf.heights, hf.n, hf.n, THREE.RedFormat, THREE.FloatType)
    this.heightTex.needsUpdate = true
    const waterUniforms = {
      uHeight: { value: this.heightTex }, uN: { value: hf.n }, uCell: { value: hf.cell }, uMin: { value: hf.min },
      uLevel: { value: map.def.waterLevel }, uTime: this.waterTime,
    }
    waterMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, waterUniforms)
      shader.vertexShader = 'varying vec3 vWaterPos;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = /* glsl */ `
        uniform sampler2D uHeight;
        uniform float uN;
        uniform float uCell;
        uniform float uMin;
        uniform float uLevel;
        uniform float uTime;
        varying vec3 vWaterPos;
        float wh(vec2 g) { return texelFetch(uHeight, ivec2(clamp(g, vec2(0.0), vec2(uN - 1.0))), 0).r; }
        float groundAt(vec2 w) {
          vec2 g = (w - uMin) / uCell;
          if (g.x < 0.0 || g.y < 0.0 || g.x > uN - 1.0 || g.y > uN - 1.0) return uLevel - 30.0;
          vec2 i = floor(g);
          vec2 f = g - i;
          return mix(mix(wh(i), wh(i + vec2(1.0, 0.0)), f.x), mix(wh(i + vec2(0.0, 1.0)), wh(i + vec2(1.0, 1.0)), f.x), f.y);
        }
      ` + shader.fragmentShader.replace('#include <color_fragment>', /* glsl */ `
        #include <color_fragment>
        float depth = max(0.0, uLevel - groundAt(vWaterPos.xz));
        vec3 shallow = vec3(0.10, 0.42, 0.42);
        vec3 deep = vec3(0.018, 0.11, 0.2);
        diffuseColor.rgb = mix(shallow, deep, smoothstep(0.2, 7.0, depth));
        float wave = sin(uTime * 1.6 - depth * 9.0 + sin(vWaterPos.x * 0.35 + uTime * 0.4) * 1.5) * 0.5 + 0.5;
        float foam = (1.0 - smoothstep(0.0, 0.55, depth)) * (0.55 + 0.45 * wave);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.96, 0.97), foam * 0.85);
        diffuseColor.a = mix(0.55, 0.9, smoothstep(0.0, 3.5, depth)) + foam * 0.3;
      `).replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.6, foam);')
    }
    waterMat.customProgramCacheKey = () => 'agua-profundidade'
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
    updateSky(this.sky, elapsed)
    this.grass?.update(camera, elapsed)
    windUniform.value = elapsed
    this.props.update(camera.position.x, camera.position.z)
    // Sombras: câmera do sol centrada no jogador, presa à grade de texels para não tremeluzir
    const texel = (this.shadowRange * 2) / this.sun.shadow.mapSize.x
    const fx = Math.round(focus.x / texel) * texel
    const fz = Math.round(focus.z / texel) * texel
    this.sun.target.position.set(fx, focus.y, fz)
    this.sun.position.set(fx + this.sunDir.x * 150, focus.y + this.sunDir.y * 150, fz + this.sunDir.z * 150)
    this.sun.target.updateMatrixWorld()
    this.waterNormal.offset.set((elapsed * 0.004) % 1, (elapsed * 0.0027) % 1)
    this.waterTime.value = elapsed
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose()
    this.materials.dispose()
    this.terrainMaterial.dispose()
    this.grass?.dispose()
    this.waterNormal.dispose()
    this.heightTex.dispose()
    ;(this.water.material as THREE.Material).dispose()
    ;(this.sky.material as THREE.Material).dispose()
    this.sky.geometry.dispose()
    this.envTarget.dispose()
    this.scene.clear()
  }
}
