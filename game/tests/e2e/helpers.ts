import { expect, type Page } from '@playwright/test'

export interface MatchState {
  tick: number
  x: number
  y: number
  z: number
  speed: number
  flags: number
  grounded: boolean
  remotes: number
  remotePositions: { id: number; name: string; x: number; y: number; z: number }[]
  corrections: number
  yaw: number
  pitch: number
  mode: string
}

/** Qualidade baixa e nome fixo antes de carregar a página. */
export async function prepare(page: Page, name: string): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`)
  })
  await page.addInitScript((n) => {
    localStorage.setItem('ultima-chama:configuracoes:v1', JSON.stringify({ quality: 'baixa', playerName: n }))
  }, name)
  return errors
}

export async function screen(page: Page): Promise<string> {
  return page.evaluate(() => window.__ULTIMA__!.state().screen)
}

export async function state(page: Page): Promise<MatchState> {
  const s = await page.evaluate(() => window.__ULTIMA__!.state().match)
  if (!s) throw new Error('sem partida ativa')
  return s as MatchState
}

/** Do "Clique para jogar" até o estado jogando. */
export async function enterGame(page: Page): Promise<void> {
  await page.locator('[data-screen="click-to-play"]').waitFor({ timeout: 90_000 })
  await page.locator('[data-screen="click-to-play"]').click()
  await expect.poll(() => screen(page)).toBe('playing')
}

/** Segura teclas até a condição ser verdadeira (o jogo roda a poucos FPS sob SwiftShader). */
export async function holdUntil(page: Page, keys: string[], cond: (s: MatchState) => boolean, timeoutMs = 60_000): Promise<MatchState> {
  for (const k of keys) await page.keyboard.down(k)
  try {
    let s = await state(page)
    const t0 = Date.now()
    while (!cond(s)) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`condição não atingida; estado: ${JSON.stringify(s)}`)
      await page.waitForTimeout(150)
      s = await state(page)
    }
    return s
  } finally {
    for (const k of keys) await page.keyboard.up(k)
  }
}

export interface CombatState extends MatchState {
  alive: boolean
  health: number
  shield: number
  selected: number
  slots: { item: number; rarity: number; count: number; ammo: number }[]
  kills: number
  hits: number
  lastHit: { damage: number; head: boolean; targetKind: number } | null
  damageTaken: number
  prompt: string | null
  items: number
  mapId: string
  pieces: number
  predictedPieces: number
  rejectedPieces: number
  drawnPieces: number
  build: { kind: number; rot: number; material: number; ghost: { kind: number; i: number; j: number; k: number; dir: number } | null; blocked: string | null } | null
  materials: number[]
  destroyedProps: number
  harvested: number
  target: { name: string; health: number; max: number } | null
}

export async function combat(page: Page): Promise<CombatState> {
  return (await state(page)) as CombatState
}

const RAD_PER_PX = 0.0022

/**
 * Gira a câmera para (yaw, pitch) com eventos sintéticos de mouse e espera o
 * jogo consumir o movimento (a poucos FPS, vários eventos se somariam).
 * Obs.: sob captura do ponteiro, o mouse do Playwright (CDP) gera deltas
 * espúrios em modo headless, por isso usamos eventos DOM diretamente.
 */
export async function look(page: Page, yaw: number, pitch: number): Promise<void> {
  const s = await state(page)
  const dyaw = Math.atan2(Math.sin(yaw - s.yaw), Math.cos(yaw - s.yaw))
  await page.evaluate(([dx, dy]) => document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy })), [-dyaw / RAD_PER_PX, -(pitch - s.pitch) / RAD_PER_PX])
  await expect.poll(async () => {
    const n = await state(page)
    return Math.abs(Math.atan2(Math.sin(yaw - n.yaw), Math.cos(yaw - n.yaw))) + Math.abs(pitch - n.pitch)
  }, { intervals: [50] }).toBeLessThan(0.05)
}

/** Anda até (x, z) corrigindo a direção a cada passo. */
export async function walkTo(page: Page, x: number, z: number, tol = 0.8): Promise<MatchState> {
  for (let k = 0; k < 120; k++) {
    const s = await state(page)
    const d = Math.hypot(x - s.x, z - s.z)
    if (d < tol) return s
    await look(page, Math.atan2(-(x - s.x), -(z - s.z)), 0)
    await page.keyboard.down('KeyW')
    await page.waitForTimeout(d > 3 ? 400 : 120)
    await page.keyboard.up('KeyW')
  }
  throw new Error(`não chegou a ${x}, ${z}`)
}

/** Yaw/pitch que põem a mira (raio do ombro da câmera, mirando) sobre o ponto. */
export function aimAt(s: { x: number; y: number; z: number }, tx: number, ty: number, tz: number): { yaw: number; pitch: number } {
  let yaw = Math.atan2(-(tx - s.x), -(tz - s.z))
  let pitch = 0
  for (let k = 0; k < 6; k++) {
    const ox = s.x + Math.cos(yaw) * 0.62 * 0.9
    const oz = s.z - Math.sin(yaw) * 0.62 * 0.9
    const oy = s.y + 1.6 + 0.22
    yaw = Math.atan2(-(tx - ox), -(tz - oz))
    pitch = Math.atan2(ty - oy, Math.hypot(tx - ox, tz - oz))
  }
  return { yaw, pitch }
}

/** Botão do mouse via evento DOM (0 = atirar, 2 = mirar). */
export async function mouseButton(page: Page, button: number, down: boolean): Promise<void> {
  await page.evaluate(([b, d]) => {
    const target = d ? document.querySelector('canvas.game')! : window
    target.dispatchEvent(new MouseEvent(d ? 'mousedown' : 'mouseup', { button: b as number, bubbles: true }))
  }, [button, down] as const)
}

/** Menu → Jogar offline → mapa → clique para jogar. */
export async function startOffline(page: Page, mapId: string): Promise<void> {
  await page.goto('/')
  await page.click('[data-action="offline"]')
  await page.click(`[data-map="${mapId}"]`)
  await enterGame(page)
}
