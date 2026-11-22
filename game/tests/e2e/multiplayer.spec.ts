import { expect, test, type Page } from '@playwright/test'
import { enterGame, holdUntil, prepare, state } from './helpers'

/**
 * Dois navegadores independentes conectam ao MESMO servidor dedicado (o
 * processo Node do webServer), como dois computadores numa LAN.
 */
test('dois jogadores reais no servidor dedicado se veem e se movem', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  const errA = await prepare(a, 'Ana')
  const errB = await prepare(b, 'Bruno')

  const join = async (page: Page) => {
    await page.goto('/')
    await page.click('[data-action="join"]')
    await page.click('[data-action="connect"]')
    await enterGame(page)
  }
  await join(a)
  await join(b)

  await expect.poll(async () => (await state(a)).remotes).toBe(1)
  await expect.poll(async () => (await state(b)).remotes).toBe(1)
  expect((await state(a)).mode).toContain('127.0.0.1')

  // A nome do outro jogador aparece como placa acima da cabeça (sprite), e B vê A andar
  await expect.poll(async () => (await state(b)).remotePositions.length).toBe(1)
  expect((await state(b)).remotePositions[0].name).toBe('Ana')
  expect((await state(a)).remotePositions[0].name).toBe('Bruno')
  const aStart = await state(a)
  const seenBefore = (await state(b)).remotePositions[0]
  expect(Math.hypot(seenBefore.x - aStart.x, seenBefore.z - aStart.z)).toBeLessThan(0.5)

  await holdUntil(a, ['KeyW'], (s) => aStart.z - s.z > 4)
  // A ainda desacelera um pouco depois de soltar a tecla: compara com o estado atual de A
  await expect.poll(async () => {
    const [seen] = (await state(b)).remotePositions
    const now = await state(a)
    return Math.hypot(seen.x - now.x, seen.z - now.z)
  }).toBeLessThan(0.25)
  const seenAfter = (await state(b)).remotePositions[0]
  expect(aStart.z - seenAfter.z).toBeGreaterThan(4)

  // Quando A sai, B deixa de vê-lo
  await ctxA.close()
  await expect.poll(async () => (await state(b)).remotes).toBe(0)
  expect((await state(b)).corrections).toBe(0)
  await ctxB.close()
  expect(errA).toEqual([])
  expect(errB).toEqual([])
})
