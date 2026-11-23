import { BuildKind } from '../../shared/config/building'
import { Buttons } from '../../shared/movement/character'
import { PICKAXE_SLOT } from '../../shared/player/player'
import type { Settings } from '../settings'

/**
 * Entrada: teclado + mouse (com captura do ponteiro) e controle (Gamepad API,
 * mapeamento padrão). O resultado é sempre o mesmo formato: eixos de
 * movimento, botões do protocolo e deltas de olhar em radianos.
 *
 * Atalhos de navegador: o agachar usa C (não Ctrl), porque Ctrl+W fecha a
 * aba e o navegador não permite bloquear isso.
 */

export interface InputFrame {
  forward: number
  right: number
  buttons: number
  /** Radianos a somar ao yaw (positivo = esquerda). */
  lookYaw: number
  /** Radianos a somar ao pitch (positivo = cima). */
  lookPitch: number
  /** Espaço escolhido diretamente (1 = picareta, 2–6 = espaços 0–4) ou null. */
  slot: number | null
  /** Passos de troca de espaço (roda do mouse, LB/RB). */
  slotStep: number
  /** Peça escolhida neste quadro (Q/Z/V/T; -1 = próxima, no controle) ou null. */
  build: number | null
  /** Girar a peça (R no modo construção). */
  rotate: boolean
  /** Trocar o material (G; botão direito no modo construção). */
  cycleMaterial: boolean
}

export const KEYBINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  crouch: ['KeyC'],
  walk: ['AltLeft', 'KeyX'],
  reload: ['KeyR'],
  use: ['KeyE', 'KeyF'],
  buildWall: ['KeyQ'],
  buildFloor: ['KeyZ'],
  buildRamp: ['KeyV'],
  buildRoof: ['KeyT'],
  material: ['KeyG'],
} as const

/** Tecla 1 = picareta; 2–6 = espaços do inventário. */
const SLOT_KEYS: Record<string, number> = { Digit1: PICKAXE_SLOT, Digit2: 0, Digit3: 1, Digit4: 2, Digit5: 3, Digit6: 4 }
const BUILD_KEYS: Record<string, number> = {
  KeyQ: BuildKind.Wall,
  KeyZ: BuildKind.Floor,
  KeyV: BuildKind.Ramp,
  KeyT: BuildKind.Roof,
}

/** Radianos por pixel de mouse com sensibilidade 1. */
const MOUSE_RAD_PER_PX = 0.0022
/** Radianos por segundo do analógico direito no máximo, sensibilidade 1. */
const STICK_RAD_PER_S = 3.4
const DEADZONE = 0.15

export interface GamepadLike {
  axes: readonly number[]
  buttons: readonly { pressed: boolean; value: number }[]
}

export interface GamepadReading {
  forward: number
  right: number
  lookX: number
  lookY: number
  buttons: number
  crouchPressed: boolean
  pause: boolean
  next: boolean
  prev: boolean
  inventory: boolean
  /** Direcional: cima = próxima peça (entra no modo construção), esquerda = girar, direita = material. */
  build: boolean
  rotate: boolean
  material: boolean
}

function deadzone(x: number, y: number): [number, number] {
  const m = Math.hypot(x, y)
  if (m < DEADZONE) return [0, 0]
  const scaled = Math.min(1, (m - DEADZONE) / (1 - DEADZONE))
  return [(x / m) * scaled, (y / m) * scaled]
}

/** Converte um controle (mapeamento "standard") em intenções de jogo. Função pura, testável. */
export function readGamepad(gp: GamepadLike): GamepadReading {
  const ax = (i: number) => gp.axes[i] ?? 0
  const btn = (i: number) => gp.buttons[i]?.pressed ?? false
  const [mx, my] = deadzone(ax(0), ax(1))
  const [lx, ly] = deadzone(ax(2), ax(3))
  // curva quadrática no olhar para precisão em pequenos ajustes
  const curve = (v: number) => Math.sign(v) * v * v
  let buttons = 0
  if (btn(0)) buttons |= Buttons.Jump
  if (btn(10)) buttons |= Buttons.Sprint
  if ((gp.buttons[6]?.value ?? 0) > 0.4) buttons |= Buttons.Aim
  if ((gp.buttons[7]?.value ?? 0) > 0.4) buttons |= Buttons.Fire
  if (btn(2)) buttons |= Buttons.Use
  if (btn(3)) buttons |= Buttons.Reload
  return {
    forward: -my || 0,
    right: mx,
    lookX: curve(lx),
    lookY: curve(ly),
    buttons,
    crouchPressed: btn(1),
    pause: btn(9),
    next: btn(5),
    prev: btn(4),
    inventory: btn(8),
    build: btn(12),
    rotate: btn(14),
    material: btn(15),
  }
}

export class InputManager {
  /** Entrada de jogo ativa (falso em menus e pausa). */
  enabled = false
  pointerLocked = false
  onPauseRequest: (() => void) | null = null
  onToggleDebug: (() => void) | null = null
  onToggleHelp: (() => void) | null = null
  onPointerLockLost: (() => void) | null = null
  onToggleInventory: (() => void) | null = null
  onToggleMap: (() => void) | null = null

  private readonly keys = new Set<string>()
  private mouseButtons = 0
  private mouseDX = 0
  private mouseDY = 0
  private crouchLatched = false
  private crouchHeldPrev = false
  /** Botões pressionados desde o último tick (toques curtos não se perdem entre ticks). */
  private tickLatch = 0
  private prevButtons = 0
  private padCrouchPrev = false
  private padPausePrev = false
  private padNextPrev = false
  private padPrevPrev = false
  private padInvPrev = false
  private padBuildPrev = false
  private padRotatePrev = false
  private padMaterialPrev = false
  private slotDirect: number | null = null
  private slotSteps = 0
  private buildDirect: number | null = null
  private rotateLatch = false
  private materialLatch = false
  private readonly listeners: [EventTarget, string, EventListener, AddEventListenerOptions?][] = []

  /**
   * `keyboardMouse`: lê teclado e mouse (o jogador 2 da tela dividida não).
   * `pad`: qual controle ler — 'any' (o primeiro conectado), um índice da
   * ordem de controles conectados, ou null (nenhum).
   */
  constructor(private readonly canvas: HTMLCanvasElement, private settings: Settings, private devices: { keyboardMouse: boolean; pad: 'any' | number | null } = { keyboardMouse: true, pad: 'any' }) {}

  /** Troca os dispositivos lidos (tela dividida: o jogador 1 deixa o controle para o 2). */
  setDevices(d: { keyboardMouse: boolean; pad: 'any' | number | null }): void {
    this.devices = d
  }

  updateSettings(s: Settings): void {
    this.settings = s
  }

  attach(): void {
    const on = <K extends string>(target: EventTarget, type: K, fn: (e: Event) => void, opts?: AddEventListenerOptions) => {
      target.addEventListener(type, fn, opts)
      this.listeners.push([target, type, fn, opts])
    }
    if (!this.devices.keyboardMouse) return
    on(window, 'keydown', (e) => this.keyDown(e as KeyboardEvent))
    on(window, 'keyup', (e) => {
      this.keys.delete((e as KeyboardEvent).code)
    })
    on(window, 'blur', () => this.clear())
    on(document, 'mousemove', (e) => {
      if (!this.pointerLocked || !this.enabled) return
      const m = e as MouseEvent
      this.mouseDX += m.movementX
      this.mouseDY += m.movementY
    })
    on(this.canvas, 'mousedown', (e) => {
      // Sem o ponteiro capturado, o clique serve só para capturá-lo (não atira).
      if (!this.pointerLocked || !this.enabled) return
      const b = (e as MouseEvent).button
      this.mouseButtons |= 1 << b
      if (b === 0) this.tickLatch |= Buttons.Fire
    })
    on(this.canvas, 'wheel', (e) => {
      if (!this.pointerLocked || !this.enabled) return
      e.preventDefault()
      this.slotSteps += Math.sign((e as WheelEvent).deltaY)
    }, { passive: false })
    on(window, 'mouseup', (e) => {
      this.mouseButtons &= ~(1 << (e as MouseEvent).button)
    })
    on(this.canvas, 'contextmenu', (e) => e.preventDefault())
    on(document, 'pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas
      const lost = this.pointerLocked && !locked
      this.pointerLocked = locked
      if (lost) this.onPointerLockLost?.()
    })
  }

  detach(): void {
    for (const [t, type, fn, opts] of this.listeners) t.removeEventListener(type, fn, opts)
    this.listeners.length = 0
    this.clear()
  }

  /** Tenta capturar o ponteiro. Não falha se o navegador negar (o teclado continua funcionando). */
  async requestPointerLock(): Promise<boolean> {
    if (document.pointerLockElement === this.canvas) return true
    try {
      await this.canvas.requestPointerLock()
      return document.pointerLockElement === this.canvas
    } catch {
      return false
    }
  }

  releasePointerLock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  clear(): void {
    this.keys.clear()
    this.mouseButtons = 0
    this.mouseDX = 0
    this.mouseDY = 0
    this.crouchHeldPrev = false
    this.tickLatch = 0
    this.slotDirect = null
    this.slotSteps = 0
    this.buildDirect = null
    this.rotateLatch = false
    this.materialLatch = false
  }

  /** Chamar depois que um tick usou o quadro de entrada. */
  consumeTickLatch(): void {
    this.tickLatch = 0
  }

  resetToggles(): void {
    this.crouchLatched = false
  }

  private keyDown(e: KeyboardEvent): void {
    if (e.code === 'F3') {
      e.preventDefault()
      this.onToggleDebug?.()
      return
    }
    if (e.code === 'Escape' && !this.pointerLocked) {
      this.onPauseRequest?.()
      return
    }
    if (e.code === 'Tab') {
      e.preventDefault()
      if (!e.repeat) this.onToggleInventory?.()
      return
    }
    if (!this.enabled) return
    if (e.code === 'KeyH') this.onToggleHelp?.()
    if (e.code === 'KeyM' && !e.repeat) this.onToggleMap?.()
    const slot = SLOT_KEYS[e.code]
    if (slot !== undefined) this.slotDirect = slot
    if (!e.repeat) {
      const build = BUILD_KEYS[e.code]
      if (build !== undefined) this.buildDirect = build
      if ((KEYBINDINGS.reload as readonly string[]).includes(e.code)) this.rotateLatch = true
      if ((KEYBINDINGS.material as readonly string[]).includes(e.code)) this.materialLatch = true
    }
    if (!e.repeat && (KEYBINDINGS.use as readonly string[]).includes(e.code)) this.tickLatch |= Buttons.Use
    if (!e.repeat && (KEYBINDINGS.reload as readonly string[]).includes(e.code)) this.tickLatch |= Buttons.Reload
    // Evita rolagem da página, menu do Alt e afins durante o jogo.
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'AltLeft' || e.code === 'Tab') e.preventDefault()
    if (!e.repeat && (KEYBINDINGS.jump as readonly string[]).includes(e.code)) this.tickLatch |= Buttons.Jump
    this.keys.add(e.code)
  }

  private any(codes: readonly string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true
    return false
  }

  /** Lê o estado atual e consome os deltas de olhar acumulados. */
  sample(frameDt: number, aiming: boolean): InputFrame {
    const out: InputFrame = {
      forward: 0, right: 0, buttons: 0, lookYaw: 0, lookPitch: 0,
      slot: this.slotDirect, slotStep: this.slotSteps,
      build: this.buildDirect, rotate: this.rotateLatch, cycleMaterial: this.materialLatch,
    }
    this.slotDirect = null
    this.slotSteps = 0
    this.buildDirect = null
    this.rotateLatch = false
    this.materialLatch = false
    const sens = this.settings.sensitivity * (aiming ? this.settings.aimSensitivity : 1)
    const invert = this.settings.invertY ? -1 : 1
    out.lookYaw = -this.mouseDX * MOUSE_RAD_PER_PX * sens
    out.lookPitch = -this.mouseDY * MOUSE_RAD_PER_PX * sens * invert
    this.mouseDX = 0
    this.mouseDY = 0

    const pads = this.devices.pad !== null && typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    let pad: GamepadReading | null = null
    let index = 0
    for (const gp of pads) {
      if (!gp || !gp.connected || gp.mapping !== 'standard') continue
      if (this.devices.pad === 'any' || this.devices.pad === index) {
        pad = readGamepad(gp)
        break
      }
      index++
    }
    if (pad) {
      if (pad.pause && !this.padPausePrev) this.onPauseRequest?.()
      if (pad.inventory && !this.padInvPrev) this.onToggleInventory?.()
      this.padPausePrev = pad.pause
      this.padInvPrev = pad.inventory
    }
    if (!this.enabled) {
      this.padCrouchPrev = pad?.crouchPressed ?? false
      return out
    }

    let f = (this.any(KEYBINDINGS.forward) ? 1 : 0) - (this.any(KEYBINDINGS.back) ? 1 : 0)
    let r = (this.any(KEYBINDINGS.right) ? 1 : 0) - (this.any(KEYBINDINGS.left) ? 1 : 0)
    let buttons = 0
    if (this.any(KEYBINDINGS.jump)) buttons |= Buttons.Jump
    buttons |= this.tickLatch
    if (this.any(KEYBINDINGS.sprint)) buttons |= Buttons.Sprint
    if (this.any(KEYBINDINGS.walk)) buttons |= Buttons.Walk
    if (this.mouseButtons & (1 << 2)) buttons |= Buttons.Aim
    if (this.mouseButtons & 1) buttons |= Buttons.Fire
    if (this.any(KEYBINDINGS.reload)) buttons |= Buttons.Reload
    if (this.any(KEYBINDINGS.use)) buttons |= Buttons.Use

    let crouchHeld = this.any(KEYBINDINGS.crouch)
    let crouchEdge = crouchHeld && !this.crouchHeldPrev
    this.crouchHeldPrev = crouchHeld
    if (pad) {
      if (Math.abs(pad.forward) > Math.abs(f)) f = pad.forward
      if (Math.abs(pad.right) > Math.abs(r)) r = pad.right
      buttons |= pad.buttons
      out.lookYaw -= pad.lookX * STICK_RAD_PER_S * sens * frameDt
      out.lookPitch -= pad.lookY * STICK_RAD_PER_S * sens * invert * frameDt
      if (pad.crouchPressed && !this.padCrouchPrev) crouchEdge = true
      crouchHeld = crouchHeld || pad.crouchPressed
      this.padCrouchPrev = pad.crouchPressed
      if (pad.next && !this.padNextPrev) out.slotStep += 1
      if (pad.prev && !this.padPrevPrev) out.slotStep -= 1
      this.padNextPrev = pad.next
      this.padPrevPrev = pad.prev
      if (pad.build && !this.padBuildPrev) out.build = -1
      if (pad.rotate && !this.padRotatePrev) out.rotate = true
      if (pad.material && !this.padMaterialPrev) out.cycleMaterial = true
      this.padBuildPrev = pad.build
      this.padRotatePrev = pad.rotate
      this.padMaterialPrev = pad.material
    }
    const pressed = buttons & ~this.prevButtons
    this.prevButtons = buttons
    if (this.settings.crouchToggle) {
      if (crouchEdge) this.crouchLatched = !this.crouchLatched
      // Apertar pulo ou corrida desfaz o agachamento travado (segurar a corrida não).
      else if (this.crouchLatched && pressed & (Buttons.Jump | Buttons.Sprint)) this.crouchLatched = false
      if (this.crouchLatched) buttons |= Buttons.Crouch
    } else if (crouchHeld) {
      buttons |= Buttons.Crouch
    }
    out.forward = f
    out.right = r
    out.buttons = buttons
    return out
  }
}
