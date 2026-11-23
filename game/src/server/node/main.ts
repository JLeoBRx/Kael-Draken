import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_MAP_ID, MAPS } from '../../shared/maps'
import { GameMode } from '../../shared/match/zone'
import { BOT_DIFFICULTIES, isBotDifficulty } from '../core/bots/profiles'
import { startServer } from './server'

/**
 * Linha de comando do servidor dedicado / host de LAN.
 *
 *   npm run server -- --port 7350 --max-players 16
 *   npm run host                      (compila o cliente e serve tudo)
 */

const here = dirname(fileURLToPath(import.meta.url))
const gameRoot = resolve(here, '../../..')

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: process.env.PORT ?? '7350' },
    host: { type: 'string', default: process.env.HOST ?? '0.0.0.0' },
    map: { type: 'string', default: DEFAULT_MAP_ID },
    'max-players': { type: 'string', default: '16' },
    'tick-rate': { type: 'string', default: '30' },
    name: { type: 'string', default: 'Servidor Última Chama' },
    mode: { type: 'string', default: 'br' },
    bots: { type: 'string', default: '0' },
    'bot-difficulty': { type: 'string', default: 'normal' },
    warmup: { type: 'string', default: '45' },
    'zone-speed': { type: 'string', default: '1' },
    'no-restart': { type: 'boolean', default: false },
    lobby: { type: 'boolean', default: false },
    'team-size': { type: 'string', default: '1' },
    'friendly-fire': { type: 'boolean', default: false },
    reconnect: { type: 'string', default: '60' },
    'no-discovery': { type: 'boolean', default: false },
    static: { type: 'string', default: resolve(gameRoot, 'dist/client') },
    'no-static': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.help) {
  console.log(`Uso: npm run server -- [opções]
  --port <n>          Porta HTTP/WebSocket (padrão 7350)
  --host <ip>         Interface (padrão 0.0.0.0 = toda a rede local)
  --map <id>          Mapa (${Object.keys(MAPS).join(', ')})
  --max-players <n>   Limite de jogadores (padrão 16)
  --tick-rate <n>     Ticks por segundo da simulação (padrão 30)
  --name <texto>      Nome do servidor
  --mode <br|treino>  Battle royale (padrão) ou treino com renascimento
  --bots <n>          Bots controlados pelo servidor (padrão 0)
  --bot-difficulty <${BOT_DIFFICULTIES.join('|')}>  (padrão normal)
  --warmup <s>        Aquecimento antes do dirigível, contado a partir da
                      primeira pessoa conectada (padrão 45)
  --zone-speed <x>    Velocidade da zona (1 = normal, 2 = o dobro…)
  --no-restart        Não recomeçar sozinho depois do fim da partida
  --lobby             Sala de espera: quem entra marca "pronto" e escolhe equipe;
                      o primeiro configura (mapa, modo, bots, equipes) e inicia
  --team-size <1-4>   Jogadores por equipe (1 solo, 2 dupla, 3 trio, 4 esquadrão)
  --friendly-fire     Dano entre colegas de equipe
  --reconnect <s>     Segundos que o personagem espera quem caiu (padrão 60)
  --no-discovery      Não anunciar o servidor na rede local (UDP)
  --static <pasta>    Cliente compilado a servir (padrão dist/client)
  --no-static         Não servir o cliente (só /ws e /api/info)`)
  process.exit(0)
}

function int(name: string, v: string, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) {
    console.error(`Valor inválido para --${name}: ${v} (esperado inteiro entre ${min} e ${max})`)
    process.exit(1)
  }
  return n
}

if (values.mode !== 'br' && values.mode !== 'treino') {
  console.error(`Modo desconhecido: ${values.mode} (use br ou treino)`)
  process.exit(1)
}
if (!isBotDifficulty(values['bot-difficulty'])) {
  console.error(`Dificuldade desconhecida: ${values['bot-difficulty']} (${BOT_DIFFICULTIES.join(', ')})`)
  process.exit(1)
}
const zoneSpeed = Number(values['zone-speed'])
if (!(zoneSpeed >= 0.1 && zoneSpeed <= 100)) {
  console.error(`Valor inválido para --zone-speed: ${values['zone-speed']}`)
  process.exit(1)
}

if (!MAPS[values.map]) {
  console.error(`Mapa desconhecido: ${values.map}. Disponíveis: ${Object.keys(MAPS).join(', ')}`)
  process.exit(1)
}

const server = await startServer({
  port: int('port', values.port, 0, 65535),
  host: values.host,
  mapId: values.map,
  maxPlayers: int('max-players', values['max-players'], 1, 128),
  tickRate: int('tick-rate', values['tick-rate'], 10, 120),
  name: values.name,
  staticDir: values['no-static'] ? null : values.static,
  match: {
    mode: values.mode === 'br' ? GameMode.BattleRoyale : GameMode.Training,
    bots: int('bots', values.bots, 0, 127),
    botDifficulty: values['bot-difficulty'],
    br: { warmup: int('warmup', values.warmup, 0, 3600), zoneSpeed },
    autoRestart: !values['no-restart'],
    lobby: values.lobby,
    teamSize: int('team-size', values['team-size'], 1, 4),
    friendlyFire: values['friendly-fire'],
    reconnectSeconds: int('reconnect', values.reconnect, 0, 600),
  },
  discovery: !values['no-discovery'],
})

const modeText = values.lobby ? 'sala de espera' : values.mode === 'br' ? `battle royale, ${values.bots} bots` : 'treino'
console.log(`\nÚltima Chama — servidor em execução (mapa "${values.map}", ${modeText}, ${values['tick-rate']} ticks/s)`)
console.log(`  Neste computador:  http://localhost:${server.port}`)
for (const ip of server.lanAddresses) console.log(`  Na rede local:     http://${ip}:${server.port}`)
console.log('  Ctrl+C para encerrar.\n')

let closing = false
const shutdown = async () => {
  if (closing) return
  closing = true
  console.log('\nEncerrando servidor...')
  await server.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
