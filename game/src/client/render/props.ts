import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { Rng } from '../../shared/math/rng'
import type { Prop, PropKind } from '../../shared/maps/types'
import type { MaterialLibrary } from './materials'

/**
 * Vegetação, rochas e caixotes como malhas instanciadas (uma chamada de
 * desenho por parte). Modelos low-poly estilizados gerados em código; para
 * trocar por modelos GLTF, substitua as fábricas em PART_FACTORIES.
 */

interface Part {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  /** Variação de cor por instância (0 = nenhuma). */
  tint: number
  castShadow: boolean
}

function jitterGeometry(g: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g
  const pos = geo.attributes.position as THREE.BufferAttribute
  const rng = new Rng(seed)
  // desloca vértices coincidentes da mesma forma (sem rasgar a malha)
  const offsets = new Map<string, [number, number, number]>()
  for (let k = 0; k < pos.count; k++) {
    const key = `${pos.getX(k).toFixed(3)},${pos.getY(k).toFixed(3)},${pos.getZ(k).toFixed(3)}`
    let o = offsets.get(key)
    if (!o) offsets.set(key, (o = [rng.range(-amount, amount), rng.range(-amount, amount), rng.range(-amount, amount)]))
    pos.setXYZ(k, pos.getX(k) + o[0], pos.getY(k) + o[1], pos.getZ(k) + o[2])
  }
  geo.computeVertexNormals()
  return geo
}

function std(color: number, roughness = 0.9, flat = true): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, flatShading: flat })
}

function nonIndexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.index ? g.toNonIndexed() : g
}

/** Tempo do vento, compartilhado por toda a vegetação. */
export const windUniform = { value: 0 }

/**
 * Folhagem: normais "esféricas" (a copa é iluminada como um volume macio, não
 * como facetas), cor escurecendo para dentro e para baixo, e vento que
 * balança mais quanto mais alto (cada árvore com a sua fase).
 */
function foliage(g: THREE.BufferGeometry, center: THREE.Vector3, bottom: number, top: number): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g
  geo.computeVertexNormals()
  const pos = geo.attributes.position as THREE.BufferAttribute
  const nor = geo.attributes.normal as THREE.BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let k = 0; k < pos.count; k++) {
    v.set(pos.getX(k), pos.getY(k), pos.getZ(k))
    n.set(nor.getX(k), nor.getY(k), nor.getZ(k))
    const out = v.clone().sub(center).normalize()
    n.multiplyScalar(0.2).addScaledVector(out, 0.8).normalize()
    nor.setXYZ(k, n.x, n.y, n.z)
    const h = (v.y - bottom) / Math.max(0.01, top - bottom)
    const radial = Math.min(1, v.clone().sub(center).setY(0).length() / 1.6)
    const c = 0.62 + h * 0.38 + radial * 0.12
    colors[k * 3] = c
    colors[k * 3 + 1] = c
    colors[k * 3 + 2] = c * 0.96
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

function leafMaterial(color: number, sway: number, height: number): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, vertexColors: true })
  addWind(m, sway, height)
  return m
}

/** Balanço do vento no vértice (instâncias têm fase pela posição). */
function addWind(m: THREE.MeshStandardMaterial, sway: number, height: number): void {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = windUniform
    shader.vertexShader = 'uniform float uWind;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
      vec3 ip = vec3(0.0);
      #endif
      float hk = clamp(position.y / ${height.toFixed(2)}, 0.0, 1.0);
      float ph = ip.x * 0.21 + ip.z * 0.17;
      float gust = sin(uWind * 0.9 + ip.x * 0.013 + ip.z * 0.011) * 0.5 + 0.5;
      float w = (sin(uWind * 1.7 + ph) * 0.6 + sin(uWind * 3.1 + ph * 1.7) * 0.25) * (0.4 + gust * 0.8);
      transformed.x += w * ${sway.toFixed(3)} * hk * hk;
      transformed.z += w * ${(sway * 0.6).toFixed(3)} * hk * hk;`,
    )
  }
  m.customProgramCacheKey = () => `vento-${sway}-${height}`
}

/**
 * Cada tipo de adereço: versão detalhada e, para a vegetação, uma versão
 * simples para longe (`far`; lista vazia = some de longe). As partes da
 * versão simples usam os MESMOS materiais, na mesma ordem.
 */
interface KindParts {
  near: Part[]
  far?: Part[]
}

const PART_FACTORIES: Record<PropKind, (materials: MaterialLibrary) => KindParts> = {
  pine: () => {
    const trunk = new THREE.CylinderGeometry(0.12, 0.26, 3.0, 7).translate(0, 1.5, 0)
    // camadas de "saia" com borda serrilhada caindo (galhos)
    const tiers: THREE.BufferGeometry[] = []
    const layers = 5
    for (let k = 0; k < layers; k++) {
      const t = k / (layers - 1)
      const r = 1.9 - t * 1.35
      const h = 1.5 - t * 0.35
      const cone = new THREE.ConeGeometry(r, h, 11, 1, true)
      const p = cone.attributes.position as THREE.BufferAttribute
      for (let v = 0; v < p.count; v++) {
        // borda de baixo serrilhada e caída
        if (p.getY(v) < 0) {
          const a = Math.atan2(p.getZ(v), p.getX(v))
          p.setY(v, p.getY(v) - 0.18 - Math.abs(Math.sin(a * 5.5)) * 0.22)
        }
      }
      tiers.push(cone.translate(0, 2.0 + k * 0.85, 0))
    }
    tiers.push(new THREE.ConeGeometry(0.35, 0.9, 7).translate(0, 2.0 + layers * 0.85, 0))
    const crown = foliage(jitterGeometry(mergeGeometries(tiers.map(nonIndexed))!, 0.07, 1), new THREE.Vector3(0, 3.6, 0), 1.2, 6.6)
    const bark = std(0x5b3f2a, 0.95, false)
    const needles = leafMaterial(0x2f5d3a, 0.16, 6.5)
    needles.side = THREE.DoubleSide
    const farCrown = foliage(mergeGeometries([
      new THREE.ConeGeometry(1.9, 3.2, 6).translate(0, 3.2, 0),
      new THREE.ConeGeometry(1.2, 2.6, 6).translate(0, 5.0, 0),
    ].map(nonIndexed))!, new THREE.Vector3(0, 3.6, 0), 1.2, 6.6)
    return {
      near: [
        { geometry: trunk, material: bark, tint: 0.1, castShadow: true },
        { geometry: crown, material: needles, tint: 0.18, castShadow: true },
      ],
      far: [
        { geometry: new THREE.CylinderGeometry(0.12, 0.26, 3.0, 4).translate(0, 1.5, 0), material: bark, tint: 0.1, castShadow: false },
        { geometry: farCrown, material: needles, tint: 0.18, castShadow: false },
      ],
    }
  },
  broadleaf: () => {
    const trunk = mergeGeometries([
      new THREE.CylinderGeometry(0.15, 0.3, 2.6, 7).translate(0, 1.3, 0),
      new THREE.CylinderGeometry(0.06, 0.12, 1.3, 5).rotateZ(-0.7).translate(0.45, 2.6, 0),
      new THREE.CylinderGeometry(0.06, 0.12, 1.2, 5).rotateZ(0.8).rotateY(1.2).translate(-0.3, 2.5, -0.3),
    ])!
    const rng = new Rng(2)
    const blobs: THREE.BufferGeometry[] = [new THREE.IcosahedronGeometry(1.35, 1).translate(0, 3.6, 0)]
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rng.range(-0.3, 0.3)
      const r = rng.range(0.85, 1.35)
      const y = rng.range(2.8, 3.9)
      blobs.push(new THREE.IcosahedronGeometry(rng.range(0.7, 1.05), 1).translate(Math.cos(a) * r, y, Math.sin(a) * r))
    }
    const crown = foliage(jitterGeometry(mergeGeometries(blobs.map(nonIndexed))!, 0.1, 2), new THREE.Vector3(0, 3.4, 0), 2.0, 4.9)
    const bark = std(0x6a4a30, 0.95, false)
    const leaves = leafMaterial(0x5f8f3e, 0.22, 5)
    const farCrown = foliage(mergeGeometries([
      new THREE.IcosahedronGeometry(1.7, 0).translate(0, 3.5, 0),
      new THREE.IcosahedronGeometry(1.2, 0).translate(0.9, 3.0, 0.3),
      new THREE.IcosahedronGeometry(1.1, 0).translate(-0.8, 3.1, -0.4),
    ].map(nonIndexed))!, new THREE.Vector3(0, 3.4, 0), 2.0, 4.9)
    return {
      near: [
        { geometry: trunk, material: bark, tint: 0.1, castShadow: true },
        { geometry: crown, material: leaves, tint: 0.22, castShadow: true },
      ],
      far: [
        { geometry: new THREE.CylinderGeometry(0.15, 0.3, 2.6, 4).translate(0, 1.3, 0), material: bark, tint: 0.1, castShadow: false },
        { geometry: farCrown, material: leaves, tint: 0.22, castShadow: false },
      ],
    }
  },
  rock: () => ({ near: [
    { geometry: jitterGeometry(new THREE.DodecahedronGeometry(0.8, 0).scale(1, 0.75, 0.85).translate(0, 0.3, 0), 0.16, 3), material: std(0x8a8780, 0.95), tint: 0.12, castShadow: true },
  ] }),
  bush: () => {
    const parts = [
      new THREE.IcosahedronGeometry(0.5, 1).scale(1.2, 0.85, 1.1).translate(0, 0.38, 0),
      new THREE.IcosahedronGeometry(0.36, 1).translate(0.42, 0.3, 0.12),
      new THREE.IcosahedronGeometry(0.34, 1).translate(-0.38, 0.28, -0.15),
    ]
    const g = foliage(jitterGeometry(mergeGeometries(parts.map(nonIndexed))!, 0.06, 4), new THREE.Vector3(0, 0.35, 0), 0, 0.85)
    // arbustos somem de longe (a grama e o relevo já cobrem)
    return { near: [{ geometry: g, material: leafMaterial(0x4e7d36, 0.06, 0.9), tint: 0.25, castShadow: false }], far: [] }
  },
  crate: (materials) => ({ near: [
    { geometry: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), material: materials.get('wood'), tint: 0.08, castShadow: true },
  ] }),
}

export interface PropMeshes {
  meshes: THREE.InstancedMesh[]
  /** Esconde um adereço quebrado (índice em map.props). */
  hide(index: number): void
  /** Nível de detalhe da vegetação conforme a posição da câmera (barato: só refaz depois de andar alguns metros). */
  update(x: number, z: number): void
}

/** Distância percorrida pela câmera que refaz as listas de perto/longe (m). */
const LOD_STEP = 6

interface LodSet {
  parts: Part[]
  meshes: THREE.InstancedMesh[]
  /** Cor por instância e por parte (rgb). */
  colors: Float32Array[]
}

interface LodGroup {
  list: { p: Prop; index: number }[]
  matrices: Float32Array
  near: LodSet
  far: LodSet
}

/**
 * Monta os adereços. A vegetação tem dois níveis de detalhe: até `lodRadius`
 * da câmera, o modelo completo (o único que projeta sombra); além, o modelo
 * simples. Rochas e caixotes são estáticos (todas as instâncias sempre).
 */
export function buildPropMeshes(props: readonly Prop[], materials: MaterialLibrary, lodRadius = 140): PropMeshes {
  const byKind = new Map<PropKind, { p: Prop; index: number }[]>()
  props.forEach((p, index) => {
    let list = byKind.get(p.kind)
    if (!list) byKind.set(p.kind, (list = []))
    list.push({ p, index })
  })
  const meshes: THREE.InstancedMesh[] = []
  const instances = new Map<number, [THREE.InstancedMesh, number][]>()
  const groups: LodGroup[] = []
  const hidden = new Set<number>()
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const t = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const color = new THREE.Color()
  const matrixOf = (p: Prop, out: THREE.Matrix4) => {
    q.setFromAxisAngle(up, p.yaw)
    s.setScalar(p.scale)
    // sementes no chão: afunda um pouco para não flutuar em encostas
    t.set(p.x, p.y - 0.15 * p.scale, p.z)
    return out.compose(t, q, s)
  }
  const colorsFor = (part: Part, n: number, seed: number) => {
    const rng = new Rng(seed)
    const out = new Float32Array(n * 3)
    for (let k = 0; k < n; k++) {
      const v = 1 + rng.range(-part.tint, part.tint)
      out[k * 3] = v
      out[k * 3 + 1] = v * (1 + rng.range(-0.04, 0.04))
      out[k * 3 + 2] = v
    }
    return out
  }
  for (const [kind, list] of byKind) {
    const def = PART_FACTORIES[kind](materials)
    if (def.far) {
      const matrices = new Float32Array(list.length * 16)
      list.forEach(({ p }, k) => matrixOf(p, m).toArray(matrices, k * 16))
      const makeSet = (parts: Part[], tag: string): LodSet => ({
        parts,
        colors: parts.map((part, pi) => colorsFor(part, list.length, list.length * 31 + pi)),
        meshes: parts.map((part, pi) => {
          const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length)
          mesh.count = 0
          mesh.castShadow = part.castShadow
          mesh.receiveShadow = true
          mesh.name = `adereco-${kind}-${tag}-${pi}`
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
          mesh.setColorAt(0, color.setRGB(1, 1, 1))
          meshes.push(mesh)
          return mesh
        }),
      })
      groups.push({ list, matrices, near: makeSet(def.near, 'perto'), far: makeSet(def.far, 'longe') })
      continue
    }
    def.near.forEach((part, pi) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length)
      const colors = colorsFor(part, list.length, list.length * 31 + pi)
      list.forEach(({ p, index }, k) => {
        let refs = instances.get(index)
        if (!refs) instances.set(index, (refs = []))
        refs.push([mesh, k])
        mesh.setMatrixAt(k, matrixOf(p, m))
        mesh.setColorAt(k, color.setRGB(colors[k * 3], colors[k * 3 + 1], colors[k * 3 + 2]))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      mesh.castShadow = part.castShadow
      mesh.receiveShadow = true
      mesh.computeBoundingSphere()
      mesh.name = `adereco-${kind}-${pi}`
      meshes.push(mesh)
    })
  }

  let lastX = Infinity
  let lastZ = Infinity
  const r2 = lodRadius * lodRadius
  const fill = (g: LodGroup, set: LodSet, slot: number, k: number) => {
    for (let pi = 0; pi < set.meshes.length; pi++) {
      const mesh = set.meshes[pi]
      ;(mesh.instanceMatrix.array as Float32Array).set(g.matrices.subarray(k * 16, k * 16 + 16), slot * 16)
      ;(mesh.instanceColor!.array as Float32Array).set(set.colors[pi].subarray(k * 3, k * 3 + 3), slot * 3)
    }
  }
  const relod = (x: number, z: number) => {
    lastX = x
    lastZ = z
    for (const g of groups) {
      let nn = 0
      let nf = 0
      for (let k = 0; k < g.list.length; k++) {
        const { p, index } = g.list[k]
        if (hidden.has(index)) continue
        if ((p.x - x) ** 2 + (p.z - z) ** 2 <= r2) fill(g, g.near, nn++, k)
        else if (g.far.meshes.length) fill(g, g.far, nf++, k)
      }
      for (const [set, n] of [[g.near, nn], [g.far, nf]] as const) {
        for (const mesh of set.meshes) {
          mesh.count = n
          mesh.instanceMatrix.needsUpdate = true
          mesh.instanceColor!.needsUpdate = true
          mesh.computeBoundingSphere()
        }
      }
    }
  }

  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  return {
    meshes,
    hide(index) {
      hidden.add(index)
      for (const [mesh, k] of instances.get(index) ?? []) {
        mesh.setMatrixAt(k, zero)
        mesh.instanceMatrix.needsUpdate = true
      }
      if (groups.some((g) => g.list.some((e) => e.index === index))) relod(lastX === Infinity ? 0 : lastX, lastZ === Infinity ? 0 : lastZ)
    },
    update(x, z) {
      if ((x - lastX) ** 2 + (z - lastZ) ** 2 < LOD_STEP * LOD_STEP) return
      relod(x, z)
    },
  }
}
