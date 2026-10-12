/**
 * Selos do Arquivo: pranchas em linha dourada para os conceitos abstratos da
 * mitologia (a Chama, o Caos, o Templo, a Ressonância, o Século Perdido e
 * Skrugheim). São composições geométricas, desenhadas em SVG e rasterizadas
 * com o sharp — ilustrações simbólicas, sem valor canônico.
 *
 *   node scripts/art/sigils.mjs            # gera todos em public/images/atlas
 *   node scripts/art/sigils.mjs --svg      # também salva os .svg ao lado
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, 'public', 'images', 'atlas')
const W = 1600
const H = 1000
const CX = W / 2
const CY = H / 2
const SCALE = 1.25 // saída em 2000 × 1250

// ── Utilidades ────────────────────────────────────────────────────────────

const f = (n) => Number(n.toFixed(2))
const rad = (deg) => ((deg - 90) * Math.PI) / 180 // 0° no topo, sentido horário
const polar = (r, deg, cx = CX, cy = CY) => [f(cx + r * Math.cos(rad(deg))), f(cy + r * Math.sin(rad(deg)))]

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const attrs = (a = {}) =>
  Object.entries(a)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')

const circle = (r, a = {}, cx = CX, cy = CY) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" ${attrs(a)}/>`
const line = (x1, y1, x2, y2, a = {}) => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${attrs(a)}/>`

function arc(r, a0, a1, a = {}, cx = CX, cy = CY) {
  const [x0, y0] = polar(r, a0, cx, cy)
  const [x1, y1] = polar(r, a1, cx, cy)
  const large = a1 - a0 > 180 ? 1 : 0
  return `<path d="M${x0} ${y0}A${f(r)} ${f(r)} 0 ${large} 1 ${x1} ${y1}" ${attrs(a)}/>`
}

function ray(r0, r1, deg, a = {}, cx = CX, cy = CY) {
  const [x0, y0] = polar(r0, deg, cx, cy)
  const [x1, y1] = polar(r1, deg, cx, cy)
  return line(x0, y0, x1, y1, a)
}

function diamond(x, y, s, a = {}) {
  return `<path d="M${f(x)} ${f(y - s)}L${f(x + s * 0.62)} ${f(y)}L${f(x)} ${f(y + s)}L${f(x - s * 0.62)} ${f(y)}Z" ${attrs(a)}/>`
}

// ── Prancha comum ─────────────────────────────────────────────────────────

const PALETTES = {
  ouro: { hi: '#f3dca6', lo: '#a67c3e', glow: '#d0862f', bg0: '#1c1610', bg1: '#0c0a08', frame: '#b8925a' },
  frio: { hi: '#d5e0e2', lo: '#6f8a90', glow: '#3d6f7a', bg0: '#11171a', bg1: '#07090b', frame: '#8a9da2' },
  cinza: { hi: '#e6dccb', lo: '#8c8170', glow: '#8f7a55', bg0: '#17150f', bg1: '#0a0907', frame: '#a8977a' },
}

function frame(p) {
  const i = 38
  const j = 50
  const parts = [
    `<rect x="${i}" y="${i}" width="${W - 2 * i}" height="${H - 2 * i}" fill="none" stroke="${p.frame}" stroke-opacity="0.5" stroke-width="1.2"/>`,
    `<rect x="${j}" y="${j}" width="${W - 2 * j}" height="${H - 2 * j}" fill="none" stroke="${p.frame}" stroke-opacity="0.28" stroke-width="0.7"/>`,
  ]
  for (const [x, y] of [
    [i, i],
    [W - i, i],
    [i, H - i],
    [W - i, H - i],
  ]) {
    parts.push(diamond(x, y, 9, { fill: '#0b0a08', stroke: p.frame, 'stroke-width': 1.2, 'stroke-opacity': 0.75 }))
  }
  for (const [x, y] of [
    [CX, i],
    [CX, H - i],
  ]) {
    parts.push(line(x - 46, y, x - 14, y, { stroke: p.frame, 'stroke-opacity': 0.6, 'stroke-width': 1 }))
    parts.push(line(x + 14, y, x + 46, y, { stroke: p.frame, 'stroke-opacity': 0.6, 'stroke-width': 1 }))
    parts.push(diamond(x, y, 5, { fill: p.frame, 'fill-opacity': 0.75 }))
  }
  return parts.join('')
}

function plate({ palette, art, defs = '', front = '', glow = 0.4, glowAt = [CX, CY], glowR = 470, distort = 0 }) {
  const p = PALETTES[palette]
  const [gx, gy] = glowAt
  const distortion = distort
    ? `<filter id="warp" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.006" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="${distort}" xChannelSelector="R" yChannelSelector="G"/></filter>`
    : ''
  const open = distort ? '<g filter="url(#warp)">' : '<g>'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W * SCALE}" height="${H * SCALE}" viewBox="0 0 ${W} ${H}">
<defs>
  <radialGradient id="bg" cx="50%" cy="50%" r="72%"><stop offset="0" stop-color="${p.bg0}"/><stop offset="0.6" stop-color="${p.bg1}"/><stop offset="1" stop-color="#040303"/></radialGradient>
  <radialGradient id="halo" cx="${gx}" cy="${gy}" r="${glowR}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${p.glow}" stop-opacity="${glow}"/><stop offset="0.45" stop-color="${p.glow}" stop-opacity="${glow * 0.35}"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
  <linearGradient id="ink" x1="0" y1="${CY - 380}" x2="0" y2="${CY + 380}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${p.hi}"/><stop offset="1" stop-color="${p.lo}"/></linearGradient>
  <filter id="bloom" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>
  <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.85  0 0 0 0.09 0"/></filter>
  <radialGradient id="vignette" cx="50%" cy="50%" r="75%"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.7"/></radialGradient>
  ${distortion}
  ${defs}
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect width="${W}" height="${H}" fill="url(#halo)"/>
<g filter="url(#bloom)" opacity="0.5">${open}${art}</g></g>
${open}${art}</g>
${front}
<rect width="${W}" height="${H}" fill="url(#vignette)"/>
<rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.55"/>
${frame(p)}
</svg>`
}

const S = (w, o = 1) => ({ fill: 'none', stroke: 'url(#ink)', 'stroke-width': w, 'stroke-opacity': o, 'stroke-linecap': 'round' })

// ── 1. A Chama do Dragão ──────────────────────────────────────────────────

function flamePath(cx, cy, h, w) {
  // chama em gota, com duas línguas laterais
  const t = cy - h * 0.62
  const b = cy + h * 0.38
  return [
    `M${f(cx)} ${f(t)}`,
    `C${f(cx + w * 0.18)} ${f(t + h * 0.22)} ${f(cx + w * 0.62)} ${f(t + h * 0.36)} ${f(cx + w * 0.5)} ${f(t + h * 0.68)}`,
    `C${f(cx + w * 0.58)} ${f(t + h * 0.6)} ${f(cx + w * 0.66)} ${f(t + h * 0.52)} ${f(cx + w * 0.64)} ${f(t + h * 0.44)}`,
    `C${f(cx + w * 0.86)} ${f(t + h * 0.64)} ${f(cx + w * 0.62)} ${f(b)} ${f(cx)} ${f(b)}`,
    `C${f(cx - w * 0.62)} ${f(b)} ${f(cx - w * 0.86)} ${f(t + h * 0.64)} ${f(cx - w * 0.64)} ${f(t + h * 0.44)}`,
    `C${f(cx - w * 0.66)} ${f(t + h * 0.52)} ${f(cx - w * 0.58)} ${f(t + h * 0.6)} ${f(cx - w * 0.5)} ${f(t + h * 0.68)}`,
    `C${f(cx - w * 0.62)} ${f(t + h * 0.36)} ${f(cx - w * 0.18)} ${f(t + h * 0.22)} ${f(cx)} ${f(t)}Z`,
  ].join('')
}

function chama() {
  const parts = []
  parts.push(circle(352, S(0.7, 0.35)))
  parts.push(circle(330, S(2.2, 0.95)))
  parts.push(circle(318, S(0.8, 0.6)))
  for (let k = 0; k < 120; k++) {
    const a = k * 3
    const long = k % 10 === 0
    parts.push(ray(long ? 290 : 300, 312, a, S(long ? 1.6 : 0.8, long ? 0.9 : 0.55)))
  }
  for (const a of [0, 90, 180, 270]) {
    const [x, y] = polar(330, a)
    parts.push(diamond(x, y, 12, { fill: '#100d0a', stroke: 'url(#ink)', 'stroke-width': 1.6 }))
  }
  parts.push(circle(270, S(0.9, 0.5)))
  for (let k = 0; k < 48; k++) {
    const a = k * 7.5
    parts.push(ray(156, k % 2 ? 236 : 262, a, S(k % 2 ? 0.8 : 1.3, k % 2 ? 0.45 : 0.75)))
  }
  parts.push(circle(146, S(1.8, 0.95)))
  parts.push(circle(136, S(0.7, 0.5)))
  return parts.join('')
}

function chamaFront() {
  const outer = flamePath(CX, CY + 20, 252, 116)
  const mid = flamePath(CX, CY + 38, 196, 84)
  const inner = flamePath(CX, CY + 58, 128, 52)
  return `
  <defs>
    <radialGradient id="fl" cx="${CX}" cy="${CY + 60}" r="170" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffe9b8"/><stop offset="0.3" stop-color="#eeb25c"/><stop offset="0.7" stop-color="#a8501a"/><stop offset="1" stop-color="#4a1a08"/></radialGradient>
    <radialGradient id="fl2" cx="${CX}" cy="${CY + 76}" r="84" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffaf0"/><stop offset="0.55" stop-color="#ffe2a6"/><stop offset="1" stop-color="#f0a850" stop-opacity="0.6"/></radialGradient>
  </defs>
  <path d="${outer}" fill="#e0812f" opacity="0.5" filter="url(#bloom)"/>
  <path d="${outer}" fill="url(#fl)" stroke="#f3dca6" stroke-width="1.5" stroke-opacity="0.95"/>
  <path d="${mid}" fill="none" stroke="#fbe7bd" stroke-width="1" stroke-opacity="0.55"/>
  <path d="${inner}" fill="url(#fl2)" stroke="#fff3d6" stroke-width="0.8" stroke-opacity="0.8"/>`
}

// ── 2. O Caos ─────────────────────────────────────────────────────────────

function caos() {
  const r = rng(11)
  const parts = []
  const rings = [352, 330, 318, 300, 270, 236, 200, 170, 146]
  rings.forEach((radius, idx) => {
    let a = r() * 30
    while (a < 360) {
      const len = 8 + r() * (idx < 3 ? 40 : 26)
      const gap = 3 + r() * 16
      const drift = (r() - 0.35) * (14 + idx * 3) * (0.4 + 0.6 * Math.abs(Math.sin(rad(a * 1.3))))
      const rot = (r() - 0.5) * 6
      const w = idx === 1 || idx === 8 ? 1.9 : 0.9
      const op = 0.35 + r() * 0.6
      parts.push(arc(radius + drift, a + rot, a + rot + len, S(w, op)))
      a += len + gap
    }
  })
  // estilhaços desprendidos, cada vez mais longe do centro
  for (let k = 0; k < 90; k++) {
    const a = r() * 360
    const rr = 360 + r() ** 1.6 * 300
    const len = 2 + r() * 7
    parts.push(arc(rr, a, a + len, S(0.6 + r() * 1.2, 0.12 + r() * 0.45)))
  }
  // raios partidos
  for (let k = 0; k < 40; k++) {
    const a = k * 9 + (r() - 0.5) * 5
    const r0 = 150 + r() * 40
    const r1 = r0 + 20 + r() * 70
    parts.push(ray(r0, r1, a, S(0.8, 0.25 + r() * 0.5)))
  }
  return parts.join('')
}

function caosFront() {
  // o centro não tem chama: um vazio irregular, de bordas frias
  const r = rng(5)
  const n = 36
  const pts = []
  for (let k = 0; k < n; k++) {
    const a = (k / n) * 360
    // fenda alongada e torta, sem simetria
    const t = rad(a) + Math.PI / 2
    const rx = 112 + 10 * Math.sin(t * 5 + 1.3) + (r() - 0.5) * 14
    const ry = 34 + 8 * Math.sin(t * 4 + 0.4) + (r() - 0.5) * 8
    const x = rx * Math.cos(t)
    const y = ry * Math.sin(t) + 18 * Math.sin(t * 2 + 0.8)
    const rot = (-24 * Math.PI) / 180
    pts.push([f(CX + x * Math.cos(rot) - y * Math.sin(rot)), f(CY + x * Math.sin(rot) + y * Math.cos(rot))])
  }
  // curva suave pelos pontos (Catmull-Rom → Bézier)
  let d = `M${pts[0][0]} ${pts[0][1]}`
  for (let k = 0; k < n; k++) {
    const p0 = pts[(k - 1 + n) % n]
    const p1 = pts[k]
    const p2 = pts[(k + 1) % n]
    const p3 = pts[(k + 2) % n]
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]} ${p2[1]}`
  }
  d += 'Z'
  return `<defs><radialGradient id="vazio" cx="${CX}" cy="${CY}" r="100" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#000"/><stop offset="0.75" stop-color="#010203"/><stop offset="1" stop-color="#0c1418"/></radialGradient></defs>
  <path d="${d}" fill="none" stroke="#7fa3aa" stroke-width="10" stroke-opacity="0.16" filter="url(#bloom)"/>
  <path d="${d}" fill="url(#vazio)" stroke="#c8d6d8" stroke-width="1.1" stroke-opacity="0.65"/>`
}

// ── 3. O Templo da Chama ──────────────────────────────────────────────────

function templo() {
  const parts = []
  const base = 760
  const ink = (w, o = 1) => S(w, o)
  // linhas de construção
  parts.push(line(CX, 118, CX, 900, { ...ink(0.7, 0.35), 'stroke-dasharray': '2 9' }))
  parts.push(line(250, base, 1350, base, ink(0.8, 0.45)))
  for (let x = 300; x <= 1300; x += 50) parts.push(line(x, base + 8, x, base + (x % 250 === 50 ? 22 : 14), ink(0.7, 0.4)))
  parts.push(circle(420, { ...ink(0.6, 0.22), 'stroke-dasharray': '1 7' }, CX, 470))
  // degraus
  for (let k = 0; k < 5; k++) {
    const w = 900 - k * 40
    const y = base - (k + 1) * 18
    parts.push(`<rect x="${CX - w / 2}" y="${y}" width="${w}" height="18" ${attrs(ink(1.1, 0.85))}/>`)
    for (let x = CX - w / 2 + 12; x < CX + w / 2 - 6; x += 16) parts.push(line(x, y + 18, x + 9, y + 2, ink(0.5, 0.18)))
  }
  const top = base - 5 * 18
  // colunas
  const colH = 300
  const cols = 6
  const span = 640
  const colW = 46
  for (let k = 0; k < cols; k++) {
    const x = CX - span / 2 + (k * span) / (cols - 1)
    parts.push(`<rect x="${x - colW / 2 - 8}" y="${top - 14}" width="${colW + 16}" height="14" ${attrs(ink(1, 0.8))}/>`)
    parts.push(`<path d="M${x - colW / 2} ${top - 14}L${x - colW / 2 + 4} ${top - 14 - colH}L${x + colW / 2 - 4} ${top - 14 - colH}L${x + colW / 2} ${top - 14}" ${attrs(ink(1.4, 0.95))}/>`)
    for (let s = -2; s <= 2; s++) parts.push(line(x + s * 8, top - 18, x + s * 7.4, top - 10 - colH, ink(0.55, 0.4)))
    parts.push(`<rect x="${x - colW / 2 - 6}" y="${top - 14 - colH - 12}" width="${colW + 12}" height="12" ${attrs(ink(1.1, 0.85))}/>`)
    parts.push(`<rect x="${x - colW / 2 - 12}" y="${top - 14 - colH - 22}" width="${colW + 24}" height="10" ${attrs(ink(1.1, 0.85))}/>`)
  }
  const ent = top - 14 - colH - 22
  const ew = span + colW + 80
  parts.push(`<rect x="${CX - ew / 2}" y="${ent - 34}" width="${ew}" height="34" ${attrs(ink(1.3, 0.9))}/>`)
  for (let x = CX - ew / 2 + 24; x < CX + ew / 2 - 10; x += 38) parts.push(`<rect x="${x}" y="${ent - 30}" width="10" height="26" ${attrs(ink(0.7, 0.55))}/>`)
  parts.push(`<rect x="${CX - ew / 2 - 16}" y="${ent - 50}" width="${ew + 32}" height="16" ${attrs(ink(1.3, 0.9))}/>`)
  // frontão
  const py = ent - 50
  parts.push(`<path d="M${CX - ew / 2 - 16} ${py}L${CX} ${py - 120}L${CX + ew / 2 + 16} ${py}Z" ${attrs(ink(1.6, 0.95))}/>`)
  parts.push(`<path d="M${CX - ew / 2 + 30} ${py - 10}L${CX} ${py - 104}L${CX + ew / 2 - 30} ${py - 10}Z" ${attrs(ink(0.7, 0.5))}/>`)
  parts.push(circle(22, ink(1.1, 0.85), CX, py - 46))
  parts.push(circle(14, ink(0.6, 0.5), CX, py - 46))
  // passagem e altar apagado
  const doorW = 96
  const doorTop = top - 14 - colH + 70
  parts.push(`<path d="M${CX - doorW / 2} ${top - 14}L${CX - doorW / 2} ${doorTop + doorW / 2}A${doorW / 2} ${doorW / 2} 0 0 1 ${CX + doorW / 2} ${doorTop + doorW / 2}L${CX + doorW / 2} ${top - 14}" ${attrs(ink(1.2, 0.85))}/>`)
  parts.push(`<rect x="${CX - 26}" y="${top - 14 - 52}" width="52" height="52" ${attrs(ink(1, 0.8))}/>`)
  parts.push(`<path d="M${CX - 30} ${top - 66}Q${CX} ${top - 50} ${CX + 30} ${top - 66}" ${attrs(ink(1, 0.8))}/>`)
  return parts.join('')
}

function temploFront() {
  // a névoa sobe dos degraus
  return `<defs><linearGradient id="mist" x1="0" y1="640" x2="0" y2="1000" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0c0a08" stop-opacity="0"/><stop offset="0.55" stop-color="#0c0a08" stop-opacity="0.82"/><stop offset="1" stop-color="#050404" stop-opacity="1"/></linearGradient></defs>
  <rect x="0" y="640" width="${W}" height="360" fill="url(#mist)"/>`
}

// ── 4. A Ressonância ──────────────────────────────────────────────────────

function ressonancia() {
  const parts = []
  const centers = [polar(96, 0), polar(96, 120), polar(96, 240)]
  const waves = []
  for (const [x, y] of centers) {
    for (let rr = 14; rr < 520; rr += 17) waves.push(circle(rr, S(0.8, 0.4), x, y))
  }
  parts.push(`<g clip-path="url(#medalha)">${waves.join('')}</g>`)
  parts.push(circle(300, S(2, 0.95)))
  parts.push(circle(312, S(0.8, 0.6)))
  parts.push(circle(346, S(0.7, 0.35)))
  for (let k = 0; k < 72; k++) parts.push(ray(318, k % 6 === 0 ? 340 : 330, k * 5, S(k % 6 === 0 ? 1.4 : 0.8, k % 6 === 0 ? 0.85 : 0.5)))
  return parts.join('')
}

function ressonanciaFront() {
  const centers = [polar(96, 0), polar(96, 120), polar(96, 240)]
  return centers
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="16" fill="#f6c66e" opacity="0.5" filter="url(#bloom)"/><circle cx="${x}" cy="${y}" r="5" fill="#fff4d6"/>`)
    .join('')
}

// ── 5. O Século Perdido ───────────────────────────────────────────────────

function seculo() {
  const parts = []
  const gap0 = 208
  const gap1 = 292
  const ok = (a) => a < gap0 || a > gap1
  for (const [rr, w, o] of [
    [352, 0.7, 0.35],
    [330, 2.1, 0.95],
    [318, 0.8, 0.6],
    [250, 1.2, 0.8],
    [150, 1.6, 0.9],
  ]) {
    parts.push(arc(rr, gap1, 360 + gap0, S(w, o)))
    parts.push(arc(rr, gap0, gap1, { ...S(0.8, 0.22), 'stroke-dasharray': '1 9' }))
  }
  for (let k = 0; k < 120; k++) {
    const a = k * 3
    if (!ok(a)) continue
    const long = k % 10 === 0
    parts.push(ray(long ? 288 : 298, 312, a, S(long ? 1.5 : 0.8, long ? 0.9 : 0.55)))
  }
  for (let k = 0; k < 60; k++) {
    const a = k * 6
    if (!ok(a)) continue
    parts.push(ray(160, k % 5 === 0 ? 240 : 222, a, S(k % 5 === 0 ? 1.2 : 0.7, k % 5 === 0 ? 0.8 : 0.45)))
  }
  // ampulheta vazia ao centro
  const hx = CX
  const hy = CY
  parts.push(`<path d="M${hx - 54} ${hy - 96}L${hx + 54} ${hy - 96}L${hx + 8} ${hy - 6}L${hx + 8} ${hy + 6}L${hx + 54} ${hy + 96}L${hx - 54} ${hy + 96}L${hx - 8} ${hy + 6}L${hx - 8} ${hy - 6}Z" ${attrs(S(1.5, 0.95))}/>`)
  parts.push(line(hx - 72, hy - 104, hx + 72, hy - 104, S(2, 0.95)))
  parts.push(line(hx - 72, hy + 104, hx + 72, hy + 104, S(2, 0.95)))
  parts.push(line(hx - 64, hy - 104, hx - 64, hy + 104, S(1, 0.7)))
  parts.push(line(hx + 64, hy - 104, hx + 64, hy + 104, S(1, 0.7)))
  return parts.join('')
}

function seculoFront() {
  // folhas em branco escapam pela lacuna
  const r = rng(23)
  const out = []
  for (let k = 0; k < 16; k++) {
    const a = 214 + r() * 72
    const rr = 300 + k * 26 + r() * 30
    const [x, y] = polar(rr, a)
    const s = 26 - k * 0.9
    const rot = (r() - 0.5) * 80
    const op = Math.max(0.12, 0.85 - k * 0.05)
    out.push(
      `<g transform="translate(${x} ${y}) rotate(${f(rot)})" opacity="${f(op)}"><rect x="${f(-s / 2)}" y="${f(-s * 0.65)}" width="${f(s)}" height="${f(s * 1.3)}" fill="#e9dfcb" fill-opacity="0.16" stroke="#e6dccb" stroke-width="0.9"/></g>`,
    )
  }
  return out.join('')
}

// ── 6. Skrugheim ──────────────────────────────────────────────────────────

function skrugheim() {
  const parts = []
  const ink = (w, o = 1) => S(w, o)
  const bw = 440
  const bottom = 820
  const spring = 380
  const left = CX - bw / 2
  const right = CX + bw / 2
  const apex = 150
  // arco ogival em três anéis
  for (const [d, w, o] of [
    [0, 1.8, 0.95],
    [26, 1, 0.7],
    [44, 0.7, 0.4],
  ]) {
    const l = left - d
    const rr = right + d
    const r0 = bw + d * 1.6
    parts.push(`<path d="M${l} ${bottom}L${l} ${spring}A${r0} ${r0} 0 0 1 ${CX} ${apex - d}A${r0} ${r0} 0 0 1 ${rr} ${spring}L${rr} ${bottom}" ${attrs(ink(w, o))}/>`)
  }
  // folhas da porta
  const inset = 22
  const dl = left + inset
  const dr = right - inset
  const dt = spring + 24
  parts.push(`<path d="M${dl} ${bottom}L${dl} ${dt}A${bw - 40} ${bw - 40} 0 0 1 ${CX} ${apex + 52}A${bw - 40} ${bw - 40} 0 0 1 ${dr} ${dt}L${dr} ${bottom}" ${attrs(ink(1.4, 0.9))}/>`)
  for (const [x0, x1] of [
    [dl, CX - 4],
    [CX + 4, dr],
  ]) {
    const w = x1 - x0
    for (let row = 0; row < 4; row++) {
      const y0 = dt + 30 + row * 96
      parts.push(`<rect x="${x0 + 18}" y="${y0}" width="${w - 36}" height="78" ${attrs(ink(0.9, 0.6))}/>`)
      parts.push(`<rect x="${x0 + 28}" y="${y0 + 10}" width="${w - 56}" height="58" ${attrs(ink(0.5, 0.35))}/>`)
    }
    for (const y of [dt + 18, dt + 200, bottom - 26]) {
      parts.push(line(x0 + 6, y, x1 - 6, y, ink(2.2, 0.75)))
      for (let x = x0 + 18; x < x1 - 10; x += 26) parts.push(circle(2.4, { fill: 'url(#ink)', opacity: 0.8 }, x, y))
    }
  }
  parts.push(circle(20, ink(1.6, 0.85), CX - 44, 600))
  parts.push(circle(20, ink(1.6, 0.85), CX + 44, 600))
  parts.push(circle(6, ink(1.2, 0.85), CX - 44, 580))
  parts.push(circle(6, ink(1.2, 0.85), CX + 44, 580))
  // degraus
  for (let k = 0; k < 3; k++) {
    const w = bw + 160 + k * 90
    parts.push(`<rect x="${CX - w / 2}" y="${bottom + k * 16}" width="${w}" height="16" ${attrs(ink(1, 0.7 - k * 0.15))}/>`)
  }
  return parts.join('')
}

function skrugheimFront() {
  const top = 202
  const bottom = 820
  return `<defs><linearGradient id="fresta" x1="0" y1="${top}" x2="0" y2="${bottom}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e8f4ff" stop-opacity="0"/><stop offset="0.25" stop-color="#e8f4ff" stop-opacity="0.95"/><stop offset="0.85" stop-color="#cfe6ff" stop-opacity="0.9"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0.1"/></linearGradient></defs>
  <rect x="${CX - 24}" y="${top}" width="48" height="${bottom - top}" fill="#9cc9ff" opacity="0.28" filter="url(#bloom)"/>
  <rect x="${CX - 9}" y="${top}" width="18" height="${bottom - top}" fill="#cfe6ff" opacity="0.35" filter="url(#bloom)"/>
  <rect x="${CX - 1.4}" y="${top}" width="2.8" height="${bottom - top}" fill="url(#fresta)"/>
  <ellipse cx="${CX}" cy="${bottom + 22}" rx="160" ry="10" fill="#cfe6ff" opacity="0.16" filter="url(#bloom)"/>`
}

// ── Exportação ────────────────────────────────────────────────────────────

const SIGILS = {
  'selo-chama': () => plate({ palette: 'ouro', art: chama(), front: chamaFront(), glow: 0.55, glowR: 520 }),
  'selo-caos': () => plate({ palette: 'frio', art: caos(), front: caosFront(), glow: 0.32, glowAt: [CX + 60, CY - 40], glowR: 560, distort: 26 }),
  'selo-templo': () => plate({ palette: 'ouro', art: templo(), front: temploFront(), glow: 0.3, glowAt: [CX, 430], glowR: 560 }),
  'selo-ressonancia': () => plate({ palette: 'ouro', art: ressonancia(), defs: `<clipPath id="medalha"><circle cx="${CX}" cy="${CY}" r="300"/></clipPath>`, front: ressonanciaFront(), glow: 0.42, glowR: 480 }),
  'selo-seculo-perdido': () => plate({ palette: 'cinza', art: seculo(), front: seculoFront(), glow: 0.3, glowR: 520 }),
  'selo-skrugheim': () => plate({ palette: 'frio', art: skrugheim(), front: skrugheimFront(), glow: 0.26, glowAt: [CX, 520], glowR: 520 }),
}

async function main() {
  const keepSvg = process.argv.includes('--svg')
  const dirArg = process.argv.indexOf('--saida')
  const out = dirArg > -1 ? process.argv[dirArg + 1] : OUT
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--') && a !== out)
  await mkdir(out, { recursive: true })
  for (const [name, build] of Object.entries(SIGILS)) {
    if (only.length && !only.includes(name)) continue
    const svg = build()
    if (keepSvg) await writeFile(join(out, `${name}.svg`), svg)
    await sharp(Buffer.from(svg)).webp({ quality: 88, effort: 6 }).toFile(join(out, `${name}.webp`))
    console.log(`  ${name}.webp`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
