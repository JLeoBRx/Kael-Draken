import * as THREE from 'three'
import { ITEM, RARITIES, itemDef } from '../../shared/config/items'

/**
 * Modelos procedurais de armas, itens e baús (placeholders organizados).
 * Armas apontam para -Z com a empunhadura na origem. Para trocar por modelos
 * GLTF, substitua as fábricas deste arquivo mantendo a orientação.
 */

const cache = new Map<string, THREE.Material>()

function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = cache.get(key)
  if (!m) cache.set(key, (m = make()))
  return m
}

const gunMetal = () => mat('gunmetal', () => new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.45, metalness: 0.6 }))
const polymer = () => mat('polymer', () => new THREE.MeshStandardMaterial({ color: 0x1c1f23, roughness: 0.8 }))
const woodMat = () => mat('woodgun', () => new THREE.MeshStandardMaterial({ color: 0x7a5233, roughness: 0.7 }))

export function rarityMaterial(rarity: number): THREE.Material {
  return mat(`rarity-${rarity}`, () => {
    const c = RARITIES[rarity]?.color ?? 0xffffff
    return new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.3, emissive: c, emissiveIntensity: rarity >= 3 ? 0.55 : 0.2 })
  })
}

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rx = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.position.set(x, y, z)
  mesh.rotation.x = rx
  return mesh
}

function cyl(r: number, len: number, m: THREE.Material, x: number, y: number, z: number, axis: 'z' | 'y' = 'z'): THREE.Mesh {
  const g = new THREE.CylinderGeometry(r, r, len, 10)
  if (axis === 'z') g.rotateX(Math.PI / 2)
  const mesh = new THREE.Mesh(g, m)
  mesh.position.set(x, y, z)
  return mesh
}

/**
 * Picareta: cabo ao longo de −Z a partir da empunhadura (origem), cabeça
 * dupla perpendicular na ponta (lâmina para cima, ponta para baixo).
 */
export function buildPickaxeModel(): THREE.Group {
  const g = new THREE.Group()
  const steel = mat('pick-steel', () => new THREE.MeshStandardMaterial({ color: 0xb9c3cc, roughness: 0.35, metalness: 0.75 }))
  const ember = mat('pick-ember', () => new THREE.MeshStandardMaterial({ color: 0xff7a2f, roughness: 0.4, metalness: 0.2, emissive: 0xff5a10, emissiveIntensity: 0.35 }))
  const grip = mat('pick-grip', () => new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.9 }))
  g.add(cyl(0.022, 0.78, woodMat(), 0, 0, -0.3))
  g.add(cyl(0.027, 0.18, grip, 0, 0, 0.02))
  g.add(box(0.07, 0.07, 0.09, ember, 0, 0, -0.66))
  const blade = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.32, 4).translate(0, 0.16, 0), steel)
  blade.position.set(0, 0.03, -0.66)
  blade.rotation.x = -0.35
  const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.24, 4).translate(0, -0.12, 0), steel)
  spike.position.set(0, -0.03, -0.66)
  spike.rotation.x = 0.35
  g.add(blade, spike)
  g.traverse((o) => { o.castShadow = true })
  return g
}

/** Arma na mão ou no chão. A ponta do cano fica em `userData.muzzle` (local). */
export function buildWeaponModel(item: number, rarity: number): THREE.Group {
  const g = new THREE.Group()
  const acc = rarityMaterial(rarity)
  const add = (...m: THREE.Object3D[]) => g.add(...m)
  let muzzle = -0.3
  switch (item) {
    case ITEM.Pistol:
      add(box(0.04, 0.05, 0.22, gunMetal(), 0, 0.06, -0.06), box(0.035, 0.11, 0.05, polymer(), 0, 0, 0.02, 0.25), box(0.042, 0.012, 0.1, acc, 0, 0.09, -0.06))
      muzzle = -0.17
      break
    case ITEM.Smg:
      add(box(0.06, 0.08, 0.32, gunMetal(), 0, 0.05, -0.1), box(0.035, 0.16, 0.05, polymer(), 0, -0.06, -0.12), box(0.035, 0.1, 0.05, polymer(), 0, -0.01, 0.03, 0.3))
      add(cyl(0.016, 0.12, gunMetal(), 0, 0.06, -0.32), box(0.04, 0.05, 0.14, polymer(), 0, 0.05, 0.12), box(0.062, 0.015, 0.2, acc, 0, 0.095, -0.1))
      muzzle = -0.38
      break
    case ITEM.Rifle:
      add(box(0.06, 0.09, 0.5, gunMetal(), 0, 0.05, -0.15), cyl(0.017, 0.26, gunMetal(), 0, 0.06, -0.52), box(0.05, 0.1, 0.22, polymer(), 0, 0.03, 0.2))
      add(box(0.04, 0.17, 0.06, polymer(), 0, -0.07, -0.16, -0.25), box(0.035, 0.1, 0.05, polymer(), 0, -0.02, 0.0, 0.3), box(0.03, 0.04, 0.08, polymer(), 0, 0.12, -0.12))
      add(box(0.062, 0.015, 0.3, acc, 0, 0.1, -0.2))
      muzzle = -0.65
      break
    case ITEM.Shotgun:
      add(cyl(0.024, 0.6, gunMetal(), 0, 0.07, -0.3), box(0.05, 0.05, 0.22, woodMat(), 0, 0.03, -0.32), box(0.055, 0.09, 0.2, gunMetal(), 0, 0.05, 0.0))
      add(box(0.05, 0.11, 0.3, woodMat(), 0, 0.02, 0.24), box(0.035, 0.1, 0.05, polymer(), 0, -0.03, 0.05, 0.3), box(0.057, 0.015, 0.16, acc, 0, 0.1, -0.02))
      muzzle = -0.6
      break
    case ITEM.Sniper:
      add(box(0.055, 0.08, 0.45, gunMetal(), 0, 0.05, -0.05), cyl(0.016, 0.55, gunMetal(), 0, 0.06, -0.55), box(0.05, 0.11, 0.3, woodMat(), 0, 0.02, 0.3))
      add(cyl(0.028, 0.28, polymer(), 0, 0.14, -0.08), cyl(0.034, 0.03, gunMetal(), 0, 0.14, -0.22), box(0.035, 0.1, 0.05, polymer(), 0, -0.03, 0.06, 0.3))
      add(box(0.057, 0.015, 0.25, acc, 0, 0.095, 0.02))
      muzzle = -0.82
      break
    case ITEM.Launcher:
      add(cyl(0.075, 0.95, mat('launcher', () => new THREE.MeshStandardMaterial({ color: 0x3e4a35, roughness: 0.7 })), 0, 0.1, -0.15), box(0.04, 0.12, 0.05, polymer(), 0, -0.02, 0, 0.3))
      add(box(0.04, 0.12, 0.05, polymer(), 0, -0.01, -0.32, 0.2), box(0.03, 0.06, 0.08, polymer(), 0, 0.2, -0.2), cyl(0.078, 0.12, acc, 0, 0.1, -0.58))
      muzzle = -0.63
      break
    default:
      add(box(0.05, 0.05, 0.2, gunMetal(), 0, 0, -0.05))
  }
  g.userData.muzzle = new THREE.Vector3(0, 0.06, muzzle)
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true
  })
  return g
}

/** Modelo de qualquer item para exibir no chão (ou na mão, no caso de consumíveis). */
export function buildItemModel(item: number, rarity: number): THREE.Object3D {
  const def = itemDef(item)
  if (!def) return new THREE.Group()
  if (def.kind === 'weapon') {
    const g = buildWeaponModel(item, rarity)
    g.scale.setScalar(1.6)
    return g
  }
  const g = new THREE.Group()
  const white = mat('white', () => new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }))
  const red = mat('red', () => new THREE.MeshStandardMaterial({ color: 0xd8372f, roughness: 0.5 }))
  const blueGlow = mat('blueglow', () => new THREE.MeshStandardMaterial({ color: 0x55b8ff, emissive: 0x2f8bff, emissiveIntensity: 0.9, roughness: 0.2, transparent: true, opacity: 0.85 }))
  switch (item) {
    case ITEM.Grenade: {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), mat('olive', () => new THREE.MeshStandardMaterial({ color: 0x55603a, roughness: 0.6, flatShading: true })))
      g.add(s, box(0.03, 0.06, 0.03, gunMetal(), 0, 0.1, 0))
      break
    }
    case ITEM.Bandage:
      g.add(cyl(0.07, 0.12, white, -0.05, 0.07, 0, 'y'), cyl(0.07, 0.12, white, 0.1, 0.07, 0.04, 'y'))
      break
    case ITEM.Medkit:
      g.add(box(0.36, 0.2, 0.24, white, 0, 0.1, 0), box(0.06, 0.02, 0.16, red, 0, 0.21, 0), box(0.16, 0.02, 0.06, red, 0, 0.21, 0))
      break
    case ITEM.ShieldCell:
      g.add(cyl(0.05, 0.16, blueGlow, 0, 0.09, 0, 'y'), cyl(0.055, 0.03, gunMetal(), 0, 0.18, 0, 'y'))
      break
    case ITEM.ShieldBattery:
      g.add(cyl(0.1, 0.26, blueGlow, 0, 0.15, 0, 'y'), cyl(0.105, 0.04, gunMetal(), 0, 0.29, 0, 'y'), cyl(0.105, 0.04, gunMetal(), 0, 0.02, 0, 'y'))
      break
    case ITEM.AmmoRockets:
      g.add(cyl(0.06, 0.5, mat('rocket', () => new THREE.MeshStandardMaterial({ color: 0x4d5a3c, roughness: 0.6 })), 0, 0.07, 0), cyl(0.06, 0.08, red, 0, 0.07, -0.28))
      break
    case ITEM.Wood:
    case ITEM.Stone:
    case ITEM.Metal: {
      const color = item === ITEM.Wood ? 0x9a6b3f : item === ITEM.Stone ? 0x8c8c88 : 0xa7b0b8
      const m = mat(`mat-${item}`, () => new THREE.MeshStandardMaterial({ color, roughness: item === ITEM.Metal ? 0.4 : 0.85, metalness: item === ITEM.Metal ? 0.6 : 0 }))
      for (let k = 0; k < 3; k++) g.add(box(0.5, 0.08, 0.16, m, 0, 0.04 + k * 0.09, (k - 1) * 0.05))
      break
    }
    default: {
      // Caixas de munição com cores por tipo
      const colors: Record<number, number> = { [ITEM.AmmoLight]: 0xc9b25a, [ITEM.AmmoMedium]: 0x6f7d3e, [ITEM.AmmoHeavy]: 0x3c4148, [ITEM.AmmoShells]: 0xa23b2e }
      const m = mat(`ammo-${item}`, () => new THREE.MeshStandardMaterial({ color: colors[item] ?? 0x888888, roughness: 0.6 }))
      g.add(box(0.28, 0.16, 0.18, m, 0, 0.08, 0), box(0.29, 0.03, 0.19, gunMetal(), 0, 0.17, 0))
    }
  }
  g.scale.setScalar(1.5)
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true
  })
  return g
}

/** Baú: corpo + tampa (pivô atrás). `userData.lid` gira para abrir. */
export function buildChestModel(): THREE.Group {
  const g = new THREE.Group()
  const wood = mat('chest-wood', () => new THREE.MeshStandardMaterial({ color: 0x7a4b25, roughness: 0.75 }))
  const gold = mat('chest-gold', () => new THREE.MeshStandardMaterial({ color: 0xe8b84a, roughness: 0.3, metalness: 0.8, emissive: 0x6b4a10, emissiveIntensity: 0.6 }))
  g.add(box(0.9, 0.42, 0.6, wood, 0, 0.21, 0))
  for (const x of [-0.3, 0.3]) g.add(box(0.06, 0.44, 0.62, gold, x, 0.21, 0))
  const lid = new THREE.Group()
  lid.position.set(0, 0.42, -0.3)
  lid.add(box(0.92, 0.16, 0.62, wood, 0, 0.08, 0.3), box(0.06, 0.17, 0.63, gold, -0.3, 0.08, 0.3), box(0.06, 0.17, 0.63, gold, 0.3, 0.08, 0.3), box(0.12, 0.12, 0.04, gold, 0, 0.0, 0.62))
  g.add(lid)
  g.userData.lid = lid
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true
      o.receiveShadow = true
    }
  })
  return g
}

/** Facho de luz vertical da raridade (legibilidade do loot à distância). */
export function buildRarityBeam(rarity: number): THREE.Mesh {
  const color = RARITIES[rarity]?.color ?? 0xffffff
  const m = mat(`beam-${rarity}`, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }))
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 2.6, 8, 1, true).translate(0, 1.3, 0), m)
  mesh.renderOrder = 5
  return mesh
}
