import * as THREE from 'three'
import { fbm2 } from '../../shared/math/noise'
import { smoothstep } from '../../shared/math/scalar'
import type { Biome } from '../../shared/maps/types'
import type { Heightfield } from '../../shared/world/heightfield'

/**
 * Malha do relevo em blocos (frustum culling por bloco). A triangulação é a
 * mesma do Heightfield (diagonal (i+1,j)–(i,j+1)), então o chão desenhado
 * coincide com o chão da colisão.
 */

const CHUNK = 64

export function buildTerrainMeshes(hf: Heightfield, biome: Biome, waterLevel: number, material: THREE.Material): THREE.Mesh[] {
  const n = hf.n
  const cells = n - 1
  const meshes: THREE.Mesh[] = []
  const col = {
    sand: new THREE.Color(biome.sand),
    grass: new THREE.Color(biome.grass),
    grassDry: new THREE.Color(biome.grassDry),
    forest: new THREE.Color(biome.forest),
    dirt: new THREE.Color(biome.dirt),
    rock: new THREE.Color(biome.rock),
    snow: new THREE.Color(biome.snow),
    seabed: new THREE.Color(biome.seabed),
  }
  const tmp = new THREE.Color()
  const out = new THREE.Color()

  const normalAt = (i: number, j: number, target: THREE.Vector3) => {
    const hl = hf.get(i - 1, j)
    const hr = hf.get(i + 1, j)
    const hd = hf.get(i, j - 1)
    const hu = hf.get(i, j + 1)
    return target.set(hl - hr, 2 * hf.cell, hd - hu).normalize()
  }

  const colorAt = (x: number, z: number, h: number, slope: number) => {
    const n1 = fbm2(x / 55, z / 55, 77, 3) * 0.5 + 0.5
    const n2 = fbm2(x / 13, z / 13, 78, 2) * 0.5 + 0.5
    // grama com manchas secas e de mata
    out.copy(col.grass).lerp(col.grassDry, smoothstep(0.55, 0.8, n1))
    out.lerp(tmp.copy(col.forest), smoothstep(-80, -130, x) * 0.8)
    out.lerp(col.dirt, smoothstep(0.72, 0.9, n2) * 0.55)
    // areia na praia
    out.lerp(col.sand, 1 - smoothstep(biome.sandLevel - 0.3, biome.sandLevel + 0.6, h))
    // fundo submerso
    out.lerp(col.seabed, 1 - smoothstep(waterLevel - 2.5, waterLevel - 0.3, h))
    // rocha nas encostas
    out.lerp(col.rock, smoothstep(0.2, 0.42, slope))
    // neve nos picos (só onde não é íngreme)
    out.lerp(col.snow, smoothstep(biome.snowLevel - 4, biome.snowLevel + 3, h + n2 * 4) * (1 - smoothstep(0.35, 0.6, slope)))
    const jitter = 0.94 + n2 * 0.12
    return out.multiplyScalar(jitter)
  }

  const normal = new THREE.Vector3()
  for (let cj = 0; cj < cells; cj += CHUNK) {
    for (let ci = 0; ci < cells; ci += CHUNK) {
      const ni = Math.min(CHUNK, cells - ci)
      const nj = Math.min(CHUNK, cells - cj)
      const vw = ni + 1
      const vh = nj + 1
      const positions = new Float32Array(vw * vh * 3)
      const normals = new Float32Array(vw * vh * 3)
      const colors = new Float32Array(vw * vh * 3)
      const uvs = new Float32Array(vw * vh * 2)
      for (let j = 0; j < vh; j++) {
        for (let i = 0; i < vw; i++) {
          const gi = ci + i
          const gj = cj + j
          const x = hf.worldX(gi)
          const z = hf.worldZ(gj)
          const h = hf.get(gi, gj)
          const k = j * vw + i
          positions[k * 3] = x
          positions[k * 3 + 1] = h
          positions[k * 3 + 2] = z
          normalAt(gi, gj, normal)
          normals[k * 3] = normal.x
          normals[k * 3 + 1] = normal.y
          normals[k * 3 + 2] = normal.z
          const c = colorAt(x, z, h, 1 - normal.y)
          colors[k * 3] = c.r
          colors[k * 3 + 1] = c.g
          colors[k * 3 + 2] = c.b
          uvs[k * 2] = x
          uvs[k * 2 + 1] = z
        }
      }
      const index = new Uint32Array(ni * nj * 6)
      let p = 0
      for (let j = 0; j < nj; j++) {
        for (let i = 0; i < ni; i++) {
          const a = j * vw + i
          const b = a + 1
          const c = a + vw
          const d = c + 1
          index[p++] = a; index[p++] = c; index[p++] = b
          index[p++] = b; index[p++] = c; index[p++] = d
        }
      }
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      g.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
      g.setIndex(new THREE.BufferAttribute(index, 1))
      g.computeBoundingSphere()
      g.computeBoundingBox()
      const mesh = new THREE.Mesh(g, material)
      mesh.receiveShadow = true
      mesh.name = `terreno-${ci}-${cj}`
      meshes.push(mesh)
    }
  }
  return meshes
}
