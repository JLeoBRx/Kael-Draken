/**
 * Cena tridimensional do Atlas (three.js), carregada sob demanda.
 *
 * O terreno é deslocado pelo mesmo mapa de altura que gerou as cartas 2D,
 * e recebe como textura a própria carta da versão escolhida — por isso o
 * mapa "ganha relevo" sem trocar de imagem. As zonas dos reinos são
 * desenhadas numa textura composta e recortadas pela máscara de terra.
 *
 * Toda a geografia é conceitual (ver src/data/atlas/world.json).
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { pointInPolygon, type Point } from '@/lib/atlas/world'

export interface Region3D {
  id: string
  name: string
  accent: string
  polygon: Point[]
  label: Point
  erased: boolean
}

export interface World3DOptions {
  container: HTMLElement
  labelLayer: HTMLElement
  heightmapUrl: string
  heightmapSize: [number, number]
  seaLevel: number
  /** Proporção largura/altura da carta (e do relevo). */
  aspect: number
  textureUrl: string
  maskUrl: string
  regions: Region3D[]
  selectedId: string | null
  reducedMotion: boolean
  lowPower: boolean
  labelText: { erased: string }
  /** A carta já traz os nomes desenhados: rótulos viram marcadores discretos, com o nome no foco ou na seleção. */
  compactLabels?: boolean
  onSelect: (id: string | null) => void
  onHover?: (id: string | null) => void
  onContextLost: () => void
}

export interface World3D {
  enter(): Promise<void>
  exit(): Promise<void>
  setSelected(id: string | null, focus?: boolean): void
  setVersion(textureUrl: string, regions: Region3D[]): Promise<void>
  zoom(factor: number): void
  rotate(radians: number): void
  tilt(radians: number): void
  resetView(): void
  dispose(): void
}

const WZ = 10
const HSCALE = 1.3
const BASE_Y = -0.75

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Falha ao carregar ${src}`))
    img.src = src
  })
}

function readPixels(img: HTMLImageElement, w = img.naturalWidth, h = img.naturalHeight): Uint8ClampedArray {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export async function createWorld3D(opts: World3DOptions): Promise<World3D> {
  const { container, labelLayer } = opts
  const WX = WZ * opts.aspect
  let regions = opts.regions
  let selectedId = opts.selectedId
  let hoveredId: string | null = null
  let disposed = false

  // ── Dados: relevo e máscara de terra ──────────────────────────────────
  const [hmImg, maskImg] = await Promise.all([loadImage(opts.heightmapUrl), loadImage(opts.maskUrl)])
  const [HW, HH] = opts.heightmapSize
  const hmPx = readPixels(hmImg, HW, HH)
  const heights = new Float32Array(HW * HH)
  for (let i = 0; i < HW * HH; i++) heights[i] = (hmPx[i * 4] * 256 + hmPx[i * 4 + 1]) / 65535
  const MW = 600
  const MH = Math.round(600 / opts.aspect)
  const maskPx = readPixels(maskImg, MW, MH)

  const sampleHeight = (u: number, v: number) => {
    const x = Math.min(HW - 1.001, Math.max(0, u * (HW - 1)))
    const y = Math.min(HH - 1.001, Math.max(0, v * (HH - 1)))
    const x0 = Math.floor(x)
    const y0 = Math.floor(y)
    const fx = x - x0
    const fy = y - y0
    const i = y0 * HW + x0
    const a = heights[i] * (1 - fx) + heights[i + 1] * fx
    const b = heights[i + HW] * (1 - fx) + heights[i + HW + 1] * fx
    return a * (1 - fy) + b * fy
  }
  const elevation = (u: number, v: number) => (sampleHeight(u, v) - opts.seaLevel) * HSCALE
  const isLand = (u: number, v: number) => {
    const x = Math.min(MW - 1, Math.max(0, Math.round(u * (MW - 1))))
    const y = Math.min(MH - 1, Math.max(0, Math.round(v * (MH - 1))))
    return maskPx[(y * MW + x) * 4] > 127
  }

  // ── Renderizador ──────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: !opts.lowPower, alpha: false, powerPreference: opts.lowPower ? 'low-power' : 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.lowPower ? 1 : 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setClearColor(0x0b0a09, 1)
  const canvas = renderer.domElement
  canvas.className = 'world3d__canvas'
  canvas.tabIndex = 0
  canvas.setAttribute('role', 'application')
  canvas.setAttribute('aria-label', 'Mapa tridimensional conceitual. Arraste para girar, use a pinça ou a roda para aproximar e toque em uma região para ver detalhes. Setas giram a câmera; + e − aproximam.')
  container.appendChild(canvas)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x0b0a09, 26, 46)

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
  scene.add(new THREE.HemisphereLight(0xfff1dc, 0x2a2018, 1.15))
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.1)
  sun.position.set(-7, 11, -5)
  scene.add(sun)

  // ── Terreno ───────────────────────────────────────────────────────────
  const segX = opts.lowPower ? 200 : 360
  const segZ = Math.round((segX * WZ) / WX)
  const geometry = new THREE.PlaneGeometry(WX, WZ, segX, segZ)
  geometry.rotateX(-Math.PI / 2)
  const pos = geometry.attributes.position as THREE.BufferAttribute
  const uv = geometry.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) pos.setY(i, elevation(uv.getX(i), 1 - uv.getY(i)))
  geometry.computeVertexNormals()

  // Textura composta: carta + zonas conceituais recortadas pela terra
  const texSize = opts.lowPower ? 1200 : 2048
  const tex = document.createElement('canvas')
  tex.width = texSize
  tex.height = Math.round(texSize / (WX / WZ))
  const texCtx = tex.getContext('2d')!
  const overlay = document.createElement('canvas')
  overlay.width = tex.width
  overlay.height = tex.height
  const overCtx = overlay.getContext('2d')!
  let baseMap = await loadImage(opts.textureUrl)
  const texture = new THREE.CanvasTexture(tex)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())

  const drawTexture = () => {
    const W = tex.width
    const H = tex.height
    texCtx.drawImage(baseMap, 0, 0, W, H)
    overCtx.clearRect(0, 0, W, H)
    for (const r of regions) {
      const path = new Path2D()
      r.polygon.forEach(([u, v], i) => (i ? path.lineTo(u * W, v * H) : path.moveTo(u * W, v * H)))
      path.closePath()
      const active = r.id === selectedId
      const hover = r.id === hoveredId
      if (r.erased) {
        overCtx.fillStyle = active ? 'rgba(235,228,212,0.55)' : hover ? 'rgba(235,228,212,0.35)' : 'rgba(235,228,212,0)'
      } else {
        overCtx.fillStyle = r.accent
        overCtx.globalAlpha = active ? 0.42 : hover ? 0.26 : 0.1
      }
      overCtx.fill(path)
      overCtx.globalAlpha = 1
      overCtx.setLineDash(active ? [] : [W * 0.006, W * 0.005])
      overCtx.lineWidth = active ? W * 0.0028 : W * 0.0014
      overCtx.strokeStyle = active ? '#f5ead0' : 'rgba(40,28,18,0.7)'
      overCtx.stroke(path)
    }
    overCtx.globalCompositeOperation = 'destination-in'
    overCtx.drawImage(maskImg, 0, 0, W, H)
    overCtx.globalCompositeOperation = 'source-over'
    texCtx.drawImage(overlay, 0, 0)
    texture.needsUpdate = true
  }
  drawTexture()

  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95, metalness: 0 })
  const terrain = new THREE.Mesh(geometry, material)
  const group = new THREE.Group()
  group.add(terrain)

  // Laterais da maquete
  const skirtPositions: number[] = []
  const edge = (u0: number, v0: number, u1: number, v1: number, steps: number) => {
    for (let k = 0; k < steps; k++) {
      const ua = u0 + ((u1 - u0) * k) / steps
      const va = v0 + ((v1 - v0) * k) / steps
      const ub = u0 + ((u1 - u0) * (k + 1)) / steps
      const vb = v0 + ((v1 - v0) * (k + 1)) / steps
      const xa = (ua - 0.5) * WX
      const za = (va - 0.5) * WZ
      const xb = (ub - 0.5) * WX
      const zb = (vb - 0.5) * WZ
      const ya = elevation(ua, va)
      const yb = elevation(ub, vb)
      skirtPositions.push(xa, ya, za, xa, BASE_Y, za, xb, yb, zb, xb, yb, zb, xa, BASE_Y, za, xb, BASE_Y, zb)
    }
  }
  edge(0, 1, 1, 1, segX)
  edge(1, 1, 1, 0, segZ)
  edge(1, 0, 0, 0, segX)
  edge(0, 0, 0, 1, segZ)
  const skirtGeometry = new THREE.BufferGeometry()
  skirtGeometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3))
  skirtGeometry.computeVertexNormals()
  const skirtMaterial = new THREE.MeshStandardMaterial({ color: 0x2a211a, roughness: 1, side: THREE.DoubleSide })
  group.add(new THREE.Mesh(skirtGeometry, skirtMaterial))
  const baseGeometry = new THREE.PlaneGeometry(WX, WZ)
  baseGeometry.rotateX(Math.PI / 2)
  const base = new THREE.Mesh(baseGeometry, skirtMaterial)
  base.position.y = BASE_Y
  group.add(base)
  scene.add(group)

  // Água
  const waterGeometry = new THREE.PlaneGeometry(WX, WZ)
  waterGeometry.rotateX(-Math.PI / 2)
  const waterMaterial = new THREE.MeshStandardMaterial({ color: 0x5f7f86, roughness: 0.25, metalness: 0.15, transparent: true, opacity: 0 })
  const water = new THREE.Mesh(waterGeometry, waterMaterial)
  water.position.y = 0.006
  scene.add(water)

  // Mesa (contexto escuro sob a maquete)
  const tableGeometry = new THREE.CircleGeometry(40, 48)
  tableGeometry.rotateX(-Math.PI / 2)
  const tableMaterial = new THREE.MeshStandardMaterial({ color: 0x14110e, roughness: 1 })
  const table = new THREE.Mesh(tableGeometry, tableMaterial)
  table.position.y = BASE_Y - 0.01
  scene.add(table)

  // ── Câmera e controles ────────────────────────────────────────────────
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = !opts.reducedMotion
  controls.dampingFactor = 0.08
  controls.rotateSpeed = 0.6
  controls.zoomSpeed = 0.9
  controls.panSpeed = 0.7
  controls.screenSpacePanning = false
  controls.minDistance = 3.5
  controls.maxDistance = 28
  controls.minPolarAngle = 0.08
  controls.maxPolarAngle = 1.28
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
  controls.enabled = false

  const topDistance = () => {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * 2
    return Math.max(WZ / t, WX / (t * camera.aspect)) * 1.02
  }
  const topPose = () => ({ pos: new THREE.Vector3(0, topDistance(), 0.0001), target: new THREE.Vector3(0, 0, 0) })
  const homePose = () => {
    const d = Math.max(13, topDistance() * 0.8)
    return { pos: new THREE.Vector3(0, d * 0.72, d * 0.75), target: new THREE.Vector3(0, 0, 0.4) }
  }

  const resize = () => {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    requestRender()
  }

  // ── Rótulos em HTML ───────────────────────────────────────────────────
  const labelEls = new Map<string, HTMLButtonElement>()
  const buildLabels = () => {
    labelLayer.replaceChildren()
    labelEls.clear()
    for (const r of regions) {
      const el = document.createElement('button')
      el.type = 'button'
      const pin = !!opts.compactLabels && !r.erased
      el.className = `world3d__label${r.erased ? ' is-erased' : ''}${pin ? ' world3d__label--pin' : ''}`
      el.dataset.region = r.id
      if (pin) {
        const mark = document.createElement('span')
        mark.className = 'world3d__pin'
        mark.setAttribute('aria-hidden', 'true')
        const name = document.createElement('span')
        name.className = 'world3d__name'
        name.textContent = r.name
        el.append(mark, name)
      } else {
        el.textContent = r.erased ? opts.labelText.erased : r.name
      }
      el.setAttribute('aria-label', r.erased ? `${opts.labelText.erased} — região apagada da história oficial` : `${r.name} — ver detalhes`)
      el.addEventListener('click', () => opts.onSelect(r.id))
      labelLayer.appendChild(el)
      labelEls.set(r.id, el)
    }
  }
  buildLabels()
  const tmp = new THREE.Vector3()
  const updateLabels = () => {
    const w = container.clientWidth
    const h = container.clientHeight
    for (const r of regions) {
      const el = labelEls.get(r.id)
      if (!el) continue
      const [u, v] = r.label
      tmp.set((u - 0.5) * WX, Math.max(0, elevation(u, v)) * group.scale.y + 0.25, (v - 0.5) * WZ)
      tmp.project(camera)
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05
      el.style.opacity = visible ? String(labelOpacity) : '0'
      el.style.visibility = visible && labelOpacity > 0.02 ? 'visible' : 'hidden'
      el.style.transform = `translate(-50%, -100%) translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`
      el.classList.toggle('is-active', r.id === selectedId)
    }
  }

  // ── Laço de renderização sob demanda ──────────────────────────────────
  let needsRender = true
  let labelOpacity = 0
  const animations = new Set<(now: number) => boolean>()
  function requestRender() {
    needsRender = true
  }
  controls.addEventListener('change', () => {
    clampTarget()
    requestRender()
  })
  const clampTarget = () => {
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -WX / 2, WX / 2)
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -WZ / 2, WZ / 2)
    controls.target.y = 0
  }
  renderer.setAnimationLoop((now) => {
    if (disposed) return
    for (const step of [...animations]) if (!step(now)) animations.delete(step)
    const moved = controls.enabled ? controls.update() : false
    if (needsRender || moved || animations.size) {
      renderer.render(scene, camera)
      updateLabels()
      needsRender = false
      // Estado da câmera exposto para testes automatizados e depuração.
      canvas.dataset.distance = camera.position.distanceTo(controls.target).toFixed(2)
      canvas.dataset.azimuth = controls.getAzimuthalAngle().toFixed(3)
    }
  })

  // Movimento de câmera em curso: um novo comando substitui o anterior (o último pedido vence)
  let cameraAnim: { step: (now: number) => boolean; resolve: () => void } | null = null

  const animate = (duration: number, frame: (t: number) => void, exclusive = false) =>
    new Promise<void>((resolve) => {
      if (exclusive && cameraAnim) {
        animations.delete(cameraAnim.step)
        cameraAnim.resolve()
        cameraAnim = null
      }
      if (opts.reducedMotion || duration <= 0) {
        frame(1)
        requestRender()
        resolve()
        return
      }
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        frame(ease(t))
        if (t >= 1) {
          if (cameraAnim?.step === step) cameraAnim = null
          resolve()
          return false
        }
        return true
      }
      animations.add(step)
      if (exclusive) cameraAnim = { step, resolve }
    })

  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3, duration = 900) => {
    const p0 = camera.position.clone()
    const t0 = controls.target.clone()
    return animate(
      duration,
      (t) => {
        camera.position.lerpVectors(p0, pos, t)
        controls.target.lerpVectors(t0, target, t)
        camera.lookAt(controls.target)
      },
      true,
    )
  }

  // Comandos dados durante a entrada esperam o relevo se erguer; e, se houve
  // algum, a câmera não voa sozinha até a região selecionada ao final.
  let entering: Promise<void> | null = null
  let interacted = false
  const whenReady = (fn: () => void) => {
    if (entering) {
      interacted = true
      void entering.then(fn)
    } else fn()
  }

  // ── Seleção por toque/clique ──────────────────────────────────────────
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const pick = (clientX: number, clientY: number): string | null => {
    const rect = canvas.getBoundingClientRect()
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.intersectObject(terrain, false)[0]
    if (!hit?.uv) return null
    const u = hit.uv.x
    const v = 1 - hit.uv.y
    if (!isLand(u, v)) return null
    for (const r of regions) if (pointInPolygon(u, v, r.polygon)) return r.id
    return null
  }
  let down: { x: number; y: number; t: number; label: string | null } | null = null
  let forwardedLabel: string | null = null
  const onPointerDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now(), label: forwardedLabel }
    forwardedLabel = null
  }
  const onPointerUp = (e: PointerEvent) => {
    if (!down || !controls.enabled) return
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y)
    if (moved < 7 && performance.now() - down.t < 600) opts.onSelect(down.label ?? pick(e.clientX, e.clientY))
    down = null
  }
  // Em telas de toque os rótulos cobrem parte do terreno: um gesto que começa
  // sobre um deles é repassado aos controles da câmera (girar, pinçar). Um toque
  // curto continua selecionando a região do rótulo, via onPointerUp.
  const onLabelPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' || !controls.enabled) return
    const label = (e.target as HTMLElement).closest<HTMLElement>('.world3d__label')
    if (!label) return
    forwardedLabel = label.dataset.region ?? null
    canvas.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: e.pointerId,
        pointerType: e.pointerType,
        isPrimary: e.isPrimary,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        button: e.button,
        buttons: e.buttons,
        width: e.width,
        height: e.height,
        pressure: e.pressure,
      }),
    )
  }
  let hoverFrame = 0
  const onPointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !controls.enabled || hoverFrame) return
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0
      const id = pick(e.clientX, e.clientY)
      canvas.style.cursor = id ? 'pointer' : 'grab'
      if (id !== hoveredId) {
        hoveredId = id
        opts.onHover?.(id)
        drawTexture()
        requestRender()
      }
    })
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (!controls.enabled) return
    const actions: Record<string, () => void> = {
      ArrowLeft: () => api.rotate(-0.25),
      ArrowRight: () => api.rotate(0.25),
      ArrowUp: () => api.tilt(-0.12),
      ArrowDown: () => api.tilt(0.12),
      '+': () => api.zoom(0.8),
      '=': () => api.zoom(0.8),
      '-': () => api.zoom(1.25),
      '0': () => api.resetView(),
      Escape: () => opts.onSelect(null),
    }
    const action = actions[e.key]
    if (action) {
      e.preventDefault()
      action()
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown)
  labelLayer.addEventListener('pointerdown', onLabelPointerDown)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('keydown', onKeyDown)

  const onContextLost = (e: Event) => {
    e.preventDefault()
    renderer.setAnimationLoop(null)
    opts.onContextLost()
  }
  canvas.addEventListener('webglcontextlost', onContextLost)

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  // Pose inicial: vista de cima, terreno plano — idêntica à carta 2D
  const start = topPose()
  camera.position.copy(start.pos)
  controls.target.copy(start.target)
  camera.lookAt(controls.target)
  group.scale.y = 0.001

  const regionFocus = (id: string) => {
    const r = regions.find((x) => x.id === id)
    if (!r) return null
    const [u, v] = r.label
    const target = new THREE.Vector3((u - 0.5) * WX, 0, (v - 0.5) * WZ)
    const offset = camera.position.clone().sub(controls.target)
    const dist = THREE.MathUtils.clamp(offset.length(), 8, 12)
    offset.setLength(dist)
    return { pos: target.clone().add(offset), target }
  }

  const api: World3D = {
    async enter() {
      const home = homePose()
      canvas.classList.add('is-visible')
      interacted = false
      entering = animate(1700, (t) => {
        group.scale.y = Math.max(0.001, t)
        waterMaterial.opacity = t * 0.42
        labelOpacity = t
        camera.position.lerpVectors(start.pos, home.pos, t)
        controls.target.lerpVectors(start.target, home.target, t)
        camera.lookAt(controls.target)
      })
      await entering
      entering = null
      controls.enabled = true
      if (selectedId && !interacted) {
        const f = regionFocus(selectedId)
        if (f) await flyTo(f.pos, f.target, 700)
      }
      canvas.focus({ preventScroll: true })
    },
    async exit() {
      controls.enabled = false
      const p0 = camera.position.clone()
      const t0 = controls.target.clone()
      const top = topPose()
      await animate(1000, (t) => {
        group.scale.y = Math.max(0.001, 1 - t)
        waterMaterial.opacity = (1 - t) * 0.42
        labelOpacity = 1 - t
        camera.position.lerpVectors(p0, top.pos, t)
        controls.target.lerpVectors(t0, top.target, t)
        camera.lookAt(controls.target)
      })
      canvas.classList.remove('is-visible')
    },
    setSelected(id, focus = true) {
      selectedId = id
      drawTexture()
      requestRender()
      if (id && focus && (controls.enabled || entering)) {
        whenReady(() => {
          const f = regionFocus(id)
          if (f) void flyTo(f.pos, f.target, 800)
        })
      }
    },
    async setVersion(textureUrl, nextRegions) {
      baseMap = await loadImage(textureUrl)
      regions = nextRegions
      buildLabels()
      drawTexture()
      requestRender()
    },
    zoom(factor) {
      whenReady(() => {
        const offset = camera.position.clone().sub(controls.target)
        const len = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance)
        offset.setLength(len)
        void flyTo(controls.target.clone().add(offset), controls.target.clone(), 350)
      })
    },
    rotate(radians) {
      whenReady(() => {
        const offset = camera.position.clone().sub(controls.target)
        offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), radians)
        void flyTo(controls.target.clone().add(offset), controls.target.clone(), 400)
      })
    },
    tilt(radians) {
      whenReady(() => {
        const offset = camera.position.clone().sub(controls.target)
        const sph = new THREE.Spherical().setFromVector3(offset)
        sph.phi = THREE.MathUtils.clamp(sph.phi + radians, controls.minPolarAngle, controls.maxPolarAngle)
        offset.setFromSpherical(sph)
        void flyTo(controls.target.clone().add(offset), controls.target.clone(), 350)
      })
    },
    resetView() {
      whenReady(() => {
        const home = homePose()
        void flyTo(home.pos, home.target, 800)
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      renderer.setAnimationLoop(null)
      if (hoverFrame) cancelAnimationFrame(hoverFrame)
      observer.disconnect()
      canvas.removeEventListener('pointerdown', onPointerDown)
      labelLayer.removeEventListener('pointerdown', onLabelPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('keydown', onKeyDown)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      controls.dispose()
      for (const g of [geometry, skirtGeometry, baseGeometry, waterGeometry, tableGeometry]) g.dispose()
      for (const m of [material, skirtMaterial, waterMaterial, tableMaterial]) m.dispose()
      texture.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
      labelLayer.replaceChildren()
    },
  }
  return api
}
