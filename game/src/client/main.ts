import './ui/styles.css'
import { App } from './app'

const root = document.getElementById('app')
if (!root) throw new Error('Elemento #app ausente')
const app = new App(root)
app.start()

declare global {
  interface Window {
    /** Gancho de diagnóstico (usado pelos testes de ponta a ponta). */
    __ULTIMA__?: { state: App['debugState']; playOffline: (mapId?: string) => Promise<void> }
  }
}
window.__ULTIMA__ = { state: () => app.debugState(), playOffline: (mapId?: string) => app.playOffline(mapId) }
