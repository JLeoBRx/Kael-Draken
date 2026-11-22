/** Utilidades escalares usadas pela simulação e pelo cliente. Sem dependências. */

export const TAU = Math.PI * 2
export const DEG = Math.PI / 180

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Normaliza um ângulo para o intervalo (-π, π]. */
export function wrapAngle(a: number): number {
  a = a % TAU
  if (a > Math.PI) a -= TAU
  else if (a <= -Math.PI) a += TAU
  return a
}

/** Interpola ângulos pelo menor arco. */
export function lerpAngle(a: number, b: number, t: number): number {
  return a + wrapAngle(b - a) * t
}

/**
 * Suavização exponencial independente da taxa de quadros.
 * `lambda` é a "velocidade" (1/s): maior chega mais rápido ao alvo.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

export function dampAngle(current: number, target: number, lambda: number, dt: number): number {
  return lerpAngle(current, target, 1 - Math.exp(-lambda * dt))
}

/** Move `current` em direção a `target` sem ultrapassar `maxDelta`. */
export function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) return Math.min(current + maxDelta, target)
  return Math.max(current - maxDelta, target)
}
