import * as THREE from 'three'

/**
 * Exportador GLB mínimo para o personagem: uma SkinnedMesh (um primitivo por
 * grupo de material), o esqueleto (nós com nome, posição e rotação de
 * repouso), as matrizes de ligação e os clipes (rotação/translação dos
 * ossos, interpolação linear). Roda no Node (sem DOM): é o que
 * `npm run assets` usa para gravar arte/personagens/personagem.glb.
 */

const FLOAT = 5126
const USHORT = 5123
const UINT = 5125
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963

interface Accessor {
  bufferView: number
  byteOffset?: number
  componentType: number
  count: number
  type: 'SCALAR' | 'VEC3' | 'VEC4' | 'MAT4'
  min?: number[]
  max?: number[]
}

export function writeCharacterGlb(root: THREE.Object3D, clips: readonly THREE.AnimationClip[]): Uint8Array {
  let mesh: THREE.SkinnedMesh | null = null
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !mesh) mesh = o as THREE.SkinnedMesh
  })
  if (!mesh) throw new Error('nenhuma SkinnedMesh para exportar')
  const sk: THREE.SkinnedMesh = mesh
  const geo = sk.geometry
  if (!geo.index) throw new Error('esperava geometria com índices (a do personagem gerado)')
  const index = geo.index
  const bones = sk.skeleton.bones

  const chunks: Uint8Array[] = []
  let binLength = 0
  const bufferViews: { buffer: 0; byteOffset: number; byteLength: number; target?: number }[] = []
  const accessors: Accessor[] = []
  const view = (bytes: Uint8Array, target?: number) => {
    const pad = (4 - (binLength % 4)) % 4
    if (pad) {
      chunks.push(new Uint8Array(pad))
      binLength += pad
    }
    bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: bytes.byteLength, ...(target ? { target } : {}) })
    chunks.push(bytes)
    binLength += bytes.byteLength
    return bufferViews.length - 1
  }
  const bytesOf = (a: Float32Array | Uint16Array | Uint32Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength)

  // ---- nós: o grupo, a malha e os ossos
  const nodes: Record<string, unknown>[] = []
  const nodeIndex = new Map<THREE.Object3D, number>()
  nodes.push({ name: root.name || 'personagem', children: [] as number[] })
  nodes.push({ name: sk.name || 'corpo-malha', mesh: 0, skin: 0 })
  ;(nodes[0].children as number[]).push(1)
  const addBone = (b: THREE.Bone): number => {
    const idx = nodes.length
    nodeIndex.set(b, idx)
    const node: Record<string, unknown> = { name: b.name }
    if (b.position.lengthSq() > 0) node.translation = b.position.toArray()
    if (b.quaternion.w !== 1) node.rotation = b.quaternion.toArray()
    nodes.push(node)
    const kids = b.children.filter((c) => (c as THREE.Bone).isBone).map((c) => addBone(c as THREE.Bone))
    if (kids.length) node.children = kids
    return idx
  }
  const rootBone = bones.find((b) => !(b.parent as THREE.Bone | null)?.isBone)!
  ;(nodes[0].children as number[]).push(addBone(rootBone))

  // ---- atributos compartilhados; cada primitivo é uma faixa dos índices
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute
  const si = geo.getAttribute('skinIndex') as THREE.BufferAttribute
  const sw = geo.getAttribute('skinWeight') as THREE.BufferAttribute
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let k = 0; k < pos.count; k++) {
    const p = [pos.getX(k), pos.getY(k), pos.getZ(k)]
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i])
      max[i] = Math.max(max[i], p[i])
    }
  }
  const shared = (bytes: Uint8Array, componentType: number, type: Accessor['type'], extra: Partial<Accessor> = {}) => {
    accessors.push({ bufferView: view(bytes, ARRAY_BUFFER), componentType, count: pos.count, type, ...extra })
    return accessors.length - 1
  }
  const attributes = {
    POSITION: shared(bytesOf(new Float32Array(pos.array)), FLOAT, 'VEC3', { min, max }),
    NORMAL: shared(bytesOf(new Float32Array(nor.array)), FLOAT, 'VEC3'),
    JOINTS_0: shared(bytesOf(new Uint16Array(si.array)), USHORT, 'VEC4'),
    WEIGHTS_0: shared(bytesOf(new Float32Array(sw.array)), FLOAT, 'VEC4'),
  }
  const wide = pos.count > 65535
  const indexView = view(bytesOf(wide ? new Uint32Array(index.array) : new Uint16Array(index.array)), ELEMENT_ARRAY_BUFFER)
  const groups = geo.groups.length ? geo.groups : [{ start: 0, count: index.count, materialIndex: 0 }]
  const materials = Array.isArray(sk.material) ? sk.material : [sk.material]
  const primitives = groups.map((g) => {
    accessors.push({ bufferView: indexView, byteOffset: g.start * (wide ? 4 : 2), componentType: wide ? UINT : USHORT, count: g.count, type: 'SCALAR' })
    return { attributes, indices: accessors.length - 1, material: g.materialIndex ?? 0 }
  })

  // ---- pele: ossos e matrizes inversas de ligação
  const ibm = new Float32Array(bones.length * 16)
  sk.skeleton.boneInverses.forEach((m, k) => m.toArray(ibm, k * 16))
  accessors.push({ bufferView: view(bytesOf(ibm)), componentType: FLOAT, count: bones.length, type: 'MAT4' })
  const skin = { joints: bones.map((b) => nodeIndex.get(b)!), inverseBindMatrices: accessors.length - 1, skeleton: nodeIndex.get(rootBone)! }

  // ---- clipes
  const byName = new Map(bones.map((b) => [b.name, b]))
  const animations = clips.map((clip) => {
    const samplers: { input: number; output: number; interpolation: 'LINEAR' }[] = []
    const channels: { sampler: number; target: { node: number; path: string } }[] = []
    for (const track of clip.tracks) {
      const [boneName, prop] = track.name.split('.')
      const bone = byName.get(boneName)
      const path = prop === 'quaternion' ? 'rotation' : prop === 'position' ? 'translation' : null
      if (!bone || !path) continue
      const times = new Float32Array(track.times)
      accessors.push({ bufferView: view(bytesOf(times)), componentType: FLOAT, count: times.length, type: 'SCALAR', min: [times[0]], max: [times[times.length - 1]] })
      const input = accessors.length - 1
      const values = new Float32Array(track.values)
      accessors.push({ bufferView: view(bytesOf(values)), componentType: FLOAT, count: times.length, type: path === 'rotation' ? 'VEC4' : 'VEC3' })
      samplers.push({ input, output: accessors.length - 1, interpolation: 'LINEAR' })
      channels.push({ sampler: samplers.length - 1, target: { node: nodeIndex.get(bone)!, path } })
    }
    return { name: clip.name, samplers, channels }
  })

  const json = {
    asset: { version: '2.0', generator: 'Última Chama — personagem gerado (rig.ts)' },
    scene: 0,
    scenes: [{ name: 'cena', nodes: [0] }],
    nodes,
    meshes: [{ name: 'corpo', primitives }],
    skins: [skin],
    materials: materials.map((m) => {
      const std = m as THREE.MeshStandardMaterial
      return { name: m.name, pbrMetallicRoughness: { baseColorFactor: [std.color?.r ?? 1, std.color?.g ?? 1, std.color?.b ?? 1, 1], metallicFactor: std.metalness ?? 0, roughnessFactor: std.roughness ?? 1 } }
    }),
    animations,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }],
  }

  // ---- GLB: cabeçalho + JSON (espaços) + BIN (zeros), alinhados em 4
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4
  const binPad = (4 - (binLength % 4)) % 4
  const total = 12 + 8 + jsonBytes.length + jsonPad + 8 + binLength + binPad
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  dv.setUint32(0, 0x46546c67, true) // 'glTF'
  dv.setUint32(4, 2, true)
  dv.setUint32(8, total, true)
  dv.setUint32(12, jsonBytes.length + jsonPad, true)
  dv.setUint32(16, 0x4e4f534a, true) // 'JSON'
  out.set(jsonBytes, 20)
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonBytes.length + jsonPad)
  let o = 20 + jsonBytes.length + jsonPad
  dv.setUint32(o, binLength + binPad, true)
  dv.setUint32(o + 4, 0x004e4942, true) // 'BIN\0'
  o += 8
  for (const c of chunks) {
    out.set(c, o)
    o += c.byteLength
  }
  return out
}
