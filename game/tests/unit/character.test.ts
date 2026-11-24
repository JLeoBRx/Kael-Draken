import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildGeneratedTemplate, parseCharacterGlb, validateAsset } from '../../src/client/character/character-assets'
import { CharacterModel, SKINS, type PoseInput } from '../../src/client/character/character-model'
import { writeCharacterGlb } from '../../src/client/character/glb-writer'
import { BONE_NAMES, CLIP_NAMES, GAIT_CLIPS, MATERIAL_SLOTS, buildBodyGeometry, buildClips } from '../../src/client/character/rig'
import { CharFlag } from '../../src/shared/movement/character'

describe('personagem com esqueleto', () => {
  it('malha com pesos válidos, um grupo por material, ossos e clipes completos', () => {
    const g = buildBodyGeometry()
    expect(g.index).toBeTruthy()
    expect(g.groups).toHaveLength(MATERIAL_SLOTS.length)
    const si = g.getAttribute('skinIndex')
    const sw = g.getAttribute('skinWeight')
    for (let k = 0; k < sw.count; k++) {
      expect(sw.getX(k) + sw.getY(k) + sw.getZ(k) + sw.getW(k)).toBeCloseTo(1, 5)
      expect(si.getX(k)).toBeLessThan(BONE_NAMES.length)
    }
    // juntas suaves: há vértices divididos entre dois ossos (cotovelos, joelhos, cintura)
    let shared = 0
    for (let k = 0; k < sw.count; k++) if (sw.getY(k) > 0.1) shared++
    expect(shared).toBeGreaterThan(50)
    const clips = buildClips()
    expect(clips.map((c) => c.name).sort()).toEqual([...CLIP_NAMES].sort())
    for (const c of clips) {
      expect(c.validate()).toBe(true)
      for (const t of c.tracks) expect(BONE_NAMES).toContain(t.name.split('.')[0])
    }
    expect(validateAsset(buildGeneratedTemplate(), clips)).toEqual([])
  })

  it('exporta para GLB e o GLTFLoader devolve o mesmo esqueleto, materiais e clipes', async () => {
    const template = buildGeneratedTemplate()
    const clips = buildClips()
    const glb = writeCharacterGlb(template, clips)
    expect(new TextDecoder().decode(glb.subarray(0, 4))).toBe('glTF')
    const asset = await parseCharacterGlb(glb.slice().buffer)
    expect(asset.source).toBe('glb')
    const src = template.getObjectByName('cotovelo_D')!
    const got = asset.template.getObjectByName('cotovelo_D')!
    expect(got.position.toArray()).toEqual(src.position.toArray().map((v) => expect.closeTo(v, 5)))
    const names = new Set<string>()
    asset.template.traverse((o) => {
      const m = (o as THREE.Mesh).material
      for (const mm of Array.isArray(m) ? m : m ? [m] : []) names.add(mm.name)
    })
    expect([...names].sort()).toEqual([...MATERIAL_SLOTS].sort())
    expect(asset.clips.map((c) => c.name).sort()).toEqual([...CLIP_NAMES].sort())
    const run = asset.clips.find((c) => c.name === 'correr')!
    const orig = clips.find((c) => c.name === 'correr')!
    expect(run.duration).toBeCloseTo(orig.duration, 4)
    const t = run.tracks.find((k) => k.name.endsWith('coxa_E.quaternion'))!
    const o = orig.tracks.find((k) => k.name === 'coxa_E.quaternion')!
    expect(Array.from(t.values.slice(0, 8))).toEqual(Array.from(o.values.slice(0, 8)).map((v) => expect.closeTo(v, 5)))
  })

  it('o GLB publicado no jogo está atualizado com o gerado (npm run assets)', async () => {
    const file = readFileSync(resolve(__dirname, '../../public/arte/personagens/personagem.glb'))
    const asset = await parseCharacterGlb(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
    expect(validateAsset(asset.template, asset.clips)).toEqual([])
    const fresh = writeCharacterGlb(buildGeneratedTemplate(), buildClips())
    expect(file.byteLength).toBe(fresh.byteLength)
  })

  it('mistura os clipes pelo estado: parado → corre → agacha → pula → planador', () => {
    const m = new CharacterModel(SKINS[2])
    const pose: PoseInput = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, flags: CharFlag.Grounded }
    const settle = (p: PoseInput, frames = 60) => {
      for (let k = 0; k < frames; k++) m.update(p, 1 / 60)
      return m.clipWeights()
    }
    const lowerSum = (w: Record<string, number>) => ['parado', 'andar', 'correr', 'disparar', 'agachado', 'agachado-andar', 'ar', 'deslize', 'nado', 'queda-livre', 'planar'].reduce((s, n) => s + (w[n] ?? 0), 0)
    const idle = settle(pose)
    expect(idle.parado).toBeCloseTo(1, 2)
    expect(lowerSum(idle)).toBeCloseTo(1, 2)
    const run = settle({ ...pose, vz: -6 })
    expect(run.correr).toBeGreaterThan(0.6)
    expect(run.parado ?? 0).toBeLessThan(0.05)
    expect(lowerSum(run)).toBeCloseTo(1, 2)
    const crouch = settle({ ...pose, flags: CharFlag.Grounded | CharFlag.Crouched })
    expect(crouch.agachado).toBeGreaterThan(0.9)
    const air = settle({ ...pose, vy: 3, flags: 0 })
    expect(air.ar).toBeGreaterThan(0.9)
    const glide = settle({ ...pose, vz: -10, flags: CharFlag.Gliding }, 120)
    expect(glide.planar).toBeGreaterThan(0.9)
    // planando, os braços são do planador (a camada dos braços cede)
    expect(glide['bracos-soltos'] ?? 0).toBeLessThan(0.1)
    // arma na mão e mirando
    m.setHeld(2, 1)
    const aim = settle({ ...pose, flags: CharFlag.Grounded | CharFlag.Aiming })
    expect(aim.mirar).toBeGreaterThan(0.9)
    m.dispose()
  })

  it('clipes de passada seguem a fase (os pés não escorregam ao misturar andar e correr)', () => {
    for (const n of GAIT_CLIPS) expect(CLIP_NAMES).toContain(n)
    const m = new CharacterModel(SKINS[0])
    const knee = () => {
      const q = new THREE.Quaternion()
      m.root.getObjectByName('joelho_E')!.getWorldQuaternion(q)
      return q
    }
    const p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: -4, yaw: 0, pitch: 0, flags: CharFlag.Grounded }
    const seen: number[] = []
    for (let k = 0; k < 90; k++) {
      m.update(p, 1 / 60)
      seen.push(knee().angleTo(new THREE.Quaternion()))
    }
    // o joelho dobra e estica ao longo da passada
    expect(Math.max(...seen) - Math.min(...seen)).toBeGreaterThan(0.4)
    m.dispose()
  })
})
