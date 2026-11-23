import { expect, test, type Page } from '@playwright/test'
import { aimAt, combat, enterGame, holdUntil, look, mouseButton, prepare, state, walkTo } from './helpers'

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

/**
 * Combate real entre dois navegadores: A pega um fuzil e atira em B. O dano
 * é decidido pelo servidor dedicado e chega aos dois clientes.
 */
test('A pega um fuzil e acerta B; o servidor aplica o dano e os dois veem', async ({ browser }) => {
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

  await walkTo(a, -3.5, 17.3, 0.5)
  await look(a, 0, -0.3)
  await expect.poll(async () => (await combat(a)).prompt ?? '').toContain('Pegar')
  await a.keyboard.press('KeyE')
  await expect.poll(async () => (await combat(a)).slots[0].item).not.toBe(255)

  const sa = await combat(a)
  const sb = await combat(b)
  const aim = aimAt(sa, sb.x, sb.y + 1.0, sb.z)
  await look(a, aim.yaw, aim.pitch)
  await mouseButton(a, 2, true)
  await a.waitForTimeout(600)
  await mouseButton(a, 0, true)
  await expect.poll(async () => (await combat(b)).damageTaken, { timeout: 30_000 }).toBeGreaterThan(0)
  await mouseButton(a, 0, false)
  await mouseButton(a, 2, false)
  const hit = await combat(a)
  expect(hit.lastHit?.targetKind).toBe(0)
  const victim = await combat(b)
  expect(victim.health + victim.shield).toBeLessThan(100)

  await ctxA.close()
  await ctxB.close()
  expect(errA).toEqual([])
  expect(errB).toEqual([])
})

test('A ergue uma parede e B a vê; A a derruba com a picareta e ela some para B', async ({ browser }) => {
  test.setTimeout(900_000)
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
  // B pode ter entrado depois de construções de testes anteriores: conta a partir daqui
  const base = (await combat(b)).pieces

  // A pega madeira (contornando as mesas) e vai a um ponto livre no meio de uma célula
  await walkTo(a, -15, 14, 0.6)
  await walkTo(a, -15, 9.4, 0.6)
  await walkTo(a, -12.5, 8.9, 0.5)
  await look(a, 0, -0.4)
  await expect.poll(async () => (await combat(a)).prompt ?? '').toContain('Madeira')
  await a.keyboard.press('KeyE')
  await expect.poll(async () => (await combat(a)).materials[0]).toBeGreaterThanOrEqual(10)
  await walkTo(a, 10, -6, 0.35)
  await look(a, 0, 0)
  await a.keyboard.press('KeyQ')
  await expect.poll(async () => {
    const mode = (await combat(a)).build
    return mode ? mode.blocked : 'fora do modo construção'
  }).toBeNull()
  await mouseButton(a, 0, true)
  await a.waitForTimeout(250)
  await mouseButton(a, 0, false)
  await expect.poll(async () => (await combat(a)).predictedPieces).toBe(0)
  expect((await combat(a)).pieces).toBe(base + 1)
  // B recebe a peça pelo servidor e a desenha
  await expect.poll(async () => (await combat(b)).pieces).toBe(base + 1)
  expect((await combat(b)).drawnPieces).toBeGreaterThanOrEqual(1)

  // A troca para a picareta e derruba a parede (3 golpes depois de pronta)
  await a.keyboard.press('Digit1')
  await walkTo(a, 10, -6.8, 0.3)
  await look(a, 0, 0)
  await a.waitForTimeout(3000)
  await mouseButton(a, 0, true)
  await expect.poll(async () => (await combat(b)).pieces, { timeout: 90_000 }).toBe(base)
  await mouseButton(a, 0, false)
  expect((await combat(a)).pieces).toBe(base)

  await ctxA.close()
  await ctxB.close()
  expect(errA).toEqual([])
  expect(errB).toEqual([])
})
