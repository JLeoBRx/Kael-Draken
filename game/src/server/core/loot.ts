import { ITEM, WEAPONS, ammoItemFor, itemDef, weaponDef, type RarityId } from '../../shared/config/items'
import type { Rng } from '../../shared/math/rng'

/**
 * Tabelas de loot. `tier` 0 = chão comum, 1 = baú, 2 = áreas de alto risco
 * (base militar, construções especiais).
 */

export interface LootDrop {
  item: number
  rarity: number
  count: number
  ammo: number
}

const RARITY_WEIGHTS: readonly (readonly number[])[] = [
  [45, 30, 17, 6, 2],
  [20, 32, 28, 14, 6],
  [5, 20, 35, 27, 13],
]

const WEAPON_WEIGHTS: Record<number, number> = {
  [ITEM.Pistol]: 18,
  [ITEM.Smg]: 18,
  [ITEM.Rifle]: 24,
  [ITEM.Shotgun]: 20,
  [ITEM.Sniper]: 9,
  [ITEM.Launcher]: 4,
}

const CONSUMABLE_TABLE: readonly { item: number; weight: number; count: number }[] = [
  { item: ITEM.Bandage, weight: 30, count: 5 },
  { item: ITEM.Medkit, weight: 14, count: 1 },
  { item: ITEM.ShieldCell, weight: 28, count: 3 },
  { item: ITEM.ShieldBattery, weight: 12, count: 1 },
  { item: ITEM.Grenade, weight: 16, count: 3 },
]

const AMMO_TABLE: readonly { item: number; weight: number }[] = [
  { item: ITEM.AmmoLight, weight: 30 },
  { item: ITEM.AmmoMedium, weight: 30 },
  { item: ITEM.AmmoShells, weight: 22 },
  { item: ITEM.AmmoHeavy, weight: 12 },
  { item: ITEM.AmmoRockets, weight: 6 },
]

function weighted<T>(rng: Rng, entries: readonly T[], weight: (e: T) => number): T {
  let total = 0
  for (const e of entries) total += weight(e)
  let r = rng.next() * total
  for (const e of entries) {
    r -= weight(e)
    if (r <= 0) return e
  }
  return entries[entries.length - 1]
}

export function rollRarity(rng: Rng, tier: number, allowed: readonly RarityId[]): number {
  const w = RARITY_WEIGHTS[Math.max(0, Math.min(2, tier))]
  return weighted(rng, allowed, (r) => w[r])
}

export function rollWeapon(rng: Rng, tier: number): LootDrop {
  const list = WEAPONS.filter((w) => tier >= 1 || w.id !== ITEM.Launcher)
  const w = weighted(rng, list, (x) => WEAPON_WEIGHTS[x.id] ?? 1)
  return { item: w.id, rarity: rollRarity(rng, tier, w.rarities), count: 1, ammo: w.magSize }
}

export function ammoFor(weaponId: number): LootDrop {
  const w = weaponDef(weaponId)!
  const a = ammoItemFor(w.ammoType)
  return { item: a.id, rarity: 0, count: a.pickup, ammo: 0 }
}

export function rollConsumable(rng: Rng): LootDrop {
  const c = weighted(rng, CONSUMABLE_TABLE, (e) => e.weight)
  const def = itemDef(c.item)!
  return { item: c.item, rarity: def.kind === 'consumable' ? def.rarity : 0, count: c.count, ammo: 0 }
}

export function rollAmmo(rng: Rng): LootDrop {
  const a = weighted(rng, AMMO_TABLE, (e) => e.weight)
  const def = itemDef(a.item)!
  return { item: a.item, rarity: 0, count: def.kind === 'ammo' ? def.pickup : 0, ammo: 0 }
}

/** Loot de um ponto no chão (0 a 2 itens). */
export function rollFloor(rng: Rng, tier: number): LootDrop[] {
  if (!rng.chance(0.72)) return []
  const r = rng.next()
  if (r < 0.5) {
    const w = rollWeapon(rng, tier)
    return [w, ammoFor(w.item)]
  }
  if (r < 0.8) return [rollConsumable(rng)]
  return [rollAmmo(rng)]
}

/** Loot de um baú: arma + munição + consumível + materiais (+ munição extra às vezes). */
export function rollChest(rng: Rng, tier: number): LootDrop[] {
  const w = rollWeapon(rng, Math.max(1, tier))
  const out = [w, ammoFor(w.item), rollConsumable(rng), { item: rng.pick([ITEM.Wood, ITEM.Stone, ITEM.Metal]), rarity: 0, count: 30, ammo: 0 }]
  if (rng.chance(0.5)) out.push(rollAmmo(rng))
  return out
}
