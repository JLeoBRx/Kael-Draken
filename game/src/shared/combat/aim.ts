import { AIM_RIG, CharFlag, aimEyeHeight, type CharacterState } from '../movement/character'

/**
 * Referencial da mira: origem no ombro da câmera e eixos frente/direita/cima.
 *
 * A câmera em terceira pessoa fica sobre a reta que passa pelo ombro na
 * direção da mira, então um raio que sai do ombro passa exatamente pelo centro
 * da tela. O servidor usa esta mesma função para saber para onde o jogador
 * mirou — sem confiar em nenhuma posição enviada pelo cliente.
 */
export interface AimFrame {
  ox: number
  oy: number
  oz: number
  fx: number
  fy: number
  fz: number
  rx: number
  rz: number
  ux: number
  uy: number
  uz: number
}

export function createAimFrame(): AimFrame {
  return { ox: 0, oy: 0, oz: 0, fx: 0, fy: 0, fz: -1, rx: 1, rz: 0, ux: 0, uy: 1, uz: 0 }
}

export function aimFrame(c: CharacterState, out: AimFrame): AimFrame {
  const cp = Math.cos(c.pitch)
  const sp = Math.sin(c.pitch)
  const cy = Math.cos(c.yaw)
  const sy = Math.sin(c.yaw)
  out.fx = -sy * cp
  out.fy = sp
  out.fz = -cy * cp
  out.rx = cy
  out.rz = -sy
  // cima = direita × frente
  out.ux = -out.rz * out.fy
  out.uy = out.rz * out.fx - out.rx * out.fz
  out.uz = out.rx * out.fy
  const shoulder = AIM_RIG.shoulder * (c.flags & CharFlag.Aiming ? AIM_RIG.aimShoulderFactor : 1)
  out.ox = c.x + out.rx * shoulder
  out.oy = c.y + aimEyeHeight(c.flags) + AIM_RIG.heightOffset
  out.oz = c.z + out.rz * shoulder
  return out
}

/** Ponto de onde a arma "sai" (peito), usado para checar obstáculos entre a arma e o alvo. */
export function muzzlePoint(c: CharacterState): { x: number; y: number; z: number } {
  const h = c.flags & CharFlag.Crouched ? 0.85 : 1.3
  return { x: c.x + Math.cos(c.yaw) * 0.25, y: c.y + h, z: c.z - Math.sin(c.yaw) * 0.25 }
}
