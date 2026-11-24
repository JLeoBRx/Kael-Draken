import * as THREE from 'three'
import { terrainLayers } from './terrain-textures'

/**
 * Material do relevo: o PBR padrão do three.js (luz, sombras, neblina e
 * ambiente continuam iguais) com a cor-base trocada por uma mistura de
 * camadas de detalhe.
 *
 * - Pesos por vértice (atributo `splat`: terra, rocha, areia, neve; o resto
 *   é grama), calculados junto com a cor do bioma em terrain-mesh.ts.
 * - Mistura por altura: cada camada "sobe" conforme o alfa da sua textura,
 *   então a transição tem frestas e tufos em vez de um degradê liso.
 * - Rocha em projeção triplanar (encostas sem textura esticada).
 * - Variação ampla (macro) contra a repetição e relevo fino pela derivada da
 *   altura misturada (luz rasante revela grama, pedrinhas e fendas).
 */

const VERTEX_HEAD = /* glsl */ `
attribute vec4 splat;
varying vec4 vSplat;
varying vec3 vSplatPos;
varying vec3 vSplatNormal;
`

const FRAGMENT_HEAD = /* glsl */ `
uniform sampler2D uLayer0;
uniform sampler2D uLayer1;
uniform sampler2D uLayer2;
uniform sampler2D uLayer3;
uniform sampler2D uLayer4;
uniform sampler2D uMacro;
uniform float uBump;
varying vec4 vSplat;
varying vec3 vSplatPos;
varying vec3 vSplatNormal;

vec3 splatPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  // derivadas degeneradas (bordas, ângulos rasantes) não podem virar NaN: aí fica a normal original
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  float lx = length(sx);
  float ly = length(sy);
  if (lx < 1e-6 || ly < 1e-6) return surfNorm;
  sx /= lx;
  sy /= ly;
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  vec3 n = abs(det) * surfNorm - grad;
  float ln = length(n);
  return ln > 1e-6 ? n / ln : surfNorm;
}
`

const SPLAT_FRAGMENT = /* glsl */ `
  vec2 tuv = vSplatPos.xz;
  float viewDist = length(vViewPosition);
  vec4 macro = texture2D(uMacro, tuv / 260.0);
  vec4 lg = texture2D(uLayer0, tuv / 3.0);
  vec4 ld = texture2D(uLayer1, tuv / 3.4);
  #ifdef SPLAT_TRIPLANAR
  vec3 bw = pow(abs(normalize(vSplatNormal)), vec3(4.0));
  bw /= (bw.x + bw.y + bw.z);
  vec4 lr = texture2D(uLayer2, vSplatPos.zy / 5.5) * bw.x + texture2D(uLayer2, vSplatPos.xz / 5.5) * bw.y + texture2D(uLayer2, vSplatPos.xy / 5.5) * bw.z;
  #else
  // qualidade baixa: rocha só de cima (2 leituras de textura a menos por pixel)
  vec4 lr = texture2D(uLayer2, vSplatPos.xz / 5.5);
  #endif
  vec4 ls = texture2D(uLayer3, tuv / 3.8);
  vec4 ln = texture2D(uLayer4, tuv / 5.0);
  vec4 w = clamp(vSplat, 0.0, 1.0);
  float wg = max(0.0, 1.0 - (w.x + w.y + w.z + w.w));
  // mistura por altura (largura da transição: 0,22)
  float hg = wg + lg.a * 0.45 * step(0.001, wg);
  float hd = w.x + ld.a * 0.45 * step(0.001, w.x);
  float hr = w.y + lr.a * 0.45 * step(0.001, w.y);
  float hs = w.z + ls.a * 0.45 * step(0.001, w.z);
  float hn = w.w + ln.a * 0.45 * step(0.001, w.w);
  float top = max(max(max(hg, hd), max(hr, hs)), hn) - 0.22;
  float bg = max(hg - top, 0.0);
  float bd = max(hd - top, 0.0);
  float br = max(hr - top, 0.0);
  float bs = max(hs - top, 0.0);
  float bn = max(hn - top, 0.0);
  float bsum = bg + bd + br + bs + bn + 1e-5;
  bg /= bsum; bd /= bsum; br /= bsum; bs /= bsum; bn /= bsum;
  vec3 detail = (lg.rgb * bg + ld.rgb * bd + lr.rgb * br + ls.rgb * bs + ln.rgb * bn) * 2.0;
  float splatH = lg.a * bg + ld.a * bd + lr.a * br + ls.a * bs + ln.a * bn;
  // longe, o detalhe vira ruído: suaviza
  float far = smoothstep(70.0, 420.0, viewDist);
  detail = mix(detail, vec3(0.86), far * 0.55);
  // manchas amplas: brilho e tom (mais seco/amarelado) variando pelo mapa
  detail *= 0.84 + macro.r * 0.32;
  detail *= mix(vec3(1.0), vec3(1.1, 1.03, 0.8), smoothstep(0.45, 0.85, macro.g) * (bg + bd) * 0.8);
  diffuseColor.rgb *= detail;
`

export function createTerrainMaterial(lowQuality = false): THREE.MeshStandardMaterial {
  const tex = terrainLayers()
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  if (!lowQuality) m.defines = { SPLAT_TRIPLANAR: '' }
  m.name = 'terreno'
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uLayer0 = { value: tex.layers[0] }
    shader.uniforms.uLayer1 = { value: tex.layers[1] }
    shader.uniforms.uLayer2 = { value: tex.layers[2] }
    shader.uniforms.uLayer3 = { value: tex.layers[3] }
    shader.uniforms.uLayer4 = { value: tex.layers[4] }
    shader.uniforms.uMacro = { value: tex.macro }
    shader.uniforms.uBump = { value: lowQuality ? 0 : 1.6 }
    shader.vertexShader = VERTEX_HEAD + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vSplat = splat;
      vSplatPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
      vSplatNormal = normalize(mat3(modelMatrix) * objectNormal);`,
    )
    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader
      .replace('#include <map_fragment>', SPLAT_FRAGMENT)
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness * (0.98 * bg + 0.95 * bd + 0.8 * br + 0.9 * bs + 0.6 * bn);`)
      .replace('#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        if (uBump > 0.0) {
          vec2 dHdxy = vec2(dFdx(splatH), dFdy(splatH)) * uBump * (1.0 - far);
          normal = splatPerturb(-vViewPosition, normal, dHdxy, faceDirection);
        }`)
  }
  m.customProgramCacheKey = () => `terreno-splat-${lowQuality ? 'b' : 'a'}`
  return m
}
