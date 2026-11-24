import type { Quality } from './settings'

/**
 * Recomendação do teste de desempenho (sem dependências de navegador, para
 * poder ser testada): a maior qualidade fluida — média de pelo menos 50
 * quadros/s e 1% piores de pelo menos 30 — ou, se nem a baixa fica fluida,
 * a baixa com uma escala de resolução menor (o custo de preenchimento cai
 * com o quadrado da escala).
 */
export function recommend(results: { quality: Quality; avgFps: number; low1Fps: number }[], renderScale: number): { quality: Quality; suggestScale: number | null } {
  const order: Quality[] = ['alta', 'media', 'baixa']
  for (const q of order) {
    const r = results.find((x) => x.quality === q)
    if (r && r.avgFps >= 50 && r.low1Fps >= 30) return { quality: q, suggestScale: null }
  }
  const low = results.find((x) => x.quality === 'baixa')
  // nem a baixa ficou fluida: menos pixels (a escala corta o custo do preenchimento)
  const suggestScale = low && renderScale > 0.5 ? Math.max(0.5, Math.round(renderScale * Math.min(1, Math.sqrt(Math.max(0.1, low.avgFps) / 55)) * 20) / 20) : null
  return { quality: 'baixa', suggestScale: suggestScale !== null && suggestScale < renderScale ? suggestScale : null }
}

