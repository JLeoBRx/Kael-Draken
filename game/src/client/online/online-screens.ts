import { SKINS } from '../character/character-model'
import { MAPS } from '../../shared/maps'
import type { HistoryEntry, LeaderRow, MatchReward, Presence } from '../../shared/platform/messages'
import { ROOM_CODE_LENGTH } from '../../shared/platform/messages'
import { SKIN_UNLOCK_LEVEL, TITLES, levelFromXp, skinUnlocked, titleById } from '../../shared/progression'
import type { OnlinePrefs } from '../settings'
import { EMBLEM_SVG, h } from '../ui/dom'
import type { OnlineState } from './platform-client'

/**
 * Telas online: entrada (só o nome) e a "casa" da plataforma — jogar
 * (fila pública por modo e região), sala privada com código, grupo, amigos
 * com presença, desafios do dia, perfil com estatísticas, visual e título.
 *
 * A casa é montada uma vez; `update` só redesenha as partes que mudam, para
 * não apagar o que a pessoa está digitando.
 */

export const PRESENCE_LABEL: Record<Presence, string> = {
  offline: 'Offline', online: 'No menu', searching: 'Procurando partida', match: 'Em partida', room: 'Em sala privada',
}

const MODE_LABEL = ['', 'Solo', 'Dupla', 'Trio', 'Esquadrão']

export interface LoginActions {
  login(name: string, address: string): void
  back(): void
}

export interface HomeActions {
  queue(prefs: OnlinePrefs): void
  cancelQueue(): void
  createRoom(): void
  joinRoom(code: string): void
  rejoin(): void
  addFriend(name: string): void
  acceptFriend(id: number): void
  declineFriend(id: number): void
  removeFriend(id: number): void
  invite(id: number): void
  leaveParty(): void
  kick(id: number): void
  acceptInvite(partyId: string): void
  declineInvite(partyId: string): void
  setSkin(skin: number): void
  setTitle(id: string): void
  history(): void
  leaderboard(): void
  logout(): void
  back(): void
  prefsChanged(prefs: OnlinePrefs): void
}

function cssColor(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

function fmtHours(seconds: number): string {
  const h = seconds / 3600
  return h >= 1 ? `${h.toFixed(1).replace('.', ',')} h` : `${Math.round(seconds / 60)} min`
}

export function loginScreen(defaults: { name: string; address: string }, a: LoginActions): { el: HTMLElement; setStatus(text: string, error?: boolean): void; setBusy(b: boolean): void } {
  const name = h('input', { class: 'text-input', name: 'nome-online', maxlength: 16, value: defaults.name, placeholder: 'Seu nome no jogo', autocomplete: 'nickname', 'data-field': 'online-name' })
  const address = h('input', { class: 'text-input', name: 'plataforma', value: defaults.address, placeholder: 'vazio = este endereço · ex.: meu-servidor.com:7370', autocomplete: 'off', spellcheck: 'false', 'data-field': 'platform-address' })
  const status = h('div', { class: 'status', 'aria-live': 'polite', 'data-hud': 'online-status' })
  const enter = h('button', { class: 'btn primary small', type: 'submit', 'data-action': 'online-login' }, h('span', { class: 'label' }, 'Entrar'))
  const advanced = h('details', { class: 'advanced' }, h('summary', {}, 'Outro endereço de plataforma'), h('label', {}, 'Endereço da plataforma', address))
  if (defaults.address) advanced.open = true
  const el = h('div', { class: 'screen stage', 'data-screen': 'online-login' },
    h('div', { class: 'panel', style: 'width:min(520px,100%)' },
      h('h2', {}, 'Jogar online'),
      h('p', { class: 'hint' }, 'Sem senha: o seu nome é a sua conta. Entre com o mesmo nome em qualquer computador para continuar com o seu nível, amigos e estatísticas.'),
      h('form', { class: 'stack', onsubmit: (e: Event) => { e.preventDefault(); a.login(name.value, address.value) } },
        h('label', {}, 'Seu nome', name),
        advanced,
        status,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', 'data-action': 'back', onclick: () => a.back() }, h('span', { class: 'label' }, 'Voltar')),
          enter))))
  queueMicrotask(() => name.focus())
  return {
    el,
    setStatus(text, error = false) {
      status.textContent = text
      status.classList.toggle('error', error)
    },
    setBusy(b) {
      enter.disabled = b
      name.disabled = b
    },
  }
}

export class OnlineHome {
  readonly el: HTMLElement
  private readonly header = h('div', { class: 'online-header' })
  private readonly play = h('div', { class: 'online-card', 'data-panel': 'play' })
  private readonly invites = h('div', { class: 'online-invites', 'data-panel': 'invites' })
  private readonly party = h('div', { class: 'online-card', 'data-panel': 'party' })
  private readonly friends = h('div', { class: 'friend-list', 'data-panel': 'friends' })
  private readonly challenges = h('div', { class: 'online-card', 'data-panel': 'challenges' })
  private readonly profile = h('div', { class: 'online-card', 'data-panel': 'profile' })
  private readonly lastReward = h('div', { class: 'online-reward', 'data-panel': 'reward' })
  private readonly searchLine = h('div', { class: 'search-line', 'data-hud': 'search' })
  private readonly playBtn: HTMLButtonElement
  private readonly modeSel: HTMLSelectElement
  private readonly regionSel: HTMLSelectElement
  private readonly fillBox: HTMLInputElement
  private readonly pendingInvites = new Map<string, { kind: 'party' | 'room'; id: string; from: string }>()
  private st: OnlineState

  constructor(st: OnlineState, private prefs: OnlinePrefs, private readonly a: HomeActions) {
    this.st = st
    this.modeSel = h('select', { 'data-field': 'mode' }, ...[1, 2, 3, 4].map((n) => h('option', { value: String(n) }, MODE_LABEL[n]))) as HTMLSelectElement
    this.modeSel.value = String(prefs.teamSize)
    this.regionSel = h('select', { 'data-field': 'region' }, ...st.regions.map((r) => h('option', { value: r.id }, r.name))) as HTMLSelectElement
    this.regionSel.value = st.regions.some((r) => r.id === prefs.region) ? prefs.region : st.regions[0]?.id ?? 'sa'
    this.fillBox = h('input', { type: 'checkbox', 'data-field': 'fill' }) as HTMLInputElement
    this.fillBox.checked = prefs.fill
    const changed = () => {
      this.prefs = { ...this.prefs, teamSize: Number(this.modeSel.value), region: this.regionSel.value, fill: this.fillBox.checked }
      this.a.prefsChanged(this.prefs)
      this.renderPlay()
    }
    for (const el of [this.modeSel, this.regionSel, this.fillBox]) el.addEventListener('change', changed)
    this.playBtn = h('button', { class: 'btn primary', 'data-action': 'queue', onclick: () => this.onPlay() }, h('span', { class: 'label' }, 'Procurar partida'), h('span', { class: 'sub' }, '')) as HTMLButtonElement

    const code = h('input', { class: 'text-input code-input', maxlength: ROOM_CODE_LENGTH + 2, placeholder: 'CÓDIGO', autocomplete: 'off', spellcheck: 'false', 'data-field': 'room-code' }) as HTMLInputElement
    const friendName = h('input', { class: 'text-input', maxlength: 16, placeholder: 'Nome do amigo', autocomplete: 'off', 'data-field': 'friend-name' }) as HTMLInputElement
    const room = h('div', { class: 'online-card', 'data-panel': 'room' },
      h('h3', {}, 'Sala privada'),
      h('p', { class: 'muted small' }, 'Crie uma sala e passe o código; você configura mapa, modo, equipes e bots e inicia quando quiser.'),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', 'data-action': 'room-create', onclick: () => this.a.createRoom() }, h('span', { class: 'label' }, 'Criar sala'))),
      h('form', { class: 'row code-row', onsubmit: (e: Event) => { e.preventDefault(); if (code.value.trim()) this.a.joinRoom(code.value) } },
        code,
        h('button', { class: 'btn small', type: 'submit', 'data-action': 'room-join' }, h('span', { class: 'label' }, 'Entrar'))))
    const friendsCard = h('div', { class: 'online-card', 'data-panel': 'friends-card' },
      h('h3', {}, 'Amigos'),
      h('form', { class: 'row code-row', onsubmit: (e: Event) => { e.preventDefault(); if (friendName.value.trim()) { this.a.addFriend(friendName.value); friendName.value = '' } } },
        friendName,
        h('button', { class: 'btn small', type: 'submit', 'data-action': 'friend-add' }, h('span', { class: 'label' }, 'Adicionar'))),
      this.friends)

    this.el = h('div', { class: 'screen online', 'data-screen': 'online-home' },
      h('div', { class: 'online-wrap' },
        this.header,
        this.invites,
        this.lastReward,
        h('div', { class: 'online-grid' },
          h('div', { class: 'online-col' }, this.play, room, this.party),
          h('div', { class: 'online-col' }, friendsCard),
          h('div', { class: 'online-col' }, this.challenges, this.profile))))
    this.lastReward.hidden = true
    this.update(st)
  }

  private onPlay(): void {
    if (this.st.queue?.searching) this.a.cancelQueue()
    else this.a.queue(this.prefs)
  }

  update(st: OnlineState): void {
    this.st = st
    this.renderHeader()
    this.renderPlay()
    this.renderParty()
    this.renderFriends()
    this.renderChallenges()
    this.renderProfile()
    this.renderInvites()
  }

  /** Atualiza só a linha de busca (a cada segundo, sem redesenhar tudo). */
  tickSearch(): void {
    const q = this.st.queue
    if (!q?.searching) return
    this.searchLine.textContent = `Procurando ${MODE_LABEL[q.teamSize].toLowerCase()} · ${fmtTime(q.waitedMs / 1000)} · ${q.inQueue} na fila`
  }

  addInvite(kind: 'party' | 'room', id: string, from: string): void {
    this.pendingInvites.set(`${kind}:${id}`, { kind, id, from })
    this.renderInvites()
  }

  showReward(r: MatchReward): void {
    const lvl = r.levelAfter > r.levelBefore ? ` · subiu para o nível ${r.levelAfter}!` : ''
    this.lastReward.hidden = false
    this.lastReward.replaceChildren(
      h('b', {}, r.victory ? 'Vitória! ' : `#${r.place} de ${r.teams} · `),
      `+${r.xp.total + r.challengeXp} XP${lvl}`,
      r.completed.length ? h('span', { class: 'muted' }, ` · desafio concluído: ${r.completed.join(', ')}`) : '',
      r.mmrDelta ? h('span', { class: 'muted' }, ` · habilidade ${r.mmrDelta > 0 ? '+' : ''}${r.mmrDelta}`) : '')
  }

  private renderHeader(): void {
    const me = this.st.me
    const lv = levelFromXp(me.xp)
    const pct = lv.needed ? Math.round((lv.into / lv.needed) * 100) : 100
    const title = titleById(me.title)?.name ?? 'Recruta'
    const skin = SKINS[me.skin % SKINS.length]
    this.header.replaceChildren(
      h('div', { class: 'online-id' },
        h('div', { class: 'avatar', style: `background:linear-gradient(135deg, ${cssColor(skin.armor)}, ${cssColor(skin.suit)});border-color:${cssColor(skin.accent)}`, html: EMBLEM_SVG }),
        h('div', {},
          h('div', { class: 'online-name', 'data-hud': 'online-name' }, me.name, h('span', { class: 'tag' }, title)),
          h('div', { class: 'level-line' },
            h('span', { class: 'level', 'data-hud': 'online-level' }, `Nível ${lv.level}`),
            h('div', { class: 'xpbar', title: `${lv.into}/${lv.needed} XP` }, h('div', { style: `width:${pct}%` })),
            h('span', { class: 'muted small' }, lv.needed ? `${lv.into}/${lv.needed} XP` : 'nível máximo')))),
      h('div', { class: 'online-meta' },
        h('span', { class: 'muted small', 'data-hud': 'online-count' }, h('span', { class: 'dot ok' }), ` ${this.st.online} online`),
        h('button', { class: 'btn small ghost', 'data-action': 'leaderboard', onclick: () => this.a.leaderboard() }, h('span', { class: 'label' }, 'Classificação')),
        h('button', { class: 'btn small ghost', 'data-action': 'history', onclick: () => this.a.history() }, h('span', { class: 'label' }, 'Partidas')),
        h('button', { class: 'btn small ghost', 'data-action': 'logout', onclick: () => this.a.logout() }, h('span', { class: 'label' }, 'Trocar de conta')),
        h('button', { class: 'btn small ghost', 'data-action': 'back', onclick: () => this.a.back() }, h('span', { class: 'label' }, 'Menu'))))
  }

  private renderPlay(): void {
    const st = this.st
    const party = st.party
    const leader = !party || party.leader === st.me.id
    const size = party?.members.length ?? 1
    const searching = !!st.queue?.searching
    const label = this.playBtn.querySelector('.label')!
    const sub = this.playBtn.querySelector('.sub')!
    label.textContent = searching ? 'Cancelar busca' : 'Procurar partida'
    this.playBtn.classList.toggle('primary', !searching)
    this.playBtn.dataset.state = searching ? 'searching' : 'idle'
    const tooBig = size > this.prefs.teamSize
    this.playBtn.disabled = !searching && (!leader || tooBig)
    sub.textContent = searching ? 'Você está na fila' : !leader ? 'O líder do grupo inicia a busca' : tooBig ? `Seu grupo tem ${size}: escolha equipes de ${size} ou mais` : `Battle royale · ${MODE_LABEL[this.prefs.teamSize]} · completa com bots`
    for (const el of [this.modeSel, this.regionSel, this.fillBox]) el.disabled = searching || !leader
    this.searchLine.hidden = !searching
    this.tickSearch()
    const rejoin = st.match
      ? h('button', { class: 'btn small', 'data-action': 'rejoin', onclick: () => this.a.rejoin() }, h('span', { class: 'label' }, st.match.kind === 'privado' ? `Voltar à sala ${st.match.code ?? ''}` : 'Voltar à partida em andamento'))
      : null
    this.play.replaceChildren(
      h('h3', {}, 'Jogar'),
      h('div', { class: 'play-opts' },
        h('label', { class: 'field-inline' }, 'Modo', this.modeSel),
        h('label', { class: 'field-inline' }, 'Região', this.regionSel),
        h('label', { class: 'check small' }, this.fillBox, ' Completar equipe com outras pessoas')),
      this.playBtn,
      this.searchLine,
      rejoin ?? '')
  }

  private renderParty(): void {
    const st = this.st
    const p = st.party
    if (!p) {
      this.party.replaceChildren(h('h3', {}, 'Grupo'), h('p', { class: 'muted small' }, 'Convide amigos online pela lista de amigos para jogar em dupla, trio ou esquadrão.'))
      return
    }
    const leader = p.leader === st.me.id
    this.party.replaceChildren(
      h('h3', {}, `Grupo (${p.members.length}/4)`),
      h('div', { class: 'party-list' }, ...p.members.map((m) => h('div', { class: 'party-member', 'data-member': m.name },
        h('span', { class: `dot ${m.presence}` }),
        h('b', {}, m.name),
        m.id === p.leader ? h('span', { class: 'tag' }, 'líder') : h('span'),
        h('span', { class: 'muted small' }, `nv. ${m.level}`),
        leader && m.id !== st.me.id ? h('button', { class: 'link', 'data-action': 'kick', onclick: () => this.a.kick(m.id) }, 'tirar') : h('span')))),
      p.invited.length ? h('p', { class: 'muted small' }, `Convite enviado para ${p.invited.length === 1 ? '1 pessoa' : `${p.invited.length} pessoas`}`) : '',
      h('div', { class: 'row' }, h('button', { class: 'btn small', 'data-action': 'party-leave', onclick: () => this.a.leaveParty() }, h('span', { class: 'label' }, 'Sair do grupo'))))
  }

  private renderFriends(): void {
    const st = this.st
    const inParty = new Set(st.party?.members.map((m) => m.id) ?? [])
    const canInvite = !st.party || st.party.leader === st.me.id
    const incoming = st.requests.filter((r) => r.incoming)
    const outgoing = st.requests.filter((r) => !r.incoming)
    const rows: HTMLElement[] = []
    for (const r of incoming) {
      rows.push(h('div', { class: 'friend request', 'data-request': r.name },
        h('span', { class: 'dot online' }), h('b', {}, r.name), h('span', { class: 'muted small' }, 'quer ser seu amigo'),
        h('button', { class: 'link', 'data-action': 'friend-accept', onclick: () => this.a.acceptFriend(r.id) }, 'aceitar'),
        h('button', { class: 'link muted', 'data-action': 'friend-decline', onclick: () => this.a.declineFriend(r.id) }, 'recusar')))
    }
    for (const f of st.friends) {
      const invitable = canInvite && f.presence === 'online' && !inParty.has(f.id) && (st.party?.members.length ?? 1) < 4
      rows.push(h('div', { class: 'friend', 'data-friend': f.name },
        h('span', { class: `dot ${f.presence}`, title: PRESENCE_LABEL[f.presence] }),
        h('b', {}, f.name),
        h('span', { class: 'muted small' }, `nv. ${f.level} · ${inParty.has(f.id) ? 'no seu grupo' : PRESENCE_LABEL[f.presence]}`),
        invitable ? h('button', { class: 'link', 'data-action': 'invite', onclick: () => this.a.invite(f.id) }, 'convidar') : h('span'),
        h('button', { class: 'link muted', 'data-action': 'friend-remove', title: 'Desfazer amizade', onclick: () => this.a.removeFriend(f.id) }, '×')))
    }
    for (const r of outgoing) {
      rows.push(h('div', { class: 'friend pending', 'data-request': r.name },
        h('span', { class: 'dot offline' }), h('b', {}, r.name), h('span', { class: 'muted small' }, 'pedido enviado'),
        h('span'), h('button', { class: 'link muted', 'data-action': 'friend-cancel', onclick: () => this.a.declineFriend(r.id) }, 'cancelar')))
    }
    if (rows.length === 0) rows.push(h('p', { class: 'muted small' }, 'Adicione amigos pelo nome exato da conta deles.'))
    this.friends.replaceChildren(...rows)
  }

  private renderChallenges(): void {
    this.challenges.replaceChildren(
      h('h3', {}, 'Desafios do dia'),
      ...this.st.challenges.map((c) => h('div', { class: `challenge${c.done ? ' done' : ''}`, 'data-challenge': c.id },
        h('div', { class: 'challenge-top' }, h('span', {}, c.text), h('span', { class: 'muted small' }, c.done ? 'concluído' : `+${c.xp} XP`)),
        h('div', { class: 'xpbar thin' }, h('div', { style: `width:${Math.round((c.progress / c.goal) * 100)}%` })),
        h('span', { class: 'muted small' }, `${c.progress.toLocaleString('pt-BR')}/${c.goal.toLocaleString('pt-BR')}`))))
  }

  private renderProfile(): void {
    const me = this.st.me
    const s = me.stats
    const level = levelFromXp(me.xp).level
    const kd = s.deaths > 0 ? (s.kills / s.deaths).toFixed(2).replace('.', ',') : String(s.kills)
    const stat = (label: string, value: string) => h('div', { class: 'stat' }, h('b', {}, value), h('span', {}, label))
    const skins = SKINS.map((sk, k) => {
      const open = skinUnlocked(k, level)
      return h('button', {
        class: `skin${k === me.skin ? ' on' : ''}${open ? '' : ' locked'}`, 'data-skin': k, title: open ? sk.name : `${sk.name} — nível ${SKIN_UNLOCK_LEVEL[k]}`,
        style: `background:linear-gradient(135deg, ${cssColor(sk.armor)} 0 50%, ${cssColor(sk.suit)} 50%);border-color:${cssColor(sk.accent)}`,
        onclick: () => open && k !== me.skin && this.a.setSkin(k),
      }, open ? '' : String(SKIN_UNLOCK_LEVEL[k]))
    })
    const titleSel = h('select', { 'data-field': 'title' }, ...TITLES.map((t) => {
      const open = t.unlocked(level, s.wins)
      return h('option', { value: t.id, disabled: !open }, open ? t.name : `${t.name} (${t.how})`)
    })) as HTMLSelectElement
    titleSel.value = me.title
    titleSel.addEventListener('change', () => this.a.setTitle(titleSel.value))
    this.profile.replaceChildren(
      h('h3', {}, 'Perfil'),
      h('div', { class: 'stats-grid' },
        stat('partidas', String(s.matches)), stat('vitórias', String(s.wins)), stat('top 10', String(s.top10)),
        stat('eliminações', String(s.kills)), stat('elim./queda', kd), stat('dano', s.damage.toLocaleString('pt-BR')),
        stat('melhor', s.bestPlace ? `#${s.bestPlace}` : '—'), stat('tempo', fmtHours(s.seconds)), stat('habilidade', String(me.mmr))),
      h('div', { class: 'skins', 'data-panel': 'skins' }, ...skins),
      h('label', { class: 'field-inline' }, 'Título', titleSel))
  }

  private renderInvites(): void {
    const rows: HTMLElement[] = []
    for (const [key, inv] of this.pendingInvites) {
      const drop = () => {
        this.pendingInvites.delete(key)
        this.renderInvites()
      }
      if (inv.kind === 'party') {
        rows.push(h('div', { class: 'invite', 'data-invite': inv.from },
          h('span', {}, h('b', {}, inv.from), ' convidou você para o grupo'),
          h('button', { class: 'btn small primary', 'data-action': 'invite-accept', onclick: () => { drop(); this.a.acceptInvite(inv.id) } }, h('span', { class: 'label' }, 'Aceitar')),
          h('button', { class: 'btn small', 'data-action': 'invite-decline', onclick: () => { drop(); this.a.declineInvite(inv.id) } }, h('span', { class: 'label' }, 'Recusar'))))
      } else {
        rows.push(h('div', { class: 'invite', 'data-invite': inv.from },
          h('span', {}, h('b', {}, inv.from), ` criou a sala `, h('b', {}, inv.id)),
          h('button', { class: 'btn small primary', 'data-action': 'room-invite-accept', onclick: () => { drop(); this.a.joinRoom(inv.id) } }, h('span', { class: 'label' }, 'Entrar')),
          h('button', { class: 'btn small', onclick: drop }, h('span', { class: 'label' }, 'Ignorar'))))
      }
    }
    this.invites.replaceChildren(...rows)
    this.invites.hidden = rows.length === 0
  }
}

export function historyModal(list: HistoryEntry[], close: () => void): HTMLElement {
  const rows = list.map((e) => h('tr', {},
    h('td', {}, new Date(e.at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })),
    h('td', {}, `${e.kind === 'privado' ? 'Sala' : 'Pública'} · ${MODE_LABEL[e.teamSize] ?? e.teamSize}`),
    h('td', {}, MAPS[e.mapId]?.name ?? e.mapId),
    h('td', { class: e.victory ? 'ok' : '' }, e.victory ? 'Vitória' : `#${e.place}/${e.teams}`),
    h('td', {}, String(e.kills)),
    h('td', {}, String(e.damage)),
    h('td', {}, fmtTime(e.seconds)),
    h('td', {}, `+${e.xp}`)))
  return h('div', { class: 'screen overlay', 'data-screen': 'online-history' },
    h('div', { class: 'panel', style: 'width:min(820px,100%)' },
      h('h2', {}, 'Suas partidas online'),
      list.length === 0 ? h('p', { class: 'hint' }, 'Nenhuma partida ainda.') : h('div', { class: 'table-wrap' }, h('table', { class: 'history' },
        h('thead', {}, h('tr', {}, ...['Quando', 'Tipo', 'Mapa', 'Resultado', 'Elim.', 'Dano', 'Tempo', 'XP'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...rows))),
      h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn small', 'data-action': 'close', onclick: close }, h('span', { class: 'label' }, 'Fechar')))))
}

export function leaderboardModal(list: LeaderRow[], me: string, close: () => void): HTMLElement {
  return h('div', { class: 'screen overlay', 'data-screen': 'online-leaderboard' },
    h('div', { class: 'panel', style: 'width:min(620px,100%)' },
      h('h2', {}, 'Classificação'),
      h('p', { class: 'hint' }, 'Por vitórias; empate decidido por eliminações.'),
      list.length === 0 ? h('p', { class: 'hint' }, 'Ninguém jogou ainda.') : h('div', { class: 'table-wrap' }, h('table', { class: 'history' },
        h('thead', {}, h('tr', {}, ...['#', 'Nome', 'Nível', 'Vitórias', 'Elim.', 'Partidas'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...list.map((r, k) => h('tr', { class: r.name === me ? 'me' : '' },
          h('td', {}, String(k + 1)), h('td', {}, r.name), h('td', {}, String(r.level)), h('td', {}, String(r.wins)), h('td', {}, String(r.kills)), h('td', {}, String(r.matches))))))),
      h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn small', 'data-action': 'close', onclick: close }, h('span', { class: 'label' }, 'Fechar')))))
}
