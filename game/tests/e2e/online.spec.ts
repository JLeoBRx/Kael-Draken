import { expect, test, type Page } from '@playwright/test'
import { PLATFORM_PORT } from '../../playwright.config'
import { combat, enterGame, prepare, screen } from './helpers'

/**
 * Plataforma online com dois navegadores: entrada só pelo nome, amizade,
 * grupo, fila de duplas → partida no servidor alocado (mesma equipe) → fim
 * com XP e estatísticas; sala privada pelo código; volta pela sessão salva.
 */

type Online = { view: string; name: string | null; level: number; xp: number; party: string[]; searching: boolean; friends: { name: string; presence: string }[]; matches: number }

async function online(page: Page): Promise<Online> {
  const o = await page.evaluate(() => window.__ULTIMA__!.state().online)
  if (!o) throw new Error('fora da plataforma')
  return o as Online
}

async function login(page: Page, name: string): Promise<void> {
  await page.goto(`http://127.0.0.1:${PLATFORM_PORT}/`)
  await page.click('[data-action="online"]')
  await page.locator('[data-screen="online-login"]').waitFor()
  await page.fill('[data-field="online-name"]', name)
  await page.click('[data-action="online-login"]')
  await page.locator('[data-screen="online-home"]').waitFor()
}

test('online: nome, amigos, grupo, dupla pelo matchmaking até o fim, sala privada e sessão', async ({ browser }) => {
  test.setTimeout(900_000)
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const a = await ctxA.newPage()
  const b = await ctxB.newPage()
  const errA = await prepare(a, 'Ana')
  const errB = await prepare(b, 'Bruno')

  // nomes curtos demais são recusados; o nome é a conta
  await a.goto(`http://127.0.0.1:${PLATFORM_PORT}/`)
  await a.click('[data-action="online"]')
  await a.fill('[data-field="online-name"]', 'A')
  await a.click('[data-action="online-login"]')
  await expect(a.locator('[data-hud="online-status"]')).toContainText('3 letras')
  await login(a, 'Ana Brasa')
  await login(b, 'Bruno')
  await expect(a.locator('[data-hud="online-name"]')).toContainText('Ana Brasa')
  await expect(a.locator('[data-hud="online-level"]')).toHaveText('Nível 1')

  // amizade (pelo nome, sem diferenciar maiúsculas) e presença
  await a.fill('[data-field="friend-name"]', 'bruno')
  await a.click('[data-action="friend-add"]')
  await b.locator('[data-request="Ana Brasa"] [data-action="friend-accept"]').click()
  await expect(a.locator('[data-friend="Bruno"]')).toContainText('No menu')

  // grupo: convite e aceite
  await a.locator('[data-friend="Bruno"] [data-action="invite"]').click()
  await b.locator('[data-action="invite-accept"]').click()
  await expect(a.locator('[data-member="Bruno"]')).toBeVisible()
  await expect(b.locator('[data-member="Ana Brasa"]')).toContainText('líder')
  await expect(b.locator('[data-action="queue"]')).toBeDisabled()

  // dupla: a líder procura; os dois caem na mesma partida, na mesma equipe
  await a.locator('[data-field="mode"]').selectOption('2')
  await a.click('[data-action="queue"]')
  await expect(b.locator('[data-hud="search"]')).toBeVisible()
  await enterGame(a)
  await enterGame(b)
  await expect.poll(async () => (await combat(a)).mates.length).toBe(1)
  const sa = await combat(a)
  const sb = await combat(b)
  expect(sa.team).toBe(sb.team)
  expect(sa.mates[0].name).toBe('Bruno')
  await expect.poll(async () => (await online(b)).friends[0]?.presence).toBe('match')

  // a zona (40× mais rápida) termina a partida; o resultado vira XP e estatística na plataforma
  await expect.poll(() => screen(a), { timeout: 600_000, intervals: [2000] }).toBe('results')
  await expect.poll(async () => (await online(a)).matches, { timeout: 120_000 }).toBe(1)
  expect((await online(a)).xp).toBeGreaterThan(0)
  // "Voltar à plataforma" (se o servidor ainda não encerrou e mandou todos de volta)
  if ((await screen(a)) === 'results') await a.click('[data-hud="results"] [data-action="menu"]').catch(() => {})
  await a.locator('[data-screen="online-home"]').waitFor({ timeout: 120_000 })
  await expect(a.locator('[data-panel="reward"]')).toContainText('XP')
  await expect(a.locator('[data-panel="profile"]')).toContainText('partidas')
  // Bruno volta sozinho quando o servidor da partida encerra
  await expect.poll(async () => (await online(b)).view, { timeout: 120_000 }).toBe('home')
  expect((await online(b)).matches).toBe(1)

  // sala privada: Ana cria, Bruno entra pelo código, Ana inicia
  await a.click('[data-action="room-create"]')
  await a.locator('[data-screen="lobby"]').waitFor({ timeout: 60_000 })
  const code = (await a.locator('[data-hud="room-code"]').textContent())!.trim()
  expect(code).toMatch(/^[A-Z2-9]{6}$/)
  // o grupo recebe o convite da sala; Bruno entra digitando o código
  await b.fill('[data-field="room-code"]', code.toLowerCase())
  await b.click('[data-action="room-join"]')
  await b.locator('[data-screen="lobby"]').waitFor({ timeout: 60_000 })
  await expect(a.locator('[data-member]')).toHaveCount(2)
  await a.locator('[data-field="bots"]').evaluate((el: HTMLInputElement) => { el.value = '0'; el.dispatchEvent(new Event('change')) })
  await a.locator('[data-field="mode"]').selectOption('0')
  await a.click('[data-action="start"]')
  await enterGame(a)
  await enterGame(b)
  expect((await combat(a)).remotes).toBe(1)
  // sair pela pausa volta para a plataforma
  await b.evaluate(() => document.exitPointerLock())
  await expect.poll(() => screen(b)).toBe('paused')
  await b.click('[data-action="quit"]')
  await b.locator('[data-screen="online-home"]').waitFor()
  await expect.poll(async () => (await combat(a)).remotes).toBe(0)

  // recarregar a página: entra de novo pela sessão salva, sem digitar o nome
  await b.reload()
  await b.click('[data-action="online"]')
  await b.locator('[data-screen="online-home"]').waitFor()
  await expect(b.locator('[data-hud="online-name"]')).toContainText('Bruno')
  expect((await online(b)).matches).toBe(1)

  await ctxA.close()
  await ctxB.close()
  expect(errA.filter((e) => !e.includes('WebSocket'))).toEqual([])
  expect(errB.filter((e) => !e.includes('WebSocket'))).toEqual([])
})
