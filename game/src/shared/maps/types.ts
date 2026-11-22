import type { CollisionWorld } from '../world/collision-world'
import type { Heightfield } from '../world/heightfield'
import type { Obb } from '../world/obb'
import type { MapBuilder } from './builder'

/**
 * Formato de mapa. Um mapa é DADO + um gerador determinístico: cliente e
 * servidor executam o mesmo `build` com a mesma semente e obtêm o mesmo
 * relevo e as mesmas caixas de colisão, sem transferir geometria pela rede.
 */

/** Materiais visuais. O cliente os resolve no registro de materiais (substituível por texturas reais). */
export type MaterialId =
  | 'grid-orange' | 'grid-gray' | 'grid-blue' | 'grid-dark'
  | 'concrete' | 'plaster' | 'plaster-warm' | 'brick' | 'wood' | 'wood-dark' | 'metal' | 'metal-red'

export interface StaticBox {
  obb: Obb
  material: MaterialId
  colliderId: number
}

export type PropKind = 'pine' | 'broadleaf' | 'rock' | 'bush' | 'crate'

export interface Prop {
  kind: PropKind
  x: number
  y: number
  z: number
  yaw: number
  scale: number
}

/** Placa de texto no mundo (campo de provas, sinalização). */
export interface MapLabel {
  text: string
  x: number
  y: number
  z: number
  yaw: number
  /** Altura da placa em metros. */
  size: number
}

export interface Region {
  id: string
  name: string
  x: number
  z: number
  radius: number
}

export interface SpawnPoint {
  x: number
  z: number
  yaw: number
}

/** Cores do relevo (0xRRGGBB) e limiares de altura. */
export interface Biome {
  sand: number
  grass: number
  grassDry: number
  forest: number
  dirt: number
  rock: number
  snow: number
  seabed: number
  sandLevel: number
  snowLevel: number
}

export interface Atmosphere {
  /** Azimute do sol em graus (0 = norte/-Z, 90 = leste/+X). */
  sunAzimuth: number
  sunElevation: number
  skyTop: number
  skyHorizon: number
  fogDensity: number
}

export interface MapDefinition {
  id: string
  name: string
  description: string
  /** Amostras do relevo por lado. */
  samples: number
  /** Distância entre amostras (m). */
  cell: number
  seed: number
  waterLevel: number
  biome: Biome
  atmosphere: Atmosphere
  build(b: MapBuilder): void
}

export interface GameMap {
  def: MapDefinition
  terrain: Heightfield
  world: CollisionWorld
  boxes: StaticBox[]
  props: Prop[]
  labels: MapLabel[]
  regions: Region[]
  spawns: SpawnPoint[]
}
