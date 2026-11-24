import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { BONE_NAMES, CLIP_NAMES, MATERIAL_SLOTS, buildBodyGeometry, buildClips, buildSkeleton, type MaterialSlot } from './rig'

/**
 * Fonte do personagem: o GLB em `arte/personagens/personagem.glb` (gerado
 * por `npm run assets`, ou feito por artista com as mesmas convenções de
 * rig.ts) e, se ele não existir ou não carregar, o mesmo personagem gerado
 * em código. Cada personagem em cena é um clone (malha + esqueleto próprios,
 * geometria e clipes compartilhados).
 */

export interface CharacterColors {
  suit: number
  armor: number
  accent: number
  visor: number
  dark: number
}

export interface CharacterAsset {
  template: THREE.Object3D
  clips: THREE.AnimationClip[]
  source: 'glb' | 'gerado'
}

export const CHARACTER_GLB_URL = 'arte/personagens/personagem.glb'

let current: CharacterAsset | null = null
let loading: Promise<CharacterAsset> | null = null

/** Personagem gerado em código (sempre disponível, também no Node para exportar). */
export function buildGeneratedTemplate(): THREE.Object3D {
  const { skeleton, root } = buildSkeleton()
  const placeholder = MATERIAL_SLOTS.map((slot) => {
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff })
    m.name = slot
    return m
  })
  const mesh = new THREE.SkinnedMesh(buildBodyGeometry(), placeholder)
  mesh.name = 'corpo-malha'
  mesh.add(root)
  mesh.bind(skeleton)
  const group = new THREE.Group()
  group.name = 'personagem'
  group.add(mesh)
  return group
}

function generated(): CharacterAsset {
  return { template: buildGeneratedTemplate(), clips: buildClips(), source: 'gerado' }
}

/** Confere se um GLB segue as convenções (ossos e clipes); devolve o que falta. */
export function validateAsset(template: THREE.Object3D, clips: THREE.AnimationClip[]): string[] {
  const missing: string[] = []
  for (const b of BONE_NAMES) if (!template.getObjectByName(b)) missing.push(`osso ${b}`)
  for (const c of CLIP_NAMES) if (!clips.some((k) => k.name === c)) missing.push(`clipe ${c}`)
  let skinned = false
  template.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned = true
  })
  if (!skinned) missing.push('malha com esqueleto')
  return missing
}

/** Lê um GLB já baixado (também usado nos testes). */
export async function parseCharacterGlb(data: ArrayBuffer): Promise<CharacterAsset> {
  const gltf = await new GLTFLoader().parseAsync(data, '')
  const missing = validateAsset(gltf.scene, gltf.animations)
  if (missing.length) throw new Error(`GLB do personagem incompleto: falta ${missing.join(', ')}`)
  return { template: gltf.scene, clips: gltf.animations, source: 'glb' }
}

/**
 * Carrega o GLB do personagem (uma vez). Se falhar, avisa no console e usa o
 * gerado — o jogo nunca fica sem personagem.
 */
export function loadCharacterAsset(url = CHARACTER_GLB_URL): Promise<CharacterAsset> {
  if (current?.source === 'glb') return Promise.resolve(current)
  loading ??= (async () => {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      current = await parseCharacterGlb(await res.arrayBuffer())
    } catch (err) {
      console.warn(`Personagem: usando o modelo gerado em código (${url}: ${err instanceof Error ? err.message : err})`)
      current = generated()
    }
    return current
  })()
  return loading
}

/** O personagem disponível agora (o gerado, se o GLB ainda não chegou). */
export function characterAsset(): CharacterAsset {
  current ??= generated()
  return current
}

const materialCache = new Map<string, Record<MaterialSlot, THREE.MeshStandardMaterial>>()

/** Materiais de um visual (compartilhados por todos os personagens com as mesmas cores). */
export function skinMaterials(c: CharacterColors): Record<MaterialSlot, THREE.MeshStandardMaterial> {
  const key = [c.suit, c.armor, c.accent, c.visor, c.dark].join(',')
  let set = materialCache.get(key)
  if (!set) {
    const mk = (slot: MaterialSlot, p: THREE.MeshStandardMaterialParameters) => {
      const m = new THREE.MeshStandardMaterial(p)
      m.name = slot
      return m
    }
    set = {
      traje: mk('traje', { color: c.suit, roughness: 0.82 }),
      armadura: mk('armadura', { color: c.armor, roughness: 0.45, metalness: 0.15 }),
      destaque: mk('destaque', { color: c.accent, roughness: 0.4, emissive: c.accent, emissiveIntensity: 0.9 }),
      viseira: mk('viseira', { color: c.visor, roughness: 0.12, metalness: 0.65 }),
      escuro: mk('escuro', { color: c.dark, roughness: 0.78 }),
    }
    materialCache.set(key, set)
  }
  return set
}

/** Um personagem novo: clone do modelo com os materiais do visual. */
export function instantiateCharacter(colors: CharacterColors): { object: THREE.Object3D; clips: THREE.AnimationClip[]; meshes: THREE.SkinnedMesh[] } {
  const asset = characterAsset()
  const object = cloneSkinned(asset.template)
  const mats = skinMaterials(colors)
  const meshes: THREE.SkinnedMesh[] = []
  const pick = (m: THREE.Material) => mats[(MATERIAL_SLOTS as readonly string[]).includes(m.name) ? (m.name as MaterialSlot) : 'traje']
  object.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh
    if (!mesh.isSkinnedMesh) return
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(pick) : pick(mesh.material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    // esfera generosa (queda livre, nado): evita recalcular pelos ossos a cada quadro
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 2.2)
    meshes.push(mesh)
  })
  return { object, clips: asset.clips, meshes }
}
