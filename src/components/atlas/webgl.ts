/** Detecta suporte a WebGL sem carregar o three.js. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

/** Heurística de aparelho modesto: menos núcleos/memória ou tela de toque pequena. */
export function isLowPowerDevice(): boolean {
  const nav = navigator as Navigator & { deviceMemory?: number }
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4
  const smallTouch = window.matchMedia('(pointer: coarse)').matches && Math.min(window.screen.width, window.screen.height) < 600
  return cores <= 4 || memory <= 4 || smallTouch
}
