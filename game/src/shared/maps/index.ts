import { buildMap } from './builder'
import { emberIsland } from './ember-island'
import { provingGrounds } from './proving-grounds'
import type { GameMap, MapDefinition } from './types'

/** Registro de mapas disponíveis. */
export const MAPS: Record<string, MapDefinition> = {
  [emberIsland.id]: emberIsland,
  [provingGrounds.id]: provingGrounds,
}

/** Mapa principal (battle royale). */
export const MAIN_MAP_ID = emberIsland.id
/** Mapa de testes/treino. */
export const TRAINING_MAP_ID = provingGrounds.id
export const DEFAULT_MAP_ID = MAIN_MAP_ID

export function getMapDefinition(id: string): MapDefinition {
  const def = MAPS[id]
  if (!def) throw new Error(`Mapa desconhecido: ${id}`)
  return def
}

export function loadMap(id: string): GameMap {
  return buildMap(getMapDefinition(id))
}

export { buildMap, regionAt } from './builder'
export type * from './types'
