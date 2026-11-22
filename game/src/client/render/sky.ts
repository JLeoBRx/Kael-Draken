import * as THREE from 'three'

/**
 * Céu em degradê com disco e halo do sol. Usado como fundo e como fonte do
 * mapa de ambiente (PMREM), que dá reflexos e luz ambiente coerentes aos
 * materiais PBR. A cor do horizonte é a mesma da neblina.
 */
export function createSky(top: THREE.Color, horizon: THREE.Color, sunDir: THREE.Vector3): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: top.clone() },
      uHorizon: { value: horizon.clone() },
      uGround: { value: horizon.clone().multiplyScalar(0.55) },
      uSunDir: { value: sunDir.clone().normalize() },
      uSunColor: { value: new THREE.Color(1.0, 0.92, 0.78) },
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
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, pow(max(h, 0.0), 0.5));
        col = mix(col, uGround, smoothstep(0.0, -0.2, h));
        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(s, 1200.0) * 6.0 + pow(s, 40.0) * 0.25 + pow(s, 6.0) * 0.12);
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
