import * as THREE from 'three'
import { ITEM } from '../shared/config/items'
import { MAIN_MAP_ID, loadMap } from '../shared/maps'
import type { GameMap } from '../shared/maps/types'
import { CharFlag } from '../shared/movement/character'
import { CharacterModel, SKINS } from './character/character-model'
import { loadCharacterAsset } from './character/character-assets'
import { Effects } from './game/effects'
import { PostPipeline } from './render/post'
import { WorldView } from './render/world-view'
import { recommend } from './benchmark-score'
import { QUALITY, type Quality } from './settings'

/**
 * Teste de desempenho dentro do jogo: o mesmo percurso, com cada qualidade
 * gráfica, medindo quadros por segundo de verdade (requestAnimationFrame) e
 * o custo de CPU de cada quadro. Três tomadas que representam a partida:
 *
 *   1. Cidade Esquecida, no nível da rua (prédios, adereços, personagens)
 *   2. Mata Fechada, na altura dos olhos (árvores, grama, sombras)
 *   3. Salto do dirigível: vista alta da ilha inteira (distância de desenho)
 *
 * Personagens animados correm na frente da câmera e explosões acontecem a
 * cada 2 s (partículas, luz, marcas). Ao final, recomenda a maior qualidade
 * que mantém o jogo fluido.
 */

export interface BenchmarkOptions {
  qualities: Quality[]
  /** Segundos medidos por qualidade (mais 1,5 s de aquecimento). */
  seconds: number
  renderScale: number
  /** Onde pôr o canvas (tela cheia, atrás das telas). */
  container: HTMLElement
  onProgress?: (p: { quality: Quality; index: number; total: number; fraction: number; shot: string }) => void
  /** Interrompe (o resultado parcial é descartado). */
  signal?: AbortSignal
}

export interface QualityResult {
  quality: Quality
  label: string
  frames: number
  avgFps: number
  /** Média dos 1% piores quadros, em quadros por segundo. */
  low1Fps: number
  p95Ms: number
  /** Tempo de CPU por quadro (atualização + envio dos comandos de desenho). */
  cpuMs: number
  drawCalls: number
  triangles: number
  width: number
  height: number
}

export interface BenchmarkResult {
  at: number
  renderScale: number
  gpu: string
  results: QualityResult[]
  /** Qualidades puladas porque uma mais leve já ficou lenta demais. */
  skipped: Quality[]
  recommended: Quality
  /** Sugestão extra quando nem a qualidade baixa fica fluida. */
  suggestScale: number | null
}

interface Shot {
  name: string
  from: THREE.Vector3
  to: THREE.Vector3
  /** Para onde a câmera olha (relativo ao movimento: à frente e um pouco para baixo). */
  pitch: number
  actors: boolean
}

const WARMUP_S = 1.5
/** Abaixo disto, as qualidades mais pesadas nem são testadas. */
const SKIP_BELOW_FPS = 12
const ORDER: Quality[] = ['baixa', 'media', 'alta']
const STORE_KEY = 'ultima-chama:desempenho:v1'

function shotsFor(map: GameMap): Shot[] {
  const region = (id: string) => map.regions.find((r) => r.id === id)
  const at = (x: number, z: number, h: number) => new THREE.Vector3(x, map.terrain.heightAt(x, z) + h, z)
  const city = region('cidade') ?? { x: 0, z: 0, radius: 150 }
  const forest = region('mata') ?? { x: city.x + 200, z: city.z, radius: 120 }
  const r = Math.min(70, city.radius * 0.4)
  const fr = Math.min(50, forest.radius * 0.35)
  const bound = map.world.bound
  return [
    { name: 'Cidade (rua)', from: at(city.x - r, city.z + r * 0.3, 2.2), to: at(city.x + r, city.z - r * 0.2, 2.6), pitch: -0.04, actors: true },
    { name: 'Mata (altura dos olhos)', from: at(forest.x - fr, forest.z - fr * 0.4, 1.8), to: at(forest.x + fr, forest.z + fr * 0.5, 1.8), pitch: -0.02, actors: true },
    { name: 'Salto (vista alta)', from: new THREE.Vector3(-bound * 0.55, 230, bound * 0.5), to: new THREE.Vector3(bound * 0.25, 170, -bound * 0.1), pitch: -0.42, actors: false },
  ]
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
}

function gpuName(renderer: THREE.WebGLRenderer): string {
  const gl = renderer.getContext()
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  return String(name ?? 'desconhecida').slice(0, 120)
}

/** Uma qualidade: cria renderizador e mundo, aquece, mede e desmonta. */
async function runQuality(map: GameMap, q: Quality, index: number, opts: BenchmarkOptions, gpu: { name: string }): Promise<QualityResult> {
  const quality = QUALITY[q]
  const canvas = document.createElement('canvas')
  canvas.className = 'game benchmark-canvas'
  // atrás das telas (a camada da interface continua por cima)
  opts.container.insertBefore(canvas, opts.container.querySelector(':scope > .ui-layer'))
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance' })
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = quality.shadows
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio) * opts.renderScale)
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.info.autoReset = false
  gpu.name ||= gpuName(renderer)
  const world = new WorldView(map, renderer, quality)
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, quality.drawDistance)
  camera.rotation.order = 'YXZ'
  const post = quality.post !== 'nenhum' ? new PostPipeline(renderer, world.scene, camera, quality.post) : null
  const fx = new Effects(world.scene, map.world, opts.container, quality.particles)
  const chars = Array.from({ length: 10 }, (_, k) => {
    const m = new CharacterModel(SKINS[k % SKINS.length])
    m.setHeld([ITEM.Rifle, ITEM.Smg, ITEM.Shotgun, ITEM.Sniper, ITEM.Pickaxe][k % 5], 3)
    world.scene.add(m.root)
    return m
  })
  const shots = shotsFor(map)
  const total = WARMUP_S + opts.seconds
  const shotLen = opts.seconds / shots.length
  const frameMs: number[] = []
  let cpuSum = 0
  let callsSum = 0
  let trisSum = 0
  let measured = 0
  let fxTimer = 0
  const focus = new THREE.Vector3()
  const dir = new THREE.Vector3()

  await new Promise<void>((done, fail) => {
    let start = -1
    let last = 0
    const frame = (now: number) => {
      if (opts.signal?.aborted) return fail(new DOMException('cancelado', 'AbortError'))
      if (start < 0) {
        start = now
        last = now
      }
      const t = (now - start) / 1000
      const dt = Math.min(0.1, (now - last) / 1000)
      // intervalo entre quadros, só depois do aquecimento
      if ((last - start) / 1000 >= WARMUP_S) frameMs.push(now - last)
      last = now
      if (t >= total) return done()
      // aquecimento: primeira tomada parada (compila os shaders de tudo que aparece)
      const mt = Math.max(0, t - WARMUP_S)
      const si = Math.min(shots.length - 1, Math.floor(mt / shotLen))
      const shot = shots[si]
      const f = t < WARMUP_S ? 0 : (mt - si * shotLen) / shotLen
      const c0 = performance.now()
      camera.position.lerpVectors(shot.from, shot.to, f)
      dir.subVectors(shot.to, shot.from).normalize()
      camera.rotation.set(shot.pitch, Math.atan2(-dir.x, -dir.z), 0)
      // personagens correndo em roda, 8–18 m à frente da câmera
      chars.forEach((m, k) => {
        m.root.visible = shot.actors
        if (!shot.actors) return
        const ang = t * 0.9 + (k / chars.length) * Math.PI * 2
        const cx = camera.position.x + dir.x * 13 + Math.cos(ang) * 5
        const cz = camera.position.z + dir.z * 13 + Math.sin(ang) * 5
        const yaw = ang + Math.PI
        m.update({ x: cx, y: map.terrain.heightAt(cx, cz), z: cz, vx: -Math.sin(ang) * 6, vy: 0, vz: Math.cos(ang) * 6, yaw, pitch: 0, flags: CharFlag.Grounded | CharFlag.Sprinting }, dt)
      })
      fxTimer -= dt
      if (shot.actors && fxTimer <= 0) {
        fxTimer = 2
        const p = new THREE.Vector3(camera.position.x + dir.x * 22, 0, camera.position.z + dir.z * 22)
        p.y = map.terrain.heightAt(p.x, p.z) + 0.3
        fx.explosion(p, 4)
        for (let k = 0; k < 4; k++) fx.tracer(camera.position.clone().add(new THREE.Vector3(0, -0.4, 0)), p.clone().add(new THREE.Vector3(k - 1.5, 1, 0)))
      }
      fx.update(dt, camera, window.innerWidth, window.innerHeight)
      focus.copy(camera.position)
      world.update(focus, camera, t)
      renderer.info.reset()
      if (post) {
        post.setSize(window.innerWidth, window.innerHeight)
        post.render(dt)
      } else renderer.render(world.scene, camera)
      if (t >= WARMUP_S) {
        cpuSum += performance.now() - c0
        callsSum += renderer.info.render.calls
        trisSum += renderer.info.render.triangles
        measured++
      }
      opts.onProgress?.({ quality: q, index, total: opts.qualities.length, fraction: Math.min(1, t / total), shot: t < WARMUP_S ? 'Preparando' : shot.name })
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }).finally(() => {
    for (const m of chars) m.dispose()
    fx.dispose()
    post?.dispose()
    world.dispose()
    renderer.dispose()
    renderer.forceContextLoss()
    canvas.remove()
  })
  const sorted = [...frameMs].sort((a, b) => a - b)
  const elapsed = frameMs.reduce((a, b) => a + b, 0)
  const worst = sorted.slice(Math.floor(sorted.length * 0.99))
  const worstAvg = worst.length ? worst.reduce((a, b) => a + b, 0) / worst.length : 0
  const size = new THREE.Vector2()
  renderer.getDrawingBufferSize(size)
  return {
    quality: q, label: quality.label, frames: frameMs.length,
    avgFps: elapsed > 0 ? (frameMs.length * 1000) / elapsed : 0,
    low1Fps: worstAvg > 0 ? 1000 / worstAvg : 0,
    p95Ms: percentile(sorted, 0.95),
    cpuMs: measured ? cpuSum / measured : 0,
    drawCalls: measured ? Math.round(callsSum / measured) : 0,
    triangles: measured ? Math.round(trisSum / measured) : 0,
    width: Math.round(window.innerWidth * Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio) * opts.renderScale),
    height: Math.round(window.innerHeight * Math.min(window.devicePixelRatio || 1, quality.maxPixelRatio) * opts.renderScale),
  }
}

export async function runBenchmark(opts: BenchmarkOptions): Promise<BenchmarkResult> {
  opts = { ...opts, qualities: [...new Set(opts.qualities)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)) }
  await loadCharacterAsset()
  const map = loadMap(MAIN_MAP_ID)
  const gpu = { name: '' }
  const results: QualityResult[] = []
  const skipped: Quality[] = []
  for (let i = 0; i < opts.qualities.length; i++) {
    // as qualidades vão da mais leve à mais pesada: se uma já ficou muito lenta, as seguintes não valem a espera
    const prev = results.at(-1)
    if (prev && prev.avgFps < SKIP_BELOW_FPS) {
      skipped.push(...opts.qualities.slice(i))
      break
    }
    results.push(await runQuality(map, opts.qualities[i], i, opts, gpu))
  }
  const rec = recommend(results, opts.renderScale)
  const out: BenchmarkResult = { at: Date.now(), renderScale: opts.renderScale, gpu: gpu.name, results, skipped, recommended: rec.quality, suggestScale: rec.suggestScale }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(out))
  } catch {
    // armazenamento cheio ou bloqueado: o resultado continua na tela
  }
  return out
}

export function lastBenchmark(): BenchmarkResult | null {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    return raw ? (JSON.parse(raw) as BenchmarkResult) : null
  } catch {
    return null
  }
}
