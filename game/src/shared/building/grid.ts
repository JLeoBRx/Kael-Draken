import { BUILD, BuildKind } from '../config/building'
import type { CharacterState } from '../movement/character'
import { makeObb, rampObb, type Obb } from '../world/obb'

/**
 * Grade de construção. Célula (i, j) cobre x ∈ [4i, 4i+4], z ∈ [4j, 4j+4];
 * nível k começa em y = 4k (absoluto).
 *
 * - Piso (i, j, k): laje com topo em y = 4k.
 * - Parede (i, j, k, dir): dir 0 = ao longo de X na borda z = 4j (de x = 4i a 4i+4);
 *   dir 1 = ao longo de Z na borda x = 4i (de z = 4j a 4j+4). Altura de 4 m.
 * - Rampa (i, j, k, dir): sobe 4 m na direção dir (0 = −Z/norte, 1 = −X/oeste,
 *   2 = +Z/sul, 3 = +X/leste) — 45°.
 * - Telhado (i, j, k, dir): duas águas com cumeeira no meio; dir 0 = cumeeira ao
 *   longo de X, dir 1 = ao longo de Z.
 */

export interface PieceSpec {
  kind: number
  i: number
  j: number
  k: number
  dir: number
}

const C = BUILD.cell
const L = BUILD.level
/** Folga mínima entre o jogador e a parede que ele ergue à frente. */
const WALL_CLEARANCE = 0.6
/** Pés até 1 m abaixo do próximo nível já contam como nele. */
const BODY_BIAS = 1.0
/** Altura (relativa à base do nível) do olhar para escolher o nível de cima. */
const LOOK_UP_BASE = 2.2

export function pieceKey(s: PieceSpec): string {
  switch (s.kind) {
    case BuildKind.Wall:
      return `W${s.dir}:${s.i}:${s.j}:${s.k}`
    case BuildKind.Floor:
      return `F:${s.i}:${s.j}:${s.k}`
    case BuildKind.Ramp:
      return `R:${s.i}:${s.j}:${s.k}`
    default:
      return `C:${s.i}:${s.j}:${s.k}`
  }
}

export function sameSpec(a: PieceSpec, b: PieceSpec): boolean {
  return a.kind === b.kind && a.i === b.i && a.j === b.j && a.k === b.k && a.dir === b.dir
}

/** Caixas de colisão da peça (1, ou 2 no telhado). */
export function pieceObbs(s: PieceSpec): Obb[] {
  const x0 = s.i * C
  const z0 = s.j * C
  const y0 = s.k * L
  const cx = x0 + C / 2
  const cz = z0 + C / 2
  const hw = C / 2
  switch (s.kind) {
    case BuildKind.Wall: {
      const t = BUILD.wallThickness / 2
      return s.dir === 0 ? [makeObb(cx, y0 + L / 2, z0, hw, L / 2, t)] : [makeObb(x0, y0 + L / 2, cz, t, L / 2, hw)]
    }
    case BuildKind.Floor: {
      const t = BUILD.floorThickness / 2
      return [makeObb(cx, y0 - t, cz, hw, t, hw)]
    }
    case BuildKind.Ramp: {
      const yaw = (s.dir & 3) * (Math.PI / 2)
      const fx = -Math.sin(yaw)
      const fz = -Math.cos(yaw)
      return [rampObb(cx - fx * hw, y0, cz - fz * hw, C, L, Math.PI / 4, yaw, BUILD.rampThickness)]
    }
    default: {
      const rise = BUILD.roofRise
      const angle = Math.atan2(rise, hw)
      const t = BUILD.roofThickness
      if ((s.dir & 1) === 0) {
        return [rampObb(cx, y0, z0 + C, C, rise, angle, 0, t), rampObb(cx, y0, z0, C, rise, angle, Math.PI, t)]
      }
      return [rampObb(x0 + C, y0, cz, C, rise, angle, Math.PI / 2, t), rampObb(x0, y0, cz, C, rise, angle, -Math.PI / 2, t)]
    }
  }
}

/** Direção cardinal mais próxima do yaw (0 = −Z, 1 = −X, 2 = +Z, 3 = +X). */
export function facingDir(yaw: number): number {
  return ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4
}

/** Vetor horizontal da direção cardinal. */
export function dirVector(dir: number): [number, number] {
  switch (dir & 3) {
    case 0: return [0, -1]
    case 1: return [-1, 0]
    case 2: return [0, 1]
    default: return [1, 0]
  }
}

/**
 * Onde a peça do tipo `kind` seria construída agora (o "fantasma"): ponto a
 * BUILD.reach metros à frente dos olhos, encaixado na grade. A altura sobe de
 * nível olhando para cima; rampas continuam a rampa em que o jogador está.
 */
export function buildTarget(c: CharacterState, kind: number, rot: number, hasRamp: (i: number, j: number, k: number, dir: number) => boolean): PieceSpec {
  const cp = Math.cos(c.pitch)
  const tx = c.x - Math.sin(c.yaw) * cp * BUILD.reach
  const tz = c.z - Math.cos(c.yaw) * cp * BUILD.reach
  const i = Math.floor(tx / C)
  const j = Math.floor(tz / C)
  // Nível em que está a maior parte do corpo (a grade vertical é absoluta: em
  // chão alto, o nível começa abaixo dos pés). Olhar para cima (~34°) sobe um.
  const feetK = Math.floor((c.y + BODY_BIAS) / L)
  const k = feetK + (LOOK_UP_BASE + Math.sin(c.pitch) * BUILD.reach >= L ? 1 : 0)
  const facing = facingDir(c.yaw)
  switch (kind) {
    case BuildKind.Floor:
      return { kind, i, j, k, dir: 0 }
    case BuildKind.Roof:
      return { kind, i, j, k, dir: (facing + rot) & 1 }
    case BuildKind.Wall: {
      // Primeira linha da grade à frente (na direção cardinal do olhar) que
      // não atravessa o próprio jogador; a outra coordenada vem do alvo.
      const [vx, vz] = dirVector(facing)
      if (vz !== 0) {
        const line = vz < 0 ? Math.floor((c.z - WALL_CLEARANCE) / C) : Math.ceil((c.z + WALL_CLEARANCE) / C)
        return { kind, i, j: line, k, dir: 0 }
      }
      const line = vx < 0 ? Math.floor((c.x - WALL_CLEARANCE) / C) : Math.ceil((c.x + WALL_CLEARANCE) / C)
      return { kind, i: line, j, k, dir: 1 }
    }
    default: {
      const dir = (facing + rot) & 3
      const [vx, vz] = dirVector(dir)
      let rk = c.pitch > 0.6 ? feetK + 1 : feetK
      // continua a rampa da célula anterior (corrida de rampas)
      if (hasRamp(i - vx, j - vz, feetK, dir)) rk = feetK + 1
      return { kind: BuildKind.Ramp, i, j, k: rk, dir }
    }
  }
}
