import * as THREE from 'three'

/**
 * Céu em degradê com disco e halo do sol e, opcionalmente, nuvens
 * procedurais (ruído fractal projetado num plano alto, iluminadas pelo lado
 * do sol e levadas pelo vento). Também é a fonte do mapa de ambiente (PMREM,
 * sem nuvens), que dá reflexos e luz ambiente coerentes aos materiais PBR.
 * A cor do horizonte é a mesma da neblina.
 */
export interface SkyOptions {
  clouds?: boolean
  /** Fração do céu coberta (0–1). */
  coverage?: number
}

export function createSky(top: THREE.Color, horizon: THREE.Color, sunDir: THREE.Vector3, opts: SkyOptions = {}): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    defines: opts.clouds ? { CLOUDS: 1 } : {},
    uniforms: {
      uTop: { value: top.clone() },
      uHorizon: { value: horizon.clone() },
      uGround: { value: horizon.clone().multiplyScalar(0.55) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.92, 0.78) },
      uTime: { value: 0 },
      uCoverage: { value: opts.coverage ?? 0.45 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uGround;
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uTime;
      uniform float uCoverage;
      varying vec3 vDir;

      #ifdef CLOUDS
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int k = 0; k < 5; k++) {
          v += a * noise(p);
          p = p * 2.03 + vec2(17.1, 9.2);
          a *= 0.5;
        }
        return v;
      }
      #endif

      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.5));
        col = mix(col, uGround, smoothstep(0.0, -0.2, h));
        float s = max(dot(d, uSunDir), 0.0);
        vec3 sun = uSunColor * (pow(s, 1200.0) * 6.0 + pow(s, 40.0) * 0.25 + pow(s, 6.0) * 0.12);
        #ifdef CLOUDS
        if (h > 0.0) {
          // plano das nuvens: mais denso perto do horizonte por perspectiva
          vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.0025);
          float n = fbm(uv);
          float cover = smoothstep(1.0 - uCoverage, 1.0 - uCoverage + 0.28, n);
          // lado voltado ao sol mais claro; base das nuvens acinzentada
          float lit = fbm(uv + uSunDir.xz * 0.06);
          float shade = clamp(0.62 + (n - lit) * 2.2, 0.35, 1.0);
          vec3 cloud = mix(uHorizon * 0.78, vec3(1.0, 0.98, 0.95), shade) + uSunColor * pow(s, 8.0) * 0.35;
          float fade = smoothstep(0.0, 0.18, h);
          col = mix(col, cloud, cover * fade * 0.92);
          sun *= 1.0 - cover * fade * 0.9;
        }
        #endif
        col += sun;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material)
  mesh.scale.setScalar(2500)
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  mesh.name = 'ceu'
  return mesh
}

/** Avança o vento das nuvens. */
export function updateSky(sky: THREE.Mesh, elapsed: number): void {
  ;(sky.material as THREE.ShaderMaterial).uniforms.uTime.value = elapsed
}
