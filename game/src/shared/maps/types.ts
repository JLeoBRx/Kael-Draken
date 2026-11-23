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
  | 'metal-blue' | 'metal-green' | 'asphalt'

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

/** Baú: abre com "Interagir" e solta itens. `tier` 0–2 controla a raridade. */
export interface Chest {
  x: number
  y: number
  z: number
  yaw: number
  tier: number
}

/** Item fixo de um ponto de loot (arsenal do campo de provas). */
export interface FixedLoot {
  item: number
  rarity: number
  count: number
}

/** Ponto de loot no chão. */
export interface LootSpot {
  x: number
  y: number
  z: number
  tier: number
  /** Se definido, sempre este item (senão, sorteado pela tabela de loot). */
  fixed?: FixedLoot
  /** Segundos para repor depois de pego (0 = não repõe). */
  refill?: number
}

/** Boneco de treino (alvo de tiro). */
export interface TargetDummy {
  x: number
  y: number
  z: number
  yaw: number
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
  chests: Chest[]
  lootSpots: LootSpot[]
  targets: TargetDummy[]
  /** Colisor → índice do adereço (árvores, rochas e caixotes podem ser quebrados). */
  propColliders: Map<number, number>
  /** Vãos de passagem (portas, aberturas em muros) — usados pela navegação dos bots. */
  portals: Portal[]
}

/** Abertura por onde uma pessoa passa: centro no chão e normal da parede. */
export interface Portal {
  x: number
  y: number
  z: number
  nx: number
  nz: number
  width: number
}
