import { app, BrowserWindow, ipcMain, session, shell, utilityProcess, type IpcMainEvent, type IpcMainInvokeEvent, type UtilityProcess } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startDesktopSite, type DesktopSite } from '../../src/desktop/site'
import { lanAddresses } from '../../src/server/node/server'

/**
 * Aplicativo de computador da Última Chama (Electron).
 *
 * - A janela carrega o jogo de um site local (127.0.0.1, porta fixa) servido
 *   por este processo, que também escuta os anúncios de partidas na rede.
 * - "Hospedar partida" sobe o servidor de jogo de verdade (o mesmo do
 *   `npm run host`) num processo separado (utilityProcess): a sala de espera
 *   fica aberta na rede local para outros computadores — com o aplicativo ou
 *   pelo navegador — e o jogo deste computador entra como dono da sala.
 * - Offline (bots) e online funcionam como no navegador.
 *
 * Configuração opcional em <dados do usuário>/config.json:
 *   { "platform": "jogo.exemplo.com.br", "hostPort": 7350 }
 * ou pelas variáveis UC_PLATFORM e UC_HOST_PORT.
 */

interface Config {
  platform: string
  hostPort: number
}

interface Hosting {
  port: number
  name: string
  addresses: string[]
}

const here = dirname(fileURLToPath(import.meta.url))
// empacotado: client/ e server/ ficam em resources/; em desenvolvimento, em game/dist/
const resources = app.isPackaged ? process.resourcesPath : join(here, '..', '..', 'dist')
const clientDir = join(resources, 'client')
const serverScript = join(resources, 'server', 'servidor.mjs')

if (process.env.UC_IGNORE_GPU_BLOCKLIST === '1') app.commandLine.appendSwitch('ignore-gpu-blocklist')
// o jogo continua rodando com a janela em segundo plano (partidas em rede)
app.commandLine.appendSwitch('disable-renderer-backgrounding')

function loadConfig(): Config {
  let file: Partial<Config> = {}
  const path = join(app.getPath('userData'), 'config.json')
  try {
    if (existsSync(path)) file = JSON.parse(readFileSync(path, 'utf8')) as Partial<Config>
  } catch (err) {
    console.warn(`[aplicativo] config.json ilegível (${path}): ${(err as Error).message}`)
  }
  const port = Number(process.env.UC_HOST_PORT ?? file.hostPort ?? 7350)
  return {
    platform: String(process.env.UC_PLATFORM ?? file.platform ?? 'localhost:7370').slice(0, 200),
    hostPort: Number.isInteger(port) && port > 0 && port < 65536 ? port : 7350,
  }
}

let site: DesktopSite | null = null
let win: BrowserWindow | null = null
let config: Config
let host: { proc: UtilityProcess; info: Hosting } | null = null
let hostLog: string[] = []

/** Só a página do jogo (site local) fala com o processo principal. */
function trusted(e: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  return !!site && url.startsWith(site.url)
}

async function waitHealthy(port: number, proc: UtilityProcess, ms: number): Promise<void> {
  const t0 = Date.now()
  let exited: number | null = null
  proc.once('exit', (code) => (exited = code))
  for (;;) {
    if (exited !== null) throw new Error(lastLines() || `o servidor fechou (código ${exited})`)
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (r.ok) return
    } catch {
      // ainda subindo
    }
    if (Date.now() - t0 > ms) throw new Error('o servidor não respondeu a tempo')
    await new Promise((ok) => setTimeout(ok, 150))
  }
}

/** O servidor explica em português por que não abriu (porta em uso, sem permissão…): repassa a última explicação. */
function lastLines(): string {
  const err = hostLog.filter((l) => /em uso|permissão|erro|error|inválid/i.test(l)).at(-1)
  return (err ?? hostLog.at(-1) ?? '').slice(0, 300)
}

async function startHost(name: string): Promise<Hosting> {
  if (host) return host.info
  if (!existsSync(serverScript)) throw new Error(`servidor não encontrado em ${serverScript}`)
  const clean = name.replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20) || 'Jogador'
  const port = config.hostPort
  hostLog = []
  const proc = utilityProcess.fork(serverScript, ['--lobby', '--port', String(port), '--name', `Sala de ${clean}`, '--static', clientDir], {
    stdio: 'pipe', serviceName: 'Servidor da partida (Última Chama)',
  })
  const keep = (d: Buffer) => {
    for (const line of d.toString().split('\n')) {
      if (!line.trim()) continue
      hostLog.push(line)
      if (hostLog.length > 200) hostLog.shift()
      console.log(`[servidor] ${line}`)
    }
  }
  proc.stdout?.on('data', keep)
  proc.stderr?.on('data', keep)
  proc.on('exit', (code) => {
    if (host?.proc === proc) host = null
    console.log(`[aplicativo] servidor da partida encerrado (código ${code})`)
  })
  try {
    await waitHealthy(port, proc, 20_000)
  } catch (err) {
    proc.kill()
    throw err
  }
  const info: Hosting = { port, name: `Sala de ${clean}`, addresses: lanAddresses() }
  host = { proc, info }
  return info
}

function stopHost(): Promise<void> {
  const h = host
  host = null
  if (!h) return Promise.resolve()
  return new Promise((ok) => {
    const t = setTimeout(ok, 3000)
    h.proc.once('exit', () => {
      clearTimeout(t)
      ok()
    })
    h.proc.kill()
  })
}

function createWindow(url: string): BrowserWindow {
  const icon = join(here, '..', 'assets', 'icon.png')
  const w = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1024, minHeight: 600, show: false, backgroundColor: '#0b0f14', title: 'Última Chama',
    autoHideMenuBar: true, icon: existsSync(icon) ? icon : undefined,
    webPreferences: { preload: join(here, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false, spellcheck: false },
  })
  w.removeMenu()
  w.once('ready-to-show', () => w.show())
  // nada de navegar para fora do jogo: links externos abrem no navegador do sistema
  w.webContents.on('will-navigate', (e, to) => {
    if (!to.startsWith(url)) e.preventDefault()
  })
  w.webContents.setWindowOpenHandler(({ url: to }) => {
    if (/^https?:\/\//.test(to) && !to.startsWith(url)) void shell.openExternal(to)
    return { action: 'deny' }
  })
  w.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'F11') {
      w.setFullScreen(!w.isFullScreen())
      e.preventDefault()
    }
    if (input.key === 'F12' && (!app.isPackaged || process.env.UC_DEVTOOLS === '1')) w.webContents.toggleDevTools()
  })
  w.webContents.on('render-process-gone', (_e, d) => console.warn(`[aplicativo] a página do jogo caiu: ${d.reason}`))
  void w.loadURL(url)
  return w
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.focus()
  })

  ipcMain.on('uc:info', (e) => {
    e.returnValue = trusted(e) ? { version: app.getVersion(), platform: config.platform } : null
  })
  ipcMain.handle('uc:hosting', (e) => (trusted(e) ? host?.info ?? null : null))
  ipcMain.handle('uc:host', async (e, opts: unknown) => {
    if (!trusted(e)) return { ok: false, error: 'origem não autorizada' }
    try {
      const name = typeof opts === 'object' && opts !== null && typeof (opts as { name?: unknown }).name === 'string' ? (opts as { name: string }).name : ''
      return { ok: true, hosting: await startHost(name) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
  ipcMain.handle('uc:stop-host', async (e) => {
    if (trusted(e)) await stopHost()
  })
  ipcMain.on('uc:fullscreen', (e) => {
    if (trusted(e) && win) win.setFullScreen(!win.isFullScreen())
  })
  ipcMain.on('uc:quit', (e) => {
    if (trusted(e)) app.quit()
  })

  app.whenReady().then(async () => {
    config = loadConfig()
    // só o que o jogo usa: mouse preso e tela cheia
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'pointerLock' || permission === 'fullscreen'))
    if (!existsSync(join(clientDir, 'index.html'))) console.error(`[aplicativo] cliente não encontrado em ${clientDir} (rode "npm run build:all" na pasta do jogo)`)
    site = await startDesktopSite({ clientDir, hosted: () => (host ? { port: host.info.port, name: host.info.name } : null), version: app.getVersion() })
    console.log(`[aplicativo] Última Chama ${app.getVersion()} em ${site.url}`)
    win = createWindow(site.url)
    win.on('closed', () => (win = null))
  }, (err) => {
    console.error(err)
    app.exit(1)
  })

  app.on('window-all-closed', () => app.quit())
  let quitting = false
  app.on('before-quit', (e) => {
    if (quitting) return
    quitting = true
    e.preventDefault()
    void Promise.all([stopHost(), site?.close()]).finally(() => app.exit(0))
  })
}
