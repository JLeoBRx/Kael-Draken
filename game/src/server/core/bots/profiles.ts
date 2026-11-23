/**
 * Níveis de dificuldade dos bots. Todos usam os mesmos comandos de entrada
 * que um jogador; a dificuldade muda só "a pessoa" por trás do controle:
 * tempo de reação, precisão, velocidade de giro, alcance de visão, quando
 * constroem e quando se curam.
 */

export type BotDifficulty = 'facil' | 'normal' | 'dificil'

export interface BotProfile {
  label: string
  /** Segundos entre ver um inimigo e começar a atirar. */
  reaction: number
  /** Erro de mira (rad) com o alvo parado e já acompanhado. */
  aimError: number
  /** Giro máximo da mira (rad/s). */
  turnRate: number
  /** Distância máxima em que nota alguém. */
  viewDistance: number
  /** Cosseno da metade do campo de visão. */
  fovCos: number
  /** Chance de erguer uma parede ao tomar tiro. */
  buildChance: number
  /** Cura abaixo desta vida (ou sem escudo, se tiver como recarregar). */
  healBelow: number
  /** Chance de mirar na cabeça. */
  headChance: number
  /** Chance por segundo de pular no meio do tiroteio. */
  jumpRate: number
  /** Coleta materiais com a picareta quando está com pouco. */
  harvests: boolean
}

export const BOT_PROFILES: Record<BotDifficulty, BotProfile> = {
  facil: {
    label: 'Fácil', reaction: 0.95, aimError: 0.075, turnRate: 4, viewDistance: 70, fovCos: Math.cos(1.0),
    buildChance: 0, healBelow: 35, headChance: 0, jumpRate: 0, harvests: false,
  },
  normal: {
    label: 'Normal', reaction: 0.55, aimError: 0.038, turnRate: 7, viewDistance: 110, fovCos: Math.cos(1.15),
    buildChance: 0.35, healBelow: 55, headChance: 0.1, jumpRate: 0.2, harvests: true,
  },
  dificil: {
    label: 'Difícil', reaction: 0.3, aimError: 0.019, turnRate: 11, viewDistance: 160, fovCos: Math.cos(1.3),
    buildChance: 0.7, healBelow: 70, headChance: 0.3, jumpRate: 0.45, harvests: true,
  },
}

export const BOT_DIFFICULTIES: readonly BotDifficulty[] = ['facil', 'normal', 'dificil']

export function isBotDifficulty(v: unknown): v is BotDifficulty {
  return v === 'facil' || v === 'normal' || v === 'dificil'
}

/** Nomes originais dos bots (com número quando acabam). */
export const BOT_NAMES = [
  'Faísca', 'Fagulha', 'Tição', 'Labareda', 'Centelha', 'Rescaldo', 'Pavio', 'Carvão', 'Fuligem', 'Lenha',
  'Pólvora', 'Fogaréu', 'Graveto', 'Fornalha', 'Brasido', 'Cinzento', 'Vulcão', 'Estopim', 'Candeia', 'Lampião',
  'Archote', 'Sarça', 'Queimada', 'Chamuscado', 'Torresmo', 'Ferrugem', 'Basalto', 'Granito', 'Quartzo', 'Ônix',
  'Corvo', 'Gavião', 'Carcará', 'Sabiá', 'Jaguar', 'Onça', 'Lobo-guará', 'Tatu', 'Quati', 'Capivara',
]
