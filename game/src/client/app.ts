import * as THREE from 'three'
import { GAME } from '../shared/config/game'
import { MAIN_MAP_ID, MAPS, TRAINING_MAP_ID } from '../shared/maps'
import { AudioEngine } from './audio/audio'
import { KICK_NEW_MATCH, sanitizeName } from '../shared/net/protocol'
import { GameMode } from '../shared/match/zone'
import { addToHistory, loadHistory } from './history'
import { Match, type DebugState } from './game/match'
import { InputManager } from './input/input'
import { TRAINING_MATCH, connectWebSocket, normalizeServerUrl, startLocalServer, type LocalMatchOptions, type Transport } from './net/transport'
import { QUALITY, loadSettings, saveSettings, type OfflinePrefs, type Settings } from './settings'
import type { MatchResult } from './ui/hud'
import { h } from './ui/dom'
import { Hud } from './ui/hud'
import { InventoryScreen } from './ui/inventory-screen'
import { Screens } from './ui/screens'

type AppState = 'menu' | 'loading' | 'ready' | 'playing' | 'paused' | 'inventory' | 'results'

/** Como (re)abrir a partida atual: para "Jogar de novo" e para a reconexão entre partidas. */
interface StartRecipe {
  make: () => Promise<Transport>
  title: string
  offline: boolean
}

function toLocalMatch(p: OfflinePrefs): LocalMatchOptions {
  return { mode: p.mode === 'br' ? GameMode.BattleRoyale : GameMode.Training, bots: p.bots, difficulty: p.difficulty, zoneSpeed: p.zone === 'rapida' ? 2.2 : 1 }
}

/**
 * Casca da aplicação: estados (menu → carregando → jogando ⇄ pausa),
 * renderizador, laço de quadros e captura do mouse.
 */
export class App {
  private readonly canvas: HTMLCanvasElement
  private readonly screens: Screens
  private readonly hud: Hud
  private readonly input: InputManager
  private settings: Settings
  private renderer: THREE.WebGLRenderer | null = null
  private webglError: string | null = null
  private match: Match | null = null
  private state: AppState = 'menu'
  private lastFrame = 0
  private readonly audio = new AudioEngine()
  private readonly inventory: InventoryScreen
  private recipe: StartRecipe | null = null

  constructor(root: HTMLElement) {
    this.settings = loadSettings()
    this.canvas = h('canvas', { class: 'game', tabindex: 0, 'aria-label': 'Jogo' })
    const layer = h('div', { class: 'ui-layer' })
    root.append(this.canvas, layer)
    this.hud = new Hud(layer)
    this.screens = new Screens(layer)
    this.input = new InputManager(this.canvas, this.settings)
    this.audio.setVolume(this.settings.volume)
    this.inventory = new InventoryScreen(layer, {
      drop: (slot) => this.match?.sendInventory({ action: 'drop', slot }),
      swap: (a, b) => this.match?.sendInventory({ action: 'swap', a, b }),
      close: () => void this.resume(),
    })
    this.input.onPauseRequest = () => {
      if (this.state === 'playing') this.pause()
      else if (this.state === 'inventory') void this.resume()
      else if (this.state === 'paused' && !this.screens.hasModal) void this.resume()
    }
    this.input.onToggleInventory = () => {
      if (this.state === 'playing') this.openInventory()
      else if (this.state === 'inventory') void this.resume()
    }
    this.input.onToggleMap = () => this.match?.toggleMap()
    this.input.onPointerLockLost = () => {
      if (this.state === 'playing') this.pause()
    }
    this.input.onToggleDebug = () => this.hud.toggleDebug()
    this.input.onToggleHelp = () => this.hud.toggleHelp()
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.pointerLocked) void this.input.requestPointerLock()
      // eliminado: clique troca quem está sendo assistido
      else if (this.state === 'playing' && this.match && !this.match.state.alive) this.match.spectateNext()
    })
    window.addEventListener('resize', () => this.resize())
  }

  start(): void {
    this.input.attach()
    try {
      this.ensureRenderer()
    } catch (err) {
      this.webglError = `Não foi possível iniciar o WebGL 2 neste navegador/dispositivo (${err instanceof Error ? err.message : err}). Atualize o navegador ou os drivers de vídeo.`
      console.error(err)
    }
    this.showMenu()
    requestAnimationFrame(this.loop)
  }

  /**
   * Cria o renderizador uma vez. Antisserrilhamento é atributo do contexto
   * WebGL: mudar essa opção vale ao recarregar a página.
   */
  private ensureRenderer(): THREE.WebGLRenderer {
    if (this.renderer) {
      this.applyQuality()
      return this.renderer
    }
    const preset = QUALITY[this.settings.quality]
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: preset.antialias, powerPreference: 'high-performance' })
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer = renderer
    this.applyQuality()
    return renderer
  }

  private applyQuality(): void {
    const r = this.renderer
    if (!r) return
    const preset = QUALITY[this.settings.quality]
    r.shadowMap.enabled = preset.shadows
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.maxPixelRatio))
    this.resize()
  }

  private resize(): void {
    const w = window.innerWidth
    const hgt = window.innerHeight
    this.renderer?.setSize(w, hgt, false)
    this.match?.setAspect(w / Math.max(1, hgt))
  }

  private showMenu(): void {
    this.state = 'menu'
    this.hud.hide()
    this.screens.mainMenu({
      playOffline: () => this.showMapSelect(),
      join: () => this.showJoin(),
      settings: () => this.showSettings(),
      controls: () => this.showControls(),
      history: () => this.screens.history(loadHistory(), () => this.screens.closeModal()),
    }, this.webglError)
  }

  private playerName(): string {
    return sanitizeName(this.settings.playerName || 'Jogador')
  }

  /** Seleção de mapa e partida offline (servidor no Web Worker). */
  showMapSelect(): void {
    if (this.webglError) return
    this.screens.mapSelect([
      { id: MAIN_MAP_ID, name: MAPS[MAIN_MAP_ID].name, description: 'Mapa principal, 1,6 km: cidade, floresta, montanhas, indústria, vilarejo, lago, base militar, farol.', tag: 'Principal' },
      { id: TRAINING_MAP_ID, name: MAPS[TRAINING_MAP_ID].name, description: 'Mapa pequeno: arsenal com todas as armas, estande de tiro, pista de movimentação e pátio de construção.', tag: 'Treino' },
    ], this.settings.offline, (id, prefs) => {
      this.settings = { ...this.settings, offline: prefs }
      saveSettings(this.settings)
      void this.playOffline(id, toLocalMatch(prefs))
    }, () => this.showMenu())
  }

  async playOffline(mapId: string = TRAINING_MAP_ID, match: LocalMatchOptions = TRAINING_MATCH): Promise<void> {
    await this.begin({ make: () => startLocalServer(mapId, match), title: MAPS[mapId]?.name ?? 'Partida offline', offline: true })
  }

  private showJoin(): void {
    const ui = this.screens.join({ name: this.settings.playerName, address: this.settings.serverAddress }, (name, address) => {
      let url: string
      try {
        url = normalizeServerUrl(address)
      } catch {
        ui.setStatus('Endereço inválido.', true)
        return
      }
      this.settings = { ...this.settings, playerName: name.slice(0, 16), serverAddress: address.trim() }
      saveSettings(this.settings)
      this.input.updateSettings(this.settings)
      ui.setBusy(true)
      ui.setStatus(`Conectando a ${url}…`)
      void this.begin({ make: () => connectWebSocket(url), title: 'Servidor', offline: false }, (err) => {
        this.showJoin()
        this.screens.toast(err, 'error', 7000)
      })
    }, () => this.showMenu())
  }

  private async begin(recipe: StartRecipe, onFail?: (message: string) => void): Promise<void> {
    if (this.state === 'loading' || this.webglError) return
    this.state = 'loading'
    this.recipe = recipe
    const loading = this.screens.loading(recipe.title)
    try {
      const renderer = this.ensureRenderer()
      loading.step('Iniciando conexão…')
      const transport = await recipe.make()
      const match = await Match.start(transport, { renderer, input: this.input, hud: this.hud, settings: this.settings, audio: this.audio }, this.playerName(), (s) => loading.step(s))
      this.match = match
      match.onClosed = (reason) => {
        // o servidor recomeçou a partida: reconecta sozinho
        if (reason === KICK_NEW_MATCH && this.recipe) this.restart('Nova partida começando…')
        else this.quitToMenu(`Partida encerrada: ${reason}`)
      }
      match.onResult = (r) => this.showResult(r)
      this.resize()
      this.state = 'ready'
      this.hud.show()
      this.screens.clickToPlay(() => void this.resume())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(err)
      this.match?.dispose()
      this.match = null
      if (onFail) {
        this.state = 'menu'
        onFail(message)
      } else {
        this.state = 'menu'
        this.screens.fatal('Não foi possível iniciar', message, () => this.showMenu())
      }
    }
  }

  /** Fim de partida para este jogador: salva no histórico e mostra o resultado. */
  private showResult(r: MatchResult): void {
    const match = this.match
    if (!match) return
    addToHistory({
      date: new Date().toISOString(),
      mapId: match.map.def.id,
      mapName: match.map.def.name,
      where: match.modeLabel,
      place: r.place,
      total: r.total,
      kills: r.kills,
      damage: r.damage,
      seconds: r.seconds,
      victory: r.victory,
    })
    this.inventory.hide()
    this.screens.clear()
    this.state = 'results'
    this.input.enabled = false
    this.input.clear()
    this.input.releasePointerLock()
    const actions: { label: string; action: string; primary?: boolean; run: () => void }[] = []
    if (this.recipe?.offline) actions.push({ label: 'Jogar de novo', action: 'again', primary: true, run: () => this.restart() })
    if (!r.victory) actions.push({ label: 'Assistir', action: 'spectate', run: () => { this.hud.showResults(null); void this.resume() } })
    actions.push({ label: 'Voltar ao menu', action: 'menu', run: () => this.quitToMenu() })
    this.hud.showResults(r, actions)
  }

  /** Abre de novo a mesma partida (offline) ou reconecta ao mesmo servidor. */
  private restart(notice?: string): void {
    const recipe = this.recipe
    this.hud.showResults(null)
    this.inventory.hide()
    this.input.enabled = false
    this.input.releasePointerLock()
    this.match?.dispose()
    this.match = null
    this.state = 'menu'
    if (!recipe) {
      this.showMenu()
      return
    }
    if (notice) this.screens.toast(notice, 'info', 4000)
    void this.begin(recipe)
  }

  async resume(): Promise<void> {
    if (!this.match) return
    this.hud.showResults(null)
    this.audio.resume()
    this.inventory.hide()
    this.screens.clear()
    this.state = 'playing'
    this.input.enabled = true
    this.input.clear()
    this.canvas.focus()
    await this.input.requestPointerLock()
  }

  pause(): void {
    if (this.state !== 'playing') return
    this.state = 'paused'
    this.input.enabled = false
    this.input.clear()
    this.input.releasePointerLock()
    this.showPause()
  }

  private openInventory(): void {
    if (this.state !== 'playing' || !this.match) return
    this.state = 'inventory'
    this.input.enabled = false
    this.input.clear()
    this.input.releasePointerLock()
    this.inventory.show(this.match.state)
  }

  private showPause(): void {
    this.screens.pause({
      resume: () => void this.resume(),
      settings: () => this.showSettings(),
      controls: () => this.showControls(),
      quit: () => this.quitToMenu(),
    }, this.match?.modeLabel ?? '')
  }

  quitToMenu(notice?: string): void {
    this.hud.showResults(null)
    this.recipe = null
    this.inventory.hide()
    this.input.enabled = false
    this.input.releasePointerLock()
    this.input.resetToggles()
    this.match?.dispose()
    this.match = null
    this.showMenu()
    if (notice) this.screens.toast(notice, 'error', 7000)
  }

  private showSettings(): void {
    this.screens.settings(this.settings, (s) => {
      const qualityChanged = s.quality !== this.settings.quality
      this.settings = s
      saveSettings(s)
      this.input.updateSettings(s)
      this.audio.setVolume(s.volume)
      this.match?.applySettings(s)
      if (qualityChanged && this.renderer) {
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[s.quality].maxPixelRatio))
        this.resize()
      }
    }, () => this.screens.closeModal())
  }

  private showControls(): void {
    this.screens.controls(() => this.screens.closeModal())
  }

  private loop = (t: number): void => {
    requestAnimationFrame(this.loop)
    const dt = this.lastFrame ? Math.min(0.1, (t - this.lastFrame) / 1000) : 1 / 60
    this.lastFrame = t
    if (this.match && this.state !== 'menu' && this.state !== 'loading') {
      this.match.frame(dt, performance.now())
      if (this.state === 'inventory') this.inventory.update(this.match.state)
    }
  }

  /** Estado resumido para testes automatizados e diagnóstico. */
  debugState(): { screen: AppState; version: string; match: DebugState | null } {
    return { screen: this.state, version: GAME.version, match: this.match?.debugState() ?? null }
  }
}
