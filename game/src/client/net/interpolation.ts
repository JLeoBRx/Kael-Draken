import { lerp, lerpAngle } from '../../shared/math/scalar'
import type { EntityState } from '../../shared/net/protocol'

/**
 * Interpolação de entidades remotas: outros jogadores são desenhados um
 * pouco no passado (≈100 ms), entre dois snapshots conhecidos, o que dá
 * movimento suave mesmo com variação de latência.
 */

/** Estima o relógio do servidor a partir dos ticks recebidos. */
export class ServerClock {
  private offset: number | null = null

  /** Registra um snapshot do tick `tick` recebido no instante local `localMs`. */
  observe(tick: number, tickRate: number, localMs: number): void {
    const sample = (tick * 1000) / tickRate - localMs
    // Pacotes nunca chegam antes de serem enviados: o maior offset é o mais
    // próximo do real. Deriva lentamente para baixo para acompanhar o relógio.
    if (this.offset === null || sample > this.offset) this.offset = sample
    else this.offset = Math.max(sample, this.offset - 0.25)
  }

  get ready(): boolean {
    return this.offset !== null
  }

  serverTimeMs(localMs: number): number {
    return localMs + (this.offset ?? 0)
  }
}

interface Sample {
  t: number
  s: EntityState
}

const MAX_SAMPLES = 40
const MAX_EXTRAPOLATION_MS = 150

export class RemoteEntity {
  name = ''
  skin = 0
  /** Último instante (ms do servidor) em que apareceu num snapshot. */
  lastSeen = 0
  private readonly samples: Sample[] = []

  constructor(readonly id: number) {}

  push(serverMs: number, s: EntityState): void {
    const last = this.samples[this.samples.length - 1]
    if (last && serverMs <= last.t) return
    this.samples.push({ t: serverMs, s })
    if (this.samples.length > MAX_SAMPLES) this.samples.shift()
    this.lastSeen = serverMs
  }

  /** Estado interpolado em `renderMs` (tempo do servidor). Devolve false se ainda não há dados. */
  sample(renderMs: number, out: EntityState): boolean {
    const n = this.samples.length
    if (n === 0) return false
    const first = this.samples[0]
    if (renderMs <= first.t || n === 1) {
      Object.assign(out, first.s)
      return true
    }
    const last = this.samples[n - 1]
    if (renderMs >= last.t) {
      const ahead = Math.min(renderMs - last.t, MAX_EXTRAPOLATION_MS) / 1000
      Object.assign(out, last.s)
      out.x += last.s.vx * ahead
      out.y += last.s.vy * ahead
      out.z += last.s.vz * ahead
      return true
    }
    let i = n - 2
    while (i > 0 && this.samples[i].t > renderMs) i--
    const a = this.samples[i]
    const b = this.samples[i + 1]
    const t = (renderMs - a.t) / (b.t - a.t)
    out.id = b.s.id
    out.x = lerp(a.s.x, b.s.x, t)
    out.y = lerp(a.s.y, b.s.y, t)
    out.z = lerp(a.s.z, b.s.z, t)
    out.yaw = lerpAngle(a.s.yaw, b.s.yaw, t)
    out.pitch = lerp(a.s.pitch, b.s.pitch, t)
    out.vx = lerp(a.s.vx, b.s.vx, t)
    out.vy = lerp(a.s.vy, b.s.vy, t)
    out.vz = lerp(a.s.vz, b.s.vz, t)
    out.flags = t < 0.5 ? a.s.flags : b.s.flags
    return true
  }
}
