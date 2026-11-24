import { describe, expect, it } from 'vitest'
import { recommend } from '../../src/client/benchmark-score'

describe('teste de desempenho: recomendação', () => {
  const r = (quality: 'baixa' | 'media' | 'alta', avgFps: number, low1Fps: number) => ({ quality, avgFps, low1Fps })

  it('escolhe a maior qualidade fluida (média ≥ 50 e 1% piores ≥ 30)', () => {
    expect(recommend([r('baixa', 144, 120), r('media', 120, 90), r('alta', 75, 48)], 1)).toEqual({ quality: 'alta', suggestScale: null })
    // alta com engasgos (1% piores baixos) não serve
    expect(recommend([r('baixa', 144, 120), r('media', 90, 60), r('alta', 60, 22)], 1)).toEqual({ quality: 'media', suggestScale: null })
    expect(recommend([r('baixa', 60, 41), r('media', 38, 25), r('alta', 20, 12)], 1)).toEqual({ quality: 'baixa', suggestScale: null })
  })

  it('nem a baixa fluida: sugere escala menor, proporcional ao que falta', () => {
    const slow = recommend([r('baixa', 30, 18)], 1)
    expect(slow.quality).toBe('baixa')
    // 30/55 → raiz ≈ 0,74 → 75%
    expect(slow.suggestScale).toBe(0.75)
    expect(recommend([r('baixa', 5, 2)], 1).suggestScale).toBe(0.5)
    // já no mínimo: nada a sugerir
    expect(recommend([r('baixa', 5, 2)], 0.5).suggestScale).toBeNull()
  })
})
