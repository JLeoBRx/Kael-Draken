import * as THREE from 'three'
import { GAME } from '../shared/config/game'
import { MAIN_MAP_ID, MAPS, TRAINING_MAP_ID } from '../shared/maps'
import { AudioEngine } from './audio/audio'
import { KICK_MATCH_OVER, KICK_NEW_MATCH, sanitizeName, type LobbyState, type WelcomeMessage } from '../shared/net/protocol'
import { GameMode } from '../shared/match/zone'
import { addToHistory, loadHistory } from './history'
import { Match, type DebugState } from './game/match'
import { InputManager } from './input/input'
import { NetSession } from './net/session'
import { OnlineController } from './online/online'
import { loadCharacterAsset } from './character/character-assets'
import { TRAINING_MATCH, connectWebSocket, normalizeServerUrl, startLocalServer, startLocalServers, type LocalMatchOptions, type Transport } from './net/transport'
import { QUALITY, loadSettings, saveSettings, type OfflinePrefs, type Settings } from './settings'
import type { MatchResult } from './ui/hud'
import { h } from './ui/dom'
import { Hud } from './ui/hud'
import { InventoryScreen } from './ui/inventory-screen'
import { Screens } from './ui/screens'

type AppState = 'menu' | 'loading' | 'lobby' | 'ready' | 'playing' | 'paused' | 'inventory' | 'results'

/** Como (re)abrir a partida atual: para "Jogar de novo" e para a reconexão entre partidas. */
interface StartRecipe {
  make: () => Promise<Transport>
  title: string
  offline: boolean
  /** Servidor de rede (chave do token de reconexão). */
  url?: string
  /** Tela dividida: mapa e partida para "Jogar de novo". */
  split?: { mapId: string; match: LocalMatchOptions }
  /** Bilhete da plataforma (servidores online). */
  ticket?: string
  /** Partida online: ao sair ou terminar, volta para a casa da plataforma. */
  online?: { onExit: (notice?: string) => void; code?: string; name: string }
}

const TOKEN_KEY = 'ultima-chama:token:'
const RECONNECT_ATTEMPTS = 15

/** Token de volta ao mesmo personagem (por aba e por servidor). */
function loadToken(url: string): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY + url) ?? ''
  } catch {
    return ''
  }
}

function saveToken(url: string, token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY + url, token)
  } catch {
    // sem armazenamento: só não reconecta depois de recarregar a página
  }
}

function toLocalMatch(p: OfflinePrefs): LocalMatchOptions {
  return { mode: p.mode === 'br' ? GameMode.BattleRoyale : GameMode.Training, bots: p.bots, difficulty: p.difficulty, zoneSpeed: p.zone === 'rapida' ? 2.2 : 1, teamSize: p.teamSize }
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
  private readonly layer: HTMLElement
  /** Tela dividida: HUDs das duas metades e o jogador 2 (controle). */
  private split: { huds: [Hud, Hud]; layers: HTMLElement[]; p2: Match | null; p2Input: InputManager } | null = null
  private session: NetSession | null = null
  private lanTimer: ReturnType<typeof setInterval> | null = null
  private readonly online: OnlineController

  constructor(root: HTMLElement) {
    this.settings = loadSettings()
    this.canvas = h('canvas', { class: 'game', tabindex: 0, 'aria-label': 'Jogo' })
    const layer = h('div', { class: 'ui-layer' })
    this.layer = layer
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
    this.online = new OnlineController({
      screens: this.screens,
      settings: () => this.settings,
      saveSettings: (s) => {
        this.settings = s
        saveSettings(s)
        this.input.updateSettings(s)
      },
      startOnlineMatch: (o) => void this.begin({
        make: () => connectWebSocket(o.url), title: o.title, offline: false, url: o.url, ticket: o.ticket, online: { onExit: o.onExit, code: o.code, name: o.name },
      }, (err) => o.onExit(`Não foi possível entrar na partida: ${err}`)),
      inMatch: () => this.state !== 'menu' && !!this.recipe?.online,
      mainMenu: () => this.showMenu(),
    })
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
    // o modelo do personagem (GLB) começa a baixar já, enquanto o menu aparece
    void loadCharacterAsset()
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

  /** HUD do jogador 1 (metade esquerda na tela dividida). */
  private get p1Hud(): Hud {
    return this.split?.huds[0] ?? this.hud
  }

  private resize(): void {
    const w = window.innerWidth
    const hgt = window.innerHeight
    this.renderer?.setSize(w, hgt, false)
    this.renderer?.setViewport(0, 0, w, hgt)
    const aspect = (this.split ? w / 2 : w) / Math.max(1, hgt)
    this.match?.setAspect(aspect)
    this.split?.p2?.setAspect(aspect)
  }

  private showMenu(): void {
    this.state = 'menu'
    this.hud.hide()
    this.screens.mainMenu({
      playOffline: () => this.showMapSelect(),
      online: () => void this.online.open(),
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
      if (prefs.localPlayers === 2) void this.beginSplit(id, toLocalMatch(prefs))
      else void this.playOffline(id, toLocalMatch(prefs))
    }, () => this.showMenu())
  }

  async playOffline(mapId: string = TRAINING_MAP_ID, match: LocalMatchOptions = TRAINING_MATCH): Promise<void> {
    await this.begin({ make: () => startLocalServer(mapId, match), title: MAPS[mapId]?.name ?? 'Partida offline', offline: true })
  }

  /**
   * Tela dividida (2 jogadores, offline): um servidor local, duas conexões,
   * duas cenas desenhadas cada uma na sua metade do canvas e dois HUDs.
   * Jogador 1: teclado e mouse. Jogador 2: o primeiro controle conectado.
   */
  async beginSplit(mapId: string, matchOpts: LocalMatchOptions): Promise<void> {
    if (this.state === 'loading' || this.webglError) return
    this.state = 'loading'
    const title = `${MAPS[mapId]?.name ?? 'Partida'} · tela dividida`
    this.recipe = { make: () => Promise.reject(new Error('tela dividida')), title, offline: true }
    const recipe = this.recipe
    const loading = this.screens.loading(title)
    const sessions: NetSession[] = []
    try {
      const renderer = this.ensureRenderer()
      loading.step('Iniciando o servidor local…')
      const transports = await startLocalServers(mapId, matchOpts, 2)
      for (const t of transports) sessions.push(new NetSession(t))
      const names = [this.playerName(), sanitizeName(`${this.playerName().slice(0, 13)} 2`)]
      const greet = await Promise.all(sessions.map((s, k) => s.handshake(names[k])))
      // camadas e HUDs das duas metades
      const layers = ['left', 'right'].map((side) => h('div', { class: `split-layer ${side}`, 'data-split': side }))
      this.layer.prepend(...layers)
      const huds: [Hud, Hud] = [new Hud(layers[0]), new Hud(layers[1])]
      this.input.setDevices({ keyboardMouse: true, pad: null })
      const p2Input = new InputManager(this.canvas, this.settings, { keyboardMouse: false, pad: 0 })
      p2Input.attach()
      p2Input.onPauseRequest = () => this.input.onPauseRequest?.()
      this.split = { huds, layers, p2: null, p2Input }
      const half = (k: number) => () => ({ x: k * (window.innerWidth / 2), y: 0, w: window.innerWidth / 2, h: window.innerHeight })
      const matches: Match[] = []
      for (let k = 0; k < 2; k++) {
        const g = greet[k]
        if (g.kind !== 'welcome') throw new Error('o servidor local abriu uma sala de espera')
        const m = await Match.start(sessions[k], g.welcome, {
          renderer, input: k === 0 ? this.input : p2Input, hud: huds[k], settings: this.settings, audio: this.audio,
          viewport: half(k), listener: k === 0,
        }, (t) => loading.step(`Jogador ${k + 1}: ${t}`))
        matches.push(m)
      }
      if (this.recipe !== recipe) {
        for (const m of matches) m.dispose()
        return
      }
      this.session = sessions[0]
      this.match = matches[0]
      this.split.p2 = matches[1]
      matches.forEach((m, k) => {
        m.onClosed = (reason) => this.quitToMenu(`Partida encerrada: ${reason}`)
        m.onResult = (r) => (k === 0 ? this.showResult(r) : this.showResultP2(r))
      })
      this.recipe = { make: recipe.make, title, offline: true, split: { mapId, match: matchOpts } }
      this.resize()
      this.hud.hide()
      for (const hd of huds) hd.show()
      this.state = 'ready'
      this.screens.clickToPlay(() => void this.resume())
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(err)
      for (const s of sessions) s.close()
      this.endSplit()
      this.state = 'menu'
      this.screens.fatal('Não foi possível iniciar a tela dividida', message, () => this.showMenu())
    }
  }

  /** Resultado do jogador 2 (só no HUD dele; quem decide o que fazer é o jogador 1). */
  private showResultP2(r: MatchResult): void {
    const sp = this.split
    if (!sp?.p2) return
    sp.huds[1].showResults(r, [{ label: 'Assistir', action: 'spectate', run: () => sp.huds[1].showResults(null) }])
  }

  /** Desfaz a tela dividida (HUDs, camadas, entrada do jogador 2). */
  private endSplit(): void {
    const sp = this.split
    if (!sp) return
    this.split = null
    sp.p2?.dispose()
    sp.p2Input.detach()
    for (const hd of sp.huds) hd.showResults(null)
    for (const l of sp.layers) l.remove()
    this.input.setDevices({ keyboardMouse: true, pad: 'any' })
    this.resize()
  }

  private showJoin(): void {
    this.stopLan()
    const ui = this.screens.join({ name: this.settings.playerName, address: this.settings.serverAddress }, (name, address) => {
      this.stopLan()
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
      void this.begin({ make: () => connectWebSocket(url), title: 'Servidor', offline: false, url }, (err) => {
        this.showJoin()
        this.screens.toast(err, 'error', 7000)
      })
    }, () => {
      this.stopLan()
      this.showMenu()
    })
    // Partidas na rede local: o servidor que serviu esta página lista as que ele ouve
    const refresh = async () => {
      try {
        const res = await fetch('/api/lan', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const data = (await res.json()) as { self: { name: string; port: number; players: number; maxPlayers: number; lobby: boolean; running: boolean; mapName: string }; servers: { address: string; port: number; name: string; players: number; maxPlayers: number; lobby: boolean; running: boolean; mapName: string }[] }
        const fmt = (e: { players: number; maxPlayers: number; lobby: boolean; running: boolean; mapName: string }) =>
          `${e.mapName} · ${e.players}/${e.maxPlayers} ${e.players === 1 ? 'pessoa' : 'pessoas'} · ${e.lobby ? (e.running ? 'partida em andamento' : 'sala de espera aberta') : 'partida contínua'}`
        ui.setLan([
          { name: `${data.self.name} (este servidor)`, address: '', detail: fmt(data.self) },
          ...data.servers.map((e) => ({ name: e.name, address: `${e.address}:${e.port}`, detail: fmt(e) })),
        ])
      } catch {
        ui.setLan(null) // página não servida por um host (ex.: modo de desenvolvimento)
      }
    }
    void refresh()
    this.lanTimer = setInterval(() => void refresh(), 3000)
  }

  private stopLan(): void {
    if (this.lanTimer) clearInterval(this.lanTimer)
    this.lanTimer = null
  }

  /** Conecta (rede ou servidor local), faz o handshake e vai para a sala ou para a partida. */
  private async begin(recipe: StartRecipe, onFail?: (message: string) => void, notice?: string): Promise<void> {
    if (this.state === 'loading' || this.webglError) return
    this.state = 'loading'
    this.recipe = recipe
    const loading = this.screens.loading(recipe.title)
    if (notice) loading.step(notice)
    let session: NetSession | null = null
    try {
      this.ensureRenderer()
      if (!notice) loading.step('Iniciando conexão…')
      const transport = await recipe.make()
      const s = new NetSession(transport)
      session = s
      this.session = s
      s.onWelcome = (w) => void this.enterMatch(s, w)
      s.onLobby = (st) => this.showLobbyState(st)
      s.onClose = (reason) => this.onSessionClosed(s, reason)
      loading.step('Conectando ao servidor…')
      const greeting = await s.handshake(recipe.online?.name ?? this.playerName(), recipe.url ? loadToken(recipe.url) : '', recipe.ticket ?? '')
      if (greeting.kind === 'lobby') {
        this.state = 'lobby'
        this.showLobbyState(greeting.state)
        return
      }
      await this.enterMatch(s, greeting.welcome, loading)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(err)
      this.match?.dispose(false)
      this.match = null
      session?.close()
      if (this.session === session) this.session = null
      this.state = 'menu'
      if (onFail) onFail(message)
      else this.screens.fatal('Não foi possível iniciar', message, () => this.showMenu())
    }
  }

  /** A partida começou (direto ou vinda da sala): carrega o mapa e espera o clique para jogar. */
  private async enterMatch(session: NetSession, welcome: WelcomeMessage, loading?: { step(text: string): void }): Promise<void> {
    if (this.session !== session) return
    if (this.recipe?.url) saveToken(this.recipe.url, welcome.token)
    this.state = 'loading'
    this.p1Hud.showResults(null)
    const steps = loading ?? this.screens.loading(this.recipe?.title ?? 'Partida')
    const renderer = this.ensureRenderer()
    try {
      const match = await Match.start(session, welcome, { renderer, input: this.input, hud: this.hud, settings: this.settings, audio: this.audio }, (t) => steps.step(t))
      if (this.session !== session) {
        match.dispose(false)
        return
      }
      this.match = match
      match.onClosed = (reason) => this.onSessionClosed(session, reason)
      match.onResult = (r) => this.showResult(r)
      this.resize()
      this.state = 'ready'
      this.hud.show()
      this.screens.clickToPlay(() => void this.resume())
    } catch (err) {
      if (this.session !== session) return
      const message = err instanceof Error ? err.message : String(err)
      console.error(err)
      session.close()
      this.session = null
      this.state = 'menu'
      this.screens.fatal('Não foi possível iniciar', message, () => this.showMenu())
    }
  }

  /** Sala de espera (ao entrar ou quando a partida acaba e todos voltam). */
  private showLobbyState(st: LobbyState): void {
    const session = this.session
    if (!session) return
    if (this.match) {
      // fim da partida: volta à sala pela mesma conexão
      this.match.dispose(false)
      this.match = null
      this.p1Hud.showResults(null)
      this.hud.hide()
      this.inventory.hide()
      this.input.enabled = false
      this.input.releasePointerLock()
    }
    this.state = 'lobby'
    const maps = Object.values(MAPS).map((m) => ({ id: m.id, name: m.name }))
    this.screens.lobby(st, maps, {
      ready: (ready) => session.sendLobby({ op: 'ready', ready }),
      team: (team) => session.sendLobby({ op: 'team', team }),
      config: (config) => session.sendLobby({ op: 'config', config }),
      start: () => session.sendLobby({ op: 'start' }),
      leave: () => this.quitToMenu(),
    }, this.recipe?.online?.code)
  }

  /** A conexão acabou: expulsão/nova partida, ou queda de rede (tenta voltar ao mesmo personagem). */
  private onSessionClosed(session: NetSession, reason: string): void {
    if (this.session !== session) return
    this.session = null
    const recipe = this.recipe
    if (session.kicked) {
      if (reason === KICK_NEW_MATCH && recipe) this.restart('Nova partida começando…')
      else if (reason === KICK_MATCH_OVER && recipe?.online) this.quitToMenu('Partida encerrada')
      else this.quitToMenu(`Partida encerrada: ${reason}`)
      return
    }
    if (recipe && !recipe.offline) this.reconnect(1)
    else this.quitToMenu(`Partida encerrada: ${reason}`)
  }

  /** Queda de rede: tenta de novo com o token (o personagem espera no servidor). */
  private reconnect(attempt: number): void {
    const recipe = this.recipe
    this.match?.dispose(false)
    this.match = null
    this.p1Hud.showResults(null)
    this.hud.hide()
    this.inventory.hide()
    this.input.enabled = false
    this.input.releasePointerLock()
    this.state = 'menu'
    if (!recipe || attempt > RECONNECT_ATTEMPTS) {
      this.quitToMenu('Não foi possível reconectar ao servidor.')
      return
    }
    const notice = `Conexão perdida — reconectando (tentativa ${attempt} de ${RECONNECT_ATTEMPTS})…`
    this.screens.loading(recipe.title).step(notice)
    setTimeout(() => {
      if (this.recipe !== recipe || this.state !== 'menu') return
      void this.begin(recipe, () => this.reconnect(attempt + 1), notice)
    }, attempt === 1 ? 300 : 2000)
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
    if (!r.victory) actions.push({ label: 'Assistir', action: 'spectate', run: () => { this.p1Hud.showResults(null); void this.resume() } })
    actions.push({ label: this.recipe?.online ? 'Voltar à plataforma' : 'Voltar ao menu', action: 'menu', run: () => this.quitToMenu() })
    this.p1Hud.showResults(r, actions)
  }

  /** Abre de novo a mesma partida (offline) ou reconecta ao mesmo servidor. */
  private restart(notice?: string): void {
    const recipe = this.recipe
    this.p1Hud.showResults(null)
    this.inventory.hide()
    this.input.enabled = false
    this.input.releasePointerLock()
    this.match?.dispose()
    this.match = null
    this.session?.close()
    this.session = null
    this.state = 'menu'
    if (!recipe) {
      this.showMenu()
      return
    }
    if (notice) this.screens.toast(notice, 'info', 4000)
    if (recipe.split) {
      this.endSplit()
      void this.beginSplit(recipe.split.mapId, recipe.split.match)
    } else void this.begin(recipe)
  }

  async resume(): Promise<void> {
    if (!this.match) return
    this.p1Hud.showResults(null)
    this.audio.resume()
    this.inventory.hide()
    this.screens.clear()
    this.state = 'playing'
    this.input.enabled = true
    this.input.clear()
    if (this.split) {
      this.split.p2Input.enabled = true
      this.split.p2Input.clear()
    }
    this.canvas.focus()
    await this.input.requestPointerLock()
  }

  pause(): void {
    if (this.state !== 'playing') return
    this.state = 'paused'
    if (this.split) this.split.p2Input.enabled = false
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
    this.p1Hud.showResults(null)
    const onExit = this.recipe?.online?.onExit
    this.recipe = null
    const session = this.session
    this.session = null
    if (!this.match) session?.close()
    this.inventory.hide()
    this.input.enabled = false
    this.input.releasePointerLock()
    this.input.resetToggles()
    this.match?.dispose()
    this.match = null
    this.endSplit()
    this.hud.hide()
    this.state = 'menu'
    if (onExit) {
      onExit(notice)
      return
    }
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
      this.split?.p2?.frame(dt, performance.now())
      if (this.state === 'inventory') this.inventory.update(this.match.state)
    }
  }

  /** Para testes: derruba a conexão como se a rede tivesse caído (sem aviso ao servidor). */
  debugDropConnection(): void {
    const t = this.session?.transport
    if (t?.drop) t.drop()
    else t?.close()
  }

  /** Estado resumido para testes automatizados e diagnóstico. */
  debugState(): { screen: AppState; version: string; match: DebugState | null; match2: DebugState | null; online: ReturnType<OnlineController['debug']> } {
    return { screen: this.state, version: GAME.version, match: this.match?.debugState() ?? null, match2: this.split?.p2?.debugState() ?? null, online: this.online.debug() }
  }
}
