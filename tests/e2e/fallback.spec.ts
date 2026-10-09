import { expect, test } from '@playwright/test'

test('sem WebGL, o atlas continua utilizável em 2D e explica a limitação', async ({ page }) => {
  await page.goto('/atlas')
  await page.getByRole('button', { name: 'Explorar em 3D' }).click()
  await expect(page.locator('.world-atlas__message')).toContainText('WebGL')
  await expect(page.locator('.world-atlas')).toHaveAttribute('data-mode', '2d')
  await page.locator('.region-list').getByRole('button', { name: /Elyndor/ }).click()
  await expect(page.locator('.atlas-panel h3')).toHaveText('Elyndor')
})
