import './ui/styles.css'
import { App } from './app'
import type { BenchmarkResult } from './benchmark'
import { startPhotoMode } from './photo'
import { QUALITY, type Quality } from './settings'

const root = document.getElementById('app')
if (!root) throw new Error('Elemento #app ausente')
const params = new URLSearchParams(location.search)

declare global {
  interface Window {
    /** Gancho de diagnóstico (usado pelos testes de ponta a ponta). */
    __ULTIMA__?: {
      state: App['debugState']
      playOffline: (mapId?: string) => Promise<void>
      dropConnection: () => void
      benchmark: (qualities?: Quality[], seconds?: number) => Promise<BenchmarkResult | null>
    }
  }
}

if (params.has('foto')) {
  // modo foto (ferramenta de desenvolvimento): só o mapa, sem partida
  void startPhotoMode(root, params)
} else {
  const app = new App(root)
  app.start()
  window.__ULTIMA__ = {
    state: () => app.debugState(), playOffline: (mapId?: string) => app.playOffline(mapId), dropConnection: () => app.debugDropConnection(),
    benchmark: (qualities, seconds) => app.showBenchmark(qualities, seconds),
  }
  // ?desempenho=baixa,media&s=10: abre direto no teste de desempenho
  if (params.has('desempenho')) {
    const qs = (params.get('desempenho') || 'baixa,media,alta').split(',').filter((q): q is Quality => q in QUALITY)
    void app.showBenchmark(qs.length ? qs : undefined, Number(params.get('s')) || undefined)
  }
}
