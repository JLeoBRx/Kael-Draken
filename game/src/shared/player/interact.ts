import type { CharacterState } from '../movement/character'

/**
 * Escolha do que o jogador vai pegar/abrir ao apertar "Interagir".
 * Servidor (autoridade) e cliente (aviso na tela) usam a mesma regra.
 */

export const INTERACT_RANGE = 2.6

export interface Interactable {
  kind: 'item' | 'chest'
  id: number
  x: number
  y: number
  z: number
}

export function pickInteractable(c: CharacterState, candidates: Iterable<Interactable>): Interactable | null {
  const ox = c.x
  const oy = c.y + 0.9
  const oz = c.z
  const cp = Math.cos(c.pitch)
  const fx = -Math.sin(c.yaw) * cp
  const fy = Math.sin(c.pitch)
  const fz = -Math.cos(c.yaw) * cp
  let best: Interactable | null = null
  let bestScore = Infinity
  for (const it of candidates) {
    const dx = it.x - ox
    const dy = it.y - oy
    const dz = it.z - oz
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (dist > INTERACT_RANGE || Math.abs(dy) > 2) continue
    const facing = dist > 1e-3 ? (dx * fx + dy * fy + dz * fz) / dist : 1
    if (facing < -0.2 && dist > 1.2) continue
    // perto e na direção do olhar ganha; baús têm leve prioridade
    const score = dist - facing * 1.4 - (it.kind === 'chest' ? 0.3 : 0)
    if (score < bestScore) {
      bestScore = score
      best = it
    }
  }
  return best
}

/** Ponto de interação de um item no chão (mesma regra no cliente e no servidor). */
export function itemInteractable(id: number, x: number, y: number, z: number): Interactable {
  return { kind: 'item', id, x, y: y + 0.3, z }
}

/** Ponto de interação de um baú. */
export function chestInteractable(index: number, x: number, y: number, z: number): Interactable {
  return { kind: 'chest', id: index, x, y: y + 0.4, z }
}
