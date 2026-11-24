import { RARITIES } from '../shared/config/items'

/**
 * Acessibilidade: visão de cores, escala da interface, mira e teclas.
 *
 * Visão de cores: dois cuidados.
 * 1. Paleta da interface (raridades, colegas de equipe) trocada por cores
 *    que se distinguem em cada tipo de daltonismo.
 * 2. Correção na imagem inteira (pós-processamento): simula como a pessoa vê
 *    (matrizes de Machado et al., 2009) e devolve a diferença perdida para
 *    canais que ela enxerga (o método "daltonize").
 */

export type ColorVision = 'normal' | 'protanopia' | 'deuteranopia' | 'tritanopia'

export const COLOR_VISION_LABEL: Record<ColorVision, string> = {
  normal: 'Normal',
  protanopia: 'Protanopia (vermelho)',
  deuteranopia: 'Deuteranopia (verde)',
  tritanopia: 'Tritanopia (azul)',
}

/** Raridades: comum, incomum, raro, épico, lendário. */
const RARITY_PALETTES: Record<ColorVision, readonly number[]> = {
  normal: RARITIES.map((r) => r.color),
  // vermelho/verde confundem: troca o verde por ciano e o roxo por magenta claro
  protanopia: [0xa3abb5, 0x35d0ff, 0x2f5bff, 0xf05cff, 0xffc400],
  deuteranopia: [0xa3abb5, 0x35d0ff, 0x2f5bff, 0xf05cff, 0xffc400],
  // azul/amarelo confundem: usa vermelho, verde-água e magenta
  tritanopia: [0xa3abb5, 0x2fe0a0, 0xff4f6d, 0xc02cff, 0xff8a00],
}

const MATE_COLOR: Record<ColorVision, string> = { normal: '#5cf08a', protanopia: '#4aa3ff', deuteranopia: '#4aa3ff', tritanopia: '#ff5c8a' }

let mode: ColorVision = 'normal'

export function setColorVision(m: ColorVision): void {
  mode = m
}

export function colorVision(): ColorVision {
  return mode
}

export function rarityColor(rarity: number): number {
  return RARITY_PALETTES[mode][rarity] ?? 0x888888
}

export function rarityCss(rarity: number): string {
  return `#${rarityColor(rarity).toString(16).padStart(6, '0')}`
}

export function mateCss(): string {
  return MATE_COLOR[mode]
}

type Mat3 = [number, number, number, number, number, number, number, number, number]

const SIMULATE: Record<Exclude<ColorVision, 'normal'>, Mat3> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
}

/** Para onde vai o erro: vermelho/verde → azul e verde; azul → vermelho e verde. */
const SHIFT: Record<Exclude<ColorVision, 'normal'>, Mat3> = {
  protanopia: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  deuteranopia: [0, 0, 0, 0.7, 1, 0, 0.7, 0, 1],
  tritanopia: [1, 0, 0.7, 0, 1, 0.7, 0, 0, 0],
}

function mul(a: Mat3, b: Mat3): Mat3 {
  const o = new Array(9).fill(0) as Mat3
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c]
  return o
}

/** Matriz de correção (linhas) para o modo: C = I + Shift·(I − Simulação). */
export function correctionMatrix(m: ColorVision): Mat3 {
  const I: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1]
  if (m === 'normal') return I
  const sim = SIMULATE[m]
  const err = I.map((v, k) => v - sim[k]) as Mat3
  const shifted = mul(SHIFT[m], err)
  return I.map((v, k) => v + shifted[k]) as Mat3
}

// ---- teclas ----------------------------------------------------------------------

export const ACTIONS = [
  'forward', 'back', 'left', 'right', 'jump', 'sprint', 'crouch', 'walk', 'reload', 'use',
  'buildWall', 'buildFloor', 'buildRamp', 'buildRoof', 'material',
] as const
export type Action = (typeof ACTIONS)[number]

export const ACTION_LABEL: Record<Action, string> = {
  forward: 'Frente', back: 'Trás', left: 'Esquerda', right: 'Direita', jump: 'Pular', sprint: 'Correr',
  crouch: 'Agachar / deslizar', walk: 'Andar devagar', reload: 'Recarregar / girar peça', use: 'Pegar / abrir',
  buildWall: 'Construir parede', buildFloor: 'Construir piso', buildRamp: 'Construir rampa', buildRoof: 'Construir telhado', material: 'Trocar material',
}

export type KeyMap = Record<Action, readonly string[]>

export const DEFAULT_KEYS: KeyMap = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC'],
  walk: ['AltLeft', 'KeyX'],
  reload: ['KeyR'],
  use: ['KeyE', 'KeyF'],
  buildWall: ['KeyQ'],
  buildFloor: ['KeyZ'],
  buildRamp: ['KeyV'],
  buildRoof: ['KeyT'],
  material: ['KeyG'],
}

/** Teclas que não podem ser usadas em ações (menu, inventário, mapa, painel, espaços). */
export const RESERVED_KEYS = new Set(['Escape', 'Tab', 'KeyM', 'KeyH', 'F3', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'])

/** Troca a tecla principal de uma ação; se outra ação usava a tecla, ela fica com a antiga (sem conflito). */
export function rebind(keys: KeyMap, action: Action, code: string): KeyMap {
  if (RESERVED_KEYS.has(code)) return keys
  const next: Record<Action, string[]> = Object.fromEntries(ACTIONS.map((a) => [a, [...keys[a]]])) as Record<Action, string[]>
  const old = next[action][0]
  for (const a of ACTIONS) {
    if (a === action) continue
    const i = next[a].indexOf(code)
    if (i >= 0) {
      if (old) next[a][i] = old
      else next[a].splice(i, 1)
    }
  }
  next[action] = [code, ...next[action].slice(1).filter((c) => c !== code)]
  return next
}

/** Nome legível de uma tecla (KeyW → W, ShiftLeft → Shift). */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  const names: Record<string, string> = {
    Space: 'Espaço', ShiftLeft: 'Shift', ShiftRight: 'Shift dir.', ControlLeft: 'Ctrl', AltLeft: 'Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: 'Ç', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  }
  return names[code] ?? code
}
