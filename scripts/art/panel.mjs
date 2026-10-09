// Rasteriza o painel heráldico (scripts/art/.build/painel.html) em public/images/atlas/painel-seis-reinos.webp.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const html = path.join(dir, '.build', 'painel.html')
const png = path.join(dir, '.build', 'painel.png')
const out = path.resolve(dir, '../../public/images/atlas/painel-seis-reinos.webp')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 2400, height: 1600 } })
await page.goto('file://' + html)
await page.screenshot({ path: png })
await browser.close()
execFileSync('python3', ['-c', `from PIL import Image; Image.open(${JSON.stringify(png)}).convert('RGB').save(${JSON.stringify(out)}, 'WEBP', quality=82, method=6)`])
console.log(out)
