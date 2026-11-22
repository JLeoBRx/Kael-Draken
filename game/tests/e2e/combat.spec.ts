import { expect, test } from '@playwright/test'
import { aimAt, combat, look, mouseButton, prepare, screen, startOffline, walkTo } from './helpers'

const RIFLE = 2
const NO_ITEM = 255

test('offline: pega o fuzil do arsenal, acerta o boneco, recarrega e solta pelo inventário', async ({ page }) => {
  const errors = await prepare(page, 'Atirador')
  await startOffline(page, 'campo-de-provas')
  expect((await combat(page)).mapId).toBe('campo-de-provas')

  // Arsenal: fuzil lendário na mesa em (-3,5; 16)
  await walkTo(page, -3.5, 17.3, 0.5)
  await look(page, 0, -0.3)
  await expect.poll(async () => (await combat(page)).prompt ?? '').toContain('Tormenta AR-4')
  await expect(page.locator('[data-hud="prompt"]')).toContainText('Pegar')
  await page.keyboard.press('KeyE')
  await expect.poll(async () => (await combat(page)).slots[0].item).toBe(RIFLE)
  await expect(page.locator('[data-hud="ammo"]')).toContainText('30')

  // Estande: boneco a 10 m em (-6, 45), atirando da linha (z ≈ 33)
  await walkTo(page, -6, 33)
  const s = await combat(page)
  const aim = aimAt(s, -6, 6.15 + 1.0, 45)
  await look(page, aim.yaw, aim.pitch)
  await mouseButton(page, 2, true)
  await page.waitForTimeout(600)
  await mouseButton(page, 0, true)
  await expect.poll(async () => (await combat(page)).hits, { timeout: 30_000 }).toBeGreaterThan(0)
  await mouseButton(page, 0, false)
  await mouseButton(page, 2, false)
  const after = await combat(page)
  expect(after.lastHit?.targetKind).toBe(1)
  expect(after.lastHit!.damage).toBeGreaterThanOrEqual(37)
  expect(after.slots[0].ammo).toBeLessThan(30)

  // Inventário (Tab): soltar o fuzil volta a pô-lo no chão
  const itemsBefore = after.items
  await page.keyboard.press('Tab')
  await expect.poll(() => screen(page)).toBe('inventory')
  await page.locator('[data-screen="inventory"] [data-slot="0"] [data-action="drop"]').click()
  await expect.poll(async () => (await combat(page)).slots[0].item).toBe(NO_ITEM)
  await expect.poll(async () => (await combat(page)).items).toBe(itemsBefore + 1)
  await page.keyboard.press('Tab')
  await expect.poll(() => screen(page)).toBe('playing')

  expect((await combat(page)).corrections).toBe(0)
  expect(errors).toEqual([])
})
