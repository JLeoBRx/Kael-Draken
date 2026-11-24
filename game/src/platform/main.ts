import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { MAPS, MAIN_MAP_ID } from '../shared/maps'
import { BOT_DIFFICULTIES, isBotDifficulty } from '../server/core/bots/profiles'
import { startPlatform } from './server'
import { gameRoot } from '../server/node/paths'
import { exitOnListenError } from '../server/node/listen-error'

/**
 * Linha de comando da plataforma online.
 *
 *   npm run online                    (compila o cliente e sobe tudo em :7370)
 *   npm run platform -- --port 7370 --max-servers 8
 */

const root = gameRoot(import.meta.url)

const { values } = parseArgs({
  options: {
    port: { type: 'string', default: process.env.PORT ?? '7370' },
    host: { type: 'string', default: process.env.HOST ?? '0.0.0.0' },
    db: { type: 'string', default: process.env.PLATFORM_DB ?? resolve(root, 'data/plataforma.db') },
    secret: { type: 'string', default: process.env.PLATFORM_SECRET ?? '' },
    map: { type: 'string', default: MAIN_MAP_ID },
    'max-servers': { type: 'string', default: process.env.MAX_SERVERS ?? '8' },
    region: { type: 'string', default: process.env.LOCAL_REGION ?? '' },
    'lobby-size': { type: 'string', default: '24' },
    'max-humans': { type: 'string', default: '24' },
    'max-wait': { type: 'string', default: '20' },
    warmup: { type: 'string', default: '25' },
    'zone-speed': { type: 'string', default: '1' },
    'bot-difficulty': { type: 'string', default: 'normal' },
    'trust-proxy': { type: 'boolean', default: process.env.TRUST_PROXY === '1' },
    'metrics-token': { type: 'string', default: process.env.METRICS_TOKEN ?? '' },
    static: { type: 'string', default: process.env.STATIC_DIR ?? resolve(root, 'dist/client') },
    'no-static': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.help) {
  console.log(`Uso: npm run platform -- [opções]
  --port <n>            Porta HTTP/WebSocket (padrão 7370)
  --host <ip>           Interface (padrão 0.0.0.0)
  --db <arquivo>        Banco SQLite (padrão data/plataforma.db)
  --secret <texto>      Segredo dos bilhetes de entrada (ou PLATFORM_SECRET);
                        vazio = aleatório a cada início
  --map <id>            Mapa das partidas (${Object.keys(MAPS).join(', ')})
  --max-servers <n>     Servidores de jogo neste processo (padrão 8; 0 = só
                        nós remotos, "npm run game-node" em outras máquinas)
  --region <id>         Região dos servidores deste processo (padrão: a pedida)
  --lobby-size <n>      Jogadores por partida pública, com bots (padrão 24)
  --max-humans <n>      Pessoas por partida pública (padrão 24)
  --max-wait <s>        Espera na fila antes de completar com bots (padrão 20)
  --warmup <s>          Aquecimento máximo esperando todos chegarem (padrão 25)
  --zone-speed <x>      Velocidade da zona (padrão 1)
  --bot-difficulty <${BOT_DIFFICULTIES.join('|')}>
  --trust-proxy         IP do cliente pelo X-Forwarded-For (atrás de proxy TLS)
  --metrics-token <t>   Exige "Authorization: Bearer <t>" em /metrics
  --static <pasta>      Cliente compilado (padrão dist/client)
  --no-static           Não servir o cliente`)
  process.exit(0)
}

function int(name: string, v: string, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) {
    console.error(`Valor inválido para --${name}: ${v} (inteiro entre ${min} e ${max})`)
    process.exit(1)
  }
  return n
}

if (!MAPS[values.map]) {
  console.error(`Mapa desconhecido: ${values.map}`)
  process.exit(1)
}
if (!isBotDifficulty(values['bot-difficulty'])) {
  console.error(`Dificuldade desconhecida: ${values['bot-difficulty']}`)
  process.exit(1)
}
const zoneSpeed = Number(values['zone-speed'])
if (!(zoneSpeed >= 0.1 && zoneSpeed <= 100)) {
  console.error(`Valor inválido para --zone-speed: ${values['zone-speed']}`)
  process.exit(1)
}
const maxHumans = int('max-humans', values['max-humans'], 1, 100)

const platform = await startPlatform({
  port: int('port', values.port, 0, 65535),
  host: values.host,
  dbPath: values.db,
  secret: values.secret,
  staticDir: values['no-static'] ? null : values.static,
  trustProxy: values['trust-proxy'],
  metricsToken: values['metrics-token'] || undefined,
  logger: { info: (m) => console.log(`[plataforma] ${m}`), warn: (m) => console.warn(`[plataforma] ${m}`) },
  service: {
    matchmaker: { maxHumans, lobbySize: Math.max(maxHumans, int('lobby-size', values['lobby-size'], 1, 100)), maxWaitMs: int('max-wait', values['max-wait'], 0, 600) * 1000 },
    pool: {
      maxServers: int('max-servers', values['max-servers'], 0, 64),
      localRegion: values.region || undefined,
      mapId: values.map,
      botDifficulty: values['bot-difficulty'],
      publicBr: { warmup: int('warmup', values.warmup, 3, 600), zoneSpeed },
    },
  },
}).catch((err: unknown) => exitOnListenError(err, values.port))

if (!values.secret) console.warn('[plataforma] sem --secret: bilhetes valem só até reiniciar e nós remotos não conseguem entrar (precisam do mesmo segredo)')
console.log(`\nÚltima Chama — plataforma online em execução (banco ${values.db})`)
console.log(`  Neste computador:  http://localhost:${platform.port}`)
for (const ip of platform.lanAddresses) console.log(`  Na rede:           http://${ip}:${platform.port}`)
console.log('  Ctrl+C para encerrar.\n')

let closing = false
const shutdown = async () => {
  if (closing) return
  closing = true
  console.log('\nEncerrando plataforma...')
  await platform.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
