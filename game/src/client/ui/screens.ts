import { GAME } from '../../shared/config/game'
import { MOVE } from '../../shared/config/movement'
import { PROTOCOL_VERSION, type LobbyState } from '../../shared/net/protocol'
import { QUALITY, type OfflinePrefs, type Quality, type Settings } from '../settings'
import { ACTIONS, ACTION_LABEL, COLOR_VISION_LABEL, DEFAULT_KEYS, RESERVED_KEYS, keyLabel, rebind, type Action, type ColorVision } from '../accessibility'
import { BOT_DIFFICULTIES, BOT_PROFILES } from '../../server/core/bots/profiles'
import { historyTotals, type MatchRecord } from '../history'
import { EMBLEM_SVG, h } from './dom'

/**
 * Telas da interface (menu, entrar em servidor, carregamento, pausa,
 * configurações, controles). Cada tela é montada em uma camada própria e
 * removida ao trocar.
 */

export interface LanEntry {
  name: string
  /** Endereço para conectar (ip:porta) */
  address: string
  detail: string
}

export interface LobbyActions {
  ready(ready: boolean): void
  team(team: number): void
  config(c: LobbyState['config']): void
  start(): void
  leave(): void
}

export interface MainMenuActions {
  playOffline(): void
  online(): void
  join(): void
  locker(): void
  settings(): void
  controls(): void
  history(): void
}

export class Screens {
  private current: HTMLElement | null = null
  private modal: HTMLElement | null = null
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  private toastEl: HTMLElement | null = null

  constructor(private readonly layer: HTMLElement) {}

  private show(el: HTMLElement): HTMLElement {
    this.closeModal()
    this.current?.remove()
    this.current = el
    this.layer.append(el)
    return el
  }

  clear(): void {
    this.closeModal()
    this.current?.remove()
    this.current = null
  }

  closeModal(): void {
    this.modal?.remove()
    this.modal = null
  }

  get hasModal(): boolean {
    return this.modal !== null
  }

  private showModal(el: HTMLElement): void {
    this.closeModal()
    this.modal = el
    this.layer.append(el)
  }

  /** Mostra uma tela montada fora daqui (telas online). */
  present(el: HTMLElement): void {
    this.show(el)
  }

  presentModal(el: HTMLElement): void {
    this.showModal(el)
  }

  toast(message: string, kind: 'info' | 'error' = 'info', ms = 4500): void {
    this.toastEl?.remove()
    if (this.toastTimer) clearTimeout(this.toastTimer)
    const el = h('div', { class: `toast ${kind}`, role: 'status' }, message)
    this.toastEl = el
    this.layer.append(el)
    this.toastTimer = setTimeout(() => el.remove(), ms)
  }

  mainMenu(a: MainMenuActions, webglError: string | null): void {
    const emblem = h('div', { html: EMBLEM_SVG })
    const playBtn = h('button', { class: 'btn primary', 'data-action': 'offline', onclick: () => a.playOffline() },
      h('span', { class: 'label' }, 'Jogar offline'),
      h('span', { class: 'sub' }, 'Battle royale contra bots ou treino livre · servidor local no navegador, sem internet'))
    const onlineBtn = h('button', { class: 'btn', 'data-action': 'online', onclick: () => a.online() },
      h('span', { class: 'label' }, 'Jogar online'),
      h('span', { class: 'sub' }, 'Entre só com o seu nome: partidas públicas, salas com código, amigos e grupo'))
    const joinBtn = h('button', { class: 'btn', 'data-action': 'join', onclick: () => a.join() },
      h('span', { class: 'label' }, 'Rede local'),
      h('span', { class: 'sub' }, 'Sala de espera na LAN ou servidor dedicado pelo endereço'))
    if (webglError) {
      playBtn.disabled = true
      onlineBtn.disabled = true
      joinBtn.disabled = true
    }
    this.show(h('div', { class: 'screen stage', 'data-screen': 'menu' },
      h('div', { class: 'menu' },
        h('div', { class: 'brand' },
          emblem,
          h('h1', { class: 'title' }, GAME.title),
          h('p', { class: 'tagline' }, GAME.tagline),
          h('span', { class: 'badge' }, h('span', { class: 'dot' }), `${GAME.phase} · contas, amigos, grupos e matchmaking`),
          webglError ? h('p', { class: 'status error' }, webglError) : null),
        h('div', { class: 'actions' },
          playBtn,
          onlineBtn,
          joinBtn,
          h('div', { class: 'row' },
            h('button', { class: 'btn small', 'data-action': 'locker', onclick: () => a.locker() }, h('span', { class: 'label' }, 'Armário')),
            h('button', { class: 'btn small', 'data-action': 'settings', onclick: () => a.settings() }, h('span', { class: 'label' }, 'Configurações')),
            h('button', { class: 'btn small', 'data-action': 'controls', onclick: () => a.controls() }, h('span', { class: 'label' }, 'Controles')),
            h('button', { class: 'btn small', 'data-action': 'history', onclick: () => a.history() }, h('span', { class: 'label' }, 'Histórico'))))),
      h('div', { class: 'footer' },
        h('span', {}, `v${GAME.version} · protocolo ${PROTOCOL_VERSION}`),
        h('span', {}, 'Próxima fase: polimento (arte, som e efeitos finais)'))))
    playBtn.focus()
  }

  /** Armário: escolhe o visual (offline/LAN; online usa o da conta, liberado por nível). */
  locker(skins: readonly { name: string; armor: number; suit: number; accent: number }[], current: number, a: { pick(skin: number): void; back(): void }): void {
    const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`
    const name = h('div', { class: 'locker-name', 'data-hud': 'locker-name' }, skins[current]?.name ?? '')
    const grid = h('div', { class: 'locker-grid' }, ...skins.map((sk, k) => h('button', {
      class: `skin big${k === current ? ' on' : ''}`, 'data-skin': k, title: sk.name, 'aria-label': `Visual ${sk.name}`,
      style: `background:linear-gradient(135deg, ${hex(sk.armor)} 0 50%, ${hex(sk.suit)} 50%);border-color:${hex(sk.accent)}`,
      onclick: (e: Event) => {
        grid.querySelectorAll('.skin').forEach((b) => b.classList.remove('on'))
        ;(e.currentTarget as HTMLElement).classList.add('on')
        name.textContent = sk.name
        a.pick(k)
      },
    })))
    this.show(h('div', { class: 'screen stage', 'data-screen': 'locker' },
      h('div', { class: 'panel locker' },
        h('h2', {}, 'Armário'),
        h('p', { class: 'hint' }, 'Escolha o visual do seu personagem. Vale nas partidas offline e na rede local; online, cada visual libera com o nível da conta.'),
        name,
        grid,
        h('div', { class: 'row', style: 'margin-top:16px' }, h('button', { class: 'btn small', 'data-action': 'back', onclick: () => a.back() }, h('span', { class: 'label' }, 'Voltar'))))))
  }

  join(defaults: { name: string; address: string }, onConnect: (name: string, address: string) => void, onBack: () => void): { setStatus(text: string, error?: boolean): void; setBusy(busy: boolean): void; setLan(list: LanEntry[] | null): void } {
    const name = h('input', { class: 'text-input', name: 'nome', maxlength: 16, value: defaults.name, placeholder: 'Jogador', autocomplete: 'nickname' })
    const address = h('input', { class: 'text-input', name: 'endereco', value: defaults.address, placeholder: 'ex.: 192.168.0.10:7350 (vazio = este servidor)', autocomplete: 'off', spellcheck: 'false' })
    const status = h('div', { class: 'status', 'aria-live': 'polite' })
    const lan = h('div', { class: 'lan', 'data-screen': 'lan' })
    lan.hidden = true
    const connect = h('button', { class: 'btn primary small', type: 'submit', 'data-action': 'connect' }, h('span', { class: 'label' }, 'Conectar'))
    const form = h('form', { class: 'stack', onsubmit: (e: Event) => { e.preventDefault(); onConnect(name.value, address.value) } },
      h('label', {}, 'Seu nome', name),
      h('label', {}, 'Endereço do servidor', address),
      status,
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: onBack }, h('span', { class: 'label' }, 'Voltar')),
        connect))
    this.show(h('div', { class: 'screen', 'data-screen': 'join' },
      h('div', { class: 'panel' },
        h('h2', {}, 'Rede local'),
        h('p', { class: 'hint' }, `Na rede local, o anfitrião roda "npm run host" e informa o endereço exibido no terminal (porta ${GAME.defaultPort}). Para servidores online, use o endereço wss:// do servidor dedicado.`),
        lan,
        form)))
    ;(defaults.name ? address : name).focus()
    return {
      setLan(list) {
        lan.hidden = !list
        if (!list) return
        lan.replaceChildren(
          h('h3', { style: 'margin:6px 0 4px;font-size:15px' }, 'Partidas na rede local'),
          list.length === 0
            ? h('p', { class: 'hint', style: 'margin:0' }, 'Procurando… (os servidores se anunciam a cada 2 s)')
            : h('div', { class: 'lan-list' }, ...list.map((e) => h('div', { class: 'lan-row', 'data-lan': e.address },
              h('span', {}, h('b', {}, e.name), h('small', {}, e.detail)),
              h('button', { class: 'btn small', type: 'button', onclick: () => { address.value = e.address; onConnect(name.value, e.address) } }, h('span', { class: 'label' }, 'Entrar'))))))
      },
      setStatus(text, error = false) {
        status.textContent = text
        status.className = error ? 'status error' : 'status'
      },
      setBusy(busy) {
        connect.disabled = busy
      },
    }
  }

  /** Sala de espera: membros, prontos, equipe e configuração (o dono edita e inicia). */
  /** `code`: sala privada online (mostra o código para passar aos amigos). */
  lobby(st: LobbyState, maps: { id: string; name: string }[], a: LobbyActions, code?: string): void {
    const me = st.members.find((m) => m.id === st.you)
    const owner = st.you === st.owner
    const c = st.config
    const teamName = (t: number) => (t < 0 ? 'Automática' : `Equipe ${t + 1}`)
    const sizeName = ['', 'Solo', 'Dupla', 'Trio', 'Esquadrão']
    const members = st.members.map((m) => h('div', { class: `lobby-member${m.id === st.you ? ' me' : ''}`, 'data-member': m.name },
      h('span', {}, h('b', {}, m.name), m.id === st.owner ? h('span', { class: 'tag', style: 'margin-left:6px' }, 'anfitrião') : null, m.id === st.you ? h('span', { class: 'tag', style: 'margin-left:6px' }, 'você') : null),
      c.teamSize > 1 ? h('span', { class: 'tag' }, teamName(m.team)) : h('span'),
      h('span', { class: m.ready ? 'ok' : 'tag' }, m.ready ? 'Pronto' : 'Aguardando')))
    const sel = (field: string, options: [string | number, string][], value: string | number, onChange: (v: string) => void) => {
      const el = h('select', { 'data-field': field }, ...options.map(([v, label]) => h('option', { value: String(v) }, label))) as HTMLSelectElement
      el.value = String(value)
      el.disabled = !owner || st.running
      el.addEventListener('change', () => onChange(el.value))
      return el
    }
    const send = (patch: Partial<LobbyState['config']>) => a.config({ ...c, ...patch })
    const bots = h('input', { type: 'range', min: 0, max: 99, step: 1, 'data-field': 'bots' }) as HTMLInputElement
    bots.value = String(c.bots)
    bots.disabled = !owner || st.running
    const botsLabel = h('b', {}, String(c.bots))
    bots.addEventListener('input', () => { botsLabel.textContent = bots.value })
    bots.addEventListener('change', () => send({ bots: Number(bots.value) }))
    const ff = h('input', { type: 'checkbox', 'data-field': 'ff' }) as HTMLInputElement
    ff.checked = c.friendlyFire
    ff.disabled = !owner || st.running
    ff.addEventListener('change', () => send({ friendlyFire: ff.checked }))
    const teamSel = sel('team', [[-1, 'Automática'], ...Array.from({ length: 12 }, (_, k): [number, string] => [k, `Equipe ${k + 1}`])], me?.team ?? -1, (v) => a.team(Number(v)))
    teamSel.disabled = st.running
    const readyBtn = h('button', { class: `btn small${me?.ready ? '' : ' primary'}`, 'data-action': 'ready', onclick: () => a.ready(!me?.ready) }, h('span', { class: 'label' }, me?.ready ? 'Cancelar pronto' : 'Estou pronto'))
    readyBtn.disabled = st.running
    const allReady = st.members.every((m) => m.ready || m.id === st.owner)
    const startBtn = h('button', { class: 'btn primary small', 'data-action': 'start', onclick: () => a.start() }, h('span', { class: 'label' }, 'Iniciar partida'))
    startBtn.disabled = !owner || st.running
    const status = st.running
      ? `Partida em andamento (${st.runningAlive} vivos) — você entra na próxima.`
      : owner
        ? (allReady ? 'Todos prontos. Inicie quando quiser.' : 'Esperando os outros ficarem prontos (você pode iniciar mesmo assim).')
        : `Esperando o anfitrião iniciar. ${st.members.filter((m) => m.ready).length}/${st.members.length} prontos.`
    this.show(h('div', { class: 'screen', 'data-screen': 'lobby' },
      h('div', { class: 'panel', style: 'width:min(860px,100%)' },
        h('h2', {}, code ? 'Sala privada' : 'Sala de espera'),
        code ? h('p', { class: 'room-code' }, 'Código da sala: ', h('b', { 'data-hud': 'room-code' }, code), h('span', { class: 'muted small' }, ' — passe para os amigos entrarem em "Jogar online"')) : null,
        h('div', { class: 'lobby-grid' },
          h('div', {},
            h('h3', { style: 'margin:0 0 8px;font-size:15px' }, `Jogadores (${st.members.length})`),
            h('div', { class: 'lobby-members' }, ...members),
            c.teamSize > 1 ? h('label', { class: 'field', style: 'margin-top:12px;display:flex;flex-direction:column;gap:4px;font-size:13px' }, 'Sua equipe', teamSel) : null,
            h('div', { class: 'row', style: 'margin-top:12px;gap:8px' }, readyBtn, startBtn)),
          h('div', { class: 'lobby-config' },
            h('h3', { style: 'margin:0;font-size:15px' }, owner ? 'Partida (você configura)' : 'Partida'),
            h('label', { class: 'field' }, 'Mapa', sel('map', maps.map((m): [string, string] => [m.id, m.name]), c.mapId, (v) => send({ mapId: v }))),
            h('label', { class: 'field' }, 'Modo', sel('mode', [[1, 'Battle royale'], [0, 'Treino (renascimento)']], c.mode, (v) => send({ mode: Number(v) }))),
            h('label', { class: 'field' }, 'Equipes', sel('team-size', [1, 2, 3, 4].map((n): [number, string] => [n, sizeName[n]]), c.teamSize, (v) => send({ teamSize: Number(v) }))),
            h('label', { class: 'check', style: 'font-size:13px' }, ff, ' Fogo amigo'),
            h('label', { class: 'field' }, h('span', {}, 'Bots: ', botsLabel), bots),
            h('label', { class: 'field' }, 'Dificuldade dos bots', sel('difficulty', BOT_DIFFICULTIES.map((d, k): [number, string] => [k, BOT_PROFILES[d].label]), c.difficulty, (v) => send({ difficulty: Number(v) }))),
            h('label', { class: 'field' }, 'Zona', sel('zone', [[1, 'Normal'], [2.2, 'Rápida']], c.zoneSpeed >= 2 ? 2.2 : 1, (v) => send({ zoneSpeed: Number(v) }))))),
        h('p', { class: 'lobby-status', 'data-hud': 'lobby-status' }, status),
        h('div', { class: 'row', style: 'margin-top:10px' },
          h('button', { class: 'btn small', 'data-action': 'leave', onclick: () => a.leave() }, h('span', { class: 'label' }, 'Sair da sala'))))))
  }

  loading(title: string): { step(text: string): void } {
    const step = h('div', { class: 'step' }, 'Preparando…')
    const tips = [
      'Corra (Shift) e aperte C para deslizar; pule no fim do deslize para ganhar distância.',
      'O servidor é a autoridade: o seu cliente só envia intenções de movimento.',
      'O vão de 6,5 m do Pátio de Treino só é vencido com deslize + pulo.',
      'Mirar (botão direito) reduz muito a dispersão; correr e pular aumentam.',
      'Escudo absorve o dano antes da vida. Bandagens curam só até 75.',
      'Baús e a base militar têm armas de raridade maior.',
      'F3 mostra o painel técnico: ping, tick, correções de predição e posição.',
    ]
    this.show(h('div', { class: 'screen', 'data-screen': 'loading' },
      h('div', { class: 'loading' },
        h('div', { class: 'spinner', role: 'progressbar', 'aria-label': 'Carregando' }),
        h('h2', { class: 'title', style: 'font-size: 34px' }, title),
        step,
        h('p', { class: 'tip' }, tips[Math.floor(Math.random() * tips.length)]))))
    return { step: (text) => { step.textContent = text } }
  }

  /** Seleção de mapa (modo offline). */
  mapSelect(maps: { id: string; name: string; description: string; tag: string }[], prefs: OfflinePrefs, onPick: (id: string, prefs: OfflinePrefs) => void, onBack: () => void): void {
    const p: OfflinePrefs = { ...prefs }
    const hint = h('p', { class: 'hint', style: 'margin:0' })
    const modeBtns = (['br', 'treino'] as const).map((m) => h('button', { class: 'btn small', 'data-mode': m }, h('span', { class: 'label' }, m === 'br' ? 'Battle royale' : 'Treino')))
    const botsLabel = h('b')
    const bots = h('input', { type: 'range', min: 0, max: 99, step: 1, 'data-field': 'bots' }) as HTMLInputElement
    bots.value = String(p.bots)
    const difficulty = h('select', { 'data-field': 'difficulty' }, ...BOT_DIFFICULTIES.map((d) => h('option', { value: d }, BOT_PROFILES[d].label))) as HTMLSelectElement
    difficulty.value = p.difficulty
    const zone = h('select', { 'data-field': 'zone' }, h('option', { value: 'normal' }, 'Normal (~9 min)'), h('option', { value: 'rapida' }, 'Rápida (~4 min)')) as HTMLSelectElement
    zone.value = p.zone
    const zoneField = h('label', { class: 'field' }, 'Zona', zone)
    const teamSize = h('select', { 'data-field': 'team-size' }, h('option', { value: '1' }, 'Solo'), h('option', { value: '2' }, 'Duplas'), h('option', { value: '3' }, 'Trios'), h('option', { value: '4' }, 'Esquadrões')) as HTMLSelectElement
    teamSize.value = String(p.teamSize)
    teamSize.addEventListener('change', () => { p.teamSize = Number(teamSize.value); refresh() })
    const local = h('select', { 'data-field': 'local-players' }, h('option', { value: '1' }, '1 jogador'), h('option', { value: '2' }, '2 jogadores (tela dividida)')) as HTMLSelectElement
    local.value = String(p.localPlayers)
    local.addEventListener('change', () => { p.localPlayers = local.value === '2' ? 2 : 1; refresh() })
    const refresh = () => {
      modeBtns.forEach((b) => b.classList.toggle('on', b.dataset.mode === p.mode))
      botsLabel.textContent = String(p.bots)
      zoneField.hidden = p.mode !== 'br'
      const who = p.localPlayers === 2 ? 'vocês dois' : 'você'
      const teams = p.teamSize > 1 ? ` em ${['', '', 'duplas', 'trios', 'esquadrões'][p.teamSize]}` : ''
      const split = p.localPlayers === 2 ? ' Tela dividida: jogador 1 no teclado e mouse, jogador 2 no controle.' : ''
      hint.textContent = (p.mode === 'br'
        ? `Battle royale${teams}: ${who} e ${p.bots} ${p.bots === 1 ? 'bot' : 'bots'} saltam do dirigível; a zona fecha e vence a última equipe de pé. Sem renascimento.`
        : `Treino livre${teams}${p.bots > 0 ? ` com ${p.bots} ${p.bots === 1 ? 'bot' : 'bots'}` : ''}: sem zona, quem é eliminado renasce em 5 s.`) + split
    }
    modeBtns.forEach((b) => b.addEventListener('click', () => { p.mode = b.dataset.mode as OfflinePrefs['mode']; refresh() }))
    bots.addEventListener('input', () => { p.bots = Number(bots.value); refresh() })
    difficulty.addEventListener('change', () => { p.difficulty = difficulty.value as OfflinePrefs['difficulty'] })
    zone.addEventListener('change', () => { p.zone = zone.value as OfflinePrefs['zone'] })
    refresh()
    this.show(h('div', { class: 'screen', 'data-screen': 'map-select' },
      h('div', { class: 'panel', style: 'width:min(760px,100%)' },
        h('h2', {}, 'Partida offline'),
        h('div', { class: 'match-options' },
          h('div', { class: 'field' }, 'Modo', h('div', { class: 'seg' }, ...modeBtns)),
          h('label', { class: 'field' }, h('span', {}, 'Bots: ', botsLabel), bots),
          h('label', { class: 'field' }, 'Dificuldade dos bots', difficulty),
          zoneField,
          h('label', { class: 'field' }, 'Equipes', teamSize),
          h('label', { class: 'field' }, 'Neste computador', local)),
        hint,
        h('p', { class: 'hint', style: 'margin:14px 0 6px' }, 'Escolha o mapa para começar (o servidor roda no seu navegador):'),
        h('div', { class: 'map-cards' }, ...maps.map((m) => h('button', { class: 'btn map-card', 'data-map': m.id, onclick: () => onPick(m.id, { ...p }) },
          h('span', { class: 'tag' }, m.tag),
          h('span', { class: 'label' }, m.name),
          h('span', { class: 'sub' }, m.description)))),
        h('div', { class: 'row', style: 'margin-top:16px' },
          h('button', { class: 'btn small', onclick: onBack }, h('span', { class: 'label' }, 'Voltar'))))))
  }

  history(list: readonly MatchRecord[], onClose: () => void): void {
    const t = historyTotals(list)
    const stat = (v: string | number, label: string) => h('div', {}, h('b', {}, String(v)), h('span', {}, label))
    const rows = list.map((r) => {
      const d = new Date(r.date)
      const when = Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      const mm = Math.floor(r.seconds / 60)
      const ss = String(Math.floor(r.seconds % 60)).padStart(2, '0')
      return h('div', { class: `history-row${r.victory ? ' win' : ''}` },
        h('b', {}, r.victory ? '#1 🏆' : `#${r.place}`),
        h('span', {}, `${r.mapName} · ${r.where} · ${r.kills} ${r.kills === 1 ? 'eliminação' : 'eliminações'} · ${Math.round(r.damage)} de dano · ${mm}:${ss}`),
        h('small', {}, `${when} · de ${r.total}`))
    })
    this.showModal(h('div', { class: 'screen overlay', 'data-screen': 'history', onclick: (e: Event) => { if (e.target === e.currentTarget) onClose() } },
      h('div', { class: 'panel', style: 'width:min(680px,100%)' },
        h('h2', {}, 'Histórico de partidas'),
        h('div', { class: 'history-totals' },
          stat(t.matches, 'partidas'), stat(t.wins, 'vitórias'), stat(t.top5, 'no top 5'), stat(t.kills, 'eliminações'),
          stat(t.bestPlace === null ? '—' : `#${t.bestPlace}`, 'melhor colocação')),
        list.length === 0
          ? h('p', { class: 'hint' }, 'Nenhuma partida de battle royale ainda. Jogue uma offline contra bots!')
          : h('div', { class: 'history-list' }, ...rows),
        h('p', { class: 'hint', style: 'margin-top:10px' }, 'Salvo só neste navegador. Contas e estatísticas online chegam na Fase 6.'),
        h('div', { class: 'row', style: 'margin-top:12px' },
          h('button', { class: 'btn primary small', onclick: onClose }, h('span', { class: 'label' }, 'Fechar'))))))
  }

  clickToPlay(onClick: () => void): void {
    const el = h('div', { class: 'screen overlay click-to-play', 'data-screen': 'click-to-play', onclick: onClick },
      h('div', { class: 'panel' },
        h('p', { class: 'hint', style: 'margin:0' }, 'Pronto'),
        h('div', { class: 'big' }, 'Clique para jogar'),
        h('p', { class: 'hint', style: 'margin:0' }, 'O mouse fica preso ao jogo. Esc libera e abre a pausa.')))
    this.show(el)
  }

  pause(a: { resume(): void; settings(): void; controls(): void; quit(): void }, mode: string): void {
    this.show(h('div', { class: 'screen overlay', 'data-screen': 'pause' },
      h('div', { class: 'panel stack', style: 'width:min(420px,100%)' },
        h('h2', {}, 'Pausa'),
        h('p', { class: 'hint', style: 'margin:0' }, `${mode} · a partida continua rodando no servidor.`),
        h('button', { class: 'btn primary small', 'data-action': 'resume', onclick: () => a.resume() }, h('span', { class: 'label' }, 'Continuar')),
        h('button', { class: 'btn small', onclick: () => a.settings() }, h('span', { class: 'label' }, 'Configurações')),
        h('button', { class: 'btn small', onclick: () => a.controls() }, h('span', { class: 'label' }, 'Controles')),
        h('button', { class: 'btn small', 'data-action': 'quit', onclick: () => a.quit() }, h('span', { class: 'label' }, 'Sair para o menu')))))
  }

  fatal(title: string, message: string, onBack: () => void): void {
    this.show(h('div', { class: 'screen', 'data-screen': 'error' },
      h('div', { class: 'panel fatal stack' },
        h('h2', {}, title),
        h('p', { class: 'hint' }, message),
        h('button', { class: 'btn primary small', onclick: onBack }, h('span', { class: 'label' }, 'Voltar ao menu')))))
  }

  settings(s: Settings, onChange: (s: Settings) => void, onClose: () => void): void {
    const next = { ...s }
    const commit = () => onChange({ ...next })
    const range = (key: 'sensitivity' | 'aimSensitivity' | 'fov' | 'volume' | 'uiScale' | 'crosshairSize', label: string, min: number, max: number, step: number, fmt: (v: number) => string, hint?: string) => {
      const out = h('output', {}, fmt(next[key]))
      const input = h('input', { type: 'range', min, max, step, value: next[key], 'aria-label': label })
      input.addEventListener('input', () => {
        next[key] = Number(input.value)
        out.textContent = fmt(next[key])
        commit()
      })
      return h('div', { class: 'field' }, h('label', {}, label), out, input, hint ? h('small', {}, hint) : null)
    }
    const check = (key: 'invertY' | 'crouchToggle' | 'showFps' | 'reduceMotion' | 'soundCues', label: string, hint?: string) => {
      const input = h('input', { type: 'checkbox', 'aria-label': label, 'data-field': key })
      input.checked = next[key]
      input.addEventListener('change', () => {
        next[key] = input.checked
        commit()
      })
      return h('div', { class: 'field' }, h('label', {}, label), input, hint ? h('small', {}, hint) : null)
    }
    const selectField = (key: 'colorVision' | 'crosshairColor', label: string, options: [string, string][], hint?: string) => {
      const el = h('select', { 'aria-label': label, 'data-field': key }, ...options.map(([v, l]) => h('option', { value: v }, l))) as HTMLSelectElement
      el.value = next[key]
      el.addEventListener('change', () => {
        if (key === 'colorVision') next.colorVision = el.value as ColorVision
        else next.crosshairColor = el.value
        commit()
      })
      return h('div', { class: 'field' }, h('label', {}, label), h('span'), el, hint ? h('small', {}, hint) : null)
    }
    const quality = h('select', { 'aria-label': 'Qualidade gráfica' }, ...(Object.keys(QUALITY) as Quality[]).map((q) => {
      const o = h('option', { value: q }, QUALITY[q].label)
      if (q === next.quality) o.selected = true
      return o
    }))
    quality.addEventListener('change', () => {
      next.quality = quality.value as Quality
      commit()
    })
    const name = h('input', { class: 'text-input', maxlength: 16, value: next.playerName, placeholder: 'Jogador', 'aria-label': 'Nome do jogador' })
    name.addEventListener('input', () => {
      next.playerName = name.value
      commit()
    })
    this.showModal(h('div', { class: 'screen overlay', 'data-screen': 'settings', onclick: (e: Event) => { if (e.target === e.currentTarget) onClose() } },
      h('div', { class: 'panel' },
        h('h2', {}, 'Configurações'),
        h('p', { class: 'hint' }, 'Salvas neste navegador. Funcionam offline.'),
        h('div', { class: 'field' }, h('label', {}, 'Nome do jogador'), h('span'), name),
        range('sensitivity', 'Sensibilidade', 0.1, 3, 0.05, (v) => v.toFixed(2)),
        range('aimSensitivity', 'Sensibilidade ao mirar', 0.2, 1.5, 0.05, (v) => `${Math.round(v * 100)}%`),
        range('fov', 'Campo de visão', 60, 100, 1, (v) => `${v}°`),
        range('volume', 'Volume', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`),
        check('invertY', 'Inverter eixo vertical'),
        check('crouchToggle', 'Agachar alterna (C)', 'Desligado: segure C para agachar.'),
        check('showFps', 'Mostrar quadros por segundo'),
        h('div', { class: 'field' }, h('label', {}, 'Qualidade gráfica'), h('span'), quality,
          h('small', {}, 'Baixa: sem pós-processamento nem grama (computadores fracos). Média: brilho, cores e grama. Alta: + oclusão ambiente, sombras e grama mais longe. Vale na próxima partida; antisserrilhamento ao recarregar a página.')),
        h('h3', { class: 'settings-section' }, 'Acessibilidade'),
        selectField('colorVision', 'Daltonismo', (Object.keys(COLOR_VISION_LABEL) as ColorVision[]).map((k): [string, string] => [k, COLOR_VISION_LABEL[k]]), 'Corrige as cores da imagem e troca as cores de raridade e dos colegas.'),
        check('soundCues', 'Mostrar de onde vêm os sons', 'Arcos em volta da mira: tiros (vermelho), passos (branco), explosões (laranja), baús (amarelo), construções (azul).'),
        check('reduceMotion', 'Reduzir movimento', 'Sem tremor de câmera nas explosões.'),
        range('uiScale', 'Tamanho da interface', 0.8, 1.4, 0.05, (v) => `${Math.round(v * 100)}%`),
        selectField('crosshairColor', 'Cor da mira', [['#ffffff', 'Branca'], ['#ffe14d', 'Amarela'], ['#3ef0ff', 'Ciano'], ['#ff4dff', 'Magenta'], ['#5cff6a', 'Verde']]),
        range('crosshairSize', 'Tamanho da mira', 0.6, 1.8, 0.1, (v) => `${Math.round(v * 100)}%`),
        h('div', { class: 'row', style: 'margin-top:18px' },
          h('button', { class: 'btn primary small', 'data-action': 'close-settings', onclick: onClose }, h('span', { class: 'label' }, 'Concluir'))))))
  }

  /** Controles: teclas de cada ação (clique e aperte a nova tecla) e a referência do controle. */
  controls(s: Settings, onChange: (s: Settings) => void, onClose: () => void): void {
    let keys = s.keys
    let listening: { action: Action; btn: HTMLButtonElement } | null = null
    const label = (a: Action) => keys[a].map(keyLabel).join(' / ')
    const buttons = new Map<Action, HTMLButtonElement>()
    const refresh = () => {
      for (const [a, b] of buttons) b.textContent = label(a)
    }
    const capture = (e: KeyboardEvent) => {
      if (!listening) return
      e.preventDefault()
      e.stopPropagation()
      const { action, btn } = listening
      listening = null
      btn.classList.remove('listening')
      if (e.code !== 'Escape' && !RESERVED_KEYS.has(e.code)) {
        keys = rebind(keys, action, e.code)
        onChange({ ...s, keys })
      }
      refresh()
    }
    window.addEventListener('keydown', capture, true)
    const close = () => {
      window.removeEventListener('keydown', capture, true)
      onClose()
    }
    const keyRows = ACTIONS.map((a) => {
      const b = h('button', { class: 'key', 'data-key': a, title: 'Clique e aperte a nova tecla (Esc cancela)' }, label(a)) as HTMLButtonElement
      b.addEventListener('click', () => {
        if (listening) listening.btn.classList.remove('listening')
        listening = { action: a, btn: b }
        b.classList.add('listening')
        b.textContent = 'aperte…'
      })
      buttons.set(a, b)
      return h('tr', {}, h('td', {}, ACTION_LABEL[a]), h('td', {}, b))
    })
    const row = (action: string, ...k: string[]) => h('tr', {}, h('td', {}, action), h('td', { html: k.map((x) => `<kbd>${x}</kbd>`).join(' ') }))
    this.showModal(h('div', { class: 'screen overlay', 'data-screen': 'controls', onclick: (e: Event) => { if (e.target === e.currentTarget) close() } },
      h('div', { class: 'panel', style: 'width:min(640px,100%)' },
        h('h2', {}, 'Controles'),
        h('p', { class: 'hint' }, `Clique numa tecla para trocar (se ela já era de outra ação, as duas trocam). Pulo de ~${(MOVE.jumpSpeed ** 2 / (2 * MOVE.gravity)).toFixed(2).replace('.', ',')} m; rampas de até ${Math.round(MOVE.maxWalkableSlope * 180 / Math.PI)}°.`),
        h('table', { class: 'keymap', 'data-panel': 'keymap' }, ...keyRows),
        h('table', { class: 'keys', style: 'margin-top:12px' },
          row('Olhar / mirar / atirar', 'Mouse', 'Botão direito', 'Botão esquerdo'),
          row('Picareta / espaços', '1', '2–6', 'Roda'),
          row('Inventário / mapa / pausa', 'Tab', 'M', 'Esc'),
          row('Painel técnico / ajuda', 'F3', 'H'),
          row('Controle: mover / olhar', 'Analógico esq.', 'Analógico dir.'),
          row('Controle: pular / agachar / correr / mirar', 'A', 'B', 'L3', 'LT'),
          row('Controle: atirar / pegar / recarregar / espaços', 'RT', 'X', 'Y', 'LB/RB'),
          row('Controle: construir / girar / material', 'D↑', 'D←', 'D→')),
        h('div', { class: 'row', style: 'margin-top:18px' },
          h('button', { class: 'btn small', 'data-action': 'reset-keys', onclick: () => { keys = DEFAULT_KEYS; onChange({ ...s, keys }); refresh() } }, h('span', { class: 'label' }, 'Teclas padrão')),
          h('button', { class: 'btn primary small', 'data-action': 'close-controls', onclick: close }, h('span', { class: 'label' }, 'Fechar'))))))
  }

}
