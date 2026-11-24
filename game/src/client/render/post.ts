import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

/**
 * Pós-processamento da cena:
 *
 *   cena (HDR linear, MSAA 4×) → [GTAO, só na qualidade alta] → brilho (bloom,
 *   meia resolução) → mapeamento de tons ACES + sRGB → gradação de cor e
 *   vinheta (no espaço da tela) → tela
 *
 * Na qualidade baixa não há pós-processamento (a cena vai direto à tela).
 * Funciona na tela dividida: cada metade tem o seu pipeline, desenhado no
 * próprio viewport.
 */

export type PostLevel = 'nenhum' | 'basico' | 'completo'

export interface GradeOptions {
  /** 1 = sem mudança. */
  saturation: number
  contrast: number
  /** Escurecimento das bordas (0 = sem vinheta). */
  vignette: number
  /** Leve tom frio nas sombras e quente nas luzes (0–1). */
  splitTone: number
}

export const DEFAULT_GRADE: GradeOptions = { saturation: 1.1, contrast: 1.06, vignette: 0.28, splitTone: 0.5 }

const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.06 },
    uVignette: { value: 0.28 },
    uSplit: { value: 0.5 },
    uAspect: { value: 1.6 },
    /** Tela tingida (dano forte, fora da zona): cor e intensidade. */
    uTint: { value: new THREE.Color(0, 0, 0) },
    uTintAmount: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uSplit;
    uniform float uAspect;
    uniform vec3 uTint;
    uniform float uTintAmount;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // saturação e contraste em torno do cinza médio
      c = mix(vec3(l), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      // sombras levemente frias, luzes levemente quentes
      vec3 cool = vec3(-0.012, 0.004, 0.02);
      vec3 warm = vec3(0.022, 0.008, -0.016);
      c += uSplit * mix(cool, warm, smoothstep(0.15, 0.85, l));
      // vinheta elíptica (corrigida pela proporção da tela)
      vec2 d = (vUv - 0.5) * vec2(uAspect, 1.0) / max(uAspect, 1.0);
      float v = smoothstep(0.85, 0.25, length(d) * 1.35);
      c *= mix(1.0, v, uVignette);
      // tingimento nas bordas (dano/zona)
      float edge = smoothstep(0.25, 0.75, length(vUv - 0.5) * 1.4);
      c = mix(c, uTint, uTintAmount * edge);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
}

export class PostPipeline {
  readonly composer: EffectComposer
  private readonly renderPass: RenderPass
  private readonly bloom: UnrealBloomPass
  private readonly gtao: GTAOPass | null
  private readonly grade: ShaderPass
  private width = 0
  private height = 0

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, readonly level: Exclude<PostLevel, 'nenhum'>, grade: GradeOptions = DEFAULT_GRADE) {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 })
    target.texture.name = 'pos.cena'
    this.composer = new EffectComposer(renderer, target)
    this.renderPass = new RenderPass(scene, camera)
    this.composer.addPass(this.renderPass)
    if (level === 'completo') {
      this.gtao = new GTAOPass(scene, camera, 1, 1)
      this.gtao.blendIntensity = 0.85
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.0, scale: 1.0, samples: 12 })
      this.composer.addPass(this.gtao)
    } else this.gtao = null
    // threshold alto: só o que é realmente claro brilha (sol, clarões, explosões, emissivos)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), level === 'completo' ? 0.42 : 0.32, 0.45, 0.92)
    this.composer.addPass(this.bloom)
    this.composer.addPass(new OutputPass())
    this.grade = new ShaderPass(GradeShader)
    this.setGrade(grade)
    this.composer.addPass(this.grade)
  }

  setGrade(g: GradeOptions): void {
    const u = this.grade.uniforms
    u.uSaturation.value = g.saturation
    u.uContrast.value = g.contrast
    u.uVignette.value = g.vignette
    u.uSplit.value = g.splitTone
  }

  /** Tinge as bordas da tela (0 = nada). */
  setTint(color: THREE.ColorRepresentation, amount: number): void {
    ;(this.grade.uniforms.uTint.value as THREE.Color).set(color)
    this.grade.uniforms.uTintAmount.value = amount
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.camera = camera
    if (this.gtao) this.gtao.camera = camera
  }

  /** Tamanho em pixels CSS da área desenhada (a tela, ou a metade na tela dividida). */
  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width))
    const h = Math.max(1, Math.round(height))
    if (w === this.width && h === this.height) return
    this.width = w
    this.height = h
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(w, h)
    // brilho em meia resolução (o desfoque esconde a diferença)
    this.bloom.setSize(Math.ceil((w * this.renderer.getPixelRatio()) / 2), Math.ceil((h * this.renderer.getPixelRatio()) / 2))
    this.grade.uniforms.uAspect.value = w / h
  }

  /** Desenha a cena no viewport atual do renderizador. */
  render(dt: number): void {
    this.composer.render(dt)
  }

  dispose(): void {
    this.composer.dispose()
    this.bloom.dispose()
    this.gtao?.dispose()
    this.grade.dispose()
  }
}
