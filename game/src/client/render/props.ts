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

const PART_FACTORIES: Record<PropKind, (materials: MaterialLibrary) => Part[]> = {
  pine: () => {
    const trunk = new THREE.CylinderGeometry(0.14, 0.24, 2.6, 7).translate(0, 1.3, 0)
    const cones = [
      new THREE.ConeGeometry(1.7, 2.6, 8).translate(0, 2.6, 0),
      new THREE.ConeGeometry(1.35, 2.3, 8).translate(0, 3.8, 0),
      new THREE.ConeGeometry(0.95, 2.0, 8).translate(0, 4.9, 0),
    ]
    return [
      { geometry: trunk, material: std(0x5b3f2a), tint: 0.1, castShadow: true },
      { geometry: jitterGeometry(mergeGeometries(cones)!, 0.12, 1), material: std(0x2f5d3a), tint: 0.18, castShadow: true },
    ]
  },
  broadleaf: () => {
    const trunk = new THREE.CylinderGeometry(0.16, 0.3, 2.4, 7).translate(0, 1.2, 0)
    const blobs = [
      new THREE.IcosahedronGeometry(1.6, 1).translate(0, 3.3, 0),
      new THREE.IcosahedronGeometry(1.15, 1).translate(0.9, 2.9, 0.3),
      new THREE.IcosahedronGeometry(1.05, 1).translate(-0.8, 3.0, -0.4),
    ]
    return [
      { geometry: trunk, material: std(0x6a4a30), tint: 0.1, castShadow: true },
      { geometry: jitterGeometry(mergeGeometries(blobs)!, 0.14, 2), material: std(0x5f8f3e), tint: 0.22, castShadow: true },
    ]
  },
  rock: () => [
    { geometry: jitterGeometry(new THREE.DodecahedronGeometry(0.8, 0).scale(1, 0.75, 0.85).translate(0, 0.3, 0), 0.16, 3), material: std(0x8a8780, 0.95), tint: 0.12, castShadow: true },
  ],
  bush: () => [
    { geometry: jitterGeometry(new THREE.IcosahedronGeometry(0.55, 0).scale(1.2, 0.8, 1.1).translate(0, 0.35, 0), 0.08, 4), material: std(0x4e7d36), tint: 0.25, castShadow: false },
  ],
  crate: (materials) => [
    { geometry: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), material: materials.get('wood'), tint: 0.08, castShadow: true },
  ],
}

export interface PropMeshes {
  meshes: THREE.InstancedMesh[]
  /** Esconde um adereço quebrado (índice em map.props). */
  hide(index: number): void
}

export function buildPropMeshes(props: readonly Prop[], materials: MaterialLibrary): PropMeshes {
  const byKind = new Map<PropKind, { p: Prop; index: number }[]>()
  props.forEach((p, index) => {
    let list = byKind.get(p.kind)
    if (!list) byKind.set(p.kind, (list = []))
    list.push({ p, index })
  })
  const meshes: THREE.InstancedMesh[] = []
  const instances = new Map<number, [THREE.InstancedMesh, number][]>()
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const s = new THREE.Vector3()
  const t = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const color = new THREE.Color()
  for (const [kind, list] of byKind) {
    const parts = PART_FACTORIES[kind](materials)
    parts.forEach((part, pi) => {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, list.length)
      const rng = new Rng(list.length * 31 + pi)
      list.forEach(({ p, index }, k) => {
        let refs = instances.get(index)
        if (!refs) instances.set(index, (refs = []))
        refs.push([mesh, k])
        q.setFromAxisAngle(up, p.yaw)
        s.setScalar(p.scale)
        // sementes no chão: afunda um pouco para não flutuar em encostas
        t.set(p.x, p.y - 0.15 * p.scale, p.z)
        m.compose(t, q, s)
        mesh.setMatrixAt(k, m)
        const v = 1 + rng.range(-part.tint, part.tint)
        mesh.setColorAt(k, color.setRGB(v, v * (1 + rng.range(-0.04, 0.04)), v))
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
  const zero = new THREE.Matrix4().makeScale(0, 0, 0)
  return {
    meshes,
    hide(index) {
      for (const [mesh, k] of instances.get(index) ?? []) {
        mesh.setMatrixAt(k, zero)
        mesh.instanceMatrix.needsUpdate = true
      }
    },
  }
}
