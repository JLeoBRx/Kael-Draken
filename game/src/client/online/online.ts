import { sanitizeName } from '../../shared/net/protocol'
import type { HistoryEntry, LeaderRow, MatchReward, MatchTicket, ServerPush } from '../../shared/platform/messages'
import type { OnlinePrefs, Settings } from '../settings'
import type { Screens } from '../ui/screens'
import { OnlineHome, historyModal, leaderboardModal, loginScreen } from './online-screens'
import { desktop } from '../desktop'
import { PlatformClient, platformUrls } from './platform-client'

/**
 * Fluxo online no cliente: conecta à plataforma, entra pelo nome (ou pela
 * sessão salva), mostra a casa e, quando a plataforma entrega um bilhete
 * (fila pública ou sala privada), pede à casca para abrir a partida no
 * servidor de jogo indicado. A conexão com a plataforma continua aberta
 * durante a partida (convites, presença e o XP chegam na hora).
 */

export interface OnlineShell {
  readonly screens: Screens
  settings(): Settings
  saveSettings(s: Settings): void
  /** Abre a partida no servidor de jogo; `onExit` é chamado quando ela termina ou a pessoa sai. */
  startOnlineMatch(opts: { url: string; ticket: string; name: string; title: string; code?: string; onExit: (notice?: string) => void }): void
  /** Está numa partida (carregando, jogando, pausado, resultado). */
  inMatch(): boolean
  mainMenu(): void
  /** Som de interface (avisos da plataforma). */
  sound(name: 'partida-encontrada' | 'nivel' | 'ui-aviso' | 'ui-error' | 'ui-confirm'): void
}

const SESSION_KEY = 'ultima-chama:plataforma:'

function loadSession(base: string): string {
  try {
    return localStorage.getItem(SESSION_KEY + base) ?? ''
  } catch {
    return ''
  }
}

function saveSession(base: string, session: string | null): void {
  try {
    if (session) localStorage.setItem(SESSION_KEY + base, session)
    else localStorage.removeItem(SESSION_KEY + base)
  } catch {
    // sem armazenamento: só não volta sozinho depois de recarregar
  }
}

type View = 'closed' | 'login' | 'home' | 'match'

export class OnlineController {
  private client: PlatformClient | null = null
  private home: OnlineHome | null = null
  private view: View = 'closed'
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** Última recompensa recebida (mostrada na casa ao voltar da partida). */
  private pendingReward: MatchReward | null = null

  constructor(private readonly shell: OnlineShell) {}

  private get base(): { http: string; ws: string } {
    // aplicativo de computador: a página vem de 127.0.0.1, então o padrão é a plataforma configurada nele
    return platformUrls(this.shell.settings().online.address || desktop()?.platform || '')
  }

  /** "Jogar online" no menu principal. */
  async open(): Promise<void> {
    if (this.client?.connected && this.client.state) {
      this.showHome()
      return
    }
    const loading = this.shell.screens.loading('Plataforma online')
    loading.step('Conectando à plataforma…')
    try {
      await this.connect()
    } catch (err) {
      this.showLogin(err instanceof Error ? err.message : String(err))
      return
    }
    const session = loadSession(this.base.ws)
    if (session) {
      try {
        loading.step('Entrando…')
        await this.client!.login({ session })
        this.showHome()
        return
      } catch (err) {
        saveSession(this.base.ws, null)
        this.showLogin(err instanceof Error ? err.message : String(err))
        return
      }
    }
    this.showLogin()
  }

  private async connect(): Promise<void> {
    this.client?.close()
    const c = new PlatformClient(this.base.ws)
    this.client = c
    c.onPush = (m) => this.onPush(m)
    c.onClose = (reason, kicked) => this.onClosed(c, reason, kicked)
    await c.connect()
  }

  private showLogin(error?: string): void {
    this.view = 'login'
    this.home = null
    const s = this.shell.settings()
    const ui = loginScreen({ name: s.playerName, address: s.online.address }, {
      back: () => this.leave(),
      login: (rawName, address) => void this.login(rawName, address, ui),
    })
    this.shell.screens.present(ui.el)
    if (error) ui.setStatus(error, true)
  }

  private async login(rawName: string, address: string, ui: ReturnType<typeof loginScreen>): Promise<void> {
    const name = sanitizeName(rawName)
    if (!rawName.trim()) {
      ui.setStatus('Digite o seu nome.', true)
      return
    }
    const s = this.shell.settings()
    const changed = address.trim() !== s.online.address
    this.shell.saveSettings({ ...s, playerName: name, online: { ...s.online, address: address.trim() } })
    ui.setBusy(true)
    ui.setStatus('Entrando…')
    try {
      if (changed || !this.client?.connected) await this.connect()
      const st = await this.client!.login({ name })
      saveSession(this.base.ws, st.session)
      this.showHome()
    } catch (err) {
      ui.setBusy(false)
      ui.setStatus(err instanceof Error ? err.message : String(err), true)
    }
  }

  /** Casa da plataforma (também ao voltar de uma partida). */
  showHome(notice?: string): void {
    const c = this.client
    if (!c?.connected || !c.state) {
      void this.open().then(() => notice && this.shell.screens.toast(notice, 'info'))
      return
    }
    this.view = 'home'
    const prefs = this.shell.settings().online
    this.home = new OnlineHome(c.state, prefs, {
      queue: (p) => this.act(c.request({ t: 'queue', teamSize: p.teamSize, region: p.region, fill: p.fill })),
      cancelQueue: () => this.act(c.request({ t: 'queueCancel' })),
      createRoom: () => this.act(c.request<MatchTicket>({ t: 'roomCreate' }).then((t) => this.play(t))),
      joinRoom: (code) => this.act(c.request<MatchTicket>({ t: 'roomJoin', code }).then((t) => this.play(t))),
      rejoin: () => c.state?.match && this.play(c.state.match),
      addFriend: (name) => this.act(c.request<{ result: string }>({ t: 'friendAdd', name }).then((r) => {
        const text = r.result === 'sent' ? 'Pedido de amizade enviado' : r.result === 'accepted' ? 'Agora vocês são amigos' : r.result === 'pending' ? 'Pedido já enviado' : 'Vocês já são amigos'
        this.shell.screens.toast(text, 'info')
      })),
      acceptFriend: (id) => this.act(c.request({ t: 'friendAccept', id })),
      declineFriend: (id) => this.act(c.request({ t: 'friendDecline', id })),
      removeFriend: (id) => this.act(c.request({ t: 'friendRemove', id })),
      invite: (id) => this.act(c.request({ t: 'partyInvite', id }).then(() => this.shell.screens.toast('Convite enviado', 'info'))),
      leaveParty: () => this.act(c.request({ t: 'partyLeave' })),
      kick: (id) => this.act(c.request({ t: 'partyKick', id })),
      acceptInvite: (partyId) => this.act(c.request({ t: 'partyAccept', partyId })),
      declineInvite: (partyId) => this.act(c.request({ t: 'partyDecline', partyId })),
      setSkin: (skin) => this.act(c.request({ t: 'setSkin', skin })),
      setTitle: (id) => this.act(c.request({ t: 'setTitle', id })),
      history: () => this.act(c.request<HistoryEntry[]>({ t: 'history' }).then((list) => this.shell.screens.presentModal(historyModal(list, () => this.shell.screens.closeModal())))),
      leaderboard: () => this.act(c.request<LeaderRow[]>({ t: 'leaderboard' }).then((list) => this.shell.screens.presentModal(leaderboardModal(list, c.state?.me.name ?? '', () => this.shell.screens.closeModal())))),
      logout: () => void this.logout(),
      back: () => this.leave(),
      prefsChanged: (p: OnlinePrefs) => {
        const s = this.shell.settings()
        this.shell.saveSettings({ ...s, online: { ...p, address: s.online.address } })
      },
    })
    this.shell.screens.present(this.home.el)
    if (this.pendingReward) this.home.showReward(this.pendingReward)
    if (notice) this.shell.screens.toast(notice, 'info')
  }

  /** Ação pedida na tela: erro vira aviso na tela (nunca some em silêncio). */
  private act(p: Promise<unknown>): void {
    p.catch((err) => this.shell.screens.toast(err instanceof Error ? err.message : String(err), 'error', 6000))
  }

  private play(t: MatchTicket): void {
    const c = this.client
    if (!c?.state) return
    this.view = 'match'
    this.home = null
    this.pendingReward = null
    this.shell.startOnlineMatch({
      url: t.url ?? `${c.wsBase}${t.path}`,
      ticket: t.ticket,
      name: c.state.me.name,
      title: t.kind === 'privado' ? `Sala ${t.code ?? ''}` : 'Partida online',
      code: t.code,
      onExit: (notice) => {
        if (c.state) c.state.match = null
        this.showHome(notice)
      },
    })
  }

  private onPush(m: ServerPush): void {
    const st = this.client?.state
    switch (m.t) {
      case 'matchFound':
        if (this.view === 'match' || this.shell.inMatch()) return
        this.shell.sound('partida-encontrada')
        this.play(m.match)
        return
      case 'partyInvite':
        this.shell.sound('ui-aviso')
        if (this.home) this.home.addInvite('party', m.partyId, m.from.name)
        if (this.view !== 'home') this.shell.screens.toast(`${m.from.name} convidou você para o grupo — aceite na plataforma`, 'info', 6000)
        return
      case 'roomInvite':
        this.shell.sound('ui-aviso')
        if (this.home) this.home.addInvite('room', m.code, m.from.name)
        if (this.view !== 'home') this.shell.screens.toast(`${m.from.name} criou a sala ${m.code}`, 'info', 6000)
        return
      case 'notice':
        this.shell.sound(m.level === 'error' ? 'ui-error' : 'ui-aviso')
        this.shell.screens.toast(m.text, m.level, m.level === 'error' ? 7000 : 4500)
        return
      case 'reward': {
        const r = m.reward
        this.shell.sound(r.levelAfter > r.levelBefore ? 'nivel' : 'ui-confirm')
        this.home?.showReward(r)
        if (this.view === 'match') {
          const lvl = r.levelAfter > r.levelBefore ? ` — nível ${r.levelAfter}!` : ''
          this.shell.screens.toast(`+${r.xp.total + r.challengeXp} XP${lvl}`, 'info', 6000)
        }
        this.pendingReward = r
        return
      }
      case 'kicked':
        return
      default:
        if (this.home && st) this.home.update(st)
    }
  }

  private onClosed(c: PlatformClient, reason: string, kicked: boolean): void {
    if (this.client !== c) return
    this.client = null
    if (kicked) {
      saveSession(this.base.ws, null)
      if (this.view !== 'match') this.showLogin('Sua conta entrou em outro lugar.')
      return
    }
    if (this.view === 'home' || this.view === 'login') this.showLogin(`${reason}. Tentando de novo…`)
    // volta sozinho com a sessão (também durante a partida)
    this.scheduleReconnect(1)
  }

  private scheduleReconnect(attempt: number): void {
    if (this.reconnectTimer || attempt > 10) return
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      if (this.view === 'closed' || this.client?.connected) return
      const session = loadSession(this.base.ws)
      if (!session) return
      try {
        await this.connect()
        await this.client!.login({ session })
        if (this.view === 'home' || this.view === 'login') this.showHome()
      } catch {
        this.scheduleReconnect(attempt + 1)
      }
    }, attempt === 1 ? 1000 : 4000)
  }

  private async logout(): Promise<void> {
    try {
      await this.client?.request({ t: 'logout' })
    } catch (err) {
      console.error(err)
    }
    saveSession(this.base.ws, null)
    this.showLogin()
  }

  /** Volta ao menu principal (fecha a conexão com a plataforma). */
  private leave(): void {
    this.view = 'closed'
    this.home = null
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this.client?.close()
    this.client = null
    this.shell.mainMenu()
  }

  /** Para testes e diagnóstico. */
  debug(): { view: View; name: string | null; level: number; xp: number; party: string[]; searching: boolean; friends: { name: string; presence: string }[]; matches: number } | null {
    const st = this.client?.state
    if (this.view === 'closed' && !st) return null
    return {
      view: this.view,
      name: st?.me.name ?? null,
      level: st?.me.level ?? 0,
      xp: st?.me.xp ?? 0,
      party: st?.party?.members.map((m) => m.name) ?? [],
      searching: !!st?.queue?.searching,
      friends: st?.friends.map((f) => ({ name: f.name, presence: f.presence })) ?? [],
      matches: st?.me.stats.matches ?? 0,
    }
  }
}
