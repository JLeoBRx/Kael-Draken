import * as THREE from 'three'

/**
 * Partículas em quadrados voltados para a câmera, instanciados (uma chamada
 * de desenho por pool). Dois tipos de mistura:
 *
 * - 'brilho' (aditiva): fogo, faíscas, clarões — somam luz;
 * - 'fumaca' (alfa): fumaça, poeira, vapor — cobrem o que está atrás.
 *
 * Cada partícula tem tamanho inicial/final, giro, cor, opacidade, gravidade
 * e arrasto; a simulação é na CPU com arrays fixos (nada é alocado por
 * efeito) e a GPU só desenha. Respeita a neblina da cena.
 */

export type ParticleBlend = 'brilho' | 'fumaca'

export interface ParticleSpec {
  x: number
  y: number
  z: number
  vx?: number
  vy?: number
  vz?: number
  life: number
  size: number
  /** Tamanho no fim da vida (padrão: igual ao inicial). */
  sizeEnd?: number
  r: number
  g: number
  b: number
  /** Opacidade inicial (some até 0 no fim). */
  alpha?: number
  /** m/s² para baixo (negativo sobe: fumaça quente). */
  gravity?: number
  /** Fração da velocidade perdida por segundo. */
  drag?: number
  spin?: number
}

const STRIDE = 20

function softTexture(kind: ParticleBlend): THREE.Texture {
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)
  let seed = kind === 'fumaca' ? 7 : 3
  const rnd = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    return seed / 4294967296
  }
  // ruído suave (bolhas) para a fumaça não parecer um disco
  const blobs = Array.from({ length: 14 }, () => ({ x: 0.3 + rnd() * 0.4, y: 0.3 + rnd() * 0.4, r: 0.12 + rnd() * 0.18 }))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size
      const v = (y + 0.5) / size
      const d = Math.hypot(u - 0.5, v - 0.5) * 2
      let a: number
      if (kind === 'brilho') a = Math.pow(Math.max(0, 1 - d), 2.2)
      else {
        let m = 0
        for (const b of blobs) m = Math.max(m, 1 - Math.hypot(u - b.x, v - b.y) / b.r)
        a = Math.max(0, Math.min(1, m * 1.4)) * Math.pow(Math.max(0, 1 - d), 1.2)
      }
      const k = (y * size + x) * 4
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255
      img.data[k + 3] = Math.round(a * 255)
    }
  }
  ctx.putImageData(img, 0, 0)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  return t
}

export class ParticlePool {
  readonly mesh: THREE.Mesh
  private readonly data: Float32Array
  private readonly iPos: THREE.InstancedBufferAttribute
  private readonly iCol: THREE.InstancedBufferAttribute
  private readonly iPar: THREE.InstancedBufferAttribute
  private readonly geo: THREE.InstancedBufferGeometry
  private readonly material: THREE.ShaderMaterial
  private readonly texture: THREE.Texture
  private count = 0

  constructor(scene: THREE.Scene, readonly max: number, readonly blend: ParticleBlend) {
    this.data = new Float32Array(max * STRIDE)
    const quad = new THREE.PlaneGeometry(1, 1)
    this.geo = new THREE.InstancedBufferGeometry()
    this.geo.index = quad.index
    this.geo.setAttribute('position', quad.getAttribute('position'))
    this.geo.setAttribute('uv', quad.getAttribute('uv'))
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage)
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage)
    this.iPar = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage)
    this.geo.setAttribute('iPos', this.iPos)
    this.geo.setAttribute('iCol', this.iCol)
    this.geo.setAttribute('iPar', this.iPar)
    this.geo.instanceCount = 0
    this.texture = softTexture(blend)
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      blending: blend === 'brilho' ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: null } }]),
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec4 iCol;
        attribute vec2 iPar;
        varying vec2 vUv;
        varying vec4 vCol;
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vCol = iCol;
          vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
          float c = cos(iPar.y), s = sin(iPar.y);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iPar.x;
          mvPosition.xy += p;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying vec4 vCol;
        #include <fog_pars_fragment>
        void main() {
          float a = texture2D(uMap, vUv).a * vCol.a;
          if (a < 0.004) discard;
          gl_FragColor = vec4(vCol.rgb, a);
          #include <fog_fragment>
        }`,
    })
    this.material.uniforms.uMap.value = this.texture
    this.mesh = new THREE.Mesh(this.geo, this.material)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = blend === 'brilho' ? 3 : 2
    this.mesh.name = `particulas-${blend}`
    scene.add(this.mesh)
  }

  get active(): number {
    return this.count
  }

  spawn(p: ParticleSpec): void {
    // cheio: substitui a mais antiga (índice 0 é a mais antiga só aproximadamente; basta para efeitos)
    const k = this.count < this.max ? this.count++ : Math.floor(Math.random() * this.max)
    const o = k * STRIDE
    const d = this.data
    d[o] = p.x
    d[o + 1] = p.y
    d[o + 2] = p.z
    d[o + 3] = p.vx ?? 0
    d[o + 4] = p.vy ?? 0
    d[o + 5] = p.vz ?? 0
    d[o + 6] = p.life
    d[o + 7] = p.life
    d[o + 8] = p.size
    d[o + 9] = p.sizeEnd ?? p.size
    d[o + 10] = p.r
    d[o + 11] = p.g
    d[o + 12] = p.b
    d[o + 13] = p.alpha ?? 1
    d[o + 14] = p.gravity ?? 0
    d[o + 15] = p.drag ?? 0
    d[o + 16] = Math.random() * Math.PI * 2
    d[o + 17] = p.spin ?? 0
  }

  update(dt: number): void {
    const d = this.data
    let n = 0
    for (let k = 0; k < this.count; k++) {
      const o = k * STRIDE
      const life = d[o + 6] - dt
      if (life <= 0) continue
      // compacta: copia a viva para a posição n
      if (n !== k) d.copyWithin(n * STRIDE, o, o + STRIDE)
      const q = n * STRIDE
      d[q + 6] = life
      const drag = Math.max(0, 1 - d[q + 15] * dt)
      d[q + 3] *= drag
      d[q + 4] = d[q + 4] * drag - d[q + 14] * dt
      d[q + 5] *= drag
      d[q] += d[q + 3] * dt
      d[q + 1] += d[q + 4] * dt
      d[q + 2] += d[q + 5] * dt
      d[q + 16] += d[q + 17] * dt
      n++
    }
    this.count = n
    const pos = this.iPos.array as Float32Array
    const col = this.iCol.array as Float32Array
    const par = this.iPar.array as Float32Array
    for (let k = 0; k < n; k++) {
      const o = k * STRIDE
      const t = 1 - d[o + 6] / d[o + 7]
      pos[k * 3] = d[o]
      pos[k * 3 + 1] = d[o + 1]
      pos[k * 3 + 2] = d[o + 2]
      col[k * 4] = d[o + 10]
      col[k * 4 + 1] = d[o + 11]
      col[k * 4 + 2] = d[o + 12]
      // entra rápido e some devagar
      col[k * 4 + 3] = d[o + 13] * Math.min(1, t * 12) * (1 - t) * (1 - t * 0.3)
      par[k * 2] = d[o + 8] + (d[o + 9] - d[o + 8]) * t
      par[k * 2 + 1] = d[o + 16]
    }
    this.geo.instanceCount = n
    if (n > 0) {
      this.iPos.addUpdateRange(0, n * 3)
      this.iCol.addUpdateRange(0, n * 4)
      this.iPar.addUpdateRange(0, n * 2)
      this.iPos.needsUpdate = true
      this.iCol.needsUpdate = true
      this.iPar.needsUpdate = true
    }
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.geo.dispose()
    this.material.dispose()
    this.texture.dispose()
  }
}

/**
 * Marcas de tiro nas superfícies (decalques): um anel de N marcas
 * reaproveitadas, encostadas na superfície pela normal do impacto.
 */
export class DecalPool {
  readonly mesh: THREE.InstancedMesh
  private cursor = 0
  private readonly texture: THREE.Texture
  private readonly m = new THREE.Matrix4()
  private readonly q = new THREE.Quaternion()
  private readonly s = new THREE.Vector3()
  private readonly z = new THREE.Vector3(0, 0, 1)
  private readonly n = new THREE.Vector3()

  constructor(scene: THREE.Scene, readonly max = 160) {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 30)
    g.addColorStop(0, 'rgba(10,10,10,0.95)')
    g.addColorStop(0.35, 'rgba(25,22,20,0.8)')
    g.addColorStop(0.6, 'rgba(60,55,50,0.35)')
    g.addColorStop(1, 'rgba(60,55,50,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
    this.texture = new THREE.CanvasTexture(c)
    this.texture.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.MeshStandardMaterial({ map: this.texture, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, max)
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 1
    this.mesh.name = 'marcas-de-tiro'
    scene.add(this.mesh)
  }

  add(x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number): void {
    this.n.set(nx, ny, nz).normalize()
    this.q.setFromUnitVectors(this.z, this.n)
    const spin = new THREE.Quaternion().setFromAxisAngle(this.n, Math.random() * Math.PI * 2)
    this.q.premultiply(spin)
    this.s.setScalar(size * (0.8 + Math.random() * 0.4))
    this.m.compose(new THREE.Vector3(x + nx * 0.01, y + ny * 0.01, z + nz * 0.01), this.q, this.s)
    const k = this.cursor++ % this.max
    this.mesh.setMatrixAt(k, this.m)
    this.mesh.count = Math.min(this.max, this.cursor)
    this.mesh.instanceMatrix.needsUpdate = true
  }

  /** Remove as marcas (construção destruída etc. não fica com furo flutuando: limpeza geral). */
  clear(): void {
    this.cursor = 0
    this.mesh.count = 0
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.texture.dispose()
  }
}
