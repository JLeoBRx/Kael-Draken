import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { Predictor } from '../../src/client/net/prediction'
import { RemoteEntity, ServerClock } from '../../src/client/net/interpolation'
import { GameHost, type HostConnection } from '../../src/server/core/game-host'
import { MAX_QUEUE, MAX_TOKENS } from '../../src/server/core/simulation'
import { startServer, type RunningServer } from '../../src/server/node/server'
import { loadMap } from '../../src/shared/maps'
import { Rng } from '../../src/shared/math/rng'
import { Buttons, CharFlag, createCharacterState } from '../../src/shared/movement/character'
import { createPlayerState } from '../../src/shared/player/player'
import { ITEM } from '../../src/shared/config/items'
import { BUILD, BuildKind, decodeBuild, encodeBuild } from '../../src/shared/config/building'
import { testMap } from './sim-helpers'
import { GameMode, MatchPhase } from '../../src/shared/match/zone'
import {
  KICK_NEW_MATCH,
  PROTOCOL_VERSION,
  SnapshotDecoder,
  SnapshotEncoder,
  decodeClientMessage,
  decodeServerMessage,
  encodeHello,
  encodeInputs,
  encodeLobbyAction,
  encodePing,
  encodeWelcome,
  quantizeCommand,
  sanitizeName,
  type InputCommand,
  type ServerMessage,
} from '../../src/shared/net/protocol'

const map = loadMap('campo-de-provas')

class FakeConn implements HostConnection {
  inbox: ServerMessage[] = []
  closed: string | null = null
  bytes = 0
  readonly dec = new SnapshotDecoder()
  constructor(readonly id: number) {}
  send(data: Uint8Array) {
    this.bytes += data.length
    this.inbox.push(decodeServerMessage(data, this.dec))
  }
  close(reason: string) {
    this.closed = reason
  }
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    for (let k = this.inbox.length - 1; k >= 0; k--) if (this.inbox[k].type === type) return this.inbox[k] as Extract<ServerMessage, { type: T }>
    return undefined
  }
}

function join(host: GameHost, id: number, name = 'Teste'): FakeConn {
  const c = new FakeConn(id)
  host.connect(c)
  host.receive(id, encodeHello(name))
  return c
}

describe('protocolo', () => {
  it('comandos ida e volta preservam a quantização', () => {
    const cmds: InputCommand[] = [
      { seq: 1, forward: 1, right: -0.5, yaw: 1.234, pitch: -0.3, buttons: Buttons.Jump | Buttons.Sprint, slot: 2, viewTick: 1234.37, build: 0 },
      { seq: 2, forward: -0.25, right: 0, yaw: -2.9, pitch: 1.4, buttons: Buttons.Crouch | 0xff00, slot: 9, viewTick: 0, build: 0 },
      { seq: 3, forward: 0, right: 0, yaw: 0, pitch: 0, buttons: Buttons.Fire, slot: 5, viewTick: 0, build: encodeBuild(BuildKind.Ramp, 3, 2) },
      // peça 7 não existe (fora do modo construção); material 3 é limitado ao último (metal)
      { seq: 4, forward: 0, right: 0, yaw: 0, pitch: 0, buttons: Buttons.Fire, slot: 5, viewTick: 0, build: 7 | (3 << 5) },
      { seq: 5, forward: 0, right: 0, yaw: 0, pitch: 0, buttons: Buttons.Fire, slot: 5, viewTick: 0, build: encodeBuild(BuildKind.Wall, 0, 0) | (3 << 5) },
    ]
    const msg = decodeClientMessage(encodeInputs(cmds))
    expect(msg.type).toBe('input')
    if (msg.type !== 'input') return
    expect(msg.commands).toEqual(cmds.map(quantizeCommand))
    expect(msg.commands[1].buttons).toBe(Buttons.Crouch)
    expect(msg.commands[0].viewTick).toBe(1234.375)
    expect(msg.commands[1].slot).toBe(5)
    expect(decodeBuild(msg.commands[2].build)).toEqual({ kind: BuildKind.Ramp, rot: 3, material: 2 })
    expect(msg.commands[3].build).toBe(0)
    expect(decodeBuild(msg.commands[4].build)).toEqual({ kind: BuildKind.Wall, rot: 0, material: 2 })
  })

  it('snapshot com estado próprio completo e entidades', () => {
    const self = createPlayerState(createCharacterState(1.5, 2.25, -3.125, 0.5))
    self.char.vx = 3.3
    self.char.flags = 5
    self.health = 63.5
    self.shield = 25
    self.slots[2] = { item: ITEM.Rifle, rarity: 3, count: 1, ammo: 17 }
    self.ammo[1] = 120
    self.materials[2] = 45
    self.reloadTimer = 0.75
    const other = createPlayerState(createCharacterState(10, 8.0, 20, 1))
    other.char.vz = -7.4
    other.slots[0] = { item: ITEM.Shotgun, rarity: 2, count: 1, ammo: 5 }
    other.selected = 0
    const enc = new SnapshotEncoder()
    const dec = new SnapshotDecoder()
    const data = enc.encode({ tick: 99, ackSeq: 42, queued: 3, alive: 12, kills: 4, phase: 3, phaseEnd: 123456 }, self, [{ id: 7, p: other }],
      [{ id: 9, health: 73.2, shield: 50, alive: true }, { id: 11, health: 0, shield: 0, alive: false }])
    const msg = decodeServerMessage(data, dec)
    expect(msg.type).toBe('snapshot')
    if (msg.type !== 'snapshot') return
    const s = msg.snapshot
    expect(s.tick).toBe(99)
    expect(s.ackSeq).toBe(42)
    expect(s.queued).toBe(3)
    expect(s.alive).toBe(12)
    expect(s.kills).toBe(4)
    expect(s.phase).toBe(3)
    expect(s.phaseEnd).toBe(123456)
    expect(s.self).toEqual(self)
    expect(s.entities[0].weapon).toBe(ITEM.Shotgun)
    expect(s.entities[0].rarity).toBe(2)
    expect(s.entities[0].id).toBe(7)
    expect(s.entities[0].z).toBe(20)
    expect(s.entities[0].vz).toBeCloseTo(-7.4, 1)
    expect(s.mates).toEqual([{ id: 9, health: 74, shield: 50, alive: true }, { id: 11, health: 0, shield: 0, alive: false }])
  })

  it('snapshots em delta: só o que mudou, base por conexão, exato no estado próprio', () => {
    const enc = new SnapshotEncoder()
    const dec = new SnapshotDecoder()
    const h = { tick: 1, ackSeq: 0, queued: 0, alive: 3, kills: 0, phase: 0, phaseEnd: 0 }
    const self = createPlayerState(createCharacterState(100.123456789, 12.5, -300.987654321, 0.25))
    const a = createPlayerState(createCharacterState(-512.3, 40, 700.01, 2))
    const b = createPlayerState(createCharacterState(5, 6, 7, 0))
    const ents = [{ id: 3, p: a }, { id: 4, p: b }]
    const first = enc.encode(h, self, ents, [])
    const m1 = decodeServerMessage(first, dec)
    if (m1.type !== 'snapshot') throw new Error('tipo')
    expect(m1.snapshot.self).toEqual(self)
    expect(m1.snapshot.entities[0].x).toBeCloseTo(-512.3, 1)
    expect(Math.abs(m1.snapshot.entities[0].z - 700.01)).toBeLessThanOrEqual(1 / 64)
    // nada mudou: o segundo snapshot é bem menor e decodifica igual
    const second = enc.encode({ ...h, tick: 2 }, self, ents, [])
    expect(second.length).toBeLessThan(first.length / 4)
    const m2 = decodeServerMessage(second, dec)
    if (m2.type !== 'snapshot') throw new Error('tipo')
    expect(m2.snapshot.self).toEqual(self)
    expect(m2.snapshot.entities).toEqual(m1.snapshot.entities)
    // passo pequeno, passo grande e troca de arma
    a.char.x += 0.5
    b.char.z -= 30
    b.selected = 0
    b.slots[0] = { item: ITEM.Rifle, rarity: 4, count: 1, ammo: 30 }
    self.char.x += 1e-9
    self.health = 42.25
    const m3 = decodeServerMessage(enc.encode({ ...h, tick: 3 }, self, ents, []), dec)
    if (m3.type !== 'snapshot') throw new Error('tipo')
    expect(m3.snapshot.self).toEqual(self)
    expect(m3.snapshot.entities[0].x).toBeCloseTo(-511.8, 1)
    expect(m3.snapshot.entities[1].z).toBeCloseTo(-23, 1)
    expect(m3.snapshot.entities[1]).toMatchObject({ weapon: ITEM.Rifle, rarity: 4 })
    // entidade fora deste snapshot continua na base dos dois lados
    a.char.y += 2
    const m4 = decodeServerMessage(enc.encode({ ...h, tick: 4 }, self, [{ id: 3, p: a }], []), dec)
    if (m4.type !== 'snapshot') throw new Error('tipo')
    expect(m4.snapshot.entities).toHaveLength(1)
    expect(m4.snapshot.entities[0].y).toBeCloseTo(42, 1)
    // quem saiu é esquecido; um Welcome zera a base
    enc.forget(4)
    dec.forget(4)
    expect(enc.knows(4)).toBe(false)
    const m5 = decodeServerMessage(enc.encode({ ...h, tick: 5 }, self, ents, []), dec)
    if (m5.type !== 'snapshot') throw new Error('tipo')
    expect(m5.snapshot.entities[1].z).toBeCloseTo(-23, 1)
    // um decodificador sem base recusa deltas (não inventa estado)
    expect(() => decodeServerMessage(enc.encode({ ...h, tick: 6 }, self, ents, []), new SnapshotDecoder())).toThrow()
  })

  it('zonas mortas de velocidade e ângulos: as duas bases nunca se separam', () => {
    const enc = new SnapshotEncoder()
    const dec = new SnapshotDecoder()
    const h = { tick: 1, ackSeq: 0, queued: 0, alive: 2, kills: 0, phase: 0, phaseEnd: 0 }
    const self = createPlayerState(createCharacterState(0, 0, 0))
    const o = createPlayerState(createCharacterState(10, 5, 10, 0))
    const rng = new Rng(9)
    const read = () => {
      const m = decodeServerMessage(enc.encode(h, self, [{ id: 5, p: o }], []), dec)
      if (m.type !== 'snapshot') throw new Error('tipo')
      return m.snapshot.entities[0]
    }
    read()
    // giro abaixo da zona morta não é enviado
    o.char.yaw += 0.005
    expect(read().yaw).toBeCloseTo(0, 5)
    o.char.yaw += 0.02
    expect(read().yaw).toBeCloseTo(0.025, 3)
    // caminhada aleatória longa: posição sempre exata (só quantizada); velocidade e ângulos perto do real
    for (let k = 0; k < 300; k++) {
      o.char.yaw += (rng.next() - 0.5) * 0.3
      o.char.vx = Math.sin(o.char.yaw) * 6
      o.char.vz = Math.cos(o.char.yaw) * 6
      o.char.x += o.char.vx / 30
      o.char.z += o.char.vz / 30
      const e = read()
      expect(Math.abs(e.x - o.char.x)).toBeLessThanOrEqual(1 / 64)
      expect(Math.abs(e.z - o.char.z)).toBeLessThanOrEqual(1 / 64)
      expect(Math.abs(e.vx - o.char.vx)).toBeLessThanOrEqual(0.55)
      expect(Math.abs(Math.atan2(Math.sin(e.yaw - o.char.yaw), Math.cos(e.yaw - o.char.yaw)))).toBeLessThanOrEqual(0.0125)
    }
    // parar chega sempre (velocidade exatamente zero)
    o.char.vx = 0.2
    o.char.vz = 0
    read()
    o.char.vx = 0
    const stop = read()
    expect([stop.vx, stop.vy, stop.vz]).toEqual([0, 0, 0])
  })

  it('rejeita mensagens truncadas, com lixo no fim ou de tipo desconhecido', () => {
    const ping = encodePing(123)
    expect(() => decodeClientMessage(ping.subarray(0, 5))).toThrow()
    expect(() => decodeClientMessage(new Uint8Array([...ping, 0]))).toThrow()
    expect(() => decodeClientMessage(new Uint8Array([200]))).toThrow()
    const welcome = encodeWelcome({ version: 1, playerId: 3, mapId: 'x', tickRate: 30, tick: 5, serverName: 'S', mode: 1, token: 'abc' })
    expect(decodeServerMessage(welcome)).toMatchObject({ type: 'welcome', playerId: 3, mapId: 'x', mode: 1 })
  })

  it('normaliza nomes', () => {
    expect(sanitizeName('  Ana\u0000  Lima <b> ')).toBe('Ana Lima b')
    expect(sanitizeName('')).toBe('Jogador')
    expect(Array.from(sanitizeName('x'.repeat(40))).length).toBe(16)
  })
})

describe('GameHost', () => {
  it('handshake: welcome, info dos outros jogadores e snapshots', () => {
    const host = new GameHost({ mapId: map.def.id, map })
    const a = join(host, 1, 'Ana')
    const b = join(host, 2, 'Bruno')
    const welcome = a.last('welcome')!
    expect(welcome.version).toBe(PROTOCOL_VERSION)
    expect(welcome.mapId).toBe('campo-de-provas')
    expect(b.inbox.filter((m) => m.type === 'playerInfo').map((m) => (m as { name: string }).name).sort()).toEqual(['Ana', 'Bruno'])
    host.tick()
    const snap = a.last('snapshot')!.snapshot
    expect(snap.self).not.toBeNull()
    expect(snap.entities).toHaveLength(1)
    expect(snap.entities[0].id).toBe(b.last('welcome')!.playerId)
  })

  it('expulsa quem inunda o servidor de mensagens', () => {
    const host = new GameHost({ mapId: map.def.id, map })
    const a = join(host, 1)
    for (let k = 0; k < 300; k++) host.receive(1, encodePing(k))
    expect(a.closed).toBe('Mensagens demais por segundo')
    expect(host.playerCount).toBe(0)
  })

  it('expulsa versão incompatível, servidor cheio e lixo binário', () => {
    const host = new GameHost({ mapId: map.def.id, map, maxPlayers: 1 })
    join(host, 1)
    const full = join(host, 2)
    expect(full.closed).toBe('Servidor cheio')
    const junk = new FakeConn(3)
    host.connect(junk)
    host.receive(3, new Uint8Array([1, 2, 3]))
    expect(junk.closed).toBe('Mensagem inválida')
    expect(host.playerCount).toBe(1)
  })

  it('não deixa um cliente avançar mais rápido que o servidor (speed hack)', () => {
    const host = new GameHost({ mapId: map.def.id, map })
    const a = join(host, 1)
    host.tick()
    const start = a.last('snapshot')!.snapshot.self!
    let seq = 1
    for (let m = 0; m < 20; m++) {
      const cmds: InputCommand[] = []
      for (let k = 0; k < 16; k++) cmds.push({ seq: seq++, forward: 1, right: 0, yaw: 0, pitch: 0, buttons: Buttons.Sprint, slot: 0, viewTick: 0, build: 0 })
      host.receive(1, encodeInputs(cmds))
    }
    host.tick()
    const snap = a.last('snapshot')!.snapshot
    // fila limitada a MAX_QUEUE (os mais antigos são descartados) e no máximo MAX_TOKENS aplicados
    const player = [...host.sim.players.values()][0]
    expect(player.droppedCommands).toBe(320 - MAX_QUEUE)
    expect(snap.queued).toBe(MAX_QUEUE - MAX_TOKENS)
    // no máximo MAX_TOKENS ticks de sprint (~0,25 m cada)
    expect(Math.hypot(snap.self!.char.x - start.char.x, snap.self!.char.z - start.char.z)).toBeLessThan(MAX_TOKENS * 0.25 + 0.01)
  })

  it('sem espera de reconexão, remove o jogador e avisa os demais ao desconectar', () => {
    const host = new GameHost({ mapId: map.def.id, map, reconnectSeconds: 0 })
    const a = join(host, 1)
    const b = join(host, 2)
    const bId = b.last('welcome')!.playerId
    host.disconnect(2)
    expect(a.last('playerLeft')?.id).toBe(bId)
    host.tick()
    expect(a.last('snapshot')!.snapshot.entities).toHaveLength(0)
  })
})

describe('predição + reconciliação contra o servidor real', () => {
  it('com latência de 100 ms nos dois sentidos, a predição nunca precisa corrigir', () => {
    const host = new GameHost({ mapId: map.def.id, map })
    const conn = new FakeConn(1)
    host.connect(conn)
    host.receive(1, encodeHello('Pred'))
    host.tick()
    const predictor = new Predictor(map.world, 1 / 30)
    const LAT = 3
    const toServer: { at: number; data: Uint8Array }[] = []
    const toClient: { at: number; msg: ServerMessage }[] = []
    const rng = new Rng(9)
    let delivered = 0
    let yaw = 0
    for (let tick = 0; tick < 450; tick++) {
      // entrega ao cliente o que "chegou"
      while (delivered < conn.inbox.length) toClient.push({ at: tick + LAT, msg: conn.inbox[delivered++] })
      while (toClient.length && toClient[0].at <= tick) {
        const m = toClient.shift()!.msg
        if (m.type === 'snapshot' && m.snapshot.self) predictor.reconcile(m.snapshot.self, m.snapshot.ackSeq)
      }
      if (predictor.initialized) {
        yaw += rng.range(-0.15, 0.15)
        const cmd = predictor.predict({
          viewTick: 0,
          slot: 0,
          build: 0,
          forward: tick % 90 < 70 ? 1 : 0,
          right: rng.range(-1, 1) * 0.3,
          yaw,
          pitch: 0,
          buttons: (tick % 40 === 0 ? Buttons.Jump : 0) | (tick % 150 > 100 ? Buttons.Sprint : 0) | (tick % 150 === 130 ? Buttons.Crouch : 0),
        })
        toServer.push({ at: tick + LAT, data: encodeInputs([cmd]) })
      }
      while (toServer.length && toServer[0].at <= tick) host.receive(1, toServer.shift()!.data)
      host.tick()
    }
    expect(predictor.initialized).toBe(true)
    expect(predictor.corrections).toBe(0)
    const server = [...host.sim.players.values()][0].p.char
    // o estado previsto está à frente do servidor só pelos comandos em trânsito
    expect(predictor.pendingCount).toBeLessThanOrEqual(2 * LAT + 2)
    expect(Math.hypot(predictor.state.char.x - server.x, predictor.state.char.z - server.z)).toBeLessThan(3)
    expect(Math.hypot(server.x, server.z)).toBeGreaterThan(5)
  })

  it('corrida de rampas prevista: peças confirmadas sem nenhuma correção', () => {
    // mapas separados: cliente e servidor têm cada um o seu mundo de colisão
    const serverMap = testMap(() => {})
    const clientMap = testMap(() => {})
    const host = new GameHost({ mapId: serverMap.def.id, map: serverMap })
    const conn = new FakeConn(1)
    host.connect(conn)
    host.receive(1, encodeHello('Construtor'))
    host.tick()
    const sp = [...host.sim.players.values()][0]
    sp.p.materials[0] = 100
    const predictor = new Predictor(clientMap.world, 1 / 30, sp.id)
    const LAT = 3
    const toServer: { at: number; data: Uint8Array }[] = []
    const toClient: { at: number; msg: ServerMessage }[] = []
    // o cliente começa pelo primeiro snapshot que já tem os materiais
    let delivered = conn.inbox.length
    let built = 0
    let peak = 0
    for (let tick = 0; tick < 200; tick++) {
      while (delivered < conn.inbox.length) toClient.push({ at: tick + LAT, msg: conn.inbox[delivered++] })
      while (toClient.length && toClient[0].at <= tick) {
        const m = toClient.shift()!.msg
        if (m.type === 'events') for (const e of m.events) predictor.builds.apply(e)
        if (m.type === 'snapshot' && m.snapshot.self) {
          predictor.builds.serverTick = m.snapshot.tick
          predictor.reconcile(m.snapshot.self, m.snapshot.ackSeq)
        }
      }
      if (predictor.initialized) {
        const ramp = tick < 140 && predictor.builds.buildings.count < 3
        const cmd = predictor.predict({
          viewTick: 0, slot: 5, forward: 1, right: 0, yaw: 0, pitch: 0,
          build: ramp ? encodeBuild(BuildKind.Ramp, 0, 0) : 0,
          buttons: ramp ? Buttons.Fire : 0,
        })
        built += predictor.events.filter((e) => e.type === 'build').length
        toServer.push({ at: tick + LAT, data: encodeInputs([cmd]) })
      }
      while (toServer.length && toServer[0].at <= tick) host.receive(1, toServer.shift()!.data)
      host.tick()
      peak = Math.max(peak, sp.p.char.y)
    }
    expect(built).toBe(3)
    expect(predictor.corrections).toBe(0)
    expect(host.sim.buildings.count).toBe(3)
    const client = [...predictor.builds.buildings.byId.values()]
    expect(client.every((p) => !p.predicted && p.id > 0)).toBe(true)
    expect(client.map((p) => p.key).sort()).toEqual([...host.sim.buildings.byId.values()].map((p) => p.key).sort())
    expect(predictor.builds.rejected).toBe(0)
    expect(sp.p.materials[0]).toBe(100 - 3 * BUILD.cost)
    // no servidor o jogador subiu as três rampas (12 m)
    expect(peak).toBeGreaterThan(11.5)
  })

  it('previsão recusada pelo servidor some na reconciliação', () => {
    const serverMap = testMap(() => {})
    const clientMap = testMap(() => {})
    const host = new GameHost({ mapId: serverMap.def.id, map: serverMap })
    const conn = new FakeConn(1)
    host.connect(conn)
    host.receive(1, encodeHello('Construtor'))
    host.tick()
    const sp = [...host.sim.players.values()][0]
    sp.p.materials[0] = 100
    host.tick()
    const predictor = new Predictor(clientMap.world, 1 / 30, sp.id)
    const snap = () => conn.last('snapshot')!.snapshot
    predictor.reconcile(snap().self!, snap().ackSeq)
    // Outro jogador ocupa o lugar no servidor antes do comando chegar
    host.sim.buildings.add({ kind: BuildKind.Wall, i: 0, j: -1, k: 0, dir: 0 }, 900, 0)
    const cmd = predictor.predict({ viewTick: 0, slot: 5, forward: 0, right: 0, yaw: 0, pitch: 0, build: encodeBuild(BuildKind.Wall, 0, 0), buttons: Buttons.Fire })
    expect(predictor.builds.buildings.count).toBe(1)
    expect(predictor.state.materials[0]).toBe(90)
    host.receive(1, encodeInputs([cmd]))
    host.tick()
    host.tick()
    predictor.reconcile(snap().self!, snap().ackSeq)
    expect(predictor.builds.buildings.count).toBe(0)
    expect(predictor.builds.rejected).toBe(1)
    expect(predictor.state.materials[0]).toBe(100)
  })

  it('corrige e suaviza quando o servidor diverge', () => {
    const predictor = new Predictor(map.world, 1 / 30)
    const s = createPlayerState(createCharacterState(0, 8.0, 20))
    predictor.init(s)
    for (let k = 0; k < 5; k++) predictor.predict({ forward: 1, right: 0, yaw: 0, pitch: 0, buttons: 0, slot: 0, viewTick: 0, build: 0 })
    const moved = createPlayerState(createCharacterState(1, 8.0, 20))
    predictor.reconcile(moved, 5)
    expect(predictor.corrections).toBe(1)
    expect(Math.hypot(predictor.offset.x, predictor.offset.z)).toBeGreaterThan(0.5)
    for (let k = 0; k < 60; k++) predictor.decayOffset(1 / 60)
    expect(Math.hypot(predictor.offset.x, predictor.offset.z)).toBeLessThan(0.01)
  })
})

describe('interpolação', () => {
  it('interpola entre snapshots e extrapola pouco além do último', () => {
    const e = new RemoteEntity(1)
    const base = { id: 1, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, vy: 0, vz: 0, weapon: 255, rarity: 0 }
    e.push(1000, { ...base, x: 0, vx: 10 })
    e.push(1100, { ...base, x: 1, vx: 10 })
    const out = { ...base, x: 0, vx: 0 }
    e.sample(1050, out)
    expect(out.x).toBeCloseTo(0.5)
    e.sample(1150, out)
    expect(out.x).toBeCloseTo(1.5)
    e.sample(5000, out)
    expect(out.x).toBeCloseTo(2.5)
  })

  it('relógio do servidor usa o menor atraso observado', () => {
    const c = new ServerClock()
    c.observe(30, 30, 500) // tick 30 = 1000 ms de servidor, chegou em 500 local
    c.observe(31, 30, 560) // chegou atrasado
    expect(c.serverTimeMs(600)).toBeCloseTo(1100, 0)
  })
})

describe('servidor WebSocket (Node)', () => {
  let server: RunningServer
  beforeAll(async () => {
    server = await startServer({
      port: 0, host: '127.0.0.1', mapId: 'campo-de-provas', maxPlayers: 8, tickRate: 30, name: 'Teste', staticDir: null,
      logger: { info() {}, warn() {} },
      match: { reconnectSeconds: 0 },
    })
  })
  afterAll(async () => {
    await server.close()
  })

  function client(name: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`)
    ws.binaryType = 'arraybuffer'
    const inbox: ServerMessage[] = []
    const dec = new SnapshotDecoder()
    ws.on('message', (d) => inbox.push(decodeServerMessage(new Uint8Array(d as ArrayBuffer), dec)))
    const ready = new Promise<void>((ok) => ws.once('open', () => { ws.send(encodeHello(name)); ok() }))
    return { ws, inbox, ready }
  }

  const until = async (cond: () => boolean, ms = 3000) => {
    const t0 = Date.now()
    while (!cond()) {
      if (Date.now() - t0 > ms) throw new Error('tempo esgotado')
      await new Promise((r) => setTimeout(r, 20))
    }
  }

  it('dois clientes reais se veem e o movimento de um chega ao outro', async () => {
    const a = client('A')
    const b = client('B')
    await Promise.all([a.ready, b.ready])
    await until(() => a.inbox.some((m) => m.type === 'welcome') && b.inbox.some((m) => m.type === 'welcome'))
    const aId = (a.inbox.find((m) => m.type === 'welcome') as { playerId: number }).playerId
    const lastEntity = () => {
      for (let k = b.inbox.length - 1; k >= 0; k--) {
        const m = b.inbox[k]
        if (m.type === 'snapshot') return m.snapshot.entities.find((e) => e.id === aId)
      }
      return undefined
    }
    await until(() => lastEntity() !== undefined)
    const before = lastEntity()!
    const cmds: InputCommand[] = []
    for (let k = 1; k <= 30; k++) cmds.push({ seq: k, forward: 1, right: 0, yaw: 0, pitch: 0, buttons: 0, slot: 0, viewTick: 0, build: 0 })
    for (let k = 0; k < 30; k += 10) a.ws.send(encodeInputs(cmds.slice(k, k + 10)))
    await until(() => before.z - (lastEntity()?.z ?? before.z) > 4)
    const res = await fetch(`http://127.0.0.1:${server.port}/api/info`)
    const info = await res.json()
    expect(info).toMatchObject({ players: 2, mapId: 'campo-de-provas', version: PROTOCOL_VERSION })
    a.ws.close()
    await until(() => b.inbox.some((m) => m.type === 'playerLeft' && m.id === aId))
    b.ws.close()
  })
})

describe('servidor em modo battle royale', () => {
  it('aquecimento → dirigível; quem chega depois assiste; no fim reinicia e os clientes reconectam', () => {
    const map = testMap(() => {})
    const host = new GameHost({ mapId: map.def.id, map, mapFactory: () => testMap(() => {}), mode: GameMode.BattleRoyale, bots: 3, botDifficulty: 'facil', br: { warmup: 1, zoneSpeed: 50, endDelay: 1 }, autoRestart: true })
    expect(host.info()).toMatchObject({ mode: GameMode.BattleRoyale, bots: 3, players: 0, phase: MatchPhase.Warmup })
    const a = new FakeConn(1)
    host.connect(a)
    host.receive(1, encodeHello('Ana'))
    expect(a.last('welcome')?.mode).toBe(GameMode.BattleRoyale)
    host.tick()
    expect(a.last('snapshot')!.snapshot.phase).toBe(MatchPhase.Warmup)
    expect(a.last('snapshot')!.snapshot.phaseEnd).toBeGreaterThan(host.sim.tick)
    for (let k = 0; k < 40; k++) host.tick()
    const snap = a.last('snapshot')!.snapshot
    expect(snap.phase).toBe(MatchPhase.Airship)
    expect(snap.self!.char.flags & CharFlag.Riding).toBeTruthy()
    const synced = a.inbox.filter((m) => m.type === 'events').flatMap((m) => (m.type === 'events' ? m.events : []))
    expect(synced.some((e) => e.type === 'airship')).toBe(true)
    expect(synced.some((e) => e.type === 'zone')).toBe(true)
    // chegou atrasado: entra só para assistir, mas recebe o dirigível e a zona atuais
    const b = new FakeConn(2)
    host.connect(b)
    host.receive(2, encodeHello('Bia'))
    host.tick()
    expect(b.last('snapshot')!.snapshot.self!.alive).toBe(false)
    const bSync = b.inbox.filter((m) => m.type === 'events').flatMap((m) => (m.type === 'events' ? m.events : []))
    expect(bSync.some((e) => e.type === 'airship') && bSync.some((e) => e.type === 'zone')).toBe(true)
    // a zona (50× mais rápida) termina a partida; depois do resultado, nova partida
    for (let k = 0; k < 30 * 120 && !a.closed; k++) host.tick()
    expect(a.inbox.some((m) => m.type === 'events' && m.events.some((e) => e.type === 'matchEnd'))).toBe(true)
    expect(a.closed).toBe(KICK_NEW_MATCH)
    expect(b.closed).toBe(KICK_NEW_MATCH)
    expect(host.phase).toBe(MatchPhase.Warmup)
    expect(host.sim.players.size).toBe(3) // só os bots da nova partida
  })
})

describe('sala de espera (LAN)', () => {
  it('prontos, equipes, configuração do dono, início e volta à sala no fim', () => {
    const map = testMap(() => {})
    const host = new GameHost({ mapId: map.def.id, map, mapFactory: () => testMap(() => {}), lobby: true, mode: GameMode.BattleRoyale, br: { endDelay: 1 } })
    const a = join(host, 1, 'Ana')
    const b = join(host, 2, 'Bia')
    const lobby = (c: FakeConn) => c.last('lobby')!.state
    expect(a.last('welcome')).toBeUndefined()
    expect(lobby(a)).toMatchObject({ you: 1, owner: 1, running: false })
    expect(lobby(b).members.map((m) => m.name)).toEqual(['Ana', 'Bia'])
    // só o dono configura
    const cfg = { ...lobby(a).config, mode: GameMode.BattleRoyale, teamSize: 2, bots: 2, difficulty: 0, zoneSpeed: 50 }
    host.receive(2, encodeLobbyAction({ op: 'config', config: { ...cfg, bots: 9 } }))
    expect(lobby(a).config.bots).toBe(0)
    host.receive(1, encodeLobbyAction({ op: 'config', config: cfg }))
    expect(lobby(b).config).toMatchObject({ teamSize: 2, bots: 2, mode: GameMode.BattleRoyale })
    // prontos e equipe escolhida
    host.receive(2, encodeLobbyAction({ op: 'ready', ready: true }))
    host.receive(1, encodeLobbyAction({ op: 'team', team: 4 }))
    host.receive(2, encodeLobbyAction({ op: 'team', team: 4 }))
    expect(lobby(a).members).toEqual([
      expect.objectContaining({ name: 'Ana', ready: false, team: 4 }),
      expect.objectContaining({ name: 'Bia', ready: true, team: 4 }),
    ])
    // quem não é dono não inicia
    host.receive(2, encodeLobbyAction({ op: 'start' }))
    expect(b.last('welcome')).toBeUndefined()
    host.receive(1, encodeLobbyAction({ op: 'start' }))
    expect(a.last('welcome')!.mode).toBe(GameMode.BattleRoyale)
    expect(b.last('welcome')).toBeDefined()
    for (let k = 0; k < 30 * 5; k++) host.tick()
    // mesma equipe (a escolhida), dupla com 2 bots na outra
    const infos = b.inbox.filter((m): m is Extract<ServerMessage, { type: 'playerInfo' }> => m.type === 'playerInfo')
    const teamOf = (name: string) => [...infos].reverse().find((m) => m.name === name)!.team
    expect(teamOf('Ana')).toBe(4)
    expect(teamOf('Bia')).toBe(4)
    expect(a.last('snapshot')!.snapshot.mates.map((m) => m.id)).toEqual([b.last('welcome')!.playerId])
    // a partida acaba (zona 50×) e todos voltam para a sala pela mesma conexão
    const before = a.inbox.length
    for (let k = 0; k < 30 * 120 && !a.inbox.slice(before).some((m) => m.type === 'lobby' && !m.state.running); k++) host.tick()
    expect(a.inbox.some((m) => m.type === 'events' && m.events.some((e) => e.type === 'matchEnd'))).toBe(true)
    expect(lobby(a).running).toBe(false)
    expect(lobby(a).members.every((m) => !m.ready)).toBe(true)
    expect(a.closed).toBeNull()
    expect(host.active).toBe(false)
  })

  it('quem entra com a partida rolando espera na sala', () => {
    const map = testMap(() => {})
    const host = new GameHost({ mapId: map.def.id, map, lobby: true })
    const a = join(host, 1, 'Ana')
    host.receive(1, encodeLobbyAction({ op: 'start' }))
    host.tick()
    const c = join(host, 3, 'Caio')
    expect(c.last('welcome')).toBeUndefined()
    expect(c.last('lobby')!.state).toMatchObject({ running: true, owner: 1 })
    expect(a.last('snapshot')).toBeDefined()
  })
})

describe('reconexão', () => {
  it('a conexão cai e o jogador volta ao mesmo personagem com o token', () => {
    const map = testMap(() => {})
    const host = new GameHost({ mapId: map.def.id, map, reconnectSeconds: 5 })
    const a = join(host, 1, 'Ana')
    const b = join(host, 2, 'Bia')
    const w = a.last('welcome')!
    expect(w.token).toMatch(/^[0-9a-f]{24}$/)
    const sp = host.sim.players.get(w.playerId)!
    let seq = 1
    for (let k = 0; k < 20; k++) {
      host.receive(1, encodeInputs([{ seq: seq++, forward: 1, right: 0, yaw: 0, pitch: 0, buttons: 0, slot: 5, viewTick: 0, build: 0 }]))
      host.tick()
    }
    sp.p.materials[0] = 42
    const z = sp.p.char.z
    // cai a conexão: o personagem continua no mundo (B não recebe "saiu")
    host.disconnect(1)
    for (let k = 0; k < 30; k++) host.tick()
    expect(b.inbox.some((m) => m.type === 'playerLeft')).toBe(false)
    expect(b.last('snapshot')!.snapshot.entities.map((e) => e.id)).toContain(w.playerId)
    // volta com o token: mesmo id, mesma posição e inventário; comandos recomeçam do 1
    const a2 = new FakeConn(7)
    host.connect(a2)
    host.receive(7, encodeHello('Outro nome', w.token))
    const w2 = a2.last('welcome')!
    expect(w2.playerId).toBe(w.playerId)
    expect(w2.token).toBe(w.token)
    host.receive(7, encodeInputs([{ seq: 1, forward: 1, right: 0, yaw: 0, pitch: 0, buttons: 0, slot: 5, viewTick: 0, build: 0 }]))
    host.tick()
    const s = a2.last('snapshot')!.snapshot
    expect(s.ackSeq).toBe(1)
    expect(s.self!.char.z).toBeLessThan(z)
    expect(s.self!.materials[0]).toBe(42)
    expect(host.sim.players.get(w.playerId)!.name).toBe('Ana')
    // token usado não serve de novo; sem token é outro personagem
    const a3 = join(host, 8, 'Ana')
    expect(a3.last('welcome')!.playerId).not.toBe(w.playerId)
  })

  it('quem sai pelo menu (fechamento limpo) sai na hora', () => {
    const map = testMap(() => {})
    const host = new GameHost({ mapId: map.def.id, map, reconnectSeconds: 60 })
    const a = join(host, 1, 'Ana')
    const b = join(host, 2, 'Bia')
    host.disconnect(1, true)
    expect(b.last('playerLeft')?.id).toBe(a.last('welcome')!.playerId)
  })

  it('quem não volta a tempo sai da partida', () => {
    const map = testMap(() => {})
    const host = new GameHost({ mapId: map.def.id, map, reconnectSeconds: 1 })
    join(host, 1, 'Ana')
    const b = join(host, 2, 'Bia')
    const id = host.sim.players.size && [...host.sim.players.values()][0].id
    host.disconnect(1)
    for (let k = 0; k < 40; k++) host.tick()
    expect(b.last('playerLeft')?.id).toBe(id)
    expect(host.sim.players.has(id)).toBe(false)
  })
})
