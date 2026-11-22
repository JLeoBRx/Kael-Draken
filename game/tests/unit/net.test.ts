import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { Predictor } from '../../src/client/net/prediction'
import { RemoteEntity, ServerClock } from '../../src/client/net/interpolation'
import { GameHost, type HostConnection } from '../../src/server/core/game-host'
import { MAX_QUEUE, MAX_TOKENS } from '../../src/server/core/simulation'
import { startServer, type RunningServer } from '../../src/server/node/server'
import { loadMap } from '../../src/shared/maps'
import { Rng } from '../../src/shared/math/rng'
import { Buttons, createCharacterState } from '../../src/shared/movement/character'
import {
  PROTOCOL_VERSION,
  beginSnapshot,
  decodeClientMessage,
  decodeServerMessage,
  encodeHello,
  encodeInputs,
  encodePing,
  encodeWelcome,
  quantizeCommand,
  sanitizeName,
  writeEntity,
  type InputCommand,
  type ServerMessage,
} from '../../src/shared/net/protocol'

const map = loadMap('campo-de-provas')

class FakeConn implements HostConnection {
  inbox: ServerMessage[] = []
  closed: string | null = null
  constructor(readonly id: number) {}
  send(data: Uint8Array) {
    this.inbox.push(decodeServerMessage(data))
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
      { seq: 1, forward: 1, right: -0.5, yaw: 1.234, pitch: -0.3, buttons: Buttons.Jump | Buttons.Sprint },
      { seq: 2, forward: -0.25, right: 0, yaw: -2.9, pitch: 1.4, buttons: Buttons.Crouch | 0xff00 },
    ]
    const msg = decodeClientMessage(encodeInputs(cmds))
    expect(msg.type).toBe('input')
    if (msg.type !== 'input') return
    expect(msg.commands).toEqual(cmds.map(quantizeCommand))
    expect(msg.commands[1].buttons).toBe(Buttons.Crouch)
  })

  it('snapshot com estado próprio completo e entidades', () => {
    const self = createCharacterState(1.5, 2.25, -3.125, 0.5)
    self.vx = 3.3
    self.flags = 5
    const other = createCharacterState(10, 6.15, 20, 1)
    other.vz = -7.4
    const w = beginSnapshot(99, 42, 3, self, 1)
    writeEntity(w, 7, other)
    const msg = decodeServerMessage(w.finish())
    expect(msg.type).toBe('snapshot')
    if (msg.type !== 'snapshot') return
    const s = msg.snapshot
    expect(s.tick).toBe(99)
    expect(s.ackSeq).toBe(42)
    expect(s.queued).toBe(3)
    expect(s.self).toEqual(self)
    expect(s.entities[0].id).toBe(7)
    expect(s.entities[0].z).toBe(20)
    expect(s.entities[0].vz).toBeCloseTo(-7.4, 2)
  })

  it('rejeita mensagens truncadas, com lixo no fim ou de tipo desconhecido', () => {
    const ping = encodePing(123)
    expect(() => decodeClientMessage(ping.subarray(0, 5))).toThrow()
    expect(() => decodeClientMessage(new Uint8Array([...ping, 0]))).toThrow()
    expect(() => decodeClientMessage(new Uint8Array([200]))).toThrow()
    const welcome = encodeWelcome({ version: 1, playerId: 3, mapId: 'x', tickRate: 30, tick: 5, serverName: 'S' })
    expect(decodeServerMessage(welcome)).toMatchObject({ type: 'welcome', playerId: 3, mapId: 'x' })
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
      for (let k = 0; k < 16; k++) cmds.push({ seq: seq++, forward: 1, right: 0, yaw: 0, pitch: 0, buttons: Buttons.Sprint })
      host.receive(1, encodeInputs(cmds))
    }
    host.tick()
    const snap = a.last('snapshot')!.snapshot
    // fila limitada a MAX_QUEUE (os mais antigos são descartados) e no máximo MAX_TOKENS aplicados
    const player = [...host.sim.players.values()][0]
    expect(player.droppedCommands).toBe(320 - MAX_QUEUE)
    expect(snap.queued).toBe(MAX_QUEUE - MAX_TOKENS)
    // no máximo MAX_TOKENS ticks de sprint (~0,25 m cada)
    expect(Math.hypot(snap.self!.x - start.x, snap.self!.z - start.z)).toBeLessThan(MAX_TOKENS * 0.25 + 0.01)
  })

  it('remove o jogador e avisa os demais ao desconectar', () => {
    const host = new GameHost({ mapId: map.def.id, map })
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
    const server = [...host.sim.players.values()][0].state
    // o estado previsto está à frente do servidor só pelos comandos em trânsito
    expect(predictor.pendingCount).toBeLessThanOrEqual(2 * LAT + 2)
    expect(Math.hypot(predictor.state.x - server.x, predictor.state.z - server.z)).toBeLessThan(3)
    expect(Math.hypot(server.x, server.z)).toBeGreaterThan(5)
  })

  it('corrige e suaviza quando o servidor diverge', () => {
    const predictor = new Predictor(map.world, 1 / 30)
    const s = createCharacterState(0, 6.15, 20)
    predictor.init(s)
    for (let k = 0; k < 5; k++) predictor.predict({ forward: 1, right: 0, yaw: 0, pitch: 0, buttons: 0 })
    const moved = createCharacterState(1, 6.15, 20)
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
    const base = { id: 1, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0, vy: 0, vz: 0 }
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
    })
  })
  afterAll(async () => {
    await server.close()
  })

  function client(name: string) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`)
    ws.binaryType = 'arraybuffer'
    const inbox: ServerMessage[] = []
    ws.on('message', (d) => inbox.push(decodeServerMessage(new Uint8Array(d as ArrayBuffer))))
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
    for (let k = 1; k <= 30; k++) cmds.push({ seq: k, forward: 1, right: 0, yaw: 0, pitch: 0, buttons: 0 })
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
