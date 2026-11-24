import * as THREE from 'three'
import { MAIN_MAP_ID, loadMap } from '../shared/maps'
import { CharFlag } from '../shared/movement/character'
import { ITEM } from '../shared/config/items'
import { CharacterModel, SKINS } from './character/character-model'
import { loadCharacterAsset } from './character/character-assets'
import { PostPipeline } from './render/post'
import { Effects } from './game/effects'
import { WorldView } from './render/world-view'
import { QUALITY, type Quality } from './settings'

/**
 * Modo foto (ferramenta de desenvolvimento): `?foto=<mapa>&x=&z=&h=&yaw=&pitch=&q=&chars=`
 * desenha o mapa de um ponto fixo, com personagens posados na frente da
 * câmera, sem partida nem servidor. Serve para capturas, para comparar
 * mudanças visuais e para medir chamadas de desenho.
 *
 * `window.__FOTO__` informa quando o primeiro quadro saiu e os números do
 * renderizador.
 */

declare global {
  interface Window {
    __FOTO__?: { ready: boolean; frames: number; info: () => { calls: number; triangles: number; ms: number } }
  }
}

const POSES: { flags: number; speed: number; item: number; aim: boolean }[] = [
  { flags: CharFlag.Grounded, speed: 0, item: ITEM.Rifle, aim: false },
  { flags: CharFlag.Grounded | CharFlag.Sprinting, speed: 7.5, item: ITEM.Smg, aim: false },
  { flags: CharFlag.Grounded | CharFlag.Aiming, speed: 0, item: ITEM.Sniper, aim: true },
  { flags: CharFlag.Grounded | CharFlag.Crouched, speed: 2, item: ITEM.Shotgun, aim: false },
  { flags: CharFlag.Grounded, speed: 0, item: ITEM.Pickaxe, aim: false },
  { flags: CharFlag.Grounded, speed: 4.5, item: 255, aim: false },
]

export async function startPhotoMode(root: HTMLElement, params: URLSearchParams): Promise<void> {
  await loadCharacterAsset()
  const num = (k: string, d: number) => {
    const v = Number(params.get(k))
    return params.has(k) && Number.isFinite(v) ? v : d
  }
  const q = (params.get('q') ?? 'alta') as Quality
  const quality = { ...(QUALITY[q] ?? QUALITY.alta) }
  // chaves para isolar problemas: grama=0, pos=nenhum|basico|completo
  if (params.get('grama') === '0') quality.grass = 0
  const postParam = params.get('pos')
  if (postParam === 'nenhum' || postParam === 'basico' || postParam === 'completo') quality.post = postParam
  const map = loadMap(params.get('foto') || MAIN_MAP_ID)
  const canvas = document.createElement('canvas')
  canvas.className = 'game'
  root.append(canvas)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = quality.shadows
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio))
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  // contagem do quadro inteiro (o pós-processamento faz várias passadas)
  renderer.info.autoReset = false
  const world = new WorldView(map, renderer, quality)
  const camera = new THREE.PerspectiveCamera(num('fov', 70), window.innerWidth / window.innerHeight, 0.08, quality.drawDistance)
  camera.rotation.order = 'YXZ'
  const x = num('x', map.spawns[0]?.x ?? 0)
  const z = num('z', map.spawns[0]?.z ?? 0)
  const ground = map.terrain.heightAt(x, z)
  camera.position.set(x, ground + num('h', 1.9), z)
  camera.rotation.set(num('pitch', -0.08), num('yaw', 0), 0)
  const post = quality.post !== 'nenhum' ? new PostPipeline(renderer, world.scene, camera, quality.post) : null

  // personagens em fila na frente da câmera
  const count = Math.min(POSES.length, num('chars', 0))
  const fwd = new THREE.Vector3(-Math.sin(camera.rotation.y), 0, -Math.cos(camera.rotation.y))
  const side = new THREE.Vector3(fwd.z, 0, -fwd.x)
  const chars: { model: CharacterModel; pose: (typeof POSES)[number]; x: number; z: number }[] = []
  for (let k = 0; k < count; k++) {
    const model = new CharacterModel(SKINS[k % SKINS.length])
    const off = (k - (count - 1) / 2) * 1.6
    const cx = x + fwd.x * num('dist', 6) + side.x * off
    const cz = z + fwd.z * num('dist', 6) + side.z * off
    const pose = POSES[k]
    model.setHeld(pose.item, 3)
    world.scene.add(model.root)
    chars.push({ model, pose, x: cx, z: cz })
  }

  // fx=1: explosão e tiros na frente da câmera, repetidos (para ver partículas e marcas)
  const fx = params.get('fx') === '1' ? new Effects(world.scene, map.world, root, quality.particles) : null
  ;(window as unknown as { __FX__?: unknown }).__FX__ = fx
  const fxAt = new THREE.Vector3(x + fwd.x * num('dist', 9), 0, z + fwd.z * num('dist', 9))
  fxAt.y = map.terrain.heightAt(fxAt.x, fxAt.z) + 0.3
  let fxTimer = 0
  const focus = new THREE.Vector3(x, ground, z)
  const t0 = performance.now()
  let frames = 0
  let last = t0
  let ms = 0
  let calls = 0
  let triangles = 0
  const info = { ready: false, frames: 0, info: () => ({ calls, triangles, ms }) }
  window.__FOTO__ = info
  const loop = () => {
    const now = performance.now()
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    const t = num('t', (now - t0) / 1000)
    for (const c of chars) {
      // de frente para a câmera
      const yaw = Math.atan2(c.x - x, c.z - z)
      const facing = { x: -Math.sin(yaw), z: -Math.cos(yaw) }
      const sp = c.pose.speed
      c.model.update({
        x: c.x, y: map.terrain.heightAt(c.x, c.z), z: c.z,
        vx: facing.x * sp, vy: 0, vz: facing.z * sp, yaw, pitch: c.pose.aim ? -0.05 : 0, flags: c.pose.flags,
      }, dt)
    }
    if (fx) {
      fxTimer -= dt
      if (fxTimer <= 0) {
        fxTimer = num('fxEvery', 3)
        fx.explosion(fxAt, 4.5)
        for (let k = 0; k < 6; k++) {
          const target = fxAt.clone().add(new THREE.Vector3(side.x * (k - 2.5) * 1.2, 0.2 - fxAt.y + map.terrain.heightAt(fxAt.x + side.x * (k - 2.5) * 1.2, fxAt.z + side.z * (k - 2.5) * 1.2), side.z * (k - 2.5) * 1.2))
          fx.impact(target, 'world', camera.position)
        }
      }
      fx.update(dt, camera, window.innerWidth, window.innerHeight)
    }
    world.update(focus, camera, t)
    renderer.info.reset()
    const r0 = performance.now()
    if (post) {
      post.setSize(window.innerWidth, window.innerHeight)
      post.render(dt)
    } else renderer.render(world.scene, camera)
    ms = ms ? ms * 0.9 + (performance.now() - r0) * 0.1 : performance.now() - r0
    calls = renderer.info.render.calls
    triangles = renderer.info.render.triangles
    frames++
    info.frames = frames
    if (frames >= 3) info.ready = true
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
