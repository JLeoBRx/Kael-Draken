import { expect, test, type Page } from '@playwright/test'
import { LOBBY_PORT } from '../../playwright.config'
import { combat, enterGame, prepare, screen } from './helpers'

/**
 * Sala de espera de LAN com dois navegadores: prontos, equipes, configuração
 * do anfitrião e início; depois a conexão de B cai e ele volta ao mesmo
 * personagem.
 */
test('sala de espera: dupla na mesma equipe, início pelo anfitrião e reconexão ao mesmo personagem', async ({ browser }) => {
  test.setTimeout(900_000)
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  const errA = await prepare(a, 'Ana')
  const errB = await prepare(b, 'Bruno')
  const join = async (page: Page) => {
    await page.goto(`http://127.0.0.1:${LOBBY_PORT}/`)
    await page.click('[data-action="join"]')
    await page.click('[data-action="connect"]')
    await page.locator('[data-screen="lobby"]').waitFor({ timeout: 60_000 })
  }
  await join(a)
  await join(b)
  // os dois aparecem na sala; Ana (primeira) é a anfitriã
  await expect(a.locator('[data-member]')).toHaveCount(2)
  await expect(b.locator('[data-member="Ana"]')).toContainText('anfitrião')
  await expect(b.locator('[data-action="start"]')).toBeDisabled()
  // Ana configura: duplas, treino (renascimento), sem bots
  await a.locator('[data-field="mode"]').selectOption('0')
  await a.locator('[data-field="team-size"]').selectOption('2')
  await expect(b.locator('[data-field="team-size"]')).toHaveValue('2')
  await expect(b.locator('[data-field="team-size"]')).toBeDisabled()
  // Bruno fica pronto e os dois escolhem a equipe 3
  await b.click('[data-action="ready"]')
  await expect(a.locator('[data-member="Bruno"]')).toContainText('Pronto')
  await a.locator('[data-field="team"]').selectOption('2')
  await b.locator('[data-field="team"]').selectOption('2')
  await expect(a.locator('[data-member="Bruno"]')).toContainText('Equipe 3')
  // Ana inicia: os dois entram na partida
  await a.click('[data-action="start"]')
  await enterGame(a)
  await enterGame(b)
  await expect.poll(async () => (await combat(a)).mates.length).toBe(1)
  const sa = await combat(a)
  const sb = await combat(b)
  expect(sa.team).toBe(2)
  expect(sb.team).toBe(2)
  expect(sa.mates[0].name).toBe('Bruno')
  await expect(a.locator('[data-hud="team"]')).toContainText('Bruno')

  // A conexão do Bruno cai: ele reconecta sozinho ao mesmo personagem
  const before = await combat(b)
  await b.evaluate(() => window.__ULTIMA__!.dropConnection())
  await b.locator('[data-screen="click-to-play"]').waitFor({ timeout: 120_000 })
  await b.locator('[data-screen="click-to-play"]').click()
  await expect.poll(() => screen(b)).toBe('playing')
  const after = await combat(b)
  expect(after.playerId).toBe(before.playerId)
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(1)
  expect(after.team).toBe(2)
  // para Ana, o colega nunca saiu da partida
  expect((await combat(a)).mates.map((m) => m.id)).toEqual([before.playerId])

  await ctxA.close()
  await ctxB.close()
  expect(errA).toEqual([])
  expect(errB.filter((e) => !e.includes('WebSocket'))).toEqual([])
})
