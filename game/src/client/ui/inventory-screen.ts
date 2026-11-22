import { AMMO_INFO, MATERIAL_INFO, NO_ITEM, RARITIES, itemDef } from '../../shared/config/items'
import type { PlayerState } from '../../shared/player/player'
import { h } from './dom'
import { itemIconSvg } from './icons'

/**
 * Inventário (Tab): espaços com detalhes, soltar e reorganizar, munições e
 * materiais. As ações viram mensagens ao servidor — nada muda localmente sem
 * a confirmação dele (o próximo snapshot traz o resultado).
 */
export class InventoryScreen {
  readonly el: HTMLElement
  private readonly slotsEl: HTMLElement
  private readonly ammoEl: HTMLElement
  private readonly matsEl: HTMLElement
  private lastKey = ''

  constructor(
    layer: HTMLElement,
    private readonly actions: { drop(slot: number): void; swap(a: number, b: number): void; close(): void },
  ) {
    this.slotsEl = h('div', { class: 'inv-slots' })
    this.ammoEl = h('ul', { class: 'inv-list' })
    this.matsEl = h('ul', { class: 'inv-list' })
    this.el = h('div', { class: 'screen overlay', 'data-screen': 'inventory', onclick: (e: Event) => { if (e.target === e.currentTarget) actions.close() } },
      h('div', { class: 'panel inventory' },
        h('h2', {}, 'Inventário'),
        h('p', { class: 'hint' }, 'Tab ou Esc para voltar. A partida continua enquanto você organiza.'),
        this.slotsEl,
        h('div', { class: 'inv-cols' },
          h('div', {}, h('h3', {}, 'Munição'), this.ammoEl),
          h('div', {}, h('h3', {}, 'Materiais'), this.matsEl))))
    this.el.hidden = true
    layer.append(this.el)
  }

  get visible(): boolean {
    return !this.el.hidden
  }

  show(p: PlayerState): void {
    this.el.hidden = false
    this.lastKey = ''
    this.update(p)
  }

  hide(): void {
    this.el.hidden = true
  }

  update(p: PlayerState): void {
    if (this.el.hidden) return
    const key = JSON.stringify([p.slots, p.ammo, p.materials, p.selected])
    if (key === this.lastKey) return
    this.lastKey = key
    this.slotsEl.replaceChildren(...p.slots.map((s, k) => {
      const def = itemDef(s.item)
      if (s.item === NO_ITEM || !def) return h('div', { class: 'inv-slot empty' }, h('i', {}, String(k + 1)), h('span', {}, 'Vazio'))
      const rarity = def.kind === 'consumable' ? def.rarity : s.rarity
      const color = `#${(RARITIES[rarity]?.color ?? 0x888888).toString(16).padStart(6, '0')}`
      const detail = def.kind === 'weapon' ? `${s.ammo}/${def.magSize} · ${AMMO_INFO[def.ammoType].short}` : `×${s.count}`
      const card = h('div', { class: `inv-slot${k === p.selected ? ' selected' : ''}`, style: `--rarity:${color}`, 'data-slot': k },
        h('i', {}, String(k + 1)),
        h('div', { class: 'inv-icon', html: itemIconSvg(s.item) }),
        h('b', {}, def.name),
        h('small', {}, `${RARITIES[rarity]?.name ?? ''} · ${detail}`),
        h('div', { class: 'inv-actions' },
          h('button', { class: 'btn small', title: 'Mover para a esquerda', disabled: k === 0, onclick: () => this.actions.swap(k, k - 1) }, '◀'),
          h('button', { class: 'btn small', 'data-action': 'drop', onclick: () => this.actions.drop(k) }, 'Soltar'),
          h('button', { class: 'btn small', title: 'Mover para a direita', disabled: k === p.slots.length - 1, onclick: () => this.actions.swap(k, k + 1) }, '▶')))
      return card
    }))
    this.ammoEl.replaceChildren(...AMMO_INFO.map((a, k) => h('li', {}, h('span', {}, a.name), h('b', {}, String(p.ammo[k])))))
    this.matsEl.replaceChildren(...MATERIAL_INFO.map((m, k) => h('li', {}, h('span', {}, m.name), h('b', {}, String(p.materials[k])))))
  }
}
