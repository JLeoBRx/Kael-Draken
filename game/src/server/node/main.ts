import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { DEFAULT_MAP_ID, MAPS } from '../../shared/maps'
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
})

console.log(`\nÚltima Chama — servidor em execução (mapa "${values.map}", ${values['tick-rate']} ticks/s)`)
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
