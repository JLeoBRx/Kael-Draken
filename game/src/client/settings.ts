/**
 * Configurações do jogador, salvas no navegador (localStorage). Tudo é
 * validado ao carregar: valores ausentes ou corrompidos voltam ao padrão, e
 * o jogo funciona mesmo com o armazenamento bloqueado.
 */

import { isBotDifficulty, type BotDifficulty } from '../server/core/bots/profiles'

export type Quality = 'baixa' | 'media' | 'alta'

/** Última configuração usada na partida offline. */
export interface OfflinePrefs {
  mode: 'br' | 'treino'
  bots: number
  difficulty: BotDifficulty
  zone: 'normal' | 'rapida'
  /** Jogadores por equipe (1–4). */
  teamSize: number
  /** Pessoas neste computador (2 = tela dividida). */
  localPlayers: 1 | 2
}

/** Última escolha na tela online. */
export interface OnlinePrefs {
  /** Endereço da plataforma (vazio = o mesmo que serviu a página). */
  address: string
  teamSize: number
  region: string
  fill: boolean
}

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
  offline: OfflinePrefs
  online: OnlinePrefs
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
  offline: { mode: 'br', bots: 23, difficulty: 'normal', zone: 'normal', teamSize: 1, localPlayers: 1 },
  online: { address: '', teamSize: 1, region: 'sa', fill: true },
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
    offline: loadOffline(raw.offline, d.offline),
    online: loadOnline(raw.online, d.online),
  }
}

function loadOnline(v: unknown, d: OnlinePrefs): OnlinePrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    address: typeof o.address === 'string' ? o.address.slice(0, 200) : d.address,
    teamSize: Math.round(num(o.teamSize, 1, 4, d.teamSize)),
    region: typeof o.region === 'string' && /^[a-z]{2,8}$/.test(o.region) ? o.region : d.region,
    fill: typeof o.fill === 'boolean' ? o.fill : d.fill,
  }
}

function loadOffline(v: unknown, d: OfflinePrefs): OfflinePrefs {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  return {
    mode: o.mode === 'br' || o.mode === 'treino' ? o.mode : d.mode,
    bots: Math.round(num(o.bots, 0, 99, d.bots)),
    difficulty: isBotDifficulty(o.difficulty) ? o.difficulty : d.difficulty,
    zone: o.zone === 'normal' || o.zone === 'rapida' ? o.zone : d.zone,
    teamSize: Math.round(num(o.teamSize, 1, 4, d.teamSize)),
    localPlayers: o.localPlayers === 2 ? 2 : 1,
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Armazenamento indisponível (aba privada, bloqueio): segue só em memória.
  }
}
