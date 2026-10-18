import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// o pergaminho de anúncio abre sozinho na página inicial; aqui ele já conta como visto (ver announcement.spec.ts)
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem('kd_anuncio_ocultar', '1')
    } catch {}
  })
})

const PAGES = ['/', '/atlas', '/reinos/safra', '/personagens', '/personagens/kael-draken', '/mitologia', '/mitologia/safra-e-a-noite-das-cinzas', '/cronologia', '/ressonancia', '/locais', '/manuscritos/quando-a-chama-despertar', '/misterios', '/livros/o-sussurro-da-chama-antiga', '/livros/o-sussurro-da-chama-antiga/ilustracoes', '/novidades', '/sobre']

test('página inicial apresenta o título completo e acessos principais', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('h1')).toContainText('Kael Draken')
  await expect(page.locator('h1')).toContainText('O Sussurro da Chama Antiga')
  const hero = page.locator('.home-hero')
  await expect(hero.getByRole('link', { name: /Conhecer o Livro/ })).toHaveAttribute('href', '/livros/o-sussurro-da-chama-antiga')
  await expect(hero.getByRole('link', { name: 'Explorar o Universo' })).toHaveAttribute('href', '#universo')
  await expect(page.locator('#universo')).toBeVisible()
  await expect(page.getByRole('link', { name: /Explorar o Atlas dos Seis Reinos/ })).toBeVisible()
  await expect(page.getByText('Quando a Chama despertar, não o fará sozinha.', { exact: false }).first()).toBeVisible()

  // índice do arquivo: as oito seções, todas com destino existente
  const index = page.locator('.archive-index')
  const sections: Array<[string, string]> = [
    ['Reinos', '/atlas#reinos'],
    ['Personagens', '/personagens'],
    ['Mitologia', '/mitologia'],
    ['Sistema da Ressonância', '/ressonancia'],
    ['Cronologia', '/cronologia'],
    ['Cidades e locais', '/locais'],
    ['Manuscritos', '/manuscritos'],
    ['Mistérios', '/misterios'],
  ]
  await expect(index.getByRole('link')).toHaveCount(sections.length)
  for (const [name, href] of sections) await expect(index.getByRole('link', { name: new RegExp(`^${name}`) })).toHaveAttribute('href', href)

  // Livro I: capa oficial, título e sinopse — sem preço, editora inventada ou links de compra
  const book = page.locator('#livro')
  await expect(book.locator('.book-cover__img')).toBeVisible()
  await expect(book.getByRole('heading', { name: /O Sussurro da Chama Antiga/ })).toBeVisible()
  await expect(book).toContainText('Quando a Chama desperta')
  await expect(book).not.toContainText(/R\$|comprar|pré-venda/i)
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
    // o painel ocupa a tela abaixo do cabeçalho (não fica preso dentro dele)
    const panel = (await page.locator('.mobile-nav__panel').boundingBox())!
    expect(panel.height).toBeGreaterThan(page.viewportSize()!.height * 0.6)
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
  for (const path of ['/', '/atlas', '/personagens/kael-draken', '/misterios', '/livros/o-sussurro-da-chama-antiga', '/livros/o-sussurro-da-chama-antiga/ilustracoes']) {
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
