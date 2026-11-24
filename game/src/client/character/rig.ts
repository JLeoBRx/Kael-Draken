import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * Personagem com esqueleto: ossos, malha com pesos (uma SkinnedMesh com 5
 * grupos de material) e os clipes de animação. É o "arquivo de arte" do
 * personagem gerado em código — o mesmo conteúdo é exportado para GLB
 * (`npm run assets`) e um GLB feito por artista, com os mesmos nomes de
 * ossos, materiais e clipes, entra no lugar sem mudar o jogo.
 *
 * Convenções (para quem fizer o GLB):
 * - Y para cima, frente para −Z, pés na origem, 1 unidade = 1 m.
 * - Ossos: BONE_NAMES (pose de repouso: braços caídos, pernas retas).
 * - Materiais: MATERIAL_SLOTS (recebem as cores do visual escolhido).
 * - Clipes: CLIP_NAMES; os de passo (andar, correr…) são um ciclo completo
 *   (dois passos) e tocam sincronizados pela fase da passada.
 */

export const BONE_NAMES = [
  'raiz', 'corpo', 'quadril', 'coluna', 'peito', 'pescoco',
  'ombro_E', 'cotovelo_E', 'mao_E', 'ombro_D', 'cotovelo_D', 'mao_D',
  'coxa_E', 'joelho_E', 'pe_E', 'coxa_D', 'joelho_D', 'pe_D',
] as const
export type BoneName = (typeof BONE_NAMES)[number]

const PARENT: Record<BoneName, BoneName | null> = {
  raiz: null, corpo: 'raiz', quadril: 'corpo', coluna: 'quadril', peito: 'coluna', pescoco: 'peito',
  ombro_E: 'peito', cotovelo_E: 'ombro_E', mao_E: 'cotovelo_E',
  ombro_D: 'peito', cotovelo_D: 'ombro_D', mao_D: 'cotovelo_D',
  coxa_E: 'quadril', joelho_E: 'coxa_E', pe_E: 'joelho_E',
  coxa_D: 'quadril', joelho_D: 'coxa_D', pe_D: 'joelho_D',
}

/** Posição de repouso de cada osso em relação ao pai (m). */
const REST: Record<BoneName, [number, number, number]> = {
  raiz: [0, 0, 0], corpo: [0, 0, 0], quadril: [0, 0.98, 0], coluna: [0, 0.1, 0], peito: [0, 0.2, 0], pescoco: [0, 0.25, 0],
  ombro_E: [-0.25, 0.12, 0], cotovelo_E: [0, -0.29, 0], mao_E: [0, -0.27, 0],
  ombro_D: [0.25, 0.12, 0], cotovelo_D: [0, -0.29, 0], mao_D: [0, -0.27, 0],
  coxa_E: [-0.105, -0.04, 0], joelho_E: [0, -0.44, 0], pe_E: [0, -0.43, 0],
  coxa_D: [0.105, -0.04, 0], joelho_D: [0, -0.44, 0], pe_D: [0, -0.43, 0],
}

export const HIPS_HEIGHT = REST.quadril[1]

export const MATERIAL_SLOTS = ['traje', 'armadura', 'destaque', 'viseira', 'escuro'] as const
export type MaterialSlot = (typeof MATERIAL_SLOTS)[number]

export const CLIP_NAMES = [
  'parado', 'andar', 'correr', 'disparar', 'agachado', 'agachado-andar', 'ar', 'deslize', 'nado', 'queda-livre', 'planar',
  'bracos-soltos', 'bracos-andar', 'segurar-arma', 'mirar', 'picareta', 'golpe',
] as const
export type ClipName = (typeof CLIP_NAMES)[number]

/** Clipes que são um ciclo de passada (tocam pela fase, não pelo relógio). */
export const GAIT_CLIPS: readonly ClipName[] = ['andar', 'correr', 'disparar', 'agachado-andar', 'nado', 'bracos-andar']

/** Ossos dos braços (camada de cima); os demais são da camada de baixo. */
export const ARM_BONES: readonly BoneName[] = ['ombro_E', 'cotovelo_E', 'mao_E', 'ombro_D', 'cotovelo_D', 'mao_D']

export function buildSkeleton(): { bones: Record<BoneName, THREE.Bone>; skeleton: THREE.Skeleton; root: THREE.Bone } {
  const bones = {} as Record<BoneName, THREE.Bone>
  for (const name of BONE_NAMES) {
    const b = new THREE.Bone()
    b.name = name
    b.position.fromArray(REST[name])
    bones[name] = b
  }
  for (const name of BONE_NAMES) {
    const p = PARENT[name]
    if (p) bones[p].add(bones[name])
  }
  const list = BONE_NAMES.map((n) => bones[n])
  return { bones, skeleton: new THREE.Skeleton(list), root: bones.raiz }
}

// ---- malha --------------------------------------------------------------------

interface Piece {
  geo: THREE.BufferGeometry
  slot: MaterialSlot
  bone: BoneName
  /** Posição no espaço do osso. */
  at: [number, number, number]
  /**
   * Mistura suave com outro osso perto da junta: vértices com y local (no osso)
   * entre `from` e `to` vão de 0 a `max` do peso no osso `with`.
   */
  blend?: { with: BoneName; from: number; to: number; max: number }
}

function capsule(r: number, len: number): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(r, len, 4, 12)
}

function pieces(): Piece[] {
  // caixas arredondadas (placas da armadura, botas, mochila) — o raio acompanha a menor medida
  const box = (w: number, h: number, d: number) => new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.32)
  const out: Piece[] = []
  const add = (bone: BoneName, slot: MaterialSlot, geo: THREE.BufferGeometry, at: [number, number, number], blend?: Piece['blend']) => out.push({ bone, slot, geo, at, blend })
  // quadril e cinto
  add('quadril', 'traje', box(0.36, 0.2, 0.22), [0, 0, 0])
  add('quadril', 'escuro', box(0.38, 0.06, 0.24), [0, 0.08, 0])
  add('quadril', 'destaque', box(0.08, 0.06, 0.04), [0, 0.08, -0.125])
  // tronco
  add('peito', 'traje', capsule(0.17, 0.22).scale(1.18, 1, 0.78), [0, 0.02, 0])
  add('coluna', 'traje', capsule(0.15, 0.1).scale(1.15, 1, 0.8), [0, 0.04, 0], { with: 'quadril', from: 0.04, to: -0.08, max: 0.5 })
  add('peito', 'armadura', box(0.42, 0.34, 0.3), [0, 0.04, 0])
  add('peito', 'destaque', box(0.3, 0.05, 0.02), [0, 0.12, -0.155])
  add('peito', 'escuro', box(0.32, 0.4, 0.17), [0, 0.02, 0.23])
  add('peito', 'destaque', box(0.26, 0.08, 0.04), [0, 0.14, 0.32])
  add('peito', 'armadura', new THREE.CylinderGeometry(0.06, 0.06, 0.34, 8).rotateZ(Math.PI / 2), [0, -0.2, 0.25])
  // cabeça
  add('pescoco', 'traje', new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), [0, 0.03, 0])
  add('pescoco', 'armadura', new THREE.SphereGeometry(0.145, 18, 14).scale(1, 1.08, 1.05), [0, 0.16, 0])
  add('pescoco', 'viseira', new THREE.SphereGeometry(0.15, 18, 10, Math.PI * 1.12, Math.PI * 0.76, Math.PI * 0.34, Math.PI * 0.26).scale(1.04, 1.08, 1.1), [0, 0.16, -0.012])
  add('pescoco', 'destaque', box(0.02, 0.05, 0.24), [0, 0.3, 0.02])
  for (const side of [-1, 1] as const) {
    const S = side < 0 ? 'E' : 'D'
    const sh = `ombro_${S}` as BoneName
    const el = `cotovelo_${S}` as BoneName
    const hand = `mao_${S}` as BoneName
    const th = `coxa_${S}` as BoneName
    const kn = `joelho_${S}` as BoneName
    const ft = `pe_${S}` as BoneName
    add(sh, 'armadura', new THREE.SphereGeometry(0.085, 12, 10), [0, 0, 0])
    add(sh, 'traje', capsule(0.055, 0.2), [0, -0.15, 0], { with: el, from: -0.2, to: -0.3, max: 0.5 })
    add(el, 'traje', capsule(0.05, 0.18), [0, -0.12, 0], { with: sh, from: -0.08, to: 0.02, max: 0.5 })
    add(el, 'armadura', box(0.11, 0.07, 0.11), [0, -0.06, 0])
    add(hand, 'escuro', new THREE.SphereGeometry(0.058, 10, 8), [0, 0, 0])
    add(th, 'traje', capsule(0.078, 0.28), [0, -0.21, 0], { with: kn, from: -0.34, to: -0.46, max: 0.5 })
    add(th, 'escuro', box(0.1, 0.12, 0.06), [0.07 * side, -0.2, 0])
    add(kn, 'armadura', box(0.13, 0.12, 0.08), [0, 0, -0.06])
    add(kn, 'traje', capsule(0.066, 0.28), [0, -0.2, 0], { with: th, from: -0.1, to: 0.0, max: 0.5 })
    add(ft, 'escuro', box(0.13, 0.11, 0.27), [0, 0, -0.05])
  }
  return out
}

/** Malha com pesos no repouso, com um grupo por material (MATERIAL_SLOTS). */
export function buildBodyGeometry(): THREE.BufferGeometry {
  const { bones, root } = buildSkeleton()
  root.updateMatrixWorld(true)
  const boneIndex = new Map(BONE_NAMES.map((n, k) => [n, k]))
  const bySlot = new Map<MaterialSlot, THREE.BufferGeometry[]>(MATERIAL_SLOTS.map((s) => [s, []]))
  for (const p of pieces()) {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo).translate(...p.at)
    g.deleteAttribute('uv')
    const pos = g.attributes.position as THREE.BufferAttribute
    const skinIndex = new Uint16Array(pos.count * 4)
    const skinWeight = new Float32Array(pos.count * 4)
    const main = boneIndex.get(p.bone)!
    const other = p.blend ? boneIndex.get(p.blend.with)! : main
    for (let k = 0; k < pos.count; k++) {
      let w = 0
      if (p.blend) {
        const y = pos.getY(k)
        const t = (y - p.blend.from) / (p.blend.to - p.blend.from)
        w = Math.max(0, Math.min(1, t)) * p.blend.max
      }
      skinIndex[k * 4] = main
      skinIndex[k * 4 + 1] = other
      skinWeight[k * 4] = 1 - w
      skinWeight[k * 4 + 1] = w
    }
    // do espaço do osso para o espaço do modelo (pose de repouso)
    g.applyMatrix4(bones[p.bone].matrixWorld)
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4))
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4))
    bySlot.get(p.slot)!.push(g)
  }
  const merged = MATERIAL_SLOTS.map((s) => mergeGeometries(bySlot.get(s)!)!)
  // vértices repetidos viram um só (índices): ~3× menos vértices
  const body = mergeVertices(mergeGeometries(merged, true)!)
  body.computeBoundingSphere()
  return body
}

// ---- clipes ---------------------------------------------------------------------

/** Pose: rotações (Euler XYZ, rad) por osso; `quadrilY`/`corpoY` = altura; `corpoX` = inclinação do corpo. */
interface Pose {
  rot: Partial<Record<BoneName, [number, number, number]>>
  quadrilY?: number
  corpoY?: number
}

const sin = Math.sin
const cos = Math.cos

/** Passada de pé (u = 0–1 é um ciclo de dois passos). `amp` 1 = correr. */
function gait(u: number, amp: number, lean: number): Pose {
  const ph = u * Math.PI * 2
  const s = sin(ph)
  const c = cos(ph)
  return {
    quadrilY: HIPS_HEIGHT - Math.abs(c) * 0.035 * amp + 0.02 * amp,
    rot: {
      coluna: [-0.1 * amp - lean, s * 0.06 * amp, 0],
      coxa_E: [s * 0.6 * amp, 0, 0],
      coxa_D: [-s * 0.6 * amp, 0, 0],
      joelho_E: [-(Math.max(0, -c) * 1.1 * amp + 0.08), 0, 0],
      joelho_D: [-(Math.max(0, c) * 1.1 * amp + 0.08), 0, 0],
      pe_E: [Math.max(0, -c) * 0.3 * amp, 0, 0],
      pe_D: [Math.max(0, c) * 0.3 * amp, 0, 0],
    },
  }
}

function armSwing(u: number, amp: number): Pose {
  const s = sin(u * Math.PI * 2)
  return {
    rot: {
      ombro_E: [-s * 0.55 * amp, 0, -0.12],
      ombro_D: [s * 0.55 * amp, 0, 0.12],
      cotovelo_E: [0.25 + 0.5 * amp, 0, 0],
      cotovelo_D: [0.25 + 0.5 * amp, 0, 0],
    },
  }
}

function crouchGait(u: number, amp: number): Pose {
  const g = gait(u, amp * 0.7, 0)
  for (const k of ['coxa_E', 'coxa_D'] as const) g.rot[k]![0] += 1.0
  for (const k of ['joelho_E', 'joelho_D'] as const) g.rot[k]![0] -= 1.55
  g.rot.coluna![0] -= 0.35
  g.quadrilY = (g.quadrilY ?? HIPS_HEIGHT) - 0.36
  return g
}

const STATIC: Record<string, Pose> = {
  ar: {
    quadrilY: HIPS_HEIGHT,
    rot: { coluna: [-0.05, 0, 0], coxa_E: [0.6, 0, 0], coxa_D: [0.0, 0, 0], joelho_E: [-0.8, 0, 0], joelho_D: [-0.45, 0, 0], pe_E: [0.2, 0, 0], pe_D: [0.15, 0, 0] },
  },
  deslize: {
    quadrilY: 0.42,
    rot: { coluna: [0.45, 0, 0], coxa_E: [1.35, 0, 0], joelho_E: [-0.15, 0, 0], coxa_D: [0.55, 0, 0], joelho_D: [-1.7, 0, 0], pe_E: [-0.2, 0, 0] },
  },
  'queda-livre': {
    quadrilY: HIPS_HEIGHT,
    corpoY: 0.9,
    rot: {
      corpo: [-1.3, 0, 0], coluna: [0.1, 0, 0], pescoco: [0.9, 0, 0],
      ombro_E: [0.5, 0, -1.35], ombro_D: [0.5, 0, 1.35], cotovelo_E: [0.3, 0, 0], cotovelo_D: [0.3, 0, 0],
      coxa_E: [-0.15, 0, -0.15], coxa_D: [-0.15, 0, 0.15], joelho_E: [-0.5, 0, 0], joelho_D: [-0.5, 0, 0],
    },
  },
  planar: {
    quadrilY: HIPS_HEIGHT,
    rot: {
      ombro_E: [2.8, 0, -0.35], ombro_D: [2.8, 0, 0.35], cotovelo_E: [0.2, 0, 0], cotovelo_D: [0.2, 0, 0],
      coxa_E: [0.25, 0, 0], coxa_D: [0.1, 0, 0], joelho_E: [-0.35, 0, 0], joelho_D: [-0.2, 0, 0],
    },
  },
  'bracos-soltos': { rot: { ombro_E: [0, 0, -0.12], ombro_D: [0, 0, 0.12], cotovelo_E: [0.25, 0, 0], cotovelo_D: [0.25, 0, 0] } },
  'segurar-arma': { rot: { ombro_E: [0.85, 0, 0.5], ombro_D: [0.75, 0, 0.05], cotovelo_E: [1.1, 0, 0], cotovelo_D: [1.0, 0, 0] } },
  mirar: { rot: { ombro_E: [1.35, 0, 0.45], ombro_D: [1.45, 0, -0.1], cotovelo_E: [0.65, 0, 0], cotovelo_D: [0.2, 0, 0] } },
  picareta: { rot: { ombro_E: [0, 0, -0.12], cotovelo_E: [0.3, 0, 0], ombro_D: [0.55, 0, 0.12], cotovelo_D: [1.25, 0, 0] } },
}

function swimPose(u: number): Pose {
  const ph = u * Math.PI * 2
  const stroke = sin(ph)
  const kick = sin(ph * 2)
  return {
    quadrilY: 0.75,
    rot: {
      corpo: [-1.25, 0, 0], pescoco: [0.9, 0, 0],
      ombro_E: [2.2 + stroke * 0.9, 0, -0.12], ombro_D: [2.2 - stroke * 0.9, 0, 0.12],
      cotovelo_E: [0.4, 0, 0], cotovelo_D: [0.4, 0, 0],
      coxa_E: [kick * 0.35, 0, 0], coxa_D: [-kick * 0.35, 0, 0], joelho_E: [-0.2, 0, 0], joelho_D: [-0.2, 0, 0],
    },
  }
}

function idlePose(u: number): Pose {
  const b = sin(u * Math.PI * 2)
  return { quadrilY: HIPS_HEIGHT - 0.006 + b * 0.006, rot: { coluna: [-0.03 + b * 0.015, 0, 0], peito: [b * 0.01, 0, 0] } }
}

/** Golpe de picareta: ergue, desce em arco e volta (u = 0–1). */
function swingPose(u: number): Pose {
  let sx: number
  let ex: number
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  if (u < 0.3) {
    const k = u / 0.3
    sx = lerp(0.55, 2.7, k)
    ex = lerp(1.25, 1.5, k)
  } else if (u < 0.55) {
    const k = (u - 0.3) / 0.25
    sx = lerp(2.7, 0.75, k * k)
    ex = lerp(1.5, 0.15, k)
  } else {
    const k = (u - 0.55) / 0.45
    sx = lerp(0.75, 0.55, k)
    ex = lerp(0.15, 1.25, k)
  }
  return { rot: { ombro_E: [0, 0, -0.12], cotovelo_E: [0.3, 0, 0], ombro_D: [sx, 0, 0.12], cotovelo_D: [ex, 0, 0] } }
}

/** Duração do golpe de picareta (s). */
export const SWING_TIME = 0.42

const euler = new THREE.Euler()
const quat = new THREE.Quaternion()

/** Ossos que cada clipe anima (a camada a que pertence). */
const LOWER_BONES: BoneName[] = ['corpo', 'quadril', 'coluna', 'peito', 'pescoco', 'coxa_E', 'joelho_E', 'pe_E', 'coxa_D', 'joelho_D', 'pe_D']

function clipFrom(name: ClipName, duration: number, frames: number, poseAt: (u: number) => Pose, bones: readonly BoneName[], heights: boolean): THREE.AnimationClip {
  const times: number[] = []
  const samples: Pose[] = []
  for (let f = 0; f <= frames; f++) {
    const u = frames === 0 ? 0 : f / frames
    times.push(u * duration)
    samples.push(poseAt(u))
  }
  const tracks: THREE.KeyframeTrack[] = []
  for (const bone of bones) {
    const values: number[] = []
    for (const p of samples) {
      const r = p.rot[bone] ?? [0, 0, 0]
      quat.setFromEuler(euler.set(r[0], r[1], r[2]))
      values.push(quat.x, quat.y, quat.z, quat.w)
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, values))
  }
  if (heights) {
    tracks.push(new THREE.VectorKeyframeTrack('quadril.position', times, samples.flatMap((p) => [0, p.quadrilY ?? HIPS_HEIGHT, 0])))
    tracks.push(new THREE.VectorKeyframeTrack('corpo.position', times, samples.flatMap((p) => [0, p.corpoY ?? 0, 0])))
  }
  return new THREE.AnimationClip(name, duration, tracks)
}

/** Todos os clipes do personagem (gerados). */
export function buildClips(): THREE.AnimationClip[] {
  const still = (name: ClipName, bones: readonly BoneName[], heights: boolean) => clipFrom(name, 0.5, 1, () => STATIC[name], bones, heights)
  return [
    clipFrom('parado', 3.2, 16, idlePose, LOWER_BONES, true),
    clipFrom('andar', 1.1, 24, (u) => gait(u, 0.55, 0), LOWER_BONES, true),
    clipFrom('correr', 0.72, 24, (u) => gait(u, 1.0, 0), LOWER_BONES, true),
    clipFrom('disparar', 0.6, 24, (u) => gait(u, 1.25, 0.12), LOWER_BONES, true),
    clipFrom('agachado', 0.5, 1, () => crouchGait(0, 0), LOWER_BONES, true),
    clipFrom('agachado-andar', 1.0, 24, (u) => crouchGait(u, 0.8), LOWER_BONES, true),
    still('ar', LOWER_BONES, true),
    still('deslize', LOWER_BONES, true),
    clipFrom('nado', 1.6, 24, swimPose, [...LOWER_BONES, ...ARM_BONES], true),
    still('queda-livre', [...LOWER_BONES, ...ARM_BONES], true),
    still('planar', [...LOWER_BONES, ...ARM_BONES], true),
    still('bracos-soltos', ARM_BONES, false),
    clipFrom('bracos-andar', 1.0, 24, (u) => armSwing(u, 1), ARM_BONES, false),
    still('segurar-arma', ARM_BONES, false),
    still('mirar', ARM_BONES, false),
    still('picareta', ARM_BONES, false),
    clipFrom('golpe', SWING_TIME, 20, swingPose, ARM_BONES, false),
  ]
}
