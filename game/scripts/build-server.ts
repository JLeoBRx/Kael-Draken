import { build } from 'esbuild'
import { rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gameRoot } from '../src/server/node/paths'

/**
 * Pacote de produção dos servidores: um arquivo .mjs por programa, com tudo
 * dentro (inclusive o ws), para rodar com `node` puro — sem tsx, sem
 * node_modules, sem compilar nada na máquina de produção.
 *
 *   dist/server/plataforma.mjs   plataforma online (npm run platform)
 *   dist/server/no-de-jogo.mjs   nó de servidor de jogo (npm run game-node)
 *   dist/server/servidor.mjs     servidor dedicado / LAN (npm run server)
 */

const root = gameRoot(import.meta.url)
const out = join(root, 'dist/server')
rmSync(out, { recursive: true, force: true })

const entries: Record<string, string> = {
  plataforma: 'src/platform/main.ts',
  'no-de-jogo': 'src/platform/node-main.ts',
  servidor: 'src/server/node/main.ts',
}

const t0 = performance.now()
await build({
  absWorkingDir: root,
  entryPoints: Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, v])),
  outdir: out,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  minifySyntax: true,
  legalComments: 'none',
  // dependências opcionais do ws (aceleração nativa): ficam de fora
  external: ['bufferutil', 'utf-8-validate'],
  // o ws usa require() de módulos do Node: num pacote ESM, precisa de um require de verdade
  banner: { js: "import { createRequire as __ucRequire } from 'node:module'; const require = __ucRequire(import.meta.url);" },
  logLevel: 'warning',
})
for (const name of Object.keys(entries)) {
  const kb = statSync(join(out, `${name}.mjs`)).size / 1024
  console.log(`  dist/server/${name}.mjs  ${kb.toFixed(0)} KB`)
}
console.log(`servidores empacotados em ${(performance.now() - t0).toFixed(0)} ms`)
