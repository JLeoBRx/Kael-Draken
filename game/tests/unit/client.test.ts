import { describe, expect, it } from 'vitest'
import { readGamepad } from '../../src/client/input/input'
import { normalizeServerUrl } from '../../src/client/net/transport'
import { DEFAULT_SETTINGS, loadSettings } from '../../src/client/settings'
import { Buttons } from '../../src/shared/movement/character'

const pad = (axes: number[], pressed: number[] = [], lt = 0) => ({
  axes,
  buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: i === 6 ? lt : pressed.includes(i) ? 1 : 0 })),
})

describe('controle (Gamepad API)', () => {
  it('zona morta ignora ruído do analógico', () => {
    const r = readGamepad(pad([0.08, -0.1, 0.05, 0.1]))
    expect(r.forward).toBe(0)
    expect(r.right).toBe(0)
    expect(r.lookX).toBe(0)
  })

  it('analógico para frente = forward positivo; botões mapeados', () => {
    const r = readGamepad(pad([0, -1, 0.5, 0], [0, 10, 1], 0.9))
    expect(r.forward).toBeCloseTo(1)
    expect(r.buttons & Buttons.Jump).toBeTruthy()
    expect(r.buttons & Buttons.Sprint).toBeTruthy()
    expect(r.buttons & Buttons.Aim).toBeTruthy()
    expect(r.crouchPressed).toBe(true)
    expect(r.lookX).toBeGreaterThan(0)
    expect(r.lookX).toBeLessThan(0.5)
  })
})

describe('endereço do servidor', () => {
  const page = { protocol: 'http:', host: '192.168.0.10:7350' } as Location
  it('vazio usa o próprio servidor que entregou a página', () => {
    expect(normalizeServerUrl('', page)).toBe('ws://192.168.0.10:7350/ws')
    expect(normalizeServerUrl('', { protocol: 'https:', host: 'jogo.exemplo.com' } as Location)).toBe('wss://jogo.exemplo.com/ws')
  })
  it('aceita IP:porta, http(s) e ws(s)', () => {
    expect(normalizeServerUrl('192.168.0.5:7350', page)).toBe('ws://192.168.0.5:7350/ws')
    expect(normalizeServerUrl('https://br1.exemplo.com', page)).toBe('wss://br1.exemplo.com/ws')
    expect(normalizeServerUrl('wss://br1.exemplo.com/ws', page)).toBe('wss://br1.exemplo.com/ws')
  })
})

describe('configurações', () => {
  it('sem localStorage (Node, aba bloqueada) volta ao padrão sem erro', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})
