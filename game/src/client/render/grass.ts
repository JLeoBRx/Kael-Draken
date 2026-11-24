import * as THREE from 'three'
import type { StaticBox } from '../../shared/maps/types'
import type { Heightfield } from '../../shared/world/heightfield'
import type { TerrainFields } from './terrain-mesh'

/**
 * Grama de verdade perto da câmera: uma única chamada de desenho com N
 * lâminas instanciadas numa grade que "dá a volta" em torno da câmera em
 * coordenadas do MUNDO (a lâmina não anda junto com quem olha). A GPU busca
 * a altura do chão, a densidade (só onde a camada é grama e não há
 * construção, estrada ou água) e a cor do chão em texturas do mapa.
 *
 * Vento: cada lâmina verga pela ponta com rajadas que atravessam o campo.
 * Longe, as lâminas encolhem até sumir (sem borda visível).
 */

/**
 * Tufo de 3 lâminas afinando. Atributos: position.x = largura relativa,
 * position.y = altura relativa (0–1); `tuft` = deslocamento da lâmina no
 * tufo (x, z), giro próprio e escala de altura.
 */
function tuftGeometry(): THREE.BufferGeometry {
  const blade = [-0.5, 0, 0.5, 0, -0.34, 0.55, 0.34, 0.55, 0, 1]
  const layout = [
    [0, 0, 0, 1],
    [0.09, 0.06, 2.1, 0.82],
    [-0.07, 0.08, 4.2, 0.7],
  ]
  const pos: number[] = []
  const tuft: number[] = []
  const index: number[] = []
  layout.forEach((l, b) => {
    for (let v = 0; v < 5; v++) {
      pos.push(blade[v * 2], blade[v * 2 + 1], 0)
      tuft.push(l[0], l[1], l[2], l[3])
    }
    const o = b * 5
    index.push(o, o + 1, o + 2, o + 2, o + 1, o + 3, o + 2, o + 3, o + 4)
  })
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(Array.from({ length: pos.length / 3 }, () => [0, 1, 0]).flat(), 3))
  g.setAttribute('tuft', new THREE.Float32BufferAttribute(tuft, 4))
  g.setIndex(index)
  return g
}

/** Densidade de grama (0–1) por amostra do relevo: camada de grama, fora da água e de construções. */
function densityMask(hf: Heightfield, fields: TerrainFields, boxes: readonly StaticBox[], waterLevel: number): Uint8Array {
  const n = hf.n
  const out = new Uint8Array(n * n)
  for (let k = 0; k < n * n; k++) {
    const s = fields.splat
    const grass = Math.max(0, 1 - (s[k * 4] + s[k * 4 + 1] + s[k * 4 + 2] + s[k * 4 + 3]))
    const h = hf.heights[k]
    const dry = h > waterLevel + 0.4 ? 1 : 0
    out[k] = Math.round(Math.min(1, grass * 1.15) * dry * 255)
  }
  // caixas apoiadas no chão (ruas, calçadas, pisos, prédios) tiram a grama de baixo
  for (const b of boxes) {
    const o = b.obb
    const ex = Math.abs(o.ux) * o.hx + Math.abs(o.vx) * o.hy + Math.abs(o.wx) * o.hz
    const ez = Math.abs(o.uz) * o.hx + Math.abs(o.vz) * o.hy + Math.abs(o.wz) * o.hz
    const ey = Math.abs(o.uy) * o.hx + Math.abs(o.vy) * o.hy + Math.abs(o.wy) * o.hz
    const bottom = o.cy - ey
    const i0 = Math.max(0, Math.floor((o.cx - ex - 0.5 - hf.min) / hf.cell))
    const i1 = Math.min(n - 1, Math.ceil((o.cx + ex + 0.5 - hf.min) / hf.cell))
    const j0 = Math.max(0, Math.floor((o.cz - ez - 0.5 - hf.min) / hf.cell))
    const j1 = Math.min(n - 1, Math.ceil((o.cz + ez + 0.5 - hf.min) / hf.cell))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (bottom < hf.heights[j * n + i] + 0.8) out[j * n + i] = 0
      }
    }
  }
  return out
}

export class GrassField {
  readonly mesh: THREE.Mesh
  private readonly material: THREE.MeshLambertMaterial
  private readonly uniforms: Record<string, THREE.IUniform>
  private readonly textures: THREE.Texture[] = []

  constructor(hf: Heightfield, fields: TerrainFields, boxes: readonly StaticBox[], waterLevel: number, count: number, radius: number) {
    const n = hf.n
    const heightTex = new THREE.DataTexture(hf.heights, n, n, THREE.RedFormat, THREE.FloatType)
    heightTex.needsUpdate = true
    const mask = densityMask(hf, fields, boxes, waterLevel)
    const colorData = new Uint8Array(n * n * 4)
    for (let k = 0; k < n * n; k++) {
      // cor linear do bioma, guardada em 0–255 com folga (×0.5) para tons claros
      colorData[k * 4] = Math.min(255, Math.round(fields.colors[k * 3] * 2 * 255))
      colorData[k * 4 + 1] = Math.min(255, Math.round(fields.colors[k * 3 + 1] * 2 * 255))
      colorData[k * 4 + 2] = Math.min(255, Math.round(fields.colors[k * 3 + 2] * 2 * 255))
      colorData[k * 4 + 3] = mask[k]
    }
    const groundTex = new THREE.DataTexture(colorData, n, n, THREE.RGBAFormat)
    groundTex.magFilter = groundTex.minFilter = THREE.LinearFilter
    groundTex.needsUpdate = true
    this.textures.push(heightTex, groundTex)

    // lâminas numa grade com sorteio (posição local no quadrado de lado 2R)
    const side = radius * 2
    const base = tuftGeometry()
    const geo = new THREE.InstancedBufferGeometry()
    geo.index = base.index
    geo.setAttribute('position', base.getAttribute('position'))
    geo.setAttribute('normal', base.getAttribute('normal'))
    geo.setAttribute('tuft', base.getAttribute('tuft'))
    const offsets = new Float32Array(count * 4)
    let s = 0x9e3779b9
    const rnd = () => {
      s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0
      return (s >>> 8) / 16777216
    }
    const per = Math.ceil(Math.sqrt(count))
    for (let k = 0; k < count; k++) {
      const gx = (k % per) + rnd()
      const gz = Math.floor(k / per) + rnd()
      offsets[k * 4] = (gx / per) * side
      offsets[k * 4 + 1] = (gz / per) * side
      offsets[k * 4 + 2] = rnd() * Math.PI * 2 // giro
      offsets[k * 4 + 3] = rnd() // semente (altura, cor, fase do vento, sorteio da densidade)
    }
    geo.setAttribute('blade', new THREE.InstancedBufferAttribute(offsets, 4))
    geo.instanceCount = count

    this.uniforms = {
      uHeight: { value: heightTex },
      uGround: { value: groundTex },
      uN: { value: n },
      uCell: { value: hf.cell },
      uMin: { value: hf.min },
      uCenter: { value: new THREE.Vector2() },
      uSide: { value: side },
      uRadius: { value: radius },
      uTime: { value: 0 },
    }
    const m = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = /* glsl */ `
        attribute vec4 blade;
        attribute vec4 tuft;
        uniform sampler2D uHeight;
        uniform sampler2D uGround;
        uniform float uN;
        uniform float uCell;
        uniform float uMin;
        uniform vec2 uCenter;
        uniform float uSide;
        uniform float uRadius;
        uniform float uTime;
        varying vec3 vGrassColor;
        float hAt(vec2 g) {
          ivec2 c = ivec2(clamp(g, vec2(0.0), vec2(uN - 1.0)));
          return texelFetch(uHeight, c, 0).r;
        }
        float heightAt(vec2 w) {
          vec2 g = (w - uMin) / uCell;
          vec2 f = fract(g);
          vec2 i = floor(g);
          float a = hAt(i), b = hAt(i + vec2(1.0, 0.0)), c = hAt(i + vec2(0.0, 1.0)), d = hAt(i + vec2(1.0, 1.0));
          // mesma triangulação do relevo (diagonal (i+1,j)–(i,j+1))
          return f.x + f.y <= 1.0 ? a + (b - a) * f.x + (c - a) * f.y : d + (c - d) * (1.0 - f.x) + (b - d) * (1.0 - f.y);
        }
      ` + shader.vertexShader
        .replace('#include <beginnormal_vertex>', /* glsl */ `
          // posição da lâmina no mundo: a grade dá a volta em torno da câmera
          vec2 wpos = uCenter + mod(blade.xy - uCenter + uSide * 0.5, uSide) - uSide * 0.5;
          vec4 ground = texture2D(uGround, (wpos - uMin) / uCell / uN + 0.5 / uN);
          float dist = length(wpos - uCenter);
          float keep = step(blade.w, ground.a * 0.98) * (1.0 - smoothstep(uRadius * 0.45, uRadius, dist));
          float bladeH = (0.26 + fract(blade.w * 7.31) * 0.4) * tuft.w * keep;
          vec3 objectNormal = normalize(vec3(sin(blade.z) * 0.3, 1.0, cos(blade.z) * 0.3));
        `)
        .replace('#include <begin_vertex>', /* glsl */ `
          float t = position.y;
          float rot = blade.z + tuft.z;
          float cs = cos(rot), sn = sin(rot);
          float tc = cos(blade.z), ts = sin(blade.z);
          vec2 inTuft = vec2(tuft.x * tc - tuft.y * ts, tuft.x * ts + tuft.y * tc) * keep;
          wpos += inTuft;
          vec2 across = vec2(cs, sn) * position.x * 0.07 * keep;
          // vento: rajadas que atravessam o campo + tremor de cada lâmina
          float gust = sin(uTime * 1.3 + wpos.x * 0.07 + wpos.y * 0.05) * 0.5 + 0.5;
          float sway = (sin(uTime * 2.6 + blade.w * 6.28 + wpos.x * 0.4) * 0.35 + gust * 0.75) * t * t;
          vec2 lean = vec2(0.8, 0.5) * sway * bladeH * 0.55 + vec2(sn, -cs) * t * t * bladeH * 0.18;
          vec3 transformed = vec3(wpos.x + across.x + lean.x, heightAt(wpos) - 0.04 + t * bladeH, wpos.y + across.y + lean.y);
          // raiz escura (some no chão), ponta mais clara e às vezes amarelada
          float dryTip = smoothstep(0.75, 1.0, fract(blade.w * 13.7)) * t;
          vGrassColor = ground.rgb * 0.5 * mix(0.5, 1.12, t) * (0.82 + fract(blade.w * 3.7) * 0.32);
          vGrassColor = mix(vGrassColor, vGrassColor * vec3(1.35, 1.2, 0.7), dryTip * 0.6);
        `)
        .replace('#include <project_vertex>', /* glsl */ `
          vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        `)
        .replace('#include <worldpos_vertex>', /* glsl */ `
          vec4 worldPosition = vec4(transformed, 1.0);
        `)
      shader.fragmentShader = 'varying vec3 vGrassColor;\n' + shader.fragmentShader
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = vGrassColor;')
        // os dois lados da lâmina recebem a mesma luz (normal para cima, sem inverter)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n normal = normalize(vNormal);')
    }
    m.customProgramCacheKey = () => 'grama'
    this.material = m
    this.mesh = new THREE.Mesh(geo, m)
    this.mesh.frustumCulled = false
    this.mesh.receiveShadow = true
    this.mesh.castShadow = false
    this.mesh.name = 'grama'
  }

  update(camera: THREE.Camera, elapsed: number): void {
    ;(this.uniforms.uCenter.value as THREE.Vector2).set(camera.position.x, camera.position.z)
    this.uniforms.uTime.value = elapsed
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.material.dispose()
    for (const t of this.textures) t.dispose()
  }
}
