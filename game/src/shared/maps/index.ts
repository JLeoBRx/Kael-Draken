import { buildMap } from './builder'
import { provingGrounds } from './proving-grounds'
import type { GameMap, MapDefinition } from './types'

/** Registro de mapas disponíveis. O mapa principal do battle royale entra aqui na Fase 2. */
export const MAPS: Record<string, MapDefinition> = {
  [provingGrounds.id]: provingGrounds,
}

export const DEFAULT_MAP_ID = provingGrounds.id

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
