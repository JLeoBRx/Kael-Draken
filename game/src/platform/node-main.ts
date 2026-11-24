import { hostname } from 'node:os'
import { parseArgs } from 'node:util'
import { exitOnListenError } from '../server/node/listen-error'
import { lanAddresses } from '../server/node/server'
import { GameNode, nodesUrl } from './node-agent'
import { validNodeName, validPublicUrl } from './node-protocol'

/**
 * Linha de comando de um nó de servidor de jogo (outra máquina).
 *
 *   npm run game-node -- --platform http://plataforma:7370 --secret <segredo> \
 *     --public-url ws://203.0.113.7:7380 --region sa --capacity 4
 *
 * Variáveis de ambiente equivalentes (para contêineres): PLATFORM_URL,
 * PLATFORM_SECRET, NODE_NAME, NODE_PUBLIC_URL, NODE_REGION, NODE_CAPACITY,
 * PORT, HOST, METRICS_TOKEN.
 */

const env = process.env
const { values } = parseArgs({
  options: {
    platform: { type: 'string', default: env.PLATFORM_URL ?? 'http://localhost:7370' },
    secret: { type: 'string', default: env.PLATFORM_SECRET ?? '' },
    name: { type: 'string', default: env.NODE_NAME ?? hostname().replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 32) },
    'public-url': { type: 'string', default: env.NODE_PUBLIC_URL ?? '' },
    region: { type: 'string', default: env.NODE_REGION ?? 'sa' },
    capacity: { type: 'string', default: env.NODE_CAPACITY ?? '4' },
    port: { type: 'string', default: env.PORT ?? '7380' },
    host: { type: 'string', default: env.HOST ?? '0.0.0.0' },
    'trust-proxy': { type: 'boolean', default: env.TRUST_PROXY === '1' },
    'metrics-token': { type: 'string', default: env.METRICS_TOKEN ?? '' },
    'drain-timeout': { type: 'string', default: env.DRAIN_TIMEOUT ?? '900' },
    help: { type: 'boolean', short: 'h', default: false },
  },
})

if (values.help) {
  console.log(`Uso: npm run game-node -- [opções]
  --platform <url>      Endereço da plataforma (padrão http://localhost:7370)
  --secret <texto>      Segredo da plataforma (o mesmo --secret dela; ou PLATFORM_SECRET)
  --name <nome>         Nome deste nó (padrão: nome da máquina)
  --public-url <url>    Endereço que os jogadores usam para chegar aqui
                        (ws://ip:porta, ou wss://nome[/prefixo] atrás de um proxy TLS)
  --region <id>         Região (sa, na, eu...) para o matchmaking (padrão sa)
  --capacity <n>        Servidores de jogo simultâneos (padrão 4)
  --port <n>            Porta HTTP/WebSocket (padrão 7380)
  --host <ip>           Interface (padrão 0.0.0.0)
  --trust-proxy         IP do cliente pelo X-Forwarded-For
  --metrics-token <t>   Exige "Authorization: Bearer <t>" em /metrics
  --drain-timeout <s>   No SIGTERM, espera as partidas terminarem até este
                        tempo (padrão 900 s; um segundo sinal encerra na hora)`)
  process.exit(0)
}

function fail(msg: string): never {
  console.error(msg)
  process.exit(1)
}

function int(name: string, v: string, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) fail(`Valor inválido para --${name}: ${v} (inteiro entre ${min} e ${max})`)
  return n
}

if (!values.secret) fail('Falta o segredo da plataforma: --secret <texto> ou PLATFORM_SECRET (o mesmo da plataforma)')
if (!validNodeName(values.name)) fail(`Nome de nó inválido: ${values.name} (letras, números, ".", "-", "_"; até 32)`)
try {
  nodesUrl(values.platform)
} catch {
  fail(`Endereço da plataforma inválido: ${values.platform}`)
}
const port = int('port', values.port, 0, 65535)
const publicUrl = values['public-url'] || `ws://${lanAddresses()[0] ?? 'localhost'}:${port}`
if (!validPublicUrl(publicUrl)) fail(`Endereço público inválido: ${publicUrl} (ws://host:porta ou wss://host[/prefixo])`)
if (!values['public-url']) console.warn(`[nó] sem --public-url: anunciando ${publicUrl} (os jogadores precisam alcançar este endereço)`)

const node = new GameNode({
  name: values.name,
  platformUrl: values.platform,
  secret: values.secret,
  publicUrl,
  region: values.region.slice(0, 8),
  capacity: int('capacity', values.capacity, 1, 256),
  port,
  host: values.host,
  trustProxy: values['trust-proxy'],
  metricsToken: values['metrics-token'] || undefined,
  logger: { info: (m) => console.log(`[nó ${values.name}] ${m}`), warn: (m) => console.warn(`[nó ${values.name}] ${m}`) },
})
await node.start().catch((err: unknown) => exitOnListenError(err, port))
console.log(`\nÚltima Chama — nó de servidor de jogo "${values.name}" na porta ${node.port}`)
console.log(`  Plataforma:     ${nodesUrl(values.platform)}`)
console.log(`  Jogadores usam: ${publicUrl}`)
console.log('  Ctrl+C para encerrar (espera as partidas; duas vezes encerra na hora).\n')

let signals = 0
const shutdown = async () => {
  signals++
  if (signals > 1) {
    console.log('\nEncerrando agora.')
    await node.close()
    process.exit(0)
  }
  const timeout = int('drain-timeout', values['drain-timeout'], 0, 86_400)
  console.log(`\nDesligando: sem partidas novas; esperando ${node.servers.size} servidor(es) terminarem (até ${timeout} s)...`)
  await node.drain(timeout * 1000)
  await node.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
