import * as THREE from 'three'
import { clamp, damp } from '../../shared/math/scalar'
import { AIM_RIG, CharFlag, aimEyeHeight } from '../../shared/movement/character'
import { createWorldHit, type CollisionWorld } from '../../shared/world/collision-world'

/**
 * Câmera em terceira pessoa sobre o ombro.
 *
 * - Yaw/pitch vêm direto da entrada a cada quadro (mira responsiva).
 * - Aproxima ao mirar, afasta um pouco no sprint, com FOV dinâmico.
 * - Colide com o mundo: aproxima rápido quando bloqueada e volta devagar.
 * - Suaviza a altura (degraus, agachar) sem atrasar a horizontal.
 */

const SHOULDER = AIM_RIG.shoulder
const HEIGHT_OFFSET = AIM_RIG.heightOffset
const DIST_NORMAL = 3.1
const DIST_SPRINT = 3.5
const DIST_AIM = 1.55
const DIST_SWIM = 3.6
/** A bordo do dirigível e caindo: câmera bem mais afastada. */
const DIST_RIDE = 16
const DIST_FALL = 6.5
const CAMERA_RADIUS = 0.22

export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera
  private readonly hit = createWorldHit()
  private eye = 1.6
  private pivotY = 0
  private dist = DIST_NORMAL
  private collidedDist = DIST_NORMAL
  private fovOffset = 0
  private initialized = false
  readonly forward = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly pivot = new THREE.Vector3()
  private readonly shoulder = new THREE.Vector3()

  constructor(aspect: number, private baseFov: number, drawDistance = 1600) {
    this.camera = new THREE.PerspectiveCamera(baseFov, aspect, 0.08, drawDistance)
    this.camera.rotation.order = 'YXZ'
  }

  private aimFov: number | null = null

  setBaseFov(fov: number): void {
    this.baseFov = fov
  }

  /** FOV ao mirar com a arma atual (null = padrão: base − 16°). */
  setAimFov(fov: number | null): void {
    this.aimFov = fov
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  update(target: { x: number; y: number; z: number }, flags: number, yaw: number, pitch: number, world: CollisionWorld, dt: number): void {
    const aiming = (flags & CharFlag.Aiming) !== 0
    const sprinting = (flags & CharFlag.Sprinting) !== 0
    const sliding = (flags & CharFlag.Sliding) !== 0
    const swimming = (flags & CharFlag.Swimming) !== 0

    const eyeTarget = aimEyeHeight(flags)
    if (!this.initialized) {
      this.eye = eyeTarget
      this.pivotY = target.y
      this.initialized = true
    }
    this.eye = damp(this.eye, eyeTarget, 12, dt)
    // altura do pivô: segue rápido, mas suaviza "degraus" pequenos
    const dy = target.y - this.pivotY
    this.pivotY = Math.abs(dy) > 1.5 ? target.y : damp(this.pivotY, target.y, 18, dt)

    const cp = Math.cos(pitch)
    this.forward.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp)
    this.right.set(Math.cos(yaw), 0, -Math.sin(yaw))
    this.pivot.set(target.x, this.pivotY + this.eye, target.z)

    const riding = (flags & CharFlag.Riding) !== 0
    const falling = (flags & (CharFlag.Skydiving | CharFlag.Gliding)) !== 0
    const wantDist = riding ? DIST_RIDE : falling ? DIST_FALL : aiming ? DIST_AIM : swimming ? DIST_SWIM : sprinting ? DIST_SPRINT : DIST_NORMAL
    this.dist = damp(this.dist, wantDist, aiming ? 16 : 7, dt)

    // ombro: garante que o próprio ombro não está dentro de uma parede
    let shoulderDist = SHOULDER * (aiming ? AIM_RIG.aimShoulderFactor : 1)
    if (world.raycast(this.pivot.x, this.pivot.y, this.pivot.z, this.right.x, 0, this.right.z, shoulderDist + CAMERA_RADIUS, this.hit)) {
      shoulderDist = Math.max(0, this.hit.t - CAMERA_RADIUS)
    }
    this.shoulder.copy(this.pivot).addScaledVector(this.right, shoulderDist)
    this.shoulder.y += HEIGHT_OFFSET

    // braço da câmera
    let allowed = this.dist
    if (world.raycast(this.shoulder.x, this.shoulder.y, this.shoulder.z, -this.forward.x, -this.forward.y, -this.forward.z, this.dist + CAMERA_RADIUS, this.hit)) {
      allowed = Math.max(0.3, this.hit.t - CAMERA_RADIUS)
    }
    this.collidedDist = allowed < this.collidedDist ? allowed : damp(this.collidedDist, allowed, 5, dt)

    const cam = this.camera
    cam.position.copy(this.shoulder).addScaledVector(this.forward, -this.collidedDist)
    // nunca abaixo do relevo
    const ground = world.terrain.heightAt(cam.position.x, cam.position.z) + 0.25
    if (cam.position.y < ground) cam.position.y = ground
    cam.rotation.set(pitch, yaw, 0, 'YXZ')

    const aimOffset = this.aimFov !== null ? Math.min(this.aimFov - this.baseFov, -8) : -16
    const fovTarget = (aiming ? aimOffset : 0) + (sprinting ? 6 : 0) + (sliding ? 8 : 0)
    this.fovOffset = damp(this.fovOffset, fovTarget, aiming ? 14 : 9, dt)
    const fov = clamp(this.baseFov + this.fovOffset, 15, 110)
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov
      cam.updateProjectionMatrix()
    }
  }
}
