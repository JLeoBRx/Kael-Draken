import * as THREE from 'three'
import type { ZoneCircle } from '../../shared/match/zone'

/**
 * A "nuvem de cinzas" que fecha o mapa: um cilindro aberto e alto no círculo
 * da zona, com faixas que sobem animadas e brilho de brasa embaixo. Vista de
 * dentro ou de fora (dupla face), sem escrever profundidade.
 */

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uEmber;
uniform float uRadius;
varying vec2 vUv;
varying vec3 vWorld;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  // u ao redor do círculo (em metros, para o padrão não esticar com o raio)
  float around = vUv.x * 6.2831853 * uRadius / 18.0;
  float h = vWorld.y;
  float n = noise(vec2(around, h / 14.0 - uTime * 0.25)) * 0.6 + noise(vec2(around * 2.3, h / 6.0 - uTime * 0.6)) * 0.4;
  vec3 col = mix(uColorA, uColorB, n);
  // brasa perto do chão
  float ember = smoothstep(0.55, 1.0, noise(vec2(around * 3.0, h / 3.0 - uTime * 1.4))) * smoothstep(60.0, 0.0, h);
  col += uEmber * ember * 1.5;
  // mais densa embaixo, some no alto
  float a = (0.42 + 0.28 * n) * smoothstep(220.0, 40.0, h) + ember * 0.3;
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.85));
}
`

export class ZoneView {
  private readonly mesh: THREE.Mesh
  private readonly material: THREE.ShaderMaterial

  constructor(scene: THREE.Scene) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 128, 1, true).translate(0, 0.5, 0)
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(0x3a2f45) },
        uColorB: { value: new THREE.Color(0x8a4f7a) },
        uEmber: { value: new THREE.Color(0xff6a20) },
        uRadius: { value: 100 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
    this.mesh = new THREE.Mesh(geo, this.material)
    this.mesh.name = 'zona'
    this.mesh.visible = false
    this.mesh.renderOrder = 5
    this.mesh.frustumCulled = false
    scene.add(this.mesh)
  }

  update(circle: ZoneCircle | null, baseY: number, elapsed: number): void {
    this.mesh.visible = !!circle && circle.r > 0.5
    if (!circle) return
    this.mesh.position.set(circle.x, baseY - 40, circle.z)
    this.mesh.scale.set(circle.r, 420, circle.r)
    this.material.uniforms.uTime.value = elapsed
    this.material.uniforms.uRadius.value = circle.r
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    this.material.dispose()
  }
}
