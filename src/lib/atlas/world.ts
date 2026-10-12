import worldData from '@/data/atlas/world.json'

/**
 * Dados cartográficos do Atlas, separados da renderização (2D e 3D).
 *
 * A carta é o mapa ilustrado do manuscrito; nomes, capitais e fronteiras são
 * conceituais. As regiões clicáveis ficam em src/data/atlas/world.json,
 * geradas por `npm run art:mapas` (scripts/art/manuscript_map.py).
 */

export type Point = [number, number]

export interface WorldRegion {
  id: string
  reino: string
  estado: 'conceitual'
  /** Ponto do rótulo (u, v em [0, 1]). */
  rotulo: Point
  /** Polígono da zona conceitual (u, v em [0, 1]); a água é recortada pela máscara de terra. */
  poligono: Point[]
}

export interface WorldData {
  estado: 'conceitual'
  nota: string
  /** A carta vem ilustrada (nomes desenhados no próprio mapa). */
  cartaIlustrada?: boolean
  largura: number
  altura: number
  relevo: { arquivo: string; codificacao: 'rg16'; largura: number; altura: number; nivelDoMar: number }
  mascaraTerra: string
  regioes: WorldRegion[]
}

export const WORLD = worldData as unknown as WorldData
export const WORLD_ASPECT = WORLD.largura / WORLD.altura

export type MapVersionId = 'original' | 'conhecido'

export interface MapVersion {
  id: MapVersionId
  label: string
  sublabel: string
  description: string
  /** Regiões que não aparecem como reino nesta versão. */
  erased: string[]
}

export const MAP_VERSIONS: Record<MapVersionId, MapVersion> = {
  original: {
    id: 'original',
    label: 'Mundo original',
    sublabel: 'Seis reinos',
    description: 'O mundo como era antes da Noite das Cinzas, com os seis reinos — incluindo Safra.',
    erased: [],
  },
  conhecido: {
    id: 'conhecido',
    label: 'Mundo conhecido',
    sublabel: 'Versão oficial · cinco reinos',
    description: 'A versão oficial da história, na qual Safra foi apagada e apenas cinco reinos são reconhecidos.',
    erased: ['safra'],
  },
}

/** Teste de ponto em polígono (regra par-ímpar). */
export function pointInPolygon(u: number, v: number, polygon: Point[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi + 1e-12) + xi) inside = !inside
  }
  return inside
}

export function regionAt(u: number, v: number, regions: Array<{ id: string; poligono?: Point[]; polygon?: Point[] }>): string | null {
  for (const r of regions) {
    const poly = r.polygon ?? r.poligono
    if (poly && pointInPolygon(u, v, poly)) return r.id
  }
  return null
}

export function polygonPath(polygon: Point[], width: number, height: number): string {
  return polygon.map(([u, v], i) => `${i ? 'L' : 'M'}${(u * width).toFixed(1)} ${(v * height).toFixed(1)}`).join(' ') + ' Z'
}
