import { DEG } from '../math/scalar'

/**
 * Ajustes de movimentação. Compartilhados por cliente (predição) e servidor
 * (autoridade): qualquer diferença aqui causaria correções constantes.
 * Unidades SI (metros, segundos).
 */
export const MOVE = {
  /** Raio da cápsula do personagem. */
  radius: 0.38,
  standHeight: 1.8,
  crouchHeight: 1.2,
  eyeStand: 1.6,
  eyeCrouch: 1.05,

  runSpeed: 5.2,
  sprintSpeed: 7.4,
  walkSpeed: 2.3,
  crouchSpeed: 2.6,
  aimSpeed: 3.4,
  crouchAimSpeed: 2.1,
  swimSpeed: 3.2,
  /** Multiplicador ao andar para trás. */
  backwardFactor: 0.85,

  groundAccel: 55,
  groundDecel: 40,
  airAccel: 14,
  swimAccel: 10,

  gravity: 23,
  /** Altura do pulo ≈ jumpSpeed² / (2·gravity) ≈ 1,32 m. */
  jumpSpeed: 7.8,
  maxFallSpeed: 55,
  coyoteTime: 0.1,
  jumpBufferTime: 0.12,

  /** Inclinação máxima caminhável (rampas de construção são de 45°). */
  maxWalkableSlope: 50 * DEG,
  walkableNy: Math.cos(50 * DEG),
  stepHeight: 0.45,
  snapDistance: 0.35,

  slideMinSpeed: 5.6,
  slideBoost: 2.6,
  slideMaxStartSpeed: 10.5,
  slideMaxSpeed: 14,
  slideFriction: 5,
  slideMinEndSpeed: 3.5,
  slideMaxTime: 1.2,
  slideCooldown: 0.5,
  /** Quanto o deslize pode ser direcionado (rad/s). */
  slideSteer: 1.6,

  /** Profundidade (pés abaixo da superfície) para começar a nadar. */
  swimEnterDepth: 1.25,
  swimExitDepth: 0.95,
  /** Profundidade dos pés ao boiar. */
  swimFloatDepth: 1.1,

  maxPitch: 1.45,
} as const
