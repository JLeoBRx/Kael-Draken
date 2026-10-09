import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const PAGES = ['/', '/atlas', '/reinos/safra', '/personagens', '/personagens/kael-draken', '/mitologia', '/mitologia/safra-e-a-noite-das-cinzas', '/cronologia', '/ressonancia', '/locais', '/manuscritos/quando-a-chama-despertar', '/misterios', '/livros/o-sussurro-da-chama-antiga', '/novidades', '/sobre']

test('página inicial apresenta o título completo e acessos principais', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('Kael Draken')
  await expect(page.locator('h1')).toContainText('O Sussurro da Chama Antiga')
  await expect(page.getByRole('link', { name: /Explorar o Atlas dos Seis Reinos/ })).toBeVisible()
  await expect(page.getByText('Quando a Chama despertar, não o fará sozinha.', { exact: false }).first()).toBeVisible()
})

test('nenhuma página transborda horizontalmente', async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `transbordamento em ${path}`).toBeLessThanOrEqual(1)
  }
})

test('navegação principal funciona (menu móvel por toque quando necessário)', async ({ page, isMobile }) => {
  await page.goto('/')
  const vw = page.viewportSize()!.width
  if (vw < 1280) {
    await page.getByRole('button', { name: 'Abrir menu de navegação' }).or(page.locator('.mobile-nav summary')).first().click()
    await page.locator('.mobile-nav__list').getByRole('link', { name: 'Mistérios' }).click()
  } else {
    await page.locator('.main-nav').getByRole('link', { name: 'Mistérios' }).click()
  }
  await expect(page).toHaveURL(/\/misterios$/)
  await expect(page.locator('h1')).toHaveText('Mistérios')
  void isMobile
})

test('o seletor de spoilers controla o que o servidor envia', async ({ page }) => {
  await page.goto('/personagens/kael-draken')
  expect(await page.content()).not.toContain('linhagem real de')
  await page.locator('.spoiler-control summary').click()
  await page.getByRole('button', { name: /Revelações avançadas/ }).first().click()
  await page.getByRole('button', { name: 'Sim, mostrar' }).click()
  await expect(page.locator('#segredos')).toContainText('linhagem real')
  // volta ao nível padrão
  await page.locator('.spoiler-control summary').click()
  await page.getByRole('button', { name: /Sem spoilers/ }).click()
  await expect(page.locator('#segredos')).not.toContainText('linhagem real')
})

test('acessibilidade: sem violações graves nas páginas principais', async ({ page }) => {
  for (const path of ['/', '/atlas', '/personagens/kael-draken', '/misterios']) {
    await page.goto(path)
    // @axe-core/playwright declara tipos de uma versão mais nova do Playwright; a API usada é compatível
    const results = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]['page'] }).withTags(['wcag2a', 'wcag2aa']).analyze()
    const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${path}: ${v.id} → ${v.nodes.map((n) => `${n.target.join(' ')} ${n.failureSummary?.split('\n')[1] ?? ''}`).join(' | ')}`)).toEqual([])
  }
})

test('rotas inexistentes respondem 404', async ({ page }) => {
  const res = await page.goto('/reinos/inexistente')
  expect(res?.status()).toBe(404)
})
