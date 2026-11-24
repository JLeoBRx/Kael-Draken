import { CharFlag } from '../../shared/movement/character'

/**
 * Passos, pousos e entradas na água de qualquer personagem (o local, pelo
 * estado previsto, e os remotos, pelo interpolado). Gera eventos para o som
 * (passos por superfície — ouvir quem se aproxima) e para a poeira.
 */

export type StepKind = 'passo' | 'pouso' | 'agua'

export interface StepEvent {
  kind: StepKind
  x: number
  y: number
  z: number
  /** 0–1: agachado é baixo, correndo é alto, pouso forte é 1. */
  strength: number
  sprint: boolean
}

export interface StepInput {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  flags: number
}

export class StepTracker {
  private dist = 0
  private airborne = false
  private swimming = false
  private fallSpeed = 0
  private lastX = NaN
  private lastZ = NaN

  /** Avança e devolve o evento deste quadro (ou null). */
  update(s: StepInput): StepEvent | null {
    const grounded = (s.flags & CharFlag.Grounded) !== 0
    const swim = (s.flags & CharFlag.Swimming) !== 0
    const riding = (s.flags & (CharFlag.Riding | CharFlag.Skydiving | CharFlag.Gliding)) !== 0
    const dx = Number.isNaN(this.lastX) ? 0 : s.x - this.lastX
    const dz = Number.isNaN(this.lastZ) ? 0 : s.z - this.lastZ
    this.lastX = s.x
    this.lastZ = s.z
    let ev: StepEvent | null = null
    if (swim && !this.swimming && !riding) ev = { kind: 'agua', x: s.x, y: s.y, z: s.z, strength: Math.min(1, Math.abs(this.fallSpeed) / 10 + 0.4), sprint: false }
    this.swimming = swim
    if (!grounded && !swim) {
      this.airborne = true
      this.fallSpeed = Math.min(this.fallSpeed, s.vy)
      return ev
    }
    if (this.airborne && grounded) {
      this.airborne = false
      const impact = -this.fallSpeed
      this.fallSpeed = 0
      this.dist = 0
      if (impact > 4) return { kind: 'pouso', x: s.x, y: s.y, z: s.z, strength: Math.min(1, (impact - 4) / 10 + 0.35), sprint: false }
      return ev
    }
    this.fallSpeed = 0
    if (!grounded || riding) return ev
    const moved = Math.hypot(dx, dz)
    // teletransporte (renascer, reconciliação grande): não conta
    if (moved > 3) return ev
    this.dist += moved
    const speed = Math.hypot(s.vx, s.vz)
    const sprint = (s.flags & CharFlag.Sprinting) !== 0
    const crouched = (s.flags & CharFlag.Crouched) !== 0
    const sliding = (s.flags & CharFlag.Sliding) !== 0
    const stride = sprint ? 1.75 : speed > 3 ? 1.45 : 1.1
    if (speed > 0.8 && !sliding && this.dist >= stride) {
      this.dist = 0
      const strength = crouched ? 0.18 : sprint ? 1 : speed > 3 ? 0.7 : 0.45
      return { kind: 'passo', x: s.x, y: s.y, z: s.z, strength, sprint }
    }
    return ev
  }
}
