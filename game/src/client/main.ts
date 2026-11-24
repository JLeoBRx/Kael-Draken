import './ui/styles.css'
import { App } from './app'
import { startPhotoMode } from './photo'

const root = document.getElementById('app')
if (!root) throw new Error('Elemento #app ausente')
const params = new URLSearchParams(location.search)

declare global {
  interface Window {
    /** Gancho de diagnóstico (usado pelos testes de ponta a ponta). */
    __ULTIMA__?: { state: App['debugState']; playOffline: (mapId?: string) => Promise<void>; dropConnection: () => void }
  }
}

if (params.has('foto')) {
  // modo foto (ferramenta de desenvolvimento): só o mapa, sem partida
  void startPhotoMode(root, params)
} else {
  const app = new App(root)
  app.start()
  window.__ULTIMA__ = { state: () => app.debugState(), playOffline: (mapId?: string) => app.playOffline(mapId), dropConnection: () => app.debugDropConnection() }
}
