import { chromium } from '@playwright/test'
const [,, base] = process.argv
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const logs = []
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
await page.goto(base + '/atlas', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Explorar em 3D' }).click()
await page.waitForSelector('.world3d__canvas.is-visible', { timeout: 30000 })
await page.waitForTimeout(2500)
console.log('mode', await page.locator('.world-atlas').getAttribute('data-mode'))
await page.getByRole('button', { name: 'Voltar ao mapa 2D' }).click()
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(500)
  console.log(i, await page.locator('.world-atlas').getAttribute('data-mode'), await page.locator('canvas').count())
}
console.log(logs.filter((l) => !l.includes('preload')).join('\n'))
await browser.close()
