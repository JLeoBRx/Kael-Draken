import { describe, expect, it } from 'vitest'
import { BattleRoyale } from '../../src/server/core/battle-royale'
import { BotManager } from '../../src/server/core/bots/bot-manager'
import { Simulation } from '../../src/server/core/simulation'
import { ITEM } from '../../src/shared/config/items'
import { loadMap } from '../../src/shared/maps'
import { MatchPhase, ZONE_PLAN, planZone, zoneCircleAt } from '../../src/shared/match/zone'
import { Rng } from '../../src/shared/math/rng'
import { CharFlag } from '../../src/shared/movement/character'
import { Cause, type GameEvent } from '../../src/shared/net/protocol'
import { CHEST, Harness, aimAt, give, testMap } from './sim-helpers'

describe('zona segura', () => {
  it('cada círculo fica dentro do anterior, com o centro em terra, e encolhe no tempo certo', () => {
    const land = (x: number) => x > -50 // "mar" a oeste
    const stages = planZone({ x: 0, z: 0, r: 400 }, 100, 30, 1, new Rng(5), land)
    expect(stages).toHaveLength(ZONE_PLAN.length)
    let prevEnd = 100
    stages.forEach((st, k) => {
      expect(Math.hypot(st.toX - st.fromX, st.toZ - st.fromZ) + st.toR).toBeLessThanOrEqual(st.fromR + 1e-6)
      expect(land(st.toX)).toBe(true)
      expect(st.shrinkStart).toBe(prevEnd + ZONE_PLAN[k].wait * 30)
      expect(st.shrinkEnd).toBe(st.shrinkStart + ZONE_PLAN[k].shrink * 30)
      if (k > 0) expect([st.fromX, st.fromZ, st.fromR]).toEqual([stages[k - 1].toX, stages[k - 1].toZ, stages[k - 1].toR])
      prevEnd = st.shrinkEnd
    })
    const st = stages[0]
    expect(zoneCircleAt(st, st.shrinkStart - 10).r).toBe(400)
    expect(zoneCircleAt(st, (st.shrinkStart + st.shrinkEnd) / 2).r).toBeCloseTo((400 + st.toR) / 2)
    expect(zoneCircleAt(st, st.shrinkEnd + 99).r).toBeCloseTo(st.toR)
    // zona rápida: mesmas etapas em menos tempo
    const fast = planZone({ x: 0, z: 0, r: 400 }, 100, 30, 2, new Rng(5), land)
    expect(fast[0].shrinkStart - 100).toBe(Math.round((ZONE_PLAN[0].wait / 2) * 30))
  })
})

function brHarness(warmup = 1) {
  const h = new Harness(testMap(() => {}))
  const br = new BattleRoyale(h.sim, { warmup, zoneSpeed: 1, endDelay: 1 })
  const tick = (n = 1) => {
    for (let k = 0; k < n; k++) {
      h.tick()
      br.update()
      h.log.push(...h.sim.events)
      h.sim.events = []
    }
  }
  return { h, br, tick }
}

describe('partida battle royale', () => {
  it('aquecimento sem dano e sem loot; depois todos embarcam zerados no dirigível', () => {
    const { h, br, tick } = brHarness(2)
    const a = h.add('A')
    const b = h.add('B')
    tick(10)
    expect(br.phase).toBe(MatchPhase.Warmup)
    give(a, ITEM.Sniper, 4)
    a.p.materials[0] = 50
    h.tick(new Map([[a, { ...aimAt(a, b.p.char.x, CHEST, b.p.char.z), buttons: 32 | 8 }]]))
    expect(b.p.health).toBe(100)
    tick(60)
    expect(br.phase).toBe(MatchPhase.Airship)
    for (const sp of [a, b]) {
      expect(sp.p.char.flags).toBe(CharFlag.Riding)
      expect(sp.p.slots.every((s) => s.item === 255)).toBe(true)
      expect(sp.p.materials).toEqual([0, 0, 0])
    }
    expect(h.events('airship')).toHaveLength(1)
    expect(h.events('zone')[0]).toMatchObject({ index: 0, fromR: h.sim.map.world.bound })
    // quem entra agora só assiste
    const late = h.sim.addPlayer('Atrasado', 0, { spectator: true })
    expect(late.p.alive).toBe(false)
    // a bordo ninguém leva dano
    expect(h.sim.applyDamage(a, 50, b, ITEM.Rifle, 0, 0)).toBeNull()
    // todos saltam no fim da rota e pousam
    tick(br.route!.endTick - h.sim.tick + 30 * 40)
    expect(br.phase).toBe(MatchPhase.Playing)
    expect(a.p.char.flags & (CharFlag.Grounded | CharFlag.Swimming)).toBeTruthy()
    expect(a.p.health).toBe(100)
  })

  it('a zona tira vida (ignorando o escudo) de quem está fora', () => {
    const { h, br, tick } = brHarness(0.1)
    const a = h.add('A')
    h.add('B')
    tick(5)
    expect(br.phase).toBe(MatchPhase.Airship)
    tick(br.route!.endTick - h.sim.tick + 30 * 40)
    a.p.shield = 50
    const bound = h.sim.map.world.bound
    a.p.char.x = bound - 1
    a.p.char.z = bound - 1
    a.p.char.y = h.sim.map.terrain.heightAt(bound - 1, bound - 1) + 0.05
    tick(31)
    expect(a.p.health).toBe(100 - br.stage!.dps)
    expect(a.p.shield).toBe(50)
    expect(h.events('damaged').some((e) => e.cause === Cause.Zone)).toBe(true)
  })

  it('eliminação dá a colocação; o último vivo vence e a partida termina', () => {
    const { h, br, tick } = brHarness(0.1)
    const a = h.add('A')
    const b = h.add('B')
    const c = h.add('C')
    tick(5)
    tick(br.route!.endTick - h.sim.tick + 30 * 40)
    h.sim.applyDamage(c, 500, a, ITEM.Rifle, 0, 0)
    tick(1)
    expect(h.events('eliminated').at(-1)).toMatchObject({ victim: c.id, killer: a.id, place: 3, respawnIn: 0 })
    expect(br.phase).toBe(MatchPhase.Playing)
    h.sim.applyDamage(b, 500, a, ITEM.Rifle, 0, 0)
    tick(1)
    expect(h.events('eliminated').at(-1)).toMatchObject({ victim: b.id, place: 2 })
    expect(br.phase).toBe(MatchPhase.Ended)
    expect(br.winner).toBe(a.id)
    expect(h.events('matchEnd')).toEqual([{ type: 'matchEnd', winner: a.id, team: a.team }])
    // ninguém morre depois do fim; sem renascimento
    expect(h.sim.applyDamage(a, 500, null, Cause.Zone, 0, 0)).toBeNull()
    tick(31)
    expect(br.finished).toBe(true)
    expect(b.p.alive).toBe(false)
  })
})

describe('partida completa só com bots', () => {
  it('bots saltam, saqueiam, lutam e a partida termina com um vencedor', () => {
    const map = loadMap('ilha-de-brasa')
    const sim = new Simulation(map, 30, { seed: 3 })
    const br = new BattleRoyale(sim, { warmup: 1, zoneSpeed: 2, endDelay: 2, seed: 3 })
    const bots = new BotManager(sim, br, { count: 24, difficulty: 'normal', seed: 3 })
    const log: GameEvent[] = []
    let ms = 0
    let ticks = 0
    br.startNow()
    for (; ticks < 30 * 60 * 10 && br.phase !== MatchPhase.Ended; ticks++) {
      const t0 = performance.now()
      bots.update()
      sim.step()
      br.update()
      ms += performance.now() - t0
      for (const r of sim.events) log.push(r.ev)
      sim.events = []
    }
    const elims = log.filter((e): e is Extract<GameEvent, { type: 'eliminated' }> => e.type === 'eliminated')
    const pickups = log.filter((e) => e.type === 'itemRemove' && e.by !== 0).length
    const shots = log.filter((e) => e.type === 'shot').length
    const byWeapon = elims.filter((e) => e.cause < 250).length
    console.log(`partida: ${(ticks / 30).toFixed(0)} s de jogo, ${(ms / ticks).toFixed(2)} ms/tick, ${pickups} itens pegos, ${shots} tiros, ${elims.length} eliminações (${byWeapon} por arma), vencedor ${br.winner}`)
    expect(br.phase).toBe(MatchPhase.Ended)
    expect(elims.length).toBeGreaterThanOrEqual(23)
    expect(pickups).toBeGreaterThan(15)
    expect(shots).toBeGreaterThan(100)
    // a maior parte das eliminações vem de combate, não da zona
    expect(byWeapon).toBeGreaterThan(elims.length / 2)
    // colocações de 24 até 2 (ou 1 se os últimos caírem juntos para a zona)
    const places = elims.map((e) => e.place).sort((x, y) => x - y)
    expect(places.at(-1)).toBe(24)
    expect(new Set(places).size).toBe(places.length)
    // ~1 ms por tick com 24 bots seria folgado (orçamento de 33 ms)
    expect(ms / ticks).toBeLessThan(5)
  }, 120_000)
})

describe('equipes', () => {
  it('monta equipes respeitando a escolha e completando com pessoas e depois bots', () => {
    const h = new Harness(testMap(() => {}), { teamSize: 2 })
    const a = h.sim.addPlayer('A', 0, { team: 3 })
    const b = h.sim.addPlayer('B')
    const c = h.sim.addPlayer('C', 0, { team: 3 })
    const d = h.sim.addPlayer('D', 0, { team: 3 }) // equipe 3 cheia: vai para outra
    const bot = h.sim.addPlayer('Bot', 0, { bot: true })
    h.sim.assignTeams()
    expect(a.team).toBe(3)
    expect(c.team).toBe(3)
    expect(d.team).not.toBe(3)
    expect(b.team).toBe(d.team) // pessoas completam antes dos bots
    expect(bot.team).not.toBe(3)
    expect(bot.team).not.toBe(b.team)
    expect(h.sim.teammates(a).map((p) => p.id)).toEqual([c.id])
  })

  it('sem fogo amigo, colegas não se ferem; com fogo amigo, sim', () => {
    for (const ff of [false, true]) {
      const h = new Harness(testMap(() => {}), { teamSize: 2, friendlyFire: ff })
      const a = h.add('A')
      const b = h.add('B')
      h.sim.assignTeams()
      expect(a.team).toBe(b.team)
      h.run(10)
      give(a, ITEM.Rifle, 0)
      h.tick(new Map([[a, { ...aimAt(a, b.p.char.x, CHEST, b.p.char.z), buttons: 32 | 8 }]]))
      expect(b.p.health < 100).toBe(ff)
    }
  })

  it('a equipe só sai quando o último cai; vence a última equipe de pé', () => {
    const h = new Harness(testMap(() => {}), { teamSize: 2 })
    const br = new BattleRoyale(h.sim, { warmup: 0.1, zoneSpeed: 1, endDelay: 1 })
    const a1 = h.sim.addPlayer('A1', 0, { team: 0 })
    const a2 = h.sim.addPlayer('A2', 0, { team: 0 })
    const b1 = h.sim.addPlayer('B1', 0, { team: 1 })
    const b2 = h.sim.addPlayer('B2', 0, { team: 1 })
    const tick = (n = 1) => {
      for (let k = 0; k < n; k++) {
        h.sim.step()
        br.update()
        h.log.push(...h.sim.events)
        h.sim.events = []
      }
    }
    tick(5)
    expect(br.phase).toBe(MatchPhase.Airship)
    expect(br.teams).toBe(2)
    tick(br.route!.endTick - h.sim.tick + 30)
    h.sim.applyDamage(b1, 500, a1, ITEM.Rifle, 0, 0)
    tick(1)
    expect(h.events('eliminated').at(-1)).toMatchObject({ victim: b1.id, place: 0 })
    expect(h.events('teamOut')).toHaveLength(0)
    expect(br.phase).not.toBe(MatchPhase.Ended)
    h.sim.applyDamage(b2, 500, a2, ITEM.Rifle, 0, 0)
    tick(1)
    expect(h.events('teamOut')).toEqual([{ type: 'teamOut', team: 1, place: 2 }])
    expect(br.phase).toBe(MatchPhase.Ended)
    expect(br.winnerTeam).toBe(0)
    expect(h.events('matchEnd')[0]).toMatchObject({ team: 0 })
    expect([a1.id, a2.id]).toContain(br.winner)
  })

  it('se os últimos caem juntos, vence a equipe que saiu por último', () => {
    const { h, br, tick } = brHarness(0.1)
    const a = h.add('A')
    const b = h.add('B')
    tick(5)
    tick(br.route!.endTick - h.sim.tick + 30)
    h.sim.applyDamage(a, 500, null, Cause.Zone, 0, 0, true)
    h.sim.applyDamage(b, 500, null, Cause.Zone, 0, 0, true)
    tick(1)
    expect(h.events('teamOut').map((e) => e.place)).toEqual([2, 1])
    expect(br.phase).toBe(MatchPhase.Ended)
    expect(br.winner).toBe(b.id)
    expect(h.events('matchEnd')[0]).toMatchObject({ winner: b.id, team: b.team })
  })

  it('partida de esquadrões só com bots: ninguém fere a própria equipe e há uma equipe vencedora', () => {
    const map = loadMap('campo-de-provas')
    const sim = new Simulation(map, 30, { seed: 5, teamSize: 4 })
    const br = new BattleRoyale(sim, { warmup: 1, zoneSpeed: 4, endDelay: 1, seed: 5 })
    const bots = new BotManager(sim, br, { count: 12, difficulty: 'dificil', seed: 5 })
    br.startNow()
    const teamOf = new Map([...sim.players.values()].map((p) => [p.id, p.team]))
    const kills: Extract<GameEvent, { type: 'eliminated' }>[] = []
    for (let t = 0; t < 30 * 60 * 6 && br.phase !== MatchPhase.Ended; t++) {
      bots.update()
      sim.step()
      br.update()
      for (const r of sim.events) if (r.ev.type === 'eliminated') kills.push(r.ev)
      sim.events = []
    }
    expect(br.teams).toBe(3)
    expect(br.phase).toBe(MatchPhase.Ended)
    for (const k of kills) if (k.killer && k.cause < 250) expect(teamOf.get(k.killer)).not.toBe(teamOf.get(k.victim))
  }, 60_000)
})
