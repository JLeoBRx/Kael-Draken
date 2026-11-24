import { ITEM } from '../../shared/config/items'

/**
 * Áudio sintetizado com Web Audio (placeholders organizados: cada som é uma
 * receita aqui; para usar gravações reais, troque a receita por um arquivo
 * decodificado com o mesmo nome).
 *
 * Mixagem: efeitos, ambiente e interface em barramentos separados, um
 * compressor no master (explosões não estouram) e um envio para reverb por
 * convolução (resposta ao impulso gerada). Sons do mundo são posicionais
 * (HRTF); de longe ficam abafados (filtro passa-baixa pela distância) e com
 * mais eco. Ambiente (vento, ondas, pássaros) em laços que acompanham o
 * lugar. Funciona offline e segue sem som se o navegador não tiver áudio.
 */

export type FootSurface = 'grama' | 'terra' | 'pedra' | 'concreto' | 'madeira' | 'metal' | 'areia' | 'neve' | 'agua'

export type SoundName =
  | 'shot-pistol' | 'shot-smg' | 'shot-rifle' | 'shot-shotgun' | 'shot-sniper' | 'shot-launcher'
  | 'explosion' | 'reload' | 'dry' | 'pickup' | 'chest' | 'hit' | 'headshot' | 'shieldbreak' | 'hurt' | 'heal' | 'throw' | 'eliminated'
  | 'build' | 'swing' | 'chop' | 'mine' | 'clank' | 'break' | 'collapse'
  | `passo-${FootSurface}` | 'pouso' | 'respingo' | 'planador'
  | 'ui-hover' | 'ui-click' | 'ui-confirm' | 'ui-error' | 'ui-aviso' | 'partida-encontrada' | 'nivel'

/** Sons que interessam a quem não ouve (indicador visual de som). */
export type CueKind = 'tiro' | 'passo' | 'explosao' | 'bau' | 'construcao'

const CUE_OF: Partial<Record<SoundName, CueKind>> = {
  'shot-pistol': 'tiro', 'shot-smg': 'tiro', 'shot-rifle': 'tiro', 'shot-shotgun': 'tiro', 'shot-sniper': 'tiro', 'shot-launcher': 'tiro',
  explosion: 'explosao', chest: 'bau', build: 'construcao',
}

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

/** Passo: ruído filtrado curto + batida grave; `grit` = grãos (areia, neve, cascalho). */
function step(bright: number, thump: number, decay: number, grit = 0, ring = 0): Recipe {
  let lp = 0
  return {
    dur: decay * 7 + ring * 0.3,
    fn: (t, rnd) => {
      lp += ((rnd() * 2 - 1) - lp) * bright
      const grains = grit ? (rnd() < grit * Math.exp(-t * 20) ? (rnd() * 2 - 1) * 1.5 : 0) : 0
      const body = Math.sin(2 * Math.PI * thump * t) * Math.exp(-t / (decay * 0.8)) * 0.8
      const bell = ring ? (Math.sin(2 * Math.PI * 620 * t) + Math.sin(2 * Math.PI * 1480 * t) * 0.6) * Math.exp(-t / 0.09) * ring : 0
      return (lp * 1.2 + grains + body + bell) * env(t, 0.004, decay)
    },
  }
}

/** Bipe de interface (frequências em sequência). */
function chime(freqs: number[], each: number, vol = 0.25): Recipe {
  return {
    dur: freqs.length * each + 0.25,
    fn: (t) => {
      const k = Math.min(freqs.length - 1, Math.floor(t / each))
      const lt = t - k * each
      return (Math.sin(2 * Math.PI * freqs[k] * t) + Math.sin(2 * Math.PI * freqs[k] * 2 * t) * 0.25) * env(lt, 0.004, each * 0.9) * vol
    },
  }
}

const RECIPES: Record<SoundName, () => Recipe> = {
  'passo-grama': () => step(0.12, 70, 0.035, 0.35),
  'passo-terra': () => step(0.22, 85, 0.03, 0.5),
  'passo-areia': () => step(0.1, 60, 0.05, 0.8),
  'passo-neve': () => step(0.18, 65, 0.045, 1.0),
  'passo-pedra': () => step(0.55, 120, 0.02, 0.2),
  'passo-concreto': () => step(0.6, 110, 0.018),
  'passo-madeira': () => step(0.35, 170, 0.03),
  'passo-metal': () => step(0.6, 140, 0.02, 0, 0.35),
  'passo-agua': () => {
    let lp = 0
    return { dur: 0.3, fn: (t, r) => { lp += ((r() * 2 - 1) - lp) * (0.08 + 0.3 * Math.exp(-t * 18)); return lp * 1.6 * env(t, 0.01, 0.07) } }
  },
  pouso: () => step(0.18, 55, 0.07, 0.3),
  respingo: () => {
    let lp = 0
    return { dur: 0.9, fn: (t, r) => { lp += ((r() * 2 - 1) - lp) * (0.05 + 0.35 * Math.exp(-t * 8)); const drops = r() < 0.03 * Math.exp(-t * 3) ? (r() * 2 - 1) : 0; return (lp * 2 + drops) * env(t, 0.01, 0.22) } }
  },
  planador: () => {
    let lp = 0
    return { dur: 0.6, fn: (t, r) => { lp += ((r() * 2 - 1) - lp) * (0.02 + 0.2 * Math.min(1, t * 6)); return lp * 1.5 * env(t, 0.05, 0.15) } }
  },
  'ui-hover': () => chime([1320], 0.04, 0.08),
  'ui-click': () => chime([880, 1320], 0.035, 0.14),
  'ui-confirm': () => chime([660, 880, 1320], 0.06, 0.18),
  'ui-error': () => chime([330, 247], 0.09, 0.2),
  'ui-aviso': () => chime([988, 1319], 0.08, 0.16),
  'partida-encontrada': () => chime([523, 659, 784, 1047], 0.09, 0.22),
  nivel: () => chime([523, 659, 784, 1047, 1319], 0.08, 0.24),
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

type Bus = 'efeitos' | 'ambiente' | 'interface'

/** Resposta ao impulso do reverb: ruído com decaimento exponencial (estéreo). */
function impulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.ceil(seconds * ctx.sampleRate)
  const b = ctx.createBuffer(2, len, ctx.sampleRate)
  let seed = 99
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch)
    for (let k = 0; k < len; k++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
      d[k] = (seed / 4294967296 * 2 - 1) * Math.pow(1 - k / len, decay)
    }
  }
  return b
}

/** Laço de ruído para o ambiente (vento, ondas). */
function noiseLoop(ctx: BaseAudioContext, seconds: number, kind: 'vento' | 'ondas'): AudioBuffer {
  const len = Math.ceil(seconds * ctx.sampleRate)
  const b = ctx.createBuffer(1, len, ctx.sampleRate)
  const d = b.getChannelData(0)
  let seed = kind === 'vento' ? 5 : 11
  let lp = 0
  let lp2 = 0
  for (let k = 0; k < len; k++) {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0
    const n = seed / 4294967296 * 2 - 1
    const t = k / ctx.sampleRate
    if (kind === 'vento') {
      // rajadas lentas: o filtro abre e fecha
      const gust = 0.5 + 0.5 * Math.sin((2 * Math.PI * t) / seconds * 3) * Math.sin((2 * Math.PI * t) / seconds * 1.3 + 1)
      lp += (n - lp) * (0.008 + 0.03 * gust)
      d[k] = lp * (2.2 + gust * 2)
    } else {
      // ondas: chegam a cada ~5 s e se desfazem
      const swell = Math.pow(0.5 + 0.5 * Math.sin((2 * Math.PI * t) / (seconds / 3)), 3)
      lp += (n - lp) * (0.02 + 0.12 * swell)
      lp2 += (lp - lp2) * 0.3
      d[k] = lp2 * (0.6 + swell * 2.4)
    }
  }
  // emenda o laço sem estalo
  const fade = Math.min(len >> 3, 4000)
  for (let k = 0; k < fade; k++) {
    const a = k / fade
    d[k] = d[k] * a + d[len - fade + k] * (1 - a)
  }
  return b
}

export interface AmbientState {
  /** 0–1 */
  wind: number
  waves: number
  birds: number
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private readonly bus = new Map<Bus, GainNode>()
  private reverb: ConvolverNode | null = null
  private reverbIn: GainNode | null = null
  private readonly buffers = new Map<SoundName, AudioBuffer>()
  private volume = 0.7
  private readonly listener = { x: 0, y: 0, z: 0 }
  /** Quanto o lugar reverbera (0 campo aberto … 1 entre prédios). */
  private space = 0.2
  private ambient: { wind: GainNode; waves: GainNode; birds: GainNode } | null = null
  private birdTimer = 0
  private birdLevel = 0
  /** Som com posição que interessa ao jogo (indicador visual de som). */
  onCue: ((kind: CueKind, x: number, y: number, z: number, loud: number) => void) | null = null

  /** Precisa de um gesto do usuário (clique) para iniciar. */
  resume(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return
        const ctx = new Ctor()
        this.ctx = ctx
        const comp = ctx.createDynamicsCompressor()
        comp.threshold.value = -14
        comp.knee.value = 12
        comp.ratio.value = 5
        comp.attack.value = 0.004
        comp.release.value = 0.25
        comp.connect(ctx.destination)
        this.master = ctx.createGain()
        this.master.gain.value = this.volume
        this.master.connect(comp)
        for (const [name, level] of [['efeitos', 1], ['ambiente', 0.55], ['interface', 0.8]] as const) {
          const g = ctx.createGain()
          g.gain.value = level
          g.connect(this.master)
          this.bus.set(name, g)
        }
        this.reverb = ctx.createConvolver()
        this.reverb.buffer = impulse(ctx, 1.9, 3.2)
        this.reverbIn = ctx.createGain()
        this.reverbIn.gain.value = 0.5
        this.reverbIn.connect(this.reverb)
        this.reverb.connect(this.master)
        this.startAmbient(ctx)
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch {
      this.ctx = null
    }
  }

  private startAmbient(ctx: AudioContext): void {
    const out = this.bus.get('ambiente')!
    const loop = (buf: AudioBuffer) => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(g)
      g.connect(out)
      src.start()
      return g
    }
    const birds = ctx.createGain()
    birds.gain.value = 0
    birds.connect(out)
    this.ambient = { wind: loop(noiseLoop(ctx, 14, 'vento')), waves: loop(noiseLoop(ctx, 15, 'ondas')), birds }
  }

  setVolume(v: number): void {
    this.volume = v
    if (this.master) this.master.gain.value = v
  }

  /** Quanto reverbera o lugar onde está quem ouve (0 aberto … 1 fechado). */
  setSpace(amount: number): void {
    this.space = Math.max(0, Math.min(1, amount))
  }

  /** Mistura do ambiente (chamar algumas vezes por segundo). */
  updateAmbient(a: AmbientState, dt: number): void {
    const ctx = this.ctx
    const amb = this.ambient
    if (!ctx || !amb) return
    const now = ctx.currentTime
    amb.wind.gain.setTargetAtTime(0.18 + a.wind * 0.8, now, 0.8)
    amb.waves.gain.setTargetAtTime(a.waves * 0.9, now, 1.2)
    amb.birds.gain.setTargetAtTime(a.birds * 0.5, now, 1.5)
    this.birdLevel = a.birds
    // pássaros: cantos curtos em momentos aleatórios
    this.birdTimer -= dt
    if (this.birdLevel > 0.05 && this.birdTimer <= 0) {
      this.birdTimer = 0.8 + Math.random() * 3.5 / this.birdLevel
      this.chirp(ctx, amb.birds)
    }
  }

  private chirp(ctx: AudioContext, out: GainNode): void {
    try {
      const t0 = ctx.currentTime
      const notes = 2 + Math.floor(Math.random() * 4)
      const base = 2200 + Math.random() * 2200
      const pan = ctx.createStereoPanner()
      pan.pan.value = Math.random() * 2 - 1
      pan.connect(out)
      for (let k = 0; k < notes; k++) {
        const o = ctx.createOscillator()
        const g = ctx.createGain()
        const st = t0 + k * (0.09 + Math.random() * 0.05)
        o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), st)
        o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), st + 0.06)
        g.gain.setValueAtTime(0, st)
        g.gain.linearRampToValueAtTime(0.12, st + 0.01)
        g.gain.exponentialRampToValueAtTime(0.001, st + 0.08)
        o.connect(g)
        g.connect(pan)
        o.start(st)
        o.stop(st + 0.1)
      }
    } catch {
      // sem áudio
    }
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
    this.listener.x = x
    this.listener.y = y
    this.listener.z = z
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

  /** Toca um som; com `pos`, é posicional (some, abafa e ecoa com a distância). */
  play(name: SoundName, opts: { pos?: { x: number; y: number; z: number }; volume?: number; rate?: number; bus?: Bus } = {}): void {
    const cue = CUE_OF[name]
    if (cue && opts.pos) this.onCue?.(cue, opts.pos.x, opts.pos.y, opts.pos.z, opts.volume ?? 1)
    if (!this.ctx || !this.master || this.volume <= 0) return
    const buf = this.buffer(name)
    if (!buf) return
    try {
      const ctx = this.ctx
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = (opts.rate ?? 1) * (0.94 + Math.random() * 0.12)
      const gain = ctx.createGain()
      gain.gain.value = opts.volume ?? 1
      src.connect(gain)
      const out = this.bus.get(opts.bus ?? (name.startsWith('ui-') || name === 'partida-encontrada' || name === 'nivel' ? 'interface' : 'efeitos'))!
      if (opts.pos) {
        const d = Math.hypot(opts.pos.x - this.listener.x, opts.pos.y - this.listener.y, opts.pos.z - this.listener.z)
        // de longe: sem agudos e com mais eco
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.value = Math.max(700, 18000 * Math.exp(-d / 140))
        const p = ctx.createPanner()
        p.panningModel = 'HRTF'
        p.distanceModel = 'inverse'
        p.refDistance = 4
        p.maxDistance = 500
        p.rolloffFactor = 1.1
        p.positionX.value = opts.pos.x
        p.positionY.value = opts.pos.y
        p.positionZ.value = opts.pos.z
        gain.connect(lp)
        lp.connect(p)
        p.connect(out)
        if (this.reverbIn) {
          const send = ctx.createGain()
          send.gain.value = Math.min(0.9, 0.08 + this.space * 0.35 + Math.min(1, d / 200) * 0.45)
          p.connect(send)
          send.connect(this.reverbIn)
        }
      } else {
        gain.connect(out)
        if (this.reverbIn && out === this.bus.get('efeitos')) {
          const send = ctx.createGain()
          send.gain.value = 0.05 + this.space * 0.3
          gain.connect(send)
          send.connect(this.reverbIn)
        }
      }
      src.start()
    } catch {
      // áudio indisponível: segue sem som
    }
  }

  /** Passo, com o som da superfície e a força do passo. */
  footstep(surface: FootSurface, pos: { x: number; y: number; z: number }, strength: number, local: boolean): void {
    this.play(`passo-${surface}`, { pos: local ? undefined : pos, volume: (local ? 0.35 : 0.9) * (0.25 + strength * 0.75) })
    if (!local) this.onCue?.('passo', pos.x, pos.y, pos.z, strength)
  }

  dispose(): void {
    void this.ctx?.close()
    this.ctx = null
    this.ambient = null
  }
}
