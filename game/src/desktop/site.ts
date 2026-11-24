import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { LanDiscovery, type LanServer } from '../server/node/discovery'
import { lanAddresses, serveStatic } from '../server/node/server'

/**
 * Parte "servidor" do aplicativo de computador (sem Electron, para poder ser
 * testada): o site local de onde a janela carrega o jogo e a descoberta de
 * partidas na rede.
 *
 * O site escuta só em 127.0.0.1, numa porta fixa (7349, ou a próxima livre):
 * a origem fica a mesma entre aberturas, então as configurações salvas no
 * navegador da janela (localStorage) continuam lá.
 *
 *   /              cliente compilado
 *   /api/lan       partidas anunciadas na rede local (o mesmo formato dos hosts)
 *   /api/desktop   este é o aplicativo de computador
 */

export const DESKTOP_SITE_PORT = 7349

export interface HostedServer {
  port: number
  name: string
}

export interface DesktopSiteOptions {
  clientDir: string
  /** Primeira porta a tentar (as 10 seguintes também; depois, qualquer uma). */
  port?: number
  /** Servidor que este computador está hospedando (aparece primeiro na lista). */
  hosted?: () => HostedServer | null
  /** Escuta anúncios na rede (desligue nos testes). */
  discovery?: boolean
  discoveryPort?: number
  version?: string
}

export interface DesktopSite {
  port: number
  url: string
  discovery: LanDiscovery | null
  close(): Promise<void>
}

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise((ok, fail) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening)
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') ok(false)
      else fail(err)
    }
    const onListening = () => {
      server.off('error', onError)
      ok(true)
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, '127.0.0.1')
  })
}

/** Lista para a tela "Rede local": o servidor hospedado aqui vem como `self`. */
export function lanList(hosted: HostedServer | null, seen: LanServer[]): { self: unknown; servers: LanServer[]; discovery: boolean } {
  const mine = new Set(hosted ? lanAddresses().map((ip) => `${ip}:${hosted.port}`).concat(`127.0.0.1:${hosted.port}`) : [])
  return {
    self: hosted ? { name: hosted.name, port: hosted.port, addresses: lanAddresses(), hosted: true } : null,
    // o próprio anúncio volta pela rede: não aparece duas vezes
    servers: seen.filter((s) => !mine.has(`${s.address}:${s.port}`)),
    discovery: true,
  }
}

export async function startDesktopSite(opts: DesktopSiteOptions): Promise<DesktopSite> {
  const root = resolve(opts.clientDir)
  let discovery: LanDiscovery | null = null
  const http = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]
    const json = (body: unknown) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(JSON.stringify(body))
    }
    if (path === '/api/lan') {
      const hosted = opts.hosted?.() ?? null
      return json({ ...lanList(hosted, discovery?.list() ?? []), discovery: !!discovery })
    }
    if (path === '/api/desktop') return json({ desktop: true, version: opts.version ?? '' })
    serveStatic(root, req, res)
  })
  const first = opts.port ?? DESKTOP_SITE_PORT
  let bound = false
  for (let p = first; p < first + 11 && !bound; p++) bound = await listen(http, p)
  if (!bound) await listen(http, 0)
  const port = (http.address() as AddressInfo).port
  if (opts.discovery !== false) {
    const d = new LanDiscovery({ httpPort: 0, info: null, listenPort: opts.discoveryPort })
    if (await d.start()) discovery = d
  }
  return {
    port,
    url: `http://127.0.0.1:${port}/`,
    discovery,
    close: () =>
      new Promise<void>((ok) => {
        discovery?.close()
        http.close(() => ok())
        http.closeAllConnections()
      }),
  }
}
