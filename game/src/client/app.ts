import * as THREE from 'three'
import { GAME } from '../shared/config/game'
import { DEFAULT_MAP_ID } from '../shared/maps'
import { sanitizeName } from '../shared/net/protocol'
import { Match, type DebugState } from './game/match'
import { InputManager } from './input/input'
import { connectWebSocket, normalizeServerUrl, startLocalServer, type Transport } from './net/transport'
import { QUALITY, loadSettings, saveSettings, type Settings } from './settings'
import { h } from './ui/dom'
import { Hud } from './ui/hud'
import { Screens } from './ui/screens'

type AppState = 'menu' | 'loading' | 'ready' | 'playing' | 'paused'

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

  constructor(root: HTMLElement) {
    this.settings = loadSettings()
    this.canvas = h('canvas', { class: 'game', tabindex: 0, 'aria-label': 'Jogo' })
    const layer = h('div', { class: 'ui-layer' })
    root.append(this.canvas, layer)
    this.hud = new Hud(layer)
    this.screens = new Screens(layer)
    this.input = new InputManager(this.canvas, this.settings)
    this.input.onPauseRequest = () => {
      if (this.state === 'playing') this.pause()
      else if (this.state === 'paused' && !this.screens.hasModal) this.resume()
    }
    this.input.onPointerLockLost = () => {
      if (this.state === 'playing') this.pause()
    }
    this.input.onToggleDebug = () => this.hud.toggleDebug()
    this.input.onToggleHelp = () => this.hud.toggleHelp()
    this.canvas.addEventListener('click', () => {
      if (this.state === 'playing' && !this.input.pointerLocked) void this.input.requestPointerLock()
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
      playOffline: () => void this.playOffline(),
      join: () => this.showJoin(),
      settings: () => this.showSettings(),
      controls: () => this.showControls(),
    }, this.webglError)
  }

  private playerName(): string {
    return sanitizeName(this.settings.playerName || 'Jogador')
  }

  async playOffline(): Promise<void> {
    await this.begin(() => startLocalServer(DEFAULT_MAP_ID), 'Campo de Provas')
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
      void this.begin(() => connectWebSocket(url), 'Servidor', (err) => {
        this.showJoin()
        this.screens.toast(err, 'error', 7000)
      })
    }, () => this.showMenu())
  }

  private async begin(makeTransport: () => Promise<Transport>, title: string, onFail?: (message: string) => void): Promise<void> {
    if (this.state === 'loading' || this.webglError) return
    this.state = 'loading'
    const loading = this.screens.loading(title)
    try {
      const renderer = this.ensureRenderer()
      loading.step('Iniciando conexão…')
      const transport = await makeTransport()
      const match = await Match.start(transport, { renderer, input: this.input, hud: this.hud, settings: this.settings }, this.playerName(), (s) => loading.step(s))
      this.match = match
      match.onClosed = (reason) => this.quitToMenu(`Partida encerrada: ${reason}`)
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

  async resume(): Promise<void> {
    if (!this.match) return
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

  private showPause(): void {
    this.screens.pause({
      resume: () => void this.resume(),
      settings: () => this.showSettings(),
      controls: () => this.showControls(),
      quit: () => this.quitToMenu(),
    }, this.match?.modeLabel ?? '')
  }

  quitToMenu(notice?: string): void {
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
    if (this.match && this.state !== 'menu' && this.state !== 'loading') this.match.frame(dt, performance.now())
  }

  /** Estado resumido para testes automatizados e diagnóstico. */
  debugState(): { screen: AppState; version: string; match: DebugState | null } {
    return { screen: this.state, version: GAME.version, match: this.match?.debugState() ?? null }
  }
}
