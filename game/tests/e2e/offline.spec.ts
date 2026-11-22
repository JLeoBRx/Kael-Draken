import { expect, test } from '@playwright/test'
import { holdUntil, mouseButton, prepare, screen, startOffline, state } from './helpers'

test('menu, configurações persistentes e controles', async ({ page }) => {
  const errors = await prepare(page, 'Menu')
  await page.goto('/')
  await expect(page.locator('h1.title')).toHaveText('Última Chama')
  await page.click('[data-action="settings"]')
  const fov = page.locator('[data-screen="settings"] input[aria-label="Campo de visão"]')
  await fov.fill('90')
  await page.click('[data-action="close-settings"]')
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ultima-chama:configuracoes:v1') ?? '{}'))
  expect(saved.fov).toBe(90)
  await page.click('[data-action="controls"]')
  await expect(page.locator('[data-screen="controls"]')).toContainText('Agachar / deslizar')
  await page.locator('[data-screen="controls"] button').click()
  await expect(page.locator('[data-screen="controls"]')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('partida offline: servidor no Worker, movimento, pulo, deslize, mira e pausa', async ({ page }) => {
  const errors = await prepare(page, 'Solo')
  await startOffline(page, 'campo-de-provas')

  const start = await state(page)
  expect(start.mode).toBe('Offline')
  expect(start.grounded).toBe(true)
  expect(start.y).toBeCloseTo(8.0, 1)

  // Olhar com o mouse (evento sintético: o modo headless não entrega movementX sob captura)
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: -200, movementY: -50 })))
  await expect.poll(async () => (await state(page)).yaw).toBeGreaterThan(0.3)
  const looked = await state(page)
  expect(looked.pitch).toBeGreaterThan(0)
  await page.evaluate(() => document.dispatchEvent(new MouseEvent('mousemove', { movementX: 200, movementY: 50 })))
  await expect.poll(async () => Math.abs((await state(page)).yaw)).toBeLessThan(0.01)

  // Andar para a frente (norte, -Z)
  const walked = await holdUntil(page, ['KeyW'], (s) => start.z - s.z > 3)
  expect(Math.abs(walked.x - start.x)).toBeLessThan(0.5)

  // Pulo: sai do chão e volta
  await page.keyboard.press('Space')
  await expect.poll(async () => (await state(page)).y, { intervals: [50] }).toBeGreaterThan(start.y + 0.3)
  await expect.poll(async () => (await state(page)).grounded).toBe(true)

  // Sprint e deslize (teclas seguradas o tempo todo: a poucos FPS, soltar perde velocidade)
  await page.keyboard.down('KeyW')
  await page.keyboard.down('ShiftLeft')
  await expect.poll(async () => (await state(page)).speed, { intervals: [100] }).toBeGreaterThan(7)
  await page.keyboard.press('KeyC')
  await expect.poll(async () => (await state(page)).flags & 4, { intervals: [50] }).toBe(4)
  await page.keyboard.up('ShiftLeft')
  await page.keyboard.up('KeyW')
  await page.keyboard.press('KeyC') // destrava o agachar
  await expect.poll(async () => (await state(page)).flags & 2).toBe(0)

  // Mira (botão direito)
  await mouseButton(page, 2, true)
  await expect.poll(async () => (await state(page)).flags & 16).toBe(16)
  await mouseButton(page, 2, false)

  // Pausa ao perder a captura do mouse, e volta
  await page.evaluate(() => document.exitPointerLock())
  await expect.poll(() => screen(page)).toBe('paused')
  await page.click('[data-action="resume"]')
  await expect.poll(() => screen(page)).toBe('playing')

  // A predição nunca divergiu do servidor local
  expect((await state(page)).corrections).toBe(0)

  await page.evaluate(() => document.exitPointerLock())
  await expect.poll(() => screen(page)).toBe('paused')
  await page.click('[data-action="quit"]')
  await expect.poll(() => screen(page)).toBe('menu')
  expect(errors).toEqual([])
})
