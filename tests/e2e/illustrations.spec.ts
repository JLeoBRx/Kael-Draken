import { expect, test, type Page } from '@playwright/test'

const BOOK = '/livros/o-sussurro-da-chama-antiga'
const GALLERY = `${BOOK}/ilustracoes`
const TITLES = [
  'O lugar que não existia',
  'O peso do despertar',
  'A casa no fim da estrada',
  'O caminho do bosque',
  'Aquilo que ficou à porta',
  'O que pode ser provado',
  'O arquivo sob a poeira',
  'A versão oficial',
  'O homem dos estábulos',
  'A chave de ferro',
]
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

async function login(page: Page) {
  await page.goto('/admin/login')
  await page.fill('#username', process.env.E2E_ADMIN_USER!)
  await page.fill('#password', process.env.E2E_ADMIN_PASSWORD!)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/admin$/)
}

test('galeria: dez capítulos em ordem, com estado da arte e sem cortar as imagens', async ({ page }) => {
  await page.goto(GALLERY)
  await expect(page.locator('h1')).toHaveText('Ilustrações do Livro I')
  const cards = page.locator('.illus-card')
  await expect(cards).toHaveCount(10)
  await expect(page.locator('.illus-card__num')).toHaveText(ROMAN.map((r) => `Capítulo ${r}`))
  await expect(page.locator('.illus-card__title')).toHaveText(TITLES)
  await expect(page.locator('.illus-card .art-state--final')).toHaveCount(9)
  await expect(page.locator('.illus-card').nth(1).locator('.art-state--estudo')).toHaveText('Versão provisória')

  // todas as imagens carregam, a moldura é 31:46 e a imagem inteira cabe nela (object-fit: contain)
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) {
      window.scrollTo({ top: y, behavior: 'instant' })
      await new Promise((r) => setTimeout(r, 50))
    }
  })
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.illus-card__img')].every((i) => i.complete && i.naturalWidth > 0))
  const frames = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLImageElement>('.illus-card__img')].map((img) => {
      const box = img.parentElement!.getBoundingClientRect()
      return { frame: box.width / box.height, natural: img.naturalWidth / img.naturalHeight, fit: getComputedStyle(img).objectFit }
    }),
  )
  expect(frames).toHaveLength(10)
  for (const f of frames) {
    expect(f.fit).toBe('contain')
    expect(Math.abs(f.frame - 31 / 46)).toBeLessThan(0.01)
    expect(Math.abs(f.natural / (31 / 46) - 1)).toBeLessThan(0.02)
  }

  // anotações de trabalho nunca chegam ao site
  const html = await page.content()
  expect(html).not.toContain('Não retratar Orven automaticamente como vilão')
  expect(html).not.toContain('Ilustrador não identificado')
  expect(html).not.toContain('Edicao_Profissional')
})

test('visualização ampliada: abre, navega, fecha e devolve o foco e a posição', async ({ page }) => {
  await page.goto(GALLERY)
  const dialog = page.locator('dialog.illus-dialog')
  const card = page.getByRole('link', { name: /Ampliar a ilustração do capítulo iii:/i })
  await card.scrollIntoViewIfNeeded()
  const before = await page.evaluate(() => window.scrollY)
  await card.click()
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('h2')).toHaveText('A casa no fim da estrada')
  await expect(page).toHaveURL(/#capitulo-03-casa-fim-da-estrada$/)
  await expect(dialog.locator('img.illus-dialog__img')).toHaveAttribute('alt', /casa de pedra/)
  await expect(dialog.getByText('3 de 10')).toBeVisible()

  await page.keyboard.press('ArrowRight')
  await expect(dialog.locator('h2')).toHaveText('O caminho do bosque')
  await page.getByRole('button', { name: '← Anterior' }).click()
  await page.getByRole('button', { name: '← Anterior' }).click()
  await expect(dialog.locator('h2')).toHaveText('O peso do despertar')
  await expect(dialog.getByText('Versão provisória', { exact: true })).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page).not.toHaveURL(/#/)
  await expect(card).toBeFocused()
  expect(await page.evaluate(() => window.scrollY)).toBe(before)

  // o botão Voltar do navegador também fecha
  await page.getByRole('link', { name: /Ampliar a ilustração do capítulo v:/i }).click()
  await expect(dialog).toBeVisible()
  await page.goBack()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`${GALLERY}$`))

  // link compartilhado com #identificador (vindo de outra página) abre a ilustração correspondente
  await page.goto(BOOK)
  await page.goto(`${GALLERY}#capitulo-09-homem-dos-estabulos`)
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('h2')).toHaveText('O homem dos estábulos')
  await page.getByRole('button', { name: 'Fechar a visualização ampliada' }).click()
  await expect(dialog).toBeHidden()
})

test('Livro I apresenta as ilustrações e leva à galeria', async ({ page }) => {
  await page.goto(BOOK)
  const section = page.locator('#ilustracoes')
  await expect(section.getByRole('heading', { name: 'Ilustrações do Livro I' })).toBeVisible()
  await expect(section.locator('.illus-strip__item')).toHaveCount(10)
  // a área de capítulos autorizados continua sem textos publicados
  await expect(page.locator('#capitulos')).toContainText('Nenhum capítulo ou trecho foi autorizado')
  await section.getByRole('link', { name: 'Ver as ilustrações dos capítulos' }).click()
  await expect(page).toHaveURL(new RegExp(`${GALLERY}$`))
})

test('capítulos: ilustração na página do capítulo (pré-visualização) e textos não publicados', async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'fluxo do painel verificado no desktop')
  // o texto do capítulo não é público
  expect((await request.get(`${BOOK}/capitulos/3`)).status()).toBe(404)

  await login(page)
  await page.goto('/admin/ilustracoes')
  await page.getByRole('link', { name: /Capítulo III — A casa no fim da estrada/ }).click()
  await expect(page.locator('.adm-illustration')).toContainText('1831 × 2717 px · 300 DPI')
  await expect(page.locator('.adm-illustration')).toContainText('31:46')
  await page.goto('/admin/ilustracoes')
  await page.getByRole('link', { name: /Capítulo II — O peso do despertar/ }).click()
  await expect(page.locator('.adm-warnings')).toContainText('DPI')

  // publicar um capítulo sem trecho autorizado é bloqueado
  await page.goto('/admin/capitulos')
  await page.getByRole('link', { name: 'A casa no fim da estrada' }).click()
  await page.click('button[value=publicar]')
  await expect(page.locator('.adm-error-box')).toContainText('trecho autorizado')

  // a pré-visualização do capítulo mostra a ilustração correspondente
  await page.goto(`/api/preview?caminho=${encodeURIComponent(`${BOOK}/capitulos/3`)}`)
  await expect(page.locator('.chapter-illustration img')).toHaveAttribute('alt', /casa de pedra/)
  await expect(page.locator('.chapter-illustration')).toContainText('Arte final')
})
