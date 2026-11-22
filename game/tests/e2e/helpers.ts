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
