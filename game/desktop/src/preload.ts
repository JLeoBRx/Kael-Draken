import { contextBridge, ipcRenderer } from 'electron'

/**
 * Ponte mínima entre a página do jogo e o aplicativo (ver
 * src/client/desktop.ts). A página não ganha acesso ao Node: só estas
 * funções, e o processo principal confere a origem de cada pedido.
 */

const info = ipcRenderer.sendSync('uc:info') as { version: string; platform: string } | null

if (info) {
  contextBridge.exposeInMainWorld('ucDesktop', {
    version: info.version,
    platform: info.platform,
    hosting: () => ipcRenderer.invoke('uc:hosting'),
    host: async (opts: { name?: unknown }) => {
      const r = (await ipcRenderer.invoke('uc:host', { name: String(opts?.name ?? '').slice(0, 32) })) as { ok: boolean; hosting?: unknown; error?: string }
      if (!r.ok) throw new Error(r.error ?? 'falha ao hospedar')
      return r.hosting
    },
    stopHost: () => ipcRenderer.invoke('uc:stop-host'),
    toggleFullscreen: () => ipcRenderer.send('uc:fullscreen'),
    quit: () => ipcRenderer.send('uc:quit'),
  })
}
