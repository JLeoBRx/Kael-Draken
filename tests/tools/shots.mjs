// Capturas de página inteira (uso interno). node tests/tools/shots.mjs <base> <saida> <largura> <rotas...>
import { chromium } from '@playwright/test'
const [,, base, out, width, ...routes] = process.argv
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: +width, height: 900 } })
for (const r of routes) {
  await page.goto(base + r, { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((res) => setTimeout(res, 60)) }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(400)
  const file = `${out}/${width}${r.replace(/[\/?=&#]+/g, '_') || '_home'}.png`
  await page.screenshot({ path: file, fullPage: true })
  console.log(file)
}
await browser.close()
