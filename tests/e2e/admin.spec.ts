import path from 'node:path'
import { writeFileSync, mkdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const USER = process.env.E2E_ADMIN_USER!
const PASS = process.env.E2E_ADMIN_PASSWORD!

async function login(page: Page) {
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.fill('#username', USER)
  await page.fill('#password', PASS)
  await page.click('button[type=submit]')
  await expect(page).toHaveURL(/\/admin$/)
}

test('área administrativa exige autenticação', async ({ page, request }) => {
  const res = await request.get('/admin/personagens', { maxRedirects: 0 })
  expect(res.status()).toBe(307)
  await page.goto('/admin/login')
  await page.fill('#username', USER)
  await page.fill('#password', 'senha-incorreta')
  await page.click('button[type=submit]')
  await expect(page.locator('.adm-error')).toContainText('incorretos')
  await expect(page.locator('#username')).toHaveValue(USER)
})

test('criar, publicar, editar, pré-visualizar e excluir conteúdo', async ({ page, browser }) => {
  await login(page)
  await page.goto('/admin/personagens/novo')
  await page.fill('#f-name', 'Personagem E2E')
  await page.fill('#f-summary', 'Resumo do teste automatizado.')
  await page.selectOption('#f-role', 'aliado')
  await page.locator('fieldset.adm-multi', { hasText: 'Lugares associados' }).getByLabel('Brumafunda').check()
  await page.fill('#f-notes', 'NOTA-PRIVADA-E2E')
  await page.click('button[value=publicar]')
  await expect(page).toHaveURL(/\/admin\/personagens\/\d+\?criado=1/)
  await expect(page.locator('.adm-status')).toContainText('Publicado')
  const editUrl = page.url().split('?')[0]

  const visitor = await browser.newPage()
  await visitor.goto('/personagens/personagem-e2e')
  await expect(visitor.locator('h1')).toHaveText('Personagem E2E')
  expect(await visitor.content()).not.toContain('NOTA-PRIVADA-E2E')
  await expect(visitor.locator('a[href="/locais/brumafunda"]').first()).toBeVisible()
  await visitor.goto('/locais/brumafunda')
  await expect(visitor.getByRole('link', { name: /Personagem E2E/ })).toBeVisible()

  await page.goto(editUrl)
  await page.fill('#f-summary', 'Resumo alterado.')
  await page.click('button[value=salvar]')
  await expect(page.locator('.adm-ok').first()).toContainText('Alterações salvas')

  await page.click('button[value=despublicar]')
  await expect(page.locator('.adm-status')).toContainText('Rascunho')
  const hidden = await visitor.goto('/personagens/personagem-e2e')
  expect(hidden?.status()).toBe(404)

  const preview = await page.locator('a', { hasText: 'Pré-visualizar no site' }).getAttribute('href')
  await page.goto(preview!)
  await expect(page.locator('.preview-banner')).toBeVisible()
  await expect(page.locator('h1')).toHaveText('Personagem E2E')
  await page.goto('/api/preview/sair')

  await page.goto(editUrl)
  await page.getByRole('button', { name: 'Excluir…' }).click()
  await page.getByRole('button', { name: 'Sim, excluir' }).click()
  await expect(page).toHaveURL(/excluido=1/)
  await visitor.close()
})

test('enviar imagem e definir a capa oficial nas configurações', async ({ page }) => {
  await login(page)
  // PNG mínimo válido (1×1)
  const dir = path.join(process.cwd(), 'test-results')
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'capa-e2e.png')
  writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
  await page.goto('/admin/midia')
  await page.setInputFiles('#files', file)
  await page.fill('#alt', 'Capa de teste')
  await page.click('form.adm-upload button[type=submit]')
  await expect(page.locator('.adm-upload .adm-ok')).toContainText('enviada')
  const src = await page.locator('.adm-library img').first().getAttribute('src')
  const res = await page.request.get(src!)
  expect(res.status()).toBe(200)
  expect(res.headers()['content-type']).toBe('image/png')

  // arquivo que não é imagem é recusado
  const fake = path.join(dir, 'falso.png')
  writeFileSync(fake, '<script>alert(1)</script>')
  await page.setInputFiles('#files', fake)
  await page.click('form.adm-upload button[type=submit]')
  await expect(page.locator('.adm-upload .adm-error')).toContainText('não é uma imagem')

  await page.goto('/admin/configuracoes')
  await page.getByRole('button', { name: 'Escolher imagem' }).click()
  await page.locator('.adm-media-grid button').first().click()
  await page.getByRole('button', { name: 'Usar seleção' }).click()
  await page.getByRole('button', { name: 'Salvar configurações' }).click()
  await expect(page.locator('.adm-ok')).toContainText('salvas')
  await page.goto('/')
  await expect(page.locator('.book-cover__img')).toBeVisible()
})

test('marcadores de mapa: criar mapa, posicionar marcador e publicar', async ({ page }) => {
  await login(page)
  await page.goto('/admin/mapas/novo')
  await page.fill('#f-title', 'Mapa regional E2E')
  await page.click('button[value=publicar]')
  await expect(page).toHaveURL(/\/admin\/mapas\/\d+/)
  const viewport = page.locator('.adm-markers .map-viewer__viewport')
  const box = (await viewport.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.4)
  await page.fill('#m-label', 'Ponto de teste')
  await page.selectOption('#m-status', 'publicado')
  await page.getByRole('button', { name: 'Adicionar marcador' }).click()
  await expect(page.locator('.adm-markers .adm-ok')).toContainText('criado')
  await page.goto('/atlas/mapas/mapa-regional-e2e')
  await expect(page.getByRole('button', { name: /Ponto de teste/ }).first()).toBeAttached()
})
