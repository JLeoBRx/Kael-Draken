import { MOVE } from '../config/movement'
import { approach, clamp, damp } from '../math/scalar'
import type { Collider, CollisionWorld } from '../world/collision-world'
import { capsuleVsObb, type Contact } from '../world/obb'

/**
 * Controlador de personagem determinístico.
 *
 * `stepCharacter` avança um personagem por um tick fixo a partir de um
 * comando de entrada. É a MESMA função no servidor (que decide a posição
 * oficial) e no cliente (que prevê o próprio movimento e depois reconcilia
 * com o servidor). Por isso ela não usa relógio, aleatoriedade nem estado
 * global além de rascunhos reaproveitados.
 *
 * Convenções: (x, y, z) é o ponto dos pés; yaw = 0 olha para -Z; yaw positivo
 * gira para a esquerda (como `rotation.y` no three.js); pitch positivo olha para cima.
 */

/** Botões do comando de entrada (bitmask). */
export const Buttons = {
  Jump: 1,
  Sprint: 2,
  Crouch: 4,
  Aim: 8,
  Walk: 16,
  Fire: 32,
  Reload: 64,
  /** Interagir: pegar item, abrir baú. */
  Use: 128,
} as const
export const BUTTONS_MASK = 255

/** Estado de movimento (bitmask), também usado pelas animações. */
export const CharFlag = {
  Grounded: 1,
  Crouched: 2,
  Sliding: 4,
  Sprinting: 8,
  Aiming: 16,
  Swimming: 32,
  Walking: 64,
} as const

export interface MoveCommand {
  /** -1 (trás) a 1 (frente). */
  forward: number
  /** -1 (esquerda) a 1 (direita). */
  right: number
  yaw: number
  pitch: number
  buttons: number
}

export interface CharacterState {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  yaw: number
  pitch: number
  flags: number
  slideTime: number
  slideCooldown: number
  /** Tempo desde que saiu do chão (base do "coyote time"). */
  airTime: number
  jumpBuffer: number
  /** Velocidade horizontal máxima no ar, fixada ao sair do chão. */
  airSpeedCap: number
  prevButtons: number
  groundNx: number
  groundNy: number
  groundNz: number
  /** Velocidade de queda no tick em que aterrissou (0 nos demais). */
  landImpact: number
}

/** Campos numéricos do estado, na ordem usada pela serialização. */
export const CHARACTER_STATE_FIELDS = [
  'x', 'y', 'z', 'vx', 'vy', 'vz', 'yaw', 'pitch', 'flags', 'slideTime', 'slideCooldown',
  'airTime', 'jumpBuffer', 'airSpeedCap', 'prevButtons', 'groundNx', 'groundNy', 'groundNz', 'landImpact',
] as const satisfies readonly (keyof CharacterState)[]

export function createCharacterState(x: number, y: number, z: number, yaw = 0): CharacterState {
  return {
    x, y, z, vx: 0, vy: 0, vz: 0, yaw, pitch: 0,
    flags: 0, slideTime: 0, slideCooldown: 0, airTime: 1, jumpBuffer: 0,
    airSpeedCap: MOVE.runSpeed, prevButtons: 0,
    groundNx: 0, groundNy: 1, groundNz: 0, landImpact: 0,
  }
}

export function copyCharacterState(src: CharacterState, dst: CharacterState): CharacterState {
  for (const k of CHARACTER_STATE_FIELDS) dst[k] = src[k]
  return dst
}

export function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) !== 0
}

export function capsuleHeightFor(flags: number): number {
  return flags & CharFlag.Crouched ? MOVE.crouchHeight : MOVE.standHeight
}

export function eyeHeightFor(flags: number): number {
  return flags & CharFlag.Crouched ? MOVE.eyeCrouch : MOVE.eyeStand
}

/**
 * Altura do olho usada pela câmera e pela mira (deslizando fica mais baixa
 * que agachado). Câmera e servidor precisam concordar para o tiro sair na mira.
 */
export function aimEyeHeight(flags: number): number {
  return flags & CharFlag.Sliding ? AIM_RIG.slideEye : eyeHeightFor(flags)
}

/** Geometria da câmera de ombro, compartilhada com o cálculo do tiro no servidor. */
export const AIM_RIG = {
  /** Deslocamento lateral do ombro direito (m). */
  shoulder: 0.62,
  /** Fator do ombro ao mirar. */
  aimShoulderFactor: 0.9,
  /** Altura acima do olho. */
  heightOffset: 0.22,
  slideEye: 0.95,
} as const

// ---------------------------------------------------------------------------
// Colisão

interface MoveReport {
  ground: boolean
  gnx: number
  gny: number
  gnz: number
  wall: boolean
  ceiling: boolean
}

function newReport(): MoveReport {
  return { ground: false, gnx: 0, gny: 1, gnz: 0, wall: false, ceiling: false }
}

function resetReport(r: MoveReport): MoveReport {
  r.ground = false
  r.gnx = 0
  r.gny = 1
  r.gnz = 0
  r.wall = false
  r.ceiling = false
  return r
}

const MAX_SUBSTEP = 0.2
/** Passo fino para sondagens verticais: evita "afundar" além de quinas de degraus. */
const PROBE_SUBSTEP = 0.06
const MAX_SUBSTEPS = 24
const STEP_ASSIST = 0.15
const RESOLVE_ITERATIONS = 4

const contact: Contact = { nx: 0, ny: 0, nz: 0, depth: 0 }
const nearby: Collider[] = []
const terrainNormal = { x: 0, y: 1, z: 0 }
const repMain = newReport()
const repStepUp = newReport()
const repStepAcross = newReport()
const repStepDown = newReport()
const repSnap = newReport()

function applyContact(s: CharacterState, nx: number, ny: number, nz: number, depth: number, rep: MoveReport): void {
  if (ny >= MOVE.walkableNy) {
    // Chão caminhável: empurra só na vertical para não escorregar parado em rampas.
    s.y += depth / ny
    if (s.vy < 0) s.vy = 0
    if (!rep.ground || ny > rep.gny) {
      rep.gnx = nx
      rep.gny = ny
      rep.gnz = nz
    }
    rep.ground = true
    return
  }
  s.x += nx * depth
  s.y += ny * depth
  s.z += nz * depth
  if (ny <= -0.3) {
    rep.ceiling = true
    if (s.vy > 0) s.vy = 0
    return
  }
  rep.wall = true
  const vn = s.vx * nx + s.vy * ny + s.vz * nz
  if (vn < 0) {
    s.vx -= nx * vn
    s.vy -= ny * vn
    s.vz -= nz * vn
  }
}

function resolveOverlaps(s: CharacterState, height: number, world: CollisionWorld, rep: MoveReport): void {
  const r = MOVE.radius
  for (let iter = 0; iter < RESOLVE_ITERATIONS; iter++) {
    let pushed = false
    // Relevo: só a esfera de baixo pode tocar um campo de alturas (sem saliências).
    const above = s.y + r - world.terrain.heightAt(s.x, s.z)
    if (above < r * 3) {
      const n = world.terrain.normalAt(s.x, s.z, terrainNormal)
      const d = above * n.y
      if (d < r) {
        applyContact(s, n.x, n.y, n.z, r - d, rep)
        pushed = true
      }
    }
    world.queryAabb(s.x - r, s.y, s.z - r, s.x + r, s.y + height, s.z + r, nearby)
    for (let k = 0; k < nearby.length; k++) {
      if (capsuleVsObb(s.x, s.y + r, s.z, s.x, s.y + height - r, s.z, r, nearby[k].obb, contact) && contact.depth > 1e-5) {
        applyContact(s, contact.nx, contact.ny, contact.nz, contact.depth, rep)
        pushed = true
      }
    }
    if (!pushed) break
  }
}

function moveBy(
  s: CharacterState, dx: number, dy: number, dz: number, height: number, world: CollisionWorld, rep: MoveReport,
  maxStep = MAX_SUBSTEP, stopOnGround = false,
): void {
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const steps = dist <= maxStep ? 1 : Math.min(MAX_SUBSTEPS, Math.ceil(dist / maxStep))
  const ix = dx / steps
  const iy = dy / steps
  const iz = dz / steps
  for (let k = 0; k < steps; k++) {
    s.x += ix
    s.y += iy
    s.z += iz
    resolveOverlaps(s, height, world, rep)
    if (stopOnGround && rep.ground) return
  }
}

/** Desce até `dist` metros, parando no primeiro chão caminhável. */
function probeDown(s: CharacterState, dist: number, height: number, world: CollisionWorld, rep: MoveReport): void {
  moveBy(s, 0, -dist, 0, height, world, rep, PROBE_SUBSTEP, true)
}

/** Há espaço para ficar de pé na posição atual? */
export function canStandAt(s: CharacterState, world: CollisionWorld): boolean {
  const r = MOVE.radius
  const bottom = s.y + r + 0.15
  const top = s.y + MOVE.standHeight - r
  world.queryAabb(s.x - r, bottom - r, s.z - r, s.x + r, top + r, s.z + r, nearby)
  for (let k = 0; k < nearby.length; k++) {
    if (capsuleVsObb(s.x, bottom, s.z, s.x, top, s.z, r, nearby[k].obb, contact) && contact.depth > 0.01) return false
  }
  return true
}

/** Movimento rente ao chão com tentativa de subir degraus. */
function groundMove(s: CharacterState, dx: number, dy: number, dz: number, height: number, world: CollisionWorld, rep: MoveReport): void {
  const x0 = s.x, y0 = s.y, z0 = s.z
  const vx0 = s.vx, vy0 = s.vy, vz0 = s.vz
  moveBy(s, dx, dy, dz, height, world, rep)
  const want = Math.sqrt(dx * dx + dz * dz)
  if (!rep.wall || want < 1e-4) return
  const ux = dx / want
  const uz = dz / want
  const progA = (s.x - x0) * ux + (s.z - z0) * uz
  if (progA >= want * 0.9) return

  const ax = s.x, ay = s.y, az = s.z
  const avx = s.vx, avy = s.vy, avz = s.vz
  s.x = x0; s.y = y0; s.z = z0
  s.vx = vx0; s.vy = vy0; s.vz = vz0
  moveBy(s, 0, MOVE.stepHeight, 0, height, world, resetReport(repStepUp))
  const raised = s.y - y0
  // Avança pelo menos STEP_ASSIST além do ponto de bloqueio, para o centro da
  // cápsula passar da quina do degrau mesmo quando a velocidade foi cortada.
  const across = Math.max(want, progA + STEP_ASSIST)
  moveBy(s, ux * across, 0, uz * across, height, world, resetReport(repStepAcross))
  probeDown(s, raised + MOVE.snapDistance, height, world, resetReport(repStepDown))
  const progB = (s.x - x0) * ux + (s.z - z0) * uz
  const rise = s.y - y0
  if (repStepDown.ground && progB > progA + 0.01 && rise <= MOVE.stepHeight + 0.01) {
    rep.ground = true
    rep.gnx = repStepDown.gnx
    rep.gny = repStepDown.gny
    rep.gnz = repStepDown.gnz
    rep.wall = repStepAcross.wall
    if (s.vy < 0) s.vy = 0
    return
  }
  s.x = ax; s.y = ay; s.z = az
  s.vx = avx; s.vy = avy; s.vz = avz
}

// ---------------------------------------------------------------------------
// Passo principal

/** Avança o personagem por `dt` segundos. Modifica `s` no lugar. */
export function stepCharacter(s: CharacterState, cmd: MoveCommand, world: CollisionWorld, dt: number): void {
  const buttons = cmd.buttons & BUTTONS_MASK
  const pressed = buttons & ~s.prevButtons
  s.yaw = cmd.yaw
  s.pitch = clamp(cmd.pitch, -MOVE.maxPitch, MOVE.maxPitch)
  s.landImpact = 0

  let flags = s.flags
  let grounded = (flags & CharFlag.Grounded) !== 0
  let crouched = (flags & CharFlag.Crouched) !== 0
  let sliding = (flags & CharFlag.Sliding) !== 0
  const wasSprinting = (flags & CharFlag.Sprinting) !== 0
  let swimming = (flags & CharFlag.Swimming) !== 0

  s.slideCooldown = Math.max(0, s.slideCooldown - dt)
  s.jumpBuffer = pressed & Buttons.Jump ? MOVE.jumpBufferTime : Math.max(0, s.jumpBuffer - dt)

  // Direção desejada no plano XZ
  let f = clamp(cmd.forward, -1, 1)
  let r = clamp(cmd.right, -1, 1)
  const inputLen = Math.sqrt(f * f + r * r)
  if (inputLen > 1) {
    f /= inputLen
    r /= inputLen
  }
  const sinY = Math.sin(s.yaw)
  const cosY = Math.cos(s.yaw)
  const wx = -sinY * f + cosY * r
  const wz = -cosY * f - sinY * r
  const hasInput = inputLen > 0.01

  const wantsCrouch = (buttons & Buttons.Crouch) !== 0
  const wantsWalk = (buttons & Buttons.Walk) !== 0

  // Água
  const depth = world.waterLevel - s.y
  swimming = swimming ? depth > MOVE.swimExitDepth : depth > MOVE.swimEnterDepth
  if (swimming) {
    grounded = false
    sliding = false
    if (crouched && canStandAt(s, world)) crouched = false
  }
  const aiming = (buttons & Buttons.Aim) !== 0 && !swimming

  // Postura e deslize
  let hSpeed = Math.sqrt(s.vx * s.vx + s.vz * s.vz)
  if (!sliding && !swimming && grounded && pressed & Buttons.Crouch && hSpeed >= MOVE.slideMinSpeed && s.slideCooldown <= 0) {
    sliding = true
    crouched = true
    s.slideTime = 0
    const boosted = Math.min(hSpeed + MOVE.slideBoost, MOVE.slideMaxStartSpeed)
    s.vx *= boosted / hSpeed
    s.vz *= boosted / hSpeed
    hSpeed = boosted
  }
  if (!swimming) {
    if (wantsCrouch && !crouched) crouched = true
    else if (!wantsCrouch && crouched && !sliding && canStandAt(s, world)) crouched = false
  }

  const sprinting = !crouched && !aiming && !swimming && !wantsWalk && (buttons & Buttons.Sprint) !== 0 && f > 0.3 && (grounded || wasSprinting)
  const walking = wantsWalk && !sprinting

  // Velocidade horizontal
  if (sliding) {
    if (!grounded || !wantsCrouch) {
      sliding = false
      s.slideCooldown = MOVE.slideCooldown
    } else {
      s.slideTime += dt
      const n = s.groundNy
      const gScale = MOVE.gravity * n
      s.vx += gScale * s.groundNx * dt
      s.vz += gScale * s.groundNz * dt
      let hs = Math.sqrt(s.vx * s.vx + s.vz * s.vz)
      // Direcionamento limitado em direção à entrada
      if (hasInput && hs > 0.1) {
        const cur = Math.atan2(s.vx, s.vz)
        const want = Math.atan2(wx, wz)
        let diff = want - cur
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        const maxTurn = MOVE.slideSteer * dt
        const ang = cur + clamp(diff, -maxTurn, maxTurn)
        s.vx = Math.sin(ang) * hs
        s.vz = Math.cos(ang) * hs
      }
      const downhill = (s.vx * s.groundNx + s.vz * s.groundNz) * MOVE.gravity * n / Math.max(hs, 0.001)
      const decel = MOVE.slideFriction * dt
      const next = Math.min(Math.max(0, hs - decel), MOVE.slideMaxSpeed)
      if (hs > 0) {
        s.vx *= next / hs
        s.vz *= next / hs
      }
      hs = next
      if (hs < MOVE.slideMinEndSpeed || (s.slideTime > MOVE.slideMaxTime && downhill < MOVE.slideFriction)) {
        sliding = false
        s.slideCooldown = MOVE.slideCooldown
      }
    }
  }

  if (!sliding) {
    if (swimming) {
      const target = MOVE.swimSpeed
      s.vx = approach(s.vx, wx * target, MOVE.swimAccel * dt)
      s.vz = approach(s.vz, wz * target, MOVE.swimAccel * dt)
    } else if (grounded) {
      let speed: number = MOVE.runSpeed
      if (crouched) speed = MOVE.crouchSpeed
      else if (sprinting) speed = MOVE.sprintSpeed
      else if (walking) speed = MOVE.walkSpeed
      if (aiming) speed = Math.min(speed, crouched ? MOVE.crouchAimSpeed : MOVE.aimSpeed)
      if (f < -0.1) speed *= MOVE.backwardFactor
      const dvx = wx * speed - s.vx
      const dvz = wz * speed - s.vz
      const dvl = Math.sqrt(dvx * dvx + dvz * dvz)
      const maxDelta = (hasInput ? MOVE.groundAccel : MOVE.groundDecel) * dt
      if (dvl <= maxDelta) {
        s.vx += dvx
        s.vz += dvz
      } else {
        s.vx += (dvx / dvl) * maxDelta
        s.vz += (dvz / dvl) * maxDelta
      }
    } else if (hasInput) {
      s.vx += wx * MOVE.airAccel * dt
      s.vz += wz * MOVE.airAccel * dt
      const hs = Math.sqrt(s.vx * s.vx + s.vz * s.vz)
      if (hs > s.airSpeedCap) {
        s.vx *= s.airSpeedCap / hs
        s.vz *= s.airSpeedCap / hs
      }
    }
  }

  // Pulo
  let jumped = false
  const canJump = s.jumpBuffer > 0 && !swimming && (grounded || (s.airTime <= MOVE.coyoteTime && s.vy <= 0))
  if (canJump) {
    if (sliding) {
      sliding = false
      s.slideCooldown = MOVE.slideCooldown
    }
    if (crouched && canStandAt(s, world)) crouched = false
    s.vy = MOVE.jumpSpeed
    s.jumpBuffer = 0
    s.airTime = MOVE.coyoteTime + 1
    s.airSpeedCap = Math.max(Math.sqrt(s.vx * s.vx + s.vz * s.vz), MOVE.runSpeed)
    grounded = false
    jumped = true
  }

  // Vertical
  const vyBefore = s.vy
  if (swimming) {
    const targetY = world.waterLevel - MOVE.swimFloatDepth
    const targetVy = clamp((targetY - s.y) * 4, -3, 2.5)
    s.vy = damp(s.vy, targetVy, 5, dt)
  } else if (!grounded) {
    s.vy = Math.max(s.vy - MOVE.gravity * dt, -MOVE.maxFallSpeed)
  }

  // Deslocamento com colisão
  const height = crouched ? MOVE.crouchHeight : MOVE.standHeight
  const rep = resetReport(repMain)
  if (grounded) {
    const gny = s.groundNy > 0.1 ? s.groundNy : 1
    const tangentVy = -(s.groundNx * s.vx + s.groundNz * s.vz) / gny
    s.vy = 0
    groundMove(s, s.vx * dt, tangentVy * dt, s.vz * dt, height, world, rep)
    // Gruda no chão (descidas, degraus para baixo)
    const sx = s.x, sy = s.y, sz = s.z
    probeDown(s, MOVE.snapDistance, height, world, resetReport(repSnap))
    if (repSnap.ground) {
      s.groundNx = repSnap.gnx
      s.groundNy = repSnap.gny
      s.groundNz = repSnap.gnz
      s.vy = 0
      s.airTime = 0
    } else {
      s.x = sx; s.y = sy; s.z = sz
      grounded = false
      s.airTime = dt
      s.airSpeedCap = Math.max(Math.sqrt(s.vx * s.vx + s.vz * s.vz), MOVE.runSpeed)
    }
  } else {
    const fallSpeed = -s.vy
    // Integração trapezoidal: exata para aceleração constante (altura do pulo correta).
    const dy = swimming ? s.vy * dt : (vyBefore + s.vy) * 0.5 * dt
    moveBy(s, s.vx * dt, dy, s.vz * dt, height, world, rep)
    if (rep.ground && s.vy <= 0 && !swimming && !jumped) {
      grounded = true
      s.groundNx = rep.gnx
      s.groundNy = rep.gny
      s.groundNz = rep.gnz
      s.landImpact = Math.max(0, fallSpeed)
      s.vy = 0
      s.airTime = 0
    } else {
      s.airTime += dt
    }
  }

  // Limites do mapa e segurança contra atravessar o relevo
  const b = world.bound
  if (s.x < -b) { s.x = -b; if (s.vx < 0) s.vx = 0 }
  else if (s.x > b) { s.x = b; if (s.vx > 0) s.vx = 0 }
  if (s.z < -b) { s.z = -b; if (s.vz < 0) s.vz = 0 }
  else if (s.z > b) { s.z = b; if (s.vz > 0) s.vz = 0 }
  const ground = world.terrain.heightAt(s.x, s.z)
  if (s.y < ground - 0.5) {
    s.y = ground
    if (s.vy < 0) s.vy = 0
  }

  flags = 0
  if (grounded) flags |= CharFlag.Grounded
  if (crouched) flags |= CharFlag.Crouched
  if (sliding) flags |= CharFlag.Sliding
  if (sprinting) flags |= CharFlag.Sprinting
  if (aiming) flags |= CharFlag.Aiming
  if (swimming) flags |= CharFlag.Swimming
  if (walking) flags |= CharFlag.Walking
  s.flags = flags
  s.prevButtons = buttons
}
