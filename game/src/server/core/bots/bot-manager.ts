import { Rng } from '../../../shared/math/rng'
import type { BattleRoyale } from '../battle-royale'
import type { Simulation } from '../simulation'
import { Bot } from './bot'
import { navGridFor, type NavGrid } from './nav-grid'
import { BOT_NAMES, BOT_PROFILES, type BotDifficulty } from './profiles'

/**
 * Cria os bots da partida e, a cada tick, enfileira o comando de cada um na
 * simulação (o mesmo caminho dos comandos de rede). Buscas de caminho têm
 * orçamento por tick para o custo ficar estável com 99 bots.
 */

export interface BotOptions {
  count: number
  difficulty: BotDifficulty
  seed?: number
}

const PATHS_PER_TICK = 4
const SKINS = 8

export class BotManager {
  readonly bots: Bot[] = []
  readonly nav: NavGrid
  private pathsLeft = PATHS_PER_TICK

  constructor(private readonly sim: Simulation, br: BattleRoyale | null, opts: BotOptions) {
    this.nav = navGridFor(sim.map)
    const rng = new Rng(0xb07 ^ ((opts.seed ?? 1) * 0x9e3779b1))
    const profile = BOT_PROFILES[opts.difficulty]
    const ctx = { sim, nav: this.nav, br, pathBudget: () => this.pathsLeft-- > 0 }
    for (let k = 0; k < opts.count; k++) {
      const base = BOT_NAMES[k % BOT_NAMES.length]
      const name = k < BOT_NAMES.length ? base : `${base} ${Math.floor(k / BOT_NAMES.length) + 1}`
      const sp = sim.addPlayer(name, (k * 3 + 1) % SKINS, { bot: true })
      this.bots.push(new Bot(sp, ctx, profile, rng.fork(k + 1)))
    }
  }

  /** Antes de `sim.step()`: um comando por bot vivo. */
  update(): void {
    this.pathsLeft = PATHS_PER_TICK
    for (const b of this.bots) {
      if (!this.sim.players.has(b.sp.id)) continue
      const cmd = b.command()
      if (cmd) this.sim.enqueue(b.sp.id, [cmd])
    }
  }
}
