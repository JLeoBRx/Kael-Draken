import * as THREE from 'three'
import type { MaterialId, StaticBox } from '../../shared/maps/types'
import type { Obb } from '../../shared/world/obb'
import type { MaterialLibrary } from './materials'

/**
 * Geometria das caixas do mapa, agrupada por material em uma única malha
 * (poucas chamadas de desenho). As UVs são em metros, projetadas por face,
 * para a textura manter a escala em qualquer tamanho de caixa.
 */

class GeometryBuffer {
  positions: number[] = []
  normals: number[] = []
  uvs: number[] = []
  indices: number[] = []

  addBox(o: Obb): void {
    const axes = [
      [o.ux, o.uy, o.uz, o.hx],
      [o.vx, o.vy, o.vz, o.hy],
      [o.wx, o.wy, o.wz, o.hz],
    ] as const
    for (let k = 0; k < 3; k++) {
      const a = axes[(k + 1) % 3]
      const b = axes[(k + 2) % 3]
      const n = axes[k]
      for (const sign of [1, -1]) {
        const base = this.positions.length / 3
        const cx = o.cx + n[0] * n[3] * sign
        const cy = o.cy + n[1] * n[3] * sign
        const cz = o.cz + n[2] * n[3] * sign
        // UV: eixo horizontal/vertical coerentes para paredes (v cresce para cima)
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const
        for (const [sa, sb] of corners) {
          this.positions.push(
            cx + a[0] * a[3] * sa + b[0] * b[3] * sb,
            cy + a[1] * a[3] * sa + b[1] * b[3] * sb,
            cz + a[2] * a[3] * sa + b[2] * b[3] * sb,
          )
          this.normals.push(n[0] * sign, n[1] * sign, n[2] * sign)
          this.uvs.push((sa + 1) * a[3], (sb + 1) * b[3])
        }
        // ordem anti-horária vista de fora
        if (sign > 0) this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
        else this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
      }
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3))
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2))
    g.setIndex(this.positions.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.indices, 1) : new THREE.Uint16BufferAttribute(this.indices, 1))
    g.computeBoundingSphere()
    return g
  }
}

export function buildStaticMeshes(boxes: readonly StaticBox[], materials: MaterialLibrary): THREE.Mesh[] {
  const groups = new Map<MaterialId, GeometryBuffer>()
  for (const b of boxes) {
    let g = groups.get(b.material)
    if (!g) groups.set(b.material, (g = new GeometryBuffer()))
    g.addBox(b.obb)
  }
  const meshes: THREE.Mesh[] = []
  for (const [id, buf] of groups) {
    const mesh = new THREE.Mesh(buf.build(), materials.get(id))
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.name = `estrutura-${id}`
    meshes.push(mesh)
  }
  return meshes
}
