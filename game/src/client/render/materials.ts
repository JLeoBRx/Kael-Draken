import * as THREE from 'three'
import type { MaterialId } from '../../shared/maps/types'
import { brickTexture, concreteTexture, gridTexture, metalTexture, plasterTexture, woodTexture } from './textures'

/**
 * Registro de materiais do mundo. É o ÚNICO lugar que liga um MaterialId do
 * mapa a uma aparência — para trocar placeholders por texturas reais,
 * substitua a fábrica correspondente aqui.
 */

interface MaterialSpec {
  make: () => THREE.Texture
  /** Metros cobertos por um tile da textura. */
  tile: number
  roughness: number
  metalness: number
}

const SPECS: Record<MaterialId, MaterialSpec> = {
  'grid-orange': { make: () => gridTexture(0xe0773c, 0x7a3510), tile: 1, roughness: 0.75, metalness: 0 },
  'grid-gray': { make: () => gridTexture(0x8d9299, 0x3d4248), tile: 1, roughness: 0.85, metalness: 0 },
  'grid-blue': { make: () => gridTexture(0x3f7fc0, 0x1b3d63), tile: 1, roughness: 0.75, metalness: 0 },
  'grid-dark': { make: () => gridTexture(0x44474d, 0xd44a3a), tile: 1, roughness: 0.8, metalness: 0 },
  concrete: { make: () => concreteTexture(0xa6a39c), tile: 2, roughness: 0.92, metalness: 0 },
  plaster: { make: () => plasterTexture(0xe7e1d4), tile: 2, roughness: 0.95, metalness: 0 },
  'plaster-warm': { make: () => plasterTexture(0xe3b98c), tile: 2, roughness: 0.95, metalness: 0 },
  brick: { make: () => brickTexture(0xa2513a, 0xcfc3b0), tile: 2, roughness: 0.9, metalness: 0 },
  wood: { make: () => woodTexture(0xa87b4f), tile: 2, roughness: 0.85, metalness: 0 },
  'wood-dark': { make: () => woodTexture(0x6b4a30), tile: 2, roughness: 0.85, metalness: 0 },
  metal: { make: () => metalTexture(0x9ea5ab), tile: 2, roughness: 0.45, metalness: 0.6 },
  'metal-red': { make: () => metalTexture(0x9c3b2e), tile: 2, roughness: 0.55, metalness: 0.35 },
  'metal-blue': { make: () => metalTexture(0x2f5f9e), tile: 2, roughness: 0.55, metalness: 0.35 },
  'metal-green': { make: () => metalTexture(0x3f7a4a), tile: 2, roughness: 0.55, metalness: 0.35 },
  asphalt: { make: () => concreteTexture(0x4a4d52), tile: 6, roughness: 0.95, metalness: 0 },
}

export class MaterialLibrary {
  private readonly cache = new Map<string, THREE.Material>()
  private readonly textures: THREE.Texture[] = []

  /** Material para caixas do mapa (UV em metros, ajustado pelo tamanho do tile). */
  get(id: MaterialId): THREE.MeshStandardMaterial {
    let m = this.cache.get(id) as THREE.MeshStandardMaterial | undefined
    if (!m) {
      const spec = SPECS[id]
      const map = spec.make()
      map.repeat.set(1 / spec.tile, 1 / spec.tile)
      this.textures.push(map)
      m = new THREE.MeshStandardMaterial({ map, roughness: spec.roughness, metalness: spec.metalness })
      m.name = id
      this.cache.set(id, m)
    }
    return m
  }

  dispose(): void {
    for (const m of this.cache.values()) m.dispose()
    for (const t of this.textures) t.dispose()
    this.cache.clear()
    this.textures.length = 0
  }
}
