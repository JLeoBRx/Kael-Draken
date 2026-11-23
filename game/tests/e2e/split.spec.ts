import { expect, test } from '@playwright/test'
import { prepare } from './helpers'

/** Controle falso (mapeamento padrão) para o jogador 2: analógico esquerdo para a frente. */
const FAKE_PAD = () => {
  const pad = {
    id: 'Controle de teste', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, -1, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  }
  Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null] })
}

test('tela dividida: dois jogadores no mesmo computador, jogador 2 no controle', async ({ page }) => {
  test.setTimeout(600_000)
  const errors = await prepare(page, 'Lia')
  await page.addInitScript(FAKE_PAD)
  await page.goto('/')
  await page.click('[data-action="offline"]')
  await page.click('[data-mode="treino"]')
  await page.locator('[data-field="bots"]').fill('0')
  await page.locator('[data-field="team-size"]').selectOption('2')
  await page.locator('[data-field="local-players"]').selectOption('2')
  await page.click('[data-map="campo-de-provas"]')
  await page.locator('[data-screen="click-to-play"]').waitFor({ timeout: 120_000 })
  await page.locator('[data-screen="click-to-play"]').click()
  const st = () => page.evaluate(() => window.__ULTIMA__!.state())
  await expect.poll(async () => (await st()).screen).toBe('playing')
  const s0 = await st()
  expect(s0.match).not.toBeNull()
  expect(s0.match2).not.toBeNull()
  expect(s0.match2!.playerId).not.toBe(s0.match!.playerId)
  // dois HUDs, um em cada metade
  await expect(page.locator('[data-split="left"] [data-hud="vitals"]')).toBeVisible()
  await expect(page.locator('[data-split="right"] [data-hud="vitals"]')).toBeVisible()
  // mesma equipe (dupla), e cada um vê o outro como colega
  await expect.poll(async () => (await st()).match2!.mates.length).toBe(1)
  expect((await st()).match!.team).toBe((await st()).match2!.team)
  // o controle move só o jogador 2
  const z1 = s0.match!.z
  const z2 = s0.match2!.z
  await expect.poll(async () => Math.abs((await st()).match2!.z - z2), { timeout: 120_000 }).toBeGreaterThan(2)
  expect(Math.abs((await st()).match!.z - z1)).toBeLessThan(0.5)
  expect(errors).toEqual([])
})
