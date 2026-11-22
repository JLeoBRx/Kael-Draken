import { DEG } from '../math/scalar'

/**
 * Catálogo de itens: armas, consumíveis, munições e materiais.
 *
 * Tudo aqui é DADO. Balanceamento se faz mudando números neste arquivo;
 * servidor (autoridade) e cliente (predição, interface) leem a mesma tabela.
 * Ids são u8 no protocolo — não reutilize um id com outro significado.
 */

export const Rarity = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 } as const
export type RarityId = (typeof Rarity)[keyof typeof Rarity]

export interface RarityInfo {
  name: string
  color: number
  /** Multiplicador de dano. */
  damage: number
  /** Multiplicador do tempo de recarga. */
  reload: number
}

export const RARITIES: readonly RarityInfo[] = [
  { name: 'Comum', color: 0xa3abb5, damage: 1.0, reload: 1.0 },
  { name: 'Incomum', color: 0x4cc15a, damage: 1.05, reload: 0.95 },
  { name: 'Raro', color: 0x3d8bf2, damage: 1.1, reload: 0.9 },
  { name: 'Épico', color: 0xb15cf0, damage: 1.16, reload: 0.85 },
  { name: 'Lendário', color: 0xf2a93b, damage: 1.22, reload: 0.8 },
]

export const AmmoType = { Light: 0, Medium: 1, Heavy: 2, Shells: 3, Rockets: 4 } as const
export const AMMO_TYPES = 5
export const AMMO_INFO: readonly { name: string; short: string; max: number }[] = [
  { name: 'Munição leve', short: 'Leve', max: 999 },
  { name: 'Munição média', short: 'Média', max: 999 },
  { name: 'Munição pesada', short: 'Pesada', max: 999 },
  { name: 'Cartuchos', short: 'Cartuchos', max: 999 },
  { name: 'Foguetes', short: 'Foguetes', max: 30 },
]

export const Material = { Wood: 0, Stone: 1, Metal: 2 } as const
export const MATERIAL_TYPES = 3
export const MATERIAL_MAX = 999
export const MATERIAL_INFO: readonly { name: string }[] = [{ name: 'Madeira' }, { name: 'Pedra' }, { name: 'Metal' }]

export type WeaponCategory = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'sniper' | 'launcher'

/** Projétil simulado (explosivos). */
export interface ProjectileDef {
  speed: number
  /** Fração da gravidade aplicada. */
  gravityScale: number
  /** 0 = explode ao tocar; > 0 = quica e explode após este tempo (s). */
  fuse: number
  /** Coeficiente de restituição ao quicar. */
  restitution: number
  splashRadius: number
  /** Dano no centro da explosão. */
  damage: number
  /** Dano na borda do raio. */
  minDamage: number
}

interface BaseItem {
  id: number
  key: string
  name: string
}

export interface WeaponDef extends BaseItem {
  kind: 'weapon'
  category: WeaponCategory
  ammoType: number
  /** Dano por projétil/bala (antes de raridade, distância e cabeça). */
  damage: number
  headshot: number
  /** Segundos entre disparos. */
  fireInterval: number
  automatic: boolean
  pellets: number
  /** Meia-abertura do cone de dispersão (rad). */
  spreadHip: number
  spreadAim: number
  spreadMove: number
  spreadAir: number
  bloomPerShot: number
  bloomMax: number
  /** Recuperação do "bloom" (rad/s). */
  bloomRecover: number
  /** Coice vertical da câmera por disparo (rad), aplicado no cliente. */
  recoil: number
  magSize: number
  reloadTime: number
  equipTime: number
  range: number
  falloffStart: number
  falloffEnd: number
  /** Multiplicador de dano no fim da queda por distância. */
  falloffMin: number
  /** FOV ao mirar (graus); menor = mais zoom. */
  aimFov: number
  projectile: ProjectileDef | null
  rarities: readonly RarityId[]
}

export interface ConsumableDef extends BaseItem {
  kind: 'consumable'
  maxStack: number
  useTime: number
  heal: number
  healCap: number
  shield: number
  shieldCap: number
  /** Arremessável (granada): usa o botão de tiro para lançar. */
  throwable: ProjectileDef | null
  rarity: RarityId
}

export interface AmmoDef extends BaseItem {
  kind: 'ammo'
  ammoType: number
  pickup: number
}

export interface MaterialDef extends BaseItem {
  kind: 'material'
  material: number
  pickup: number
}

export type ItemDef = WeaponDef | ConsumableDef | AmmoDef | MaterialDef

const d = DEG

function weapon(w: Omit<WeaponDef, 'kind'>): WeaponDef {
  return { kind: 'weapon', ...w }
}

export const ITEM = {
  Pistol: 0,
  Smg: 1,
  Rifle: 2,
  Shotgun: 3,
  Sniper: 4,
  Launcher: 5,
  Grenade: 10,
  Bandage: 11,
  Medkit: 12,
  ShieldCell: 13,
  ShieldBattery: 14,
  AmmoLight: 20,
  AmmoMedium: 21,
  AmmoHeavy: 22,
  AmmoShells: 23,
  AmmoRockets: 24,
  Wood: 30,
  Stone: 31,
  Metal: 32,
} as const

export const NO_ITEM = 255

const ROCKET: ProjectileDef = { speed: 55, gravityScale: 0, fuse: 0, restitution: 0, splashRadius: 5, damage: 110, minDamage: 30 }
const GRENADE: ProjectileDef = { speed: 22, gravityScale: 1, fuse: 2.4, restitution: 0.35, splashRadius: 5.5, damage: 95, minDamage: 25 }

const LIST: ItemDef[] = [
  weapon({
    id: ITEM.Pistol, key: 'pistola', name: 'Vespa P9', category: 'pistol', ammoType: AmmoType.Light,
    damage: 24, headshot: 2, fireInterval: 0.16, automatic: false, pellets: 1,
    spreadHip: 2.2 * d, spreadAim: 0.8 * d, spreadMove: 1.5 * d, spreadAir: 3 * d,
    bloomPerShot: 0.6 * d, bloomMax: 3 * d, bloomRecover: 6 * d, recoil: 0.9 * d,
    magSize: 16, reloadTime: 1.4, equipTime: 0.4, range: 150, falloffStart: 25, falloffEnd: 70, falloffMin: 0.6,
    aimFov: 60, projectile: null, rarities: [0, 1, 2],
  }),
  weapon({
    id: ITEM.Smg, key: 'submetralhadora', name: 'Enxame M7', category: 'smg', ammoType: AmmoType.Light,
    damage: 17, headshot: 1.75, fireInterval: 0.075, automatic: true, pellets: 1,
    spreadHip: 3 * d, spreadAim: 1.6 * d, spreadMove: 1.2 * d, spreadAir: 3 * d,
    bloomPerShot: 0.25 * d, bloomMax: 3.5 * d, bloomRecover: 8 * d, recoil: 0.45 * d,
    magSize: 30, reloadTime: 2.1, equipTime: 0.35, range: 120, falloffStart: 20, falloffEnd: 50, falloffMin: 0.55,
    aimFov: 62, projectile: null, rarities: [1, 2, 3],
  }),
  weapon({
    id: ITEM.Rifle, key: 'rifle', name: 'Tormenta AR-4', category: 'rifle', ammoType: AmmoType.Medium,
    damage: 31, headshot: 1.5, fireInterval: 0.18, automatic: true, pellets: 1,
    spreadHip: 2 * d, spreadAim: 0.35 * d, spreadMove: 1.4 * d, spreadAir: 3 * d,
    bloomPerShot: 0.4 * d, bloomMax: 3 * d, bloomRecover: 5 * d, recoil: 0.75 * d,
    magSize: 30, reloadTime: 2.3, equipTime: 0.5, range: 250, falloffStart: 50, falloffEnd: 150, falloffMin: 0.7,
    aimFov: 52, projectile: null, rarities: [0, 1, 2, 3, 4],
  }),
  weapon({
    id: ITEM.Shotgun, key: 'escopeta', name: 'Trovão 12', category: 'shotgun', ammoType: AmmoType.Shells,
    damage: 11, headshot: 1.7, fireInterval: 0.9, automatic: false, pellets: 9,
    spreadHip: 5.5 * d, spreadAim: 4.5 * d, spreadMove: 0.8 * d, spreadAir: 1.5 * d,
    bloomPerShot: 0, bloomMax: 0, bloomRecover: 0, recoil: 3.2 * d,
    magSize: 5, reloadTime: 4, equipTime: 0.5, range: 50, falloffStart: 8, falloffEnd: 25, falloffMin: 0.35,
    aimFov: 64, projectile: null, rarities: [1, 2, 3, 4],
  }),
  weapon({
    id: ITEM.Sniper, key: 'sniper', name: 'Falcão de Ferrolho', category: 'sniper', ammoType: AmmoType.Heavy,
    damage: 105, headshot: 2.5, fireInterval: 1.2, automatic: false, pellets: 1,
    spreadHip: 6 * d, spreadAim: 0, spreadMove: 2 * d, spreadAir: 6 * d,
    bloomPerShot: 0, bloomMax: 0, bloomRecover: 0, recoil: 4 * d,
    magSize: 1, reloadTime: 2.4, equipTime: 0.7, range: 600, falloffStart: 600, falloffEnd: 600, falloffMin: 1,
    aimFov: 24, projectile: null, rarities: [2, 3, 4],
  }),
  weapon({
    id: ITEM.Launcher, key: 'lanca-foguetes', name: 'Rojão RL', category: 'launcher', ammoType: AmmoType.Rockets,
    damage: 0, headshot: 1, fireInterval: 1.1, automatic: false, pellets: 1,
    spreadHip: 0.6 * d, spreadAim: 0, spreadMove: 0.6 * d, spreadAir: 1.5 * d,
    bloomPerShot: 0, bloomMax: 0, bloomRecover: 0, recoil: 2.5 * d,
    magSize: 1, reloadTime: 2.8, equipTime: 0.8, range: 400, falloffStart: 400, falloffEnd: 400, falloffMin: 1,
    aimFov: 58, projectile: ROCKET, rarities: [3, 4],
  }),
  {
    kind: 'consumable', id: ITEM.Grenade, key: 'granada', name: 'Granada de Fragmentação', rarity: Rarity.Uncommon,
    maxStack: 6, useTime: 0, heal: 0, healCap: 0, shield: 0, shieldCap: 0, throwable: GRENADE,
  },
  {
    kind: 'consumable', id: ITEM.Bandage, key: 'bandagem', name: 'Bandagem', rarity: Rarity.Common,
    maxStack: 15, useTime: 3.2, heal: 15, healCap: 75, shield: 0, shieldCap: 0, throwable: null,
  },
  {
    kind: 'consumable', id: ITEM.Medkit, key: 'kit-medico', name: 'Kit Médico', rarity: Rarity.Uncommon,
    maxStack: 3, useTime: 7, heal: 100, healCap: 100, shield: 0, shieldCap: 0, throwable: null,
  },
  {
    kind: 'consumable', id: ITEM.ShieldCell, key: 'celula-escudo', name: 'Célula de Escudo', rarity: Rarity.Uncommon,
    maxStack: 6, useTime: 2, heal: 0, healCap: 0, shield: 25, shieldCap: 50, throwable: null,
  },
  {
    kind: 'consumable', id: ITEM.ShieldBattery, key: 'bateria-escudo', name: 'Bateria de Escudo', rarity: Rarity.Rare,
    maxStack: 3, useTime: 4.5, heal: 0, healCap: 0, shield: 50, shieldCap: 100, throwable: null,
  },
  { kind: 'ammo', id: ITEM.AmmoLight, key: 'municao-leve', name: 'Munição leve', ammoType: AmmoType.Light, pickup: 36 },
  { kind: 'ammo', id: ITEM.AmmoMedium, key: 'municao-media', name: 'Munição média', ammoType: AmmoType.Medium, pickup: 30 },
  { kind: 'ammo', id: ITEM.AmmoHeavy, key: 'municao-pesada', name: 'Munição pesada', ammoType: AmmoType.Heavy, pickup: 6 },
  { kind: 'ammo', id: ITEM.AmmoShells, key: 'cartuchos', name: 'Cartuchos', ammoType: AmmoType.Shells, pickup: 10 },
  { kind: 'ammo', id: ITEM.AmmoRockets, key: 'foguetes', name: 'Foguetes', ammoType: AmmoType.Rockets, pickup: 3 },
  { kind: 'material', id: ITEM.Wood, key: 'madeira', name: 'Madeira', material: Material.Wood, pickup: 30 },
  { kind: 'material', id: ITEM.Stone, key: 'pedra', name: 'Pedra', material: Material.Stone, pickup: 30 },
  { kind: 'material', id: ITEM.Metal, key: 'metal', name: 'Metal', material: Material.Metal, pickup: 30 },
]

const BY_ID: (ItemDef | undefined)[] = []
for (const it of LIST) {
  if (BY_ID[it.id]) throw new Error(`id de item duplicado: ${it.id}`)
  BY_ID[it.id] = it
}

export const ALL_ITEMS: readonly ItemDef[] = LIST
export const WEAPONS: readonly WeaponDef[] = LIST.filter((i): i is WeaponDef => i.kind === 'weapon')
export const CONSUMABLES: readonly ConsumableDef[] = LIST.filter((i): i is ConsumableDef => i.kind === 'consumable')

export function itemDef(id: number): ItemDef | undefined {
  return BY_ID[id]
}

export function weaponDef(id: number): WeaponDef | undefined {
  const it = BY_ID[id]
  return it && it.kind === 'weapon' ? it : undefined
}

/** Item de munição que alimenta uma arma. */
export function ammoItemFor(ammoType: number): AmmoDef {
  return LIST.find((i): i is AmmoDef => i.kind === 'ammo' && i.ammoType === ammoType)!
}

/** Dano de uma bala a uma distância (sem cabeça). */
export function damageAt(w: WeaponDef, rarity: number, distance: number): number {
  let f = 1
  if (distance > w.falloffStart) {
    const t = Math.min(1, (distance - w.falloffStart) / Math.max(1e-6, w.falloffEnd - w.falloffStart))
    f = 1 + (w.falloffMin - 1) * t
  }
  return w.damage * (RARITIES[rarity]?.damage ?? 1) * f
}

export function itemLabel(id: number, rarity?: number): string {
  const it = BY_ID[id]
  if (!it) return 'Item desconhecido'
  if (it.kind === 'weapon' && rarity !== undefined) return `${it.name} (${RARITIES[rarity]?.name ?? ''})`
  return it.name
}
