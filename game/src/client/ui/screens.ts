import { GAME } from '../../shared/config/game'
import { MOVE } from '../../shared/config/movement'
import { PROTOCOL_VERSION } from '../../shared/net/protocol'
import { QUALITY, type OfflinePrefs, type Quality, type Settings } from '../settings'
import { BOT_DIFFICULTIES, BOT_PROFILES } from '../../server/core/bots/profiles'
import { historyTotals, type MatchRecord } from '../history'
import { EMBLEM_SVG, h } from './dom'

/**
 * Telas da interface (menu, entrar em servidor, carregamento, pausa,
 * configurações, controles). Cada tela é montada em uma camada própria e
 * removida ao trocar.
 */

export interface MainMenuActions {
  playOffline(): void
  join(): void
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
    const joinBtn = h('button', { class: 'btn', 'data-action': 'join', onclick: () => a.join() },
      h('span', { class: 'label' }, 'Entrar em servidor'),
      h('span', { class: 'sub' }, 'Rede local (LAN) ou servidor dedicado online'))
    if (webglError) {
      playBtn.disabled = true
      joinBtn.disabled = true
    }
    this.show(h('div', { class: 'screen', 'data-screen': 'menu' },
      h('div', { class: 'menu' },
        h('div', { class: 'brand' },
          emblem,
          h('h1', { class: 'title' }, GAME.title),
          h('p', { class: 'tagline' }, GAME.tagline),
          h('span', { class: 'badge' }, h('span', { class: 'dot' }), `${GAME.phase} · bots, zona e partida completa`),
          webglError ? h('p', { class: 'status error' }, webglError) : null),
        h('div', { class: 'actions' },
          playBtn,
          joinBtn,
          h('div', { class: 'row' },
            h('button', { class: 'btn small', 'data-action': 'settings', onclick: () => a.settings() }, h('span', { class: 'label' }, 'Configurações')),
            h('button', { class: 'btn small', 'data-action': 'controls', onclick: () => a.controls() }, h('span', { class: 'label' }, 'Controles')),
            h('button', { class: 'btn small', 'data-action': 'history', onclick: () => a.history() }, h('span', { class: 'label' }, 'Histórico'))))),
      h('div', { class: 'footer' },
        h('span', {}, `v${GAME.version} · protocolo ${PROTOCOL_VERSION}`),
        h('span', {}, 'Próximas fases: lobby LAN e equipes, contas e matchmaking online'))))
    playBtn.focus()
  }

  join(defaults: { name: string; address: string }, onConnect: (name: string, address: string) => void, onBack: () => void): { setStatus(text: string, error?: boolean): void; setBusy(busy: boolean): void } {
    const name = h('input', { class: 'text-input', name: 'nome', maxlength: 16, value: defaults.name, placeholder: 'Jogador', autocomplete: 'nickname' })
    const address = h('input', { class: 'text-input', name: 'endereco', value: defaults.address, placeholder: 'ex.: 192.168.0.10:7350 (vazio = este servidor)', autocomplete: 'off', spellcheck: 'false' })
    const status = h('div', { class: 'status', 'aria-live': 'polite' })
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
        h('h2', {}, 'Entrar em servidor'),
        h('p', { class: 'hint' }, `Na rede local, o anfitrião roda "npm run host" e informa o endereço exibido no terminal (porta ${GAME.defaultPort}). Para servidores online, use o endereço wss:// do servidor dedicado.`),
        form)))
    ;(defaults.name ? address : name).focus()
    return {
      setStatus(text, error = false) {
        status.textContent = text
        status.className = error ? 'status error' : 'status'
      },
      setBusy(busy) {
        connect.disabled = busy
      },
    }
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
    const refresh = () => {
      modeBtns.forEach((b) => b.classList.toggle('on', b.dataset.mode === p.mode))
      botsLabel.textContent = String(p.bots)
      zoneField.hidden = p.mode !== 'br'
      hint.textContent = p.mode === 'br'
        ? `Battle royale: você e ${p.bots} ${p.bots === 1 ? 'bot' : 'bots'} saltam do dirigível; a zona fecha e vence o último de pé. Sem renascimento.`
        : `Treino livre${p.bots > 0 ? ` com ${p.bots} ${p.bots === 1 ? 'bot' : 'bots'}` : ''}: sem zona, quem é eliminado renasce em 5 s.`
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
          zoneField),
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
    const range = (key: 'sensitivity' | 'aimSensitivity' | 'fov' | 'volume', label: string, min: number, max: number, step: number, fmt: (v: number) => string, hint?: string) => {
      const out = h('output', {}, fmt(next[key]))
      const input = h('input', { type: 'range', min, max, step, value: next[key], 'aria-label': label })
      input.addEventListener('input', () => {
        next[key] = Number(input.value)
        out.textContent = fmt(next[key])
        commit()
      })
      return h('div', { class: 'field' }, h('label', {}, label), out, input, hint ? h('small', {}, hint) : null)
    }
    const check = (key: 'invertY' | 'crouchToggle' | 'showFps', label: string, hint?: string) => {
      const input = h('input', { type: 'checkbox', 'aria-label': label })
      input.checked = next[key]
      input.addEventListener('change', () => {
        next[key] = input.checked
        commit()
      })
      return h('div', { class: 'field' }, h('label', {}, label), input, hint ? h('small', {}, hint) : null)
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
          h('small', {}, 'Resolução muda na hora; sombras na próxima partida; antisserrilhamento ao recarregar a página.')),
        h('div', { class: 'row', style: 'margin-top:18px' },
          h('button', { class: 'btn primary small', 'data-action': 'close-settings', onclick: onClose }, h('span', { class: 'label' }, 'Concluir'))))))
  }

  controls(onClose: () => void): void {
    const row = (action: string, ...keys: string[]) => h('tr', {}, h('td', {}, action), h('td', { html: keys.map((k) => `<kbd>${k}</kbd>`).join(' ') }))
    this.showModal(h('div', { class: 'screen overlay', 'data-screen': 'controls', onclick: (e: Event) => { if (e.target === e.currentTarget) onClose() } },
      h('div', { class: 'panel' },
        h('h2', {}, 'Controles'),
        h('p', { class: 'hint' }, `Teclado e mouse ou controle (padrão Xbox/PlayStation). Pulo de ~${(MOVE.jumpSpeed ** 2 / (2 * MOVE.gravity)).toFixed(2).replace('.', ',')} m; rampas de até ${Math.round(MOVE.maxWalkableSlope * 180 / Math.PI)}°.`),
        h('table', { class: 'keys' },
          row('Mover', 'W', 'A', 'S', 'D'),
          row('Olhar / mirar', 'Mouse', 'Botão direito'),
          row('Atirar / usar item / golpear / construir', 'Botão esquerdo'),
          row('Recarregar', 'R'),
          row('Pegar item / abrir baú', 'E'),
          row('Picareta', '1'),
          row('Escolher espaço', '2', '3', '4', '5', '6', 'Roda'),
          row('Construir parede / piso / rampa / telhado', 'Q', 'Z', 'V', 'T'),
          row('Girar peça / trocar material', 'R', 'G'),
          row('Inventário', 'Tab'),
          row('Mapa', 'M'),
          row('Correr (sprint)', 'Shift'),
          row('Caminhar devagar', 'Alt', 'X'),
          row('Pular', 'Espaço'),
          row('Agachar / deslizar (correndo)', 'C'),
          row('Pausa / liberar mouse', 'Esc'),
          row('Painel técnico', 'F3'),
          row('Mostrar/ocultar ajuda', 'H'),
          row('Controle: mover / olhar', 'Analógico esq.', 'Analógico dir.'),
          row('Controle: pular / agachar / correr / mirar', 'A', 'B', 'L3', 'LT'),
          row('Controle: atirar / pegar / recarregar / espaços', 'RT', 'X', 'Y', 'LB/RB'),
          row('Controle: construir / girar / material', 'D↑', 'D←', 'D→')),
        h('div', { class: 'row', style: 'margin-top:18px' },
          h('button', { class: 'btn primary small', onclick: onClose }, h('span', { class: 'label' }, 'Fechar'))))))
  }
}
