import { describe, expect, it } from 'vitest'
import { DEFAULT_KEYS, RESERVED_KEYS, correctionMatrix, keyLabel, rarityColor, rebind, setColorVision } from '../../src/client/accessibility'
import { RARITIES } from '../../src/shared/config/items'

describe('acessibilidade', () => {
  it('trocar tecla: quem já usava fica com a antiga; reservadas são recusadas', () => {
    const k = rebind(DEFAULT_KEYS, 'jump', 'KeyQ')
    expect(k.jump[0]).toBe('KeyQ')
    expect(k.buildWall).toEqual(['Space'])
    // a segunda tecla de uma ação continua
    const k2 = rebind(DEFAULT_KEYS, 'forward', 'KeyI')
    expect(k2.forward).toEqual(['KeyI', 'ArrowUp'])
    for (const code of RESERVED_KEYS) expect(rebind(DEFAULT_KEYS, 'jump', code)).toBe(DEFAULT_KEYS)
    // nenhuma tecla em duas ações
    const all = Object.values(rebind(k, 'use', 'KeyC')).flat()
    expect(new Set(all).size).toBe(all.length)
    expect(keyLabel('KeyW')).toBe('W')
    expect(keyLabel('Space')).toBe('Espaço')
  })

  it('correção de cores: identidade no normal; preserva o cinza; muda verde/vermelho no deuteranope', () => {
    expect(correctionMatrix('normal')).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1])
    for (const m of ['protanopia', 'deuteranopia', 'tritanopia'] as const) {
      const c = correctionMatrix(m)
      // cinza continua cinza (as linhas somam ~1)
      for (let r = 0; r < 3; r++) expect(c[r * 3] + c[r * 3 + 1] + c[r * 3 + 2]).toBeCloseTo(1, 1)
    }
    const c = correctionMatrix('deuteranopia')
    const apply = (v: number[]) => [0, 1, 2].map((r) => c[r * 3] * v[0] + c[r * 3 + 1] * v[1] + c[r * 3 + 2] * v[2])
    // vermelho e verde puros ganham azul diferente (separáveis por quem não vê verde)
    expect(Math.abs(apply([1, 0, 0])[2] - apply([0, 1, 0])[2])).toBeGreaterThan(0.2)
  })

  it('paleta das raridades muda no modo de daltonismo e volta', () => {
    setColorVision('deuteranopia')
    expect(rarityColor(1)).not.toBe(RARITIES[1].color)
    setColorVision('normal')
    expect(rarityColor(1)).toBe(RARITIES[1].color)
  })
})
