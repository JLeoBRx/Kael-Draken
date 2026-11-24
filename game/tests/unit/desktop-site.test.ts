import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { lanList, startDesktopSite } from '../../src/desktop/site'
import type { LanServer } from '../../src/server/node/discovery'

describe('aplicativo de computador: site local', () => {
  it('serve o cliente, a lista da rede e cai para a próxima porta se a fixa estiver ocupada', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uc-site-'))
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Última Chama</title>')
    // ocupa uma porta e pede justamente ela: o site fica na seguinte
    const busy = createServer()
    await new Promise<void>((ok) => busy.listen(0, '127.0.0.1', () => ok()))
    const taken = (busy.address() as AddressInfo).port
    let hosted: { port: number; name: string } | null = null
    const site = await startDesktopSite({ clientDir: dir, port: taken, discovery: false, hosted: () => hosted, version: '1.0.0' })
    try {
      expect(site.port).not.toBe(taken)
      expect(site.url).toBe(`http://127.0.0.1:${site.port}/`)
      expect(await (await fetch(site.url)).text()).toContain('Última Chama')
      expect(await (await fetch(`${site.url}api/desktop`)).json()).toEqual({ desktop: true, version: '1.0.0' })
      expect(await (await fetch(`${site.url}api/lan`)).json()).toMatchObject({ self: null, servers: [], discovery: false })
      hosted = { port: 7350, name: 'Sala de Ana' }
      expect((await (await fetch(`${site.url}api/lan`)).json()).self).toMatchObject({ name: 'Sala de Ana', port: 7350, hosted: true })
      // fora da pasta do cliente: proibido
      expect((await fetch(`${site.url}..%2f..%2fetc%2fpasswd`)).status).toBeGreaterThanOrEqual(400)
    } finally {
      await site.close()
      busy.close()
    }
  })

  it('a partida hospedada aqui não aparece duas vezes na lista (o próprio anúncio volta pela rede)', () => {
    const seen = (address: string, port: number, name: string): LanServer => ({ address, port, name, mapName: 'Ilha', players: 1, bots: 0, maxPlayers: 16, mode: 1, lobby: true, running: false, teamSize: 1, version: 7, age: 100 })
    const out = lanList({ port: 7350, name: 'Minha sala' }, [seen('127.0.0.1', 7350, 'Minha sala'), seen('10.9.9.9', 7350, 'Outra sala')])
    expect(out.servers.map((s) => s.name)).toEqual(['Outra sala'])
    expect(lanList(null, [seen('127.0.0.1', 7350, 'Sala')]).servers).toHaveLength(1)
  })
})
