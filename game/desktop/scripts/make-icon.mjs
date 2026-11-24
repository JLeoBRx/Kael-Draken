// Gera assets/icon.png (512×512) a partir de assets/icon.svg com o Chromium do Playwright.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const assets = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')
const svg = readFileSync(join(assets, 'icon.svg'), 'utf8')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 })
await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="512" height="512" ')}</body></html>`)
await page.locator('svg').screenshot({ path: join(assets, 'icon.png'), omitBackground: true })
await browser.close()
console.log('assets/icon.png gerado')
