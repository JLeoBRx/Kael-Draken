// Teste de fumaça do aplicativo de computador (Playwright + Electron).
//
//   cd desktop && npm run build && xvfb-run -a node tests/smoke.mjs [pasta-das-capturas]
//   UC_EXE=release/linux-unpacked/ultima-chama xvfb-run -a node tests/smoke.mjs   (pacote pronto)
//
// Abre o aplicativo, confere a ponte com a página, hospeda uma partida na rede
// local pelo aplicativo, entra nela com um navegador comum (como outro
// computador faria) e fecha tudo, conferindo que o servidor também fechou.
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, chromium } from 'playwright'

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..')
const shots = process.argv[2] ?? null
if (shots) mkdirSync(shots, { recursive: true })
const gpu = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
const step = (t) => console.log(`· ${t}`)
const fail = (t) => {
  console.error(`✗ ${t}`)
  process.exitCode = 1
}

// UC_EXE: testa um executável já empacotado (release/linux-unpacked/ultima-chama, AppImage...)
const packaged = process.env.UC_EXE ?? null
const app = await electron.launch({
  executablePath: packaged ?? join(desktop, 'node_modules/electron/dist/electron'),
  args: packaged ? ['--no-sandbox', ...gpu] : [desktop, '--no-sandbox', ...gpu],
  cwd: desktop,
  env: { ...process.env, UC_PLATFORM: 'localhost:7370', ELECTRON_ENABLE_LOGGING: '0' },
  timeout: 60_000,
})
const logs = []
app.process().stdout?.on('data', (d) => logs.push(d.toString()))
app.process().stderr?.on('data', (d) => logs.push(d.toString()))
let browser = null
try {
  const win = await app.firstWindow()
  await win.setViewportSize({ width: 1280, height: 720 }).catch(() => {})
  await win.waitForSelector('[data-screen="menu"]', { timeout: 60_000 })
  const url = win.url()
  step(`janela aberta em ${url}`)
  if (!/^http:\/\/127\.0\.0\.1:\d+\/$/.test(url)) fail(`endereço inesperado: ${url}`)
  const bridge = await win.evaluate(() => ({ has: typeof window.ucDesktop === 'object', version: window.ucDesktop?.version, platform: window.ucDesktop?.platform, node: typeof window.require }))
  step(`ponte: ${JSON.stringify(bridge)}`)
  if (!bridge.has || bridge.platform !== 'localhost:7370') fail('ponte ausente ou sem a plataforma configurada')
  if (bridge.node !== 'undefined') fail('a página não pode ter acesso ao Node')
  if (!(await win.locator('[data-action="quit"]').isVisible())) fail('botão "Sair do jogo" ausente')
  if (shots) await win.screenshot({ path: join(shots, 'desktop-menu.png') })

  // hospedar pela tela "Rede local"
  await win.click('[data-action="join"]')
  await win.waitForSelector('[data-screen="host"] [data-action="host"]')
  await win.fill('input[name="nome"]', 'Anfitriã')
  await win.click('[data-action="host"]')
  await win.waitForSelector('[data-screen="lobby"]', { timeout: 60_000 })
  const health = await (await fetch('http://127.0.0.1:7350/api/health')).json()
  step(`servidor hospedado respondendo: ${JSON.stringify(health)}`)
  if (!health.ok) fail('servidor hospedado sem saúde')
  const hosting = await win.evaluate(() => window.ucDesktop.hosting())
  step(`hospedando: ${JSON.stringify(hosting)}`)
  if (hosting?.port !== 7350) fail('hosting() não informa a porta')

  // outro computador: navegador comum abrindo o endereço do servidor hospedado
  browser = await chromium.launch({ args: gpu })
  const guest = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await guest.addInitScript(() => localStorage.setItem('ultima-chama:configuracoes:v1', JSON.stringify({ quality: 'baixa', playerName: 'Visita', renderScale: 0.5 })))
  await guest.goto('http://127.0.0.1:7350/')
  await guest.click('[data-action="join"]')
  if (await guest.locator('[data-screen="host"]').isVisible()) fail('o navegador não deveria ver a opção de hospedar')
  await guest.fill('input[name="nome"]', 'Visita')
  await guest.click('[data-action="connect"]')
  await guest.waitForSelector('[data-screen="lobby"]', { timeout: 60_000 })
  await win.waitForFunction(() => document.querySelector('[data-screen="lobby"]')?.textContent?.includes('Visita'), null, { timeout: 30_000 })
  step('a visita entrou na sala do anfitrião (aparece na sala de espera do aplicativo)')
  if (shots) await win.screenshot({ path: join(shots, 'desktop-sala.png') })
} catch (err) {
  fail(err instanceof Error ? err.stack ?? err.message : String(err))
  console.error(logs.join('').slice(-3000))
} finally {
  await browser?.close()
  await app.close()
}
// o servidor hospedado fecha junto com o aplicativo
await new Promise((r) => setTimeout(r, 500))
const still = await fetch('http://127.0.0.1:7350/api/health').then(() => true, () => false)
if (still) fail('o servidor hospedado continuou rodando depois de fechar o aplicativo')
else step('aplicativo fechado; servidor hospedado encerrado junto')
console.log(process.exitCode ? 'FALHOU' : 'ok')
