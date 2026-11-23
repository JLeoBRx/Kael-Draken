import { expect, test } from '@playwright/test'
import { BR_PORT } from '../../playwright.config'
import { combat, enterGame, prepare, screen, startOffline } from './helpers'

const RIDING = 128
const SKYDIVING = 256
const GLIDING = 512
const GROUNDED = 1
const SWIMMING = 32

test('offline: aquecimento, dirigível, salto, planador, pouso, zona e bots', async ({ page }) => {
  test.setTimeout(600_000)
  const errors = await prepare(page, 'Saltadora')
  await startOffline(page, 'campo-de-provas', { mode: 'br', bots: 3, difficulty: 'facil', zone: 'rapida' })
  const start = await combat(page)
  expect(start.gameMode).toBe(1)
  // Aquecimento (5 s offline): contagem na faixa de fase
  if (start.phase === 1) await expect(page.locator('[data-hud="phase"]')).toContainText('A partida começa em')

  // Dirigível: todos a bordo, sem itens
  await expect.poll(async () => (await combat(page)).airship, { timeout: 120_000 }).toBe(true)
  const riding = await combat(page)
  expect(riding.phase).toBe(2)
  expect(riding.flags & RIDING).toBeTruthy()
  expect(riding.slots.every((s) => s.item === 255)).toBe(true)
  await expect(page.locator('[data-hud="phase"]')).toContainText('Dirigível')
  await expect(page.locator('[data-hud="phase"]')).toContainText('saltar')
  expect(riding.zone?.r).toBeGreaterThan(100)

  // Salta: queda livre → planador → chão, sem dano de queda
  await page.keyboard.press('Space')
  await expect.poll(async () => (await combat(page)).flags & SKYDIVING).toBeTruthy()
  await expect.poll(async () => (await combat(page)).flags & GLIDING, { timeout: 180_000 }).toBeTruthy()
  await expect.poll(async () => (await combat(page)).flags & (GROUNDED | SWIMMING), { timeout: 180_000 }).toBeTruthy()
  const landed = await combat(page)
  expect(landed.health).toBe(100)
  expect(landed.alive).toBe(true)
  // os bots estão na partida (vistos pelo snapshot) e a zona segue no HUD
  expect(landed.remotes).toBeGreaterThan(0)
  await expect(page.locator('[data-hud="phase"]')).toContainText(/zona/i)
  expect(errors).toEqual([])
})

test('servidor dedicado: partida até o fim, resultado, histórico e nova partida', async ({ page }) => {
  test.setTimeout(600_000)
  const errors = await prepare(page, 'Final')
  await page.goto(`http://127.0.0.1:${BR_PORT}/`)
  await page.click('[data-action="join"]')
  await page.click('[data-action="connect"]')
  await enterGame(page)
  expect((await combat(page)).gameMode).toBe(1)
  // Zona 30× mais rápida: a partida acaba sozinha (pela zona ou pelos bots)
  await expect.poll(async () => (await combat(page)).result, { timeout: 300_000, intervals: [1000] }).not.toBeNull()
  const r = (await combat(page)).result!
  expect(r.place).toBeGreaterThanOrEqual(1)
  expect(r.place).toBeLessThanOrEqual(3)
  expect(r.total).toBe(3)
  expect(r.victory).toBe(r.place === 1)
  await expect(page.locator('[data-hud="results"]')).toBeVisible()
  await expect(page.locator('[data-hud="results"] [data-result]')).toHaveText(r.victory ? 'Vitória!' : `#${r.place}`)
  expect(await screen(page)).toBe('results')
  // ficou salvo no histórico local
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ultima-chama:historico:v1') ?? '[]') as { place: number }[])
  expect(saved[0].place).toBe(r.place)
  // O servidor recomeça: o cliente reconecta sozinho e cai no aquecimento da nova partida
  await page.locator('[data-screen="click-to-play"]').waitFor({ timeout: 120_000 })
  await page.locator('[data-screen="click-to-play"]').click()
  await expect.poll(() => screen(page)).toBe('playing')
  // nova partida: aquecimento (4 s) ou já no dirigível, sem resultado
  const fresh = await combat(page)
  expect([1, 2]).toContain(fresh.phase)
  expect(fresh.result).toBeNull()
  expect(fresh.alive).toBe(true)
  expect(errors).toEqual([])
})
