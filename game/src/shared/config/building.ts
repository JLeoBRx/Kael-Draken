/**
 * Construção: grade, custos e resistência por material. Dados compartilhados
 * pelo servidor (autoridade) e pelo cliente (fantasma e predição).
 */

export const BUILD = {
  /** Lado da célula da grade (m). */
  cell: 4,
  /** Altura de um nível (m): rampas de 4 × 4 m têm exatamente 45°. */
  level: 4,
  /** Material gasto por peça. */
  cost: 10,
  /** Intervalo mínimo entre peças (s) — construção contínua segurando o botão. */
  cooldown: 0.12,
  /** Distância à frente dos olhos usada para escolher a célula alvo (m). */
  reach: 3.2,
  wallThickness: 0.2,
  floorThickness: 0.2,
  rampThickness: 0.25,
  roofRise: 1.6,
  roofThickness: 0.2,
  /** Altura máxima de construção acima do ponto mais alto do relevo (m). */
  maxHeightAboveTerrain: 60,
} as const

export const BuildKind = { None: 0, Wall: 1, Floor: 2, Ramp: 3, Roof: 4 } as const
export type BuildKindId = (typeof BuildKind)[keyof typeof BuildKind]

export const BUILD_KIND_NAMES: Record<number, string> = { 1: 'Parede', 2: 'Piso', 3: 'Rampa', 4: 'Telhado' }

export interface BuildMaterialStats {
  name: string
  maxHealth: number
  /** Segundos para atingir a vida máxima (a peça já é sólida desde o início). */
  buildTime: number
}

/** Índices iguais aos de `Material` (madeira, pedra, metal). */
export const BUILD_MATERIALS: readonly BuildMaterialStats[] = [
  { name: 'Madeira', maxHealth: 150, buildTime: 3 },
  { name: 'Pedra', maxHealth: 300, buildTime: 6 },
  { name: 'Metal', maxHealth: 450, buildTime: 9 },
]

/** Vida inicial de uma peça recém-colocada (fração da máxima). */
export const BUILD_START_FRACTION = 0.1

/** Multiplicador do dano de explosões contra construções. */
export const EXPLOSION_STRUCTURE_MULT = 3

export const PICKAXE = {
  damagePlayer: 20,
  damageStructure: 50,
  /** Segundos entre golpes. */
  interval: 0.55,
  /** Alcance a partir do ombro da câmera (m). */
  reach: 3.0,
  /** Material por golpe: madeira, pedra, metal. */
  harvest: [8, 8, 6] as readonly number[],
  /** Quanto um objeto fixo do mapa (carro, parede, contêiner) rende no total. */
  staticYield: 60,
} as const

/** Vida dos adereços coletáveis (quebram ao zerar). */
export const PROP_HEALTH: Record<string, number> = { pine: 200, broadleaf: 200, rock: 250, crate: 100 }

/** Empacota o modo de construção do comando em um byte: tipo (3 bits) | rotação (2) | material (2). */
export function encodeBuild(kind: number, rot: number, material: number): number {
  if (!kind) return 0
  return (kind & 7) | ((rot & 3) << 3) | ((material & 3) << 5)
}

export function decodeBuild(b: number): { kind: number; rot: number; material: number } {
  const kind = b & 7
  return { kind: kind <= 4 ? kind : 0, rot: (b >> 3) & 3, material: Math.min(2, (b >> 5) & 3) }
}
