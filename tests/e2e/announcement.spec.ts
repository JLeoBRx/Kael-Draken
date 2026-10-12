import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('pergaminho "O livro voltou": aparece uma vez, fecha e fica como seção da página inicial', async ({ page, isMobile }) => {
  await page.goto('/')
  const dialog = page.locator('dialog.announce-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('heading', { name: 'O livro voltou' })).toBeVisible()
  // sem spoilers: a origem de Kael não chega ao navegador
  const html = await page.content()
  expect(html).not.toContain('herdeiro real')
  expect(html).not.toContain('portal')
  await expect(dialog.locator('.spoiler-hidden')).toContainText('Trecho oculto')

  const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).include('dialog.announce-dialog').withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])

  // teclado no computador; botão de fechar em telas de toque
  if (isMobile) await dialog.getByRole('button', { name: 'Fechar o anúncio' }).click()
  else await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('#o-livro-voltou').getByRole('heading', { name: 'O livro voltou' })).toBeVisible()

  // não reaparece para quem já fechou
  await page.reload()
  await page.waitForTimeout(800)
  await expect(dialog).toBeHidden()

  // "Entrar no Arquivo" também fecha (num visitante novo)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Entrar no Arquivo' }).click()
  await expect(dialog).toBeHidden()

  // com revelações avançadas, o trecho reservado aparece na seção
  await page.locator('.spoiler-control summary').click()
  await page.getByRole('button', { name: /Revelações avançadas/ }).first().click()
  await page.getByRole('button', { name: 'Sim, mostrar' }).click()
  await expect(page.locator('#o-livro-voltou')).toContainText('herdeiro real de Safra')
  await page.locator('.spoiler-control summary').click()
  await page.getByRole('button', { name: /Sem spoilers/ }).click()
  await expect(page.locator('#o-livro-voltou')).not.toContainText('herdeiro real')
})
