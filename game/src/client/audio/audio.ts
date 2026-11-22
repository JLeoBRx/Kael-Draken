import { ITEM } from '../../shared/config/items'

/**
 * Áudio sintetizado com Web Audio (placeholders organizados: cada som é uma
 * receita aqui; para usar gravações reais, troque a receita por um arquivo
 * decodificado com o mesmo nome). Sons do mundo são posicionais (HRTF).
 * Funciona offline e falha em silêncio se o navegador não tiver áudio.
 */

export type SoundName =
  | 'shot-pistol' | 'shot-smg' | 'shot-rifle' | 'shot-shotgun' | 'shot-sniper' | 'shot-launcher'
  | 'explosion' | 'reload' | 'dry' | 'pickup' | 'chest' | 'hit' | 'headshot' | 'shieldbreak' | 'hurt' | 'heal' | 'throw' | 'eliminated'
  | 'build' | 'swing' | 'chop' | 'mine' | 'clank' | 'break' | 'collapse'

interface Recipe {
  dur: number
  /** Amostra no tempo t (s) — ruído e osciladores. */
  fn: (t: number, rnd: () => number) => number
}

function env(t: number, attack: number, decay: number): number {
  return t < attack ? t / attack : Math.exp(-(t - attack) / decay)
}

function shot(bright: number, thump: number, decay: number): Recipe {
  let lp = 0
  return {
    dur: decay * 6,
    fn: (t, rnd) => {
      const n = rnd() * 2 - 1
      lp += (n - lp) * bright
      const body = Math.sin(2 * Math.PI * thump * t * (1 - t * 2)) * Math.exp(-t / (decay * 1.5))
      return (lp * 1.4 + body * 0.8) * env(t, 0.002, decay)
    },
  }
}

/** Batida percussiva: ruído filtrado + tom grave que cai (madeira, pedra, metal). */
function knock(bright: number, tone: number, decay: number, ring = 0): Recipe {
  let lp = 0
  return {
    dur: decay * 7 + ring * 0.4,
    fn: (t, rnd) => {
      lp += ((rnd() * 2 - 1) - lp) * bright
      const body = Math.sin(2 * Math.PI * tone * t * (1 - t)) * Math.exp(-t / decay)
      const bell = ring ? (Math.sin(2 * Math.PI * tone * 5.3 * t) + Math.sin(2 * Math.PI * tone * 7.9 * t) * 0.5) * Math.exp(-t / (decay * 4)) * ring : 0
      return (lp * 1.1 + body + bell) * env(t, 0.002, decay)
    },
  }
}

const RECIPES: Record<SoundName, () => Recipe> = {
  build: () => {
    const a = knock(0.35, 180, 0.03)
    const b = knock(0.45, 240, 0.025)
    return { dur: 0.32, fn: (t, r) => (a.fn(t, r) + (t > 0.12 ? b.fn(t - 0.12, r) : 0)) * 0.8 }
  },
  swing: () => {
    let lp = 0
    return { dur: 0.25, fn: (t, r) => { lp += ((r() * 2 - 1) - lp) * (0.05 + 0.25 * Math.sin(Math.PI * Math.min(1, t / 0.2))); return lp * Math.sin(Math.PI * Math.min(1, t / 0.22)) * 0.9 } }
  },
  chop: () => knock(0.3, 140, 0.04),
  mine: () => knock(0.6, 320, 0.025, 0.12),
  clank: () => knock(0.7, 420, 0.02, 0.45),
  break: () => {
    let lp = 0
    return { dur: 0.9, fn: (t, r) => { lp += ((r() * 2 - 1) - lp) * 0.25; const crackle = r() < 0.04 * Math.exp(-t * 4) ? (r() * 2 - 1) * 2 : 0; return (lp + crackle) * env(t, 0.003, 0.18) * 0.9 } }
  },
  collapse: () => {
    let lp = 0
    return { dur: 1.6, fn: (t, r) => { lp += ((r() * 2 - 1) - lp) * 0.06; return (lp * 2.2 + Math.sin(2 * Math.PI * 55 * t) * 0.4 * Math.exp(-t * 2)) * env(t, 0.03, 0.4) } }
  },
  'shot-pistol': () => shot(0.5, 160, 0.05),
  'shot-smg': () => shot(0.55, 190, 0.035),
  'shot-rifle': () => shot(0.42, 120, 0.06),
  'shot-shotgun': () => shot(0.3, 80, 0.11),
  'shot-sniper': () => shot(0.35, 70, 0.16),
  'shot-launcher': () => {
    let lp = 0
    return { dur: 0.7, fn: (t, r) => { lp += ((r() * 2 - 1) - lp) * 0.08; return lp * 2 * env(t, 0.02, 0.18) } }
  },
  explosion: () => {
    let lp = 0
    return { dur: 1.8, fn: (t, r) => { lp += ((r() * 2 - 1) - lp) * (0.04 + 0.1 * Math.exp(-t * 6)); return (lp * 3 + Math.sin(2 * Math.PI * 45 * t) * Math.exp(-t * 3) * 0.6) * env(t, 0.005, 0.45) } }
  },
  reload: () => ({ dur: 0.5, fn: (t, r) => ((r() * 2 - 1) * (Math.exp(-((t - 0.02) ** 2) / 0.00002) + Math.exp(-((t - 0.32) ** 2) / 0.00003))) * 0.7 }),
  dry: () => ({ dur: 0.08, fn: (t, r) => (r() * 2 - 1) * Math.exp(-t / 0.008) * 0.5 }),
  pickup: () => ({ dur: 0.22, fn: (t) => Math.sin(2 * Math.PI * (600 + t * 2400) * t) * env(t, 0.005, 0.07) * 0.35 }),
  chest: () => ({ dur: 0.9, fn: (t) => (Math.sin(2 * Math.PI * 880 * t) + Math.sin(2 * Math.PI * 1320 * t) * 0.6 + Math.sin(2 * Math.PI * 1760 * t) * 0.3) * env(t, 0.01, 0.25) * 0.25 }),
  hit: () => ({ dur: 0.08, fn: (t) => Math.sin(2 * Math.PI * 1900 * t) * env(t, 0.001, 0.02) * 0.5 }),
  headshot: () => ({ dur: 0.35, fn: (t) => (Math.sin(2 * Math.PI * 2400 * t) + Math.sin(2 * Math.PI * 3600 * t) * 0.5) * env(t, 0.001, 0.09) * 0.4 }),
  shieldbreak: () => ({ dur: 0.5, fn: (t, r) => ((r() * 2 - 1) * 0.6 + Math.sin(2 * Math.PI * (3000 - t * 3000) * t)) * env(t, 0.002, 0.12) * 0.4 }),
  hurt: () => ({ dur: 0.25, fn: (t, r) => (Math.sin(2 * Math.PI * 90 * t) + (r() - 0.5) * 0.3) * env(t, 0.003, 0.07) * 0.8 }),
  heal: () => ({ dur: 0.6, fn: (t) => Math.sin(2 * Math.PI * (440 + 220 * Math.min(1, t * 4)) * t) * env(t, 0.02, 0.18) * 0.3 }),
  throw: () => {
    let lp = 0
    return { dur: 0.3, fn: (t, r) => { lp += ((r() * 2 - 1) - lp) * 0.2; return lp * env(t, 0.05, 0.08) } }
  },
  eliminated: () => ({ dur: 0.8, fn: (t) => (Math.sin(2 * Math.PI * 660 * t) * (t < 0.15 ? 1 : 0) + Math.sin(2 * Math.PI * 990 * t) * (t >= 0.15 ? 1 : 0)) * env(t, 0.005, 0.3) * 0.35 }),
}

export function shotSoundFor(item: number): SoundName {
  switch (item) {
    case ITEM.Pistol: return 'shot-pistol'
    case ITEM.Smg: return 'shot-smg'
    case ITEM.Shotgun: return 'shot-shotgun'
    case ITEM.Sniper: return 'shot-sniper'
    case ITEM.Launcher: return 'shot-launcher'
    default: return 'shot-rifle'
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private readonly buffers = new Map<SoundName, AudioBuffer>()
  private volume = 0.7

  /** Precisa de um gesto do usuário (clique) para iniciar. */
  resume(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return
        this.ctx = new Ctor()
        this.master = this.ctx.createGain()
        this.master.gain.value = this.volume
        this.master.connect(this.ctx.destination)
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch {
      this.ctx = null
    }
  }

  setVolume(v: number): void {
    this.volume = v
    if (this.master) this.master.gain.value = v
  }

  private buffer(name: SoundName): AudioBuffer | null {
    if (!this.ctx) return null
    let b = this.buffers.get(name)
    if (!b) {
      const r = RECIPES[name]()
      const rate = this.ctx.sampleRate
      const len = Math.ceil(r.dur * rate)
      b = this.ctx.createBuffer(1, len, rate)
      const data = b.getChannelData(0)
      let seed = 1234567
      const rnd = () => {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
        return seed / 4294967296
      }
      for (let k = 0; k < len; k++) data[k] = Math.max(-1, Math.min(1, r.fn(k / rate, rnd)))
      this.buffers.set(name, b)
    }
    return b
  }

  setListener(x: number, y: number, z: number, fx: number, fy: number, fz: number): void {
    const l = this.ctx?.listener
    if (!l) return
    if (l.positionX) {
      l.positionX.value = x
      l.positionY.value = y
      l.positionZ.value = z
      l.forwardX.value = fx
      l.forwardY.value = fy
      l.forwardZ.value = fz
      l.upX.value = 0
      l.upY.value = 1
      l.upZ.value = 0
    }
  }

  /** Toca um som; com `pos`, é posicional (some com a distância). */
  play(name: SoundName, opts: { pos?: { x: number; y: number; z: number }; volume?: number; rate?: number } = {}): void {
    if (!this.ctx || !this.master || this.volume <= 0) return
    const buf = this.buffer(name)
    if (!buf) return
    try {
      const src = this.ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = (opts.rate ?? 1) * (0.95 + Math.random() * 0.1)
      const gain = this.ctx.createGain()
      gain.gain.value = opts.volume ?? 1
      src.connect(gain)
      if (opts.pos) {
        const p = this.ctx.createPanner()
        p.panningModel = 'HRTF'
        p.distanceModel = 'inverse'
        p.refDistance = 4
        p.maxDistance = 400
        p.rolloffFactor = 1.1
        p.positionX.value = opts.pos.x
        p.positionY.value = opts.pos.y
        p.positionZ.value = opts.pos.z
        gain.connect(p)
        p.connect(this.master)
      } else gain.connect(this.master)
      src.start()
    } catch {
      // áudio indisponível: segue sem som
    }
  }

  dispose(): void {
    void this.ctx?.close()
    this.ctx = null
  }
}
