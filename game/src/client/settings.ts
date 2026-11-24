/**
 * Configurações do jogador, salvas no navegador (localStorage). Tudo é
 * validado ao carregar: valores ausentes ou corrompidos voltam ao padrão, e
 * o jogo funciona mesmo com o armazenamento bloqueado.
 */

import { isBotDifficulty, type BotDifficulty } from '../server/core/bots/profiles'
import { ACTIONS, DEFAULT_KEYS, RESERVED_KEYS, type ColorVision, type KeyMap } from './accessibility'

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
  /** Visual escolhido no armário (offline/LAN; online vale o da conta). */
  skin: number
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
  /** Acessibilidade: sem tremor de câmera nem balanço. */
  reduceMotion: boolean
  /** Escala da resolução de desenho (0,5–1): menos pixels em placas de vídeo fracas. */
  renderScale: number
  /** Correção e paleta para daltonismo. */
  colorVision: ColorVision
  /** Mostrar de onde vêm tiros, passos e explosões. */
  soundCues: boolean
  /** Escala da interface (0,8–1,4). */
  uiScale: number
  crosshairColor: string
  /** Tamanho da mira (0,6–1,8). */
  crosshairSize: number
  /** Teclas por ação. */
  keys: KeyMap
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
  /** Pós-processamento: nenhum, básico (brilho + cor + MSAA) ou completo (+ oclusão ambiente). */
  post: 'nenhum' | 'basico' | 'completo'
  /** Tufos de grama (3 lâminas cada) perto da câmera (0 = sem grama). */
  grass: number
  /** Raio da grama em volta da câmera (m). */
  grassRadius: number
  /** Nuvens no céu. */
  clouds: boolean
  /** Partículas por efeito (multiplicador). */
  particles: number
  /** Até onde a vegetação usa o modelo detalhado (e projeta sombra), em m. */
  treeDetail: number
}

export const QUALITY: Record<Quality, QualityPreset> = {
  baixa: { label: 'Baixa', maxPixelRatio: 0.75, antialias: false, shadows: false, shadowMapSize: 1024, shadowRange: 30, fogScale: 1.6, drawDistance: 450, post: 'nenhum', grass: 0, grassRadius: 0, clouds: false, particles: 0.4, treeDetail: 70 },
  media: { label: 'Média', maxPixelRatio: 1, antialias: true, shadows: true, shadowMapSize: 2048, shadowRange: 45, fogScale: 1.15, drawDistance: 900, post: 'basico', grass: 22_000, grassRadius: 28, clouds: true, particles: 0.75, treeDetail: 110 },
  alta: { label: 'Alta', maxPixelRatio: 2, antialias: true, shadows: true, shadowMapSize: 4096, shadowRange: 70, fogScale: 1, drawDistance: 1600, post: 'completo', grass: 48_000, grassRadius: 40, clouds: true, particles: 1, treeDetail: 160 },
}

export const DEFAULT_SETTINGS: Settings = {
  playerName: '',
  skin: 0,
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
  reduceMotion: false,
  renderScale: 1,
  colorVision: 'normal',
  soundCues: false,
  uiScale: 1,
  crosshairColor: '#ffffff',
  crosshairSize: 1,
  keys: DEFAULT_KEYS,
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
    skin: Number.isInteger(raw.skin) && (raw.skin as number) >= 0 && (raw.skin as number) < 8 ? (raw.skin as number) : d.skin,
    sensitivity: num(raw.sensitivity, 0.1, 4, d.sensitivity),
    aimSensitivity: num(raw.aimSensitivity, 0.2, 1.5, d.aimSensitivity),
    invertY: typeof raw.invertY === 'boolean' ? raw.invertY : d.invertY,
    fov: num(raw.fov, 60, 100, d.fov),
    quality: raw.quality === 'baixa' || raw.quality === 'media' || raw.quality === 'alta' ? raw.quality : d.quality,
    crouchToggle: typeof raw.crouchToggle === 'boolean' ? raw.crouchToggle : d.crouchToggle,
    showFps: typeof raw.showFps === 'boolean' ? raw.showFps : d.showFps,
    serverAddress: typeof raw.serverAddress === 'string' ? raw.serverAddress.slice(0, 200) : d.serverAddress,
    volume: num(raw.volume, 0, 1, d.volume),
    reduceMotion: typeof raw.reduceMotion === 'boolean' ? raw.reduceMotion : d.reduceMotion,
    renderScale: num(raw.renderScale, 0.5, 1, d.renderScale),
    colorVision: raw.colorVision === 'protanopia' || raw.colorVision === 'deuteranopia' || raw.colorVision === 'tritanopia' ? raw.colorVision : 'normal',
    soundCues: typeof raw.soundCues === 'boolean' ? raw.soundCues : d.soundCues,
    uiScale: num(raw.uiScale, 0.8, 1.4, d.uiScale),
    crosshairColor: typeof raw.crosshairColor === 'string' && /^#[0-9a-f]{6}$/i.test(raw.crosshairColor) ? raw.crosshairColor : d.crosshairColor,
    crosshairSize: num(raw.crosshairSize, 0.6, 1.8, d.crosshairSize),
    keys: loadKeys(raw.keys),
    offline: loadOffline(raw.offline, d.offline),
    online: loadOnline(raw.online, d.online),
  }
}

/** Teclas salvas: só códigos de tecla válidos, sem as reservadas; o que faltar volta ao padrão. */
function loadKeys(v: unknown): KeyMap {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out = {} as Record<(typeof ACTIONS)[number], readonly string[]>
  for (const a of ACTIONS) {
    const list = Array.isArray(o[a]) ? (o[a] as unknown[]).filter((c): c is string => typeof c === 'string' && /^[A-Za-z0-9]{2,20}$/.test(c) && !RESERVED_KEYS.has(c)) : []
    out[a] = list.length ? list.slice(0, 3) : DEFAULT_KEYS[a]
  }
  return out
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
