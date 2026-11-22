import { expect, test } from '@playwright/test'
import { combat, holdUntil, look, mouseButton, prepare, startOffline, walkTo } from './helpers'

const PICKAXE_SLOT = 5
const WALL = 1
const RAMP = 3
const PAD_Y = 8.0

/** Um clique curto do botão de tiro (constrói uma peça ou dá um golpe). */
async function click(page: import('@playwright/test').Page): Promise<void> {
  await mouseButton(page, 0, true)
  await page.waitForTimeout(250)
  await mouseButton(page, 0, false)
}

test('offline: pega madeira, ergue parede e rampa, sobe, quebra com a picareta e coleta pedra', async ({ page }) => {
  test.setTimeout(480_000)
  const errors = await prepare(page, 'Construtora')
  await startOffline(page, 'campo-de-provas')
  const start = await combat(page)
  // começa com a picareta na mão e sem materiais
  expect(start.selected).toBe(PICKAXE_SLOT)
  expect(start.materials).toEqual([0, 0, 0])
  await expect(page.locator('.slot.pickaxe')).toHaveClass(/selected/)

  // Mesa de madeira do arsenal em (-12,5; 7,5): contorna as mesas de armas e suprimentos
  await walkTo(page, -15, 14, 0.6)
  await walkTo(page, -15, 9.4, 0.6)
  await walkTo(page, -12.5, 8.9, 0.5)
  await look(page, 0, -0.4)
  await expect.poll(async () => (await combat(page)).prompt ?? '').toContain('Madeira')
  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await combat(page)).materials[0]).toBe(300)

  // Área livre do pátio, no meio de uma célula da grade (4 m)
  await walkTo(page, 6, 2, 0.35)
  await look(page, 0, 0)
  await page.keyboard.press('KeyQ')
  await expect.poll(async () => (await combat(page)).build?.kind).toBe(WALL)
  await expect(page.locator('[data-hud="build"]')).toBeVisible()
  const ghost = (await combat(page)).build!
  expect(ghost.blocked).toBeNull()
  expect(ghost.ghost).toMatchObject({ kind: WALL, i: 1, j: 0, dir: 0 })
  await click(page)
  await expect.poll(async () => (await combat(page)).pieces).toBe(1)
  // confirmada pelo servidor (o id previsto vira o oficial) e paga
  await expect.poll(async () => (await combat(page)).predictedPieces).toBe(0)
  await expect.poll(async () => (await combat(page)).materials[0]).toBe(290)
  expect((await combat(page)).drawnPieces).toBe(1)
  // o mesmo lugar agora está ocupado
  await expect.poll(async () => (await combat(page)).build?.blocked).toBe('Ocupado')

  // Rampa para o sul (vira 180°): sobe 4 m
  await look(page, Math.PI, 0)
  await page.keyboard.press('KeyV')
  await expect.poll(async () => (await combat(page)).build?.kind).toBe(RAMP)
  await click(page)
  await expect.poll(async () => (await combat(page)).pieces).toBe(2)
  const top = await holdUntil(page, ['KeyW'], (s) => s.y > PAD_Y + 3.5)
  expect(top.y).toBeGreaterThan(PAD_Y + 3.5)

  // Tecla 1: picareta (sai do modo construção)
  await page.keyboard.press('Digit1')
  await expect.poll(async () => (await combat(page)).build).toBeNull()
  await expect(page.locator('[data-hud="build"]')).toBeHidden()

  // Volta até a parede e a derruba a golpes (madeira: 150 de vida, picareta: 50)
  await walkTo(page, 6, 1.3, 0.35)
  await look(page, 0, 0)
  await expect.poll(async () => (await combat(page)).target?.name ?? '').toContain('Parede')
  await expect(page.locator('[data-hud="target"]')).toBeVisible()
  await mouseButton(page, 0, true)
  await expect.poll(async () => (await combat(page)).pieces, { timeout: 60_000 }).toBe(1)
  await mouseButton(page, 0, false)

  // Coleta: a picareta na mureta de concreto (20; 8) rende pedra
  await walkTo(page, 20, 6.7, 0.4)
  await look(page, Math.PI, -0.7)
  await mouseButton(page, 0, true)
  await expect.poll(async () => (await combat(page)).materials[1], { timeout: 60_000 }).toBeGreaterThan(0)
  await mouseButton(page, 0, false)
  expect((await combat(page)).harvested).toBeGreaterThan(0)

  const end = await combat(page)
  expect(end.corrections).toBe(0)
  expect(end.rejectedPieces).toBe(0)
  expect(errors).toEqual([])
})
