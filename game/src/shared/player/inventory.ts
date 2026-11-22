import { MATERIAL_MAX, NO_ITEM, itemDef } from '../config/items'
import { SLOT_COUNT, ammoCap, emptySlot, type PlayerState, type Slot } from './player'

/**
 * Regras de inventário (aplicadas só pelo servidor; o cliente usa as mesmas
 * funções para mostrar o que aconteceria, como o aviso "Pegar").
 */

/** Um item no chão do mundo. */
export interface WorldItem {
  id: number
  item: number
  rarity: number
  count: number
  ammo: number
  x: number
  y: number
  z: number
}

export interface PickupResult {
  /** Quantidade efetivamente pega. */
  taken: number
  /** Item que saiu do inventário para dar lugar ao novo (deve ir ao chão). */
  swapped: Slot | null
}

/**
 * Tenta pegar um item. Armas/consumíveis vão para o espaço selecionado (se
 * vazio), depois para o primeiro vazio; com o inventário cheio, trocam com o
 * espaço selecionado. Munição e materiais vão para a reserva até o limite.
 */
export function pickupItem(p: PlayerState, it: WorldItem): PickupResult {
  const def = itemDef(it.item)
  const none: PickupResult = { taken: 0, swapped: null }
  if (!def || it.count <= 0) return none
  if (def.kind === 'ammo') {
    const room = ammoCap(def.ammoType) - p.ammo[def.ammoType]
    const taken = Math.max(0, Math.min(room, it.count))
    p.ammo[def.ammoType] += taken
    return { taken, swapped: null }
  }
  if (def.kind === 'material') {
    const room = MATERIAL_MAX - p.materials[def.material]
    const taken = Math.max(0, Math.min(room, it.count))
    p.materials[def.material] += taken
    return { taken, swapped: null }
  }
  if (def.kind === 'consumable') {
    let left = it.count
    for (const s of p.slots) {
      if (left <= 0) break
      if (s.item === it.item && s.count < def.maxStack) {
        const add = Math.min(def.maxStack - s.count, left)
        s.count += add
        left -= add
      }
    }
    if (left > 0) {
      const target = firstFree(p)
      if (target >= 0) {
        const add = Math.min(def.maxStack, left)
        Object.assign(p.slots[target], { item: it.item, rarity: it.rarity, count: add, ammo: 0 })
        left -= add
      }
    }
    if (left < it.count) return { taken: it.count - left, swapped: null }
    // Cheio: troca com o espaço selecionado
    return swapIntoSelected(p, { item: it.item, rarity: it.rarity, count: Math.min(def.maxStack, it.count), ammo: 0 })
  }
  // Arma
  const target = firstFree(p)
  const slot: Slot = { item: it.item, rarity: it.rarity, count: 1, ammo: it.ammo }
  if (target >= 0) {
    Object.assign(p.slots[target], slot)
    if (target === p.selected) p.equipTimer = def.equipTime
    return { taken: 1, swapped: null }
  }
  return swapIntoSelected(p, slot)
}

function firstFree(p: PlayerState): number {
  if (p.slots[p.selected].item === NO_ITEM) return p.selected
  for (let k = 0; k < SLOT_COUNT; k++) if (p.slots[k].item === NO_ITEM) return k
  return -1
}

function swapIntoSelected(p: PlayerState, incoming: Slot): PickupResult {
  const out = { ...p.slots[p.selected] }
  Object.assign(p.slots[p.selected], incoming)
  p.reloadTimer = 0
  p.useTimer = 0
  const def = itemDef(incoming.item)
  p.equipTimer = def?.kind === 'weapon' ? def.equipTime : 0.25
  return { taken: incoming.count, swapped: out.item === NO_ITEM ? null : out }
}

/** Remove o conteúdo de um espaço (para soltar no chão). */
export function takeSlot(p: PlayerState, index: number): Slot | null {
  if (index < 0 || index >= SLOT_COUNT) return null
  const s = p.slots[index]
  if (s.item === NO_ITEM) return null
  const out = { ...s }
  Object.assign(s, emptySlot())
  if (index === p.selected) {
    p.reloadTimer = 0
    p.useTimer = 0
  }
  return out
}

export function swapSlots(p: PlayerState, a: number, b: number): boolean {
  if (a === b || a < 0 || b < 0 || a >= SLOT_COUNT || b >= SLOT_COUNT) return false
  const tmp = { ...p.slots[a] }
  Object.assign(p.slots[a], p.slots[b])
  Object.assign(p.slots[b], tmp)
  if (a === p.selected || b === p.selected) {
    p.reloadTimer = 0
    p.useTimer = 0
  }
  return true
}
