import { MOVE } from '../config/movement'
import type { ProjectileDef } from '../config/items'
import { createWorldHit, type CollisionWorld } from '../world/collision-world'

/**
 * Projéteis (foguete, granada). O servidor decide colisões e explosões; o
 * cliente roda o mesmo passo só para desenhar o voo entre os eventos.
 */
export interface ProjectileState {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
}

export interface ProjectileStepResult {
  exploded: boolean
  x: number
  y: number
  z: number
}

const hit = createWorldHit()
const MAX_LIFETIME = 8

export function stepProjectile(p: ProjectileState, def: ProjectileDef, world: CollisionWorld, dt: number, out: ProjectileStepResult): ProjectileStepResult {
  out.exploded = false
  p.age += dt
  p.vy -= MOVE.gravity * def.gravityScale * dt
  const sx = p.vx * dt
  const sy = p.vy * dt
  const sz = p.vz * dt
  const len = Math.sqrt(sx * sx + sy * sy + sz * sz)
  if (len > 1e-6 && world.raycast(p.x, p.y, p.z, sx / len, sy / len, sz / len, len, hit)) {
    if (def.fuse <= 0) {
      out.exploded = true
      out.x = hit.x + hit.nx * 0.1
      out.y = hit.y + hit.ny * 0.1
      out.z = hit.z + hit.nz * 0.1
      p.x = out.x
      p.y = out.y
      p.z = out.z
      return out
    }
    // Quica: reflete a velocidade com perda, e atrito no plano
    const vn = p.vx * hit.nx + p.vy * hit.ny + p.vz * hit.nz
    const e = def.restitution
    p.vx = (p.vx - (1 + e) * vn * hit.nx) * 0.75
    p.vy = (p.vy - (1 + e) * vn * hit.ny) * 0.75
    p.vz = (p.vz - (1 + e) * vn * hit.nz) * 0.75
    p.x = hit.x + hit.nx * 0.06
    p.y = hit.y + hit.ny * 0.06
    p.z = hit.z + hit.nz * 0.06
  } else {
    p.x += sx
    p.y += sy
    p.z += sz
  }
  if ((def.fuse > 0 && p.age >= def.fuse) || p.age >= MAX_LIFETIME || p.y < world.waterLevel - 30) {
    out.exploded = true
    out.x = p.x
    out.y = p.y
    out.z = p.z
  }
  return out
}

/** Dano de explosão a uma distância do centro. */
export function splashDamage(def: ProjectileDef, distance: number): number {
  if (distance >= def.splashRadius) return 0
  const t = distance / def.splashRadius
  return def.damage + (def.minDamage - def.damage) * t
}
