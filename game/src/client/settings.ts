/**
 * Configurações do jogador, salvas no navegador (localStorage). Tudo é
 * validado ao carregar: valores ausentes ou corrompidos voltam ao padrão, e
 * o jogo funciona mesmo com o armazenamento bloqueado.
 */

export type Quality = 'baixa' | 'media' | 'alta'

export interface Settings {
  playerName: string
  /** Multiplicador da sensibilidade do mouse/controle. */
  sensitivity: number
  /** Multiplicador extra ao mirar. */
  aimSensitivity: number
  invertY: boolean
  fov: number
  quality: Quality
  crouchToggle: boolean
  showFps: boolean
  serverAddress: string
  /** Volume geral (0–1). */
  volume: number
}

export interface QualityPreset {
  label: string
  maxPixelRatio: number
  antialias: boolean
  shadows: boolean
  shadowMapSize: number
  shadowRange: number
  fogScale: number
  /** Distância máxima de desenho (m). */
  drawDistance: number
}

export const QUALITY: Record<Quality, QualityPreset> = {
  baixa: { label: 'Baixa', maxPixelRatio: 0.75, antialias: false, shadows: false, shadowMapSize: 1024, shadowRange: 30, fogScale: 1.6, drawDistance: 450 },
  media: { label: 'Média', maxPixelRatio: 1, antialias: true, shadows: true, shadowMapSize: 2048, shadowRange: 45, fogScale: 1.15, drawDistance: 900 },
  alta: { label: 'Alta', maxPixelRatio: 2, antialias: true, shadows: true, shadowMapSize: 4096, shadowRange: 70, fogScale: 1, drawDistance: 1600 },
}

export const DEFAULT_SETTINGS: Settings = {
  playerName: '',
  sensitivity: 1,
  aimSensitivity: 0.7,
  invertY: false,
  fov: 75,
  quality: 'media',
  crouchToggle: true,
  showFps: false,
  serverAddress: '',
  volume: 0.7,
}

const KEY = 'ultima-chama:configuracoes:v1'

function num(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback
}

export function loadSettings(): Settings {
  let raw: Record<string, unknown> = {}
  try {
    const text = localStorage.getItem(KEY)
    if (text) raw = JSON.parse(text) as Record<string, unknown>
  } catch {
    raw = {}
  }
  const d = DEFAULT_SETTINGS
  return {
    playerName: typeof raw.playerName === 'string' ? raw.playerName.slice(0, 16) : d.playerName,
    sensitivity: num(raw.sensitivity, 0.1, 4, d.sensitivity),
    aimSensitivity: num(raw.aimSensitivity, 0.2, 1.5, d.aimSensitivity),
    invertY: typeof raw.invertY === 'boolean' ? raw.invertY : d.invertY,
    fov: num(raw.fov, 60, 100, d.fov),
    quality: raw.quality === 'baixa' || raw.quality === 'media' || raw.quality === 'alta' ? raw.quality : d.quality,
    crouchToggle: typeof raw.crouchToggle === 'boolean' ? raw.crouchToggle : d.crouchToggle,
    showFps: typeof raw.showFps === 'boolean' ? raw.showFps : d.showFps,
    serverAddress: typeof raw.serverAddress === 'string' ? raw.serverAddress.slice(0, 200) : d.serverAddress,
    volume: num(raw.volume, 0, 1, d.volume),
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Armazenamento indisponível (aba privada, bloqueio): segue só em memória.
  }
}
