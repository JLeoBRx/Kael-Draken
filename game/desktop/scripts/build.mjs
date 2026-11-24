// Empacota o processo principal (ESM) e o preload (CommonJS, exigido pela janela isolada).
import { build } from 'esbuild'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const desktop = join(here, '..')
const game = join(desktop, '..')
for (const need of ['dist/client/index.html', 'dist/server/servidor.mjs']) {
  if (!existsSync(join(game, need))) {
    console.error(`Falta ${need}: rode "npm run build:all" na pasta do jogo (${game}) antes.`)
    process.exit(1)
  }
}
const common = { bundle: true, platform: 'node', target: 'node22', sourcemap: true, external: ['electron', 'bufferutil', 'utf-8-validate'], logLevel: 'warning', absWorkingDir: desktop }
await build({
  ...common,
  entryPoints: ['src/main.ts'],
  outfile: 'build/main.mjs',
  format: 'esm',
  banner: { js: "import { createRequire as __ucRequire } from 'node:module'; const require = __ucRequire(import.meta.url);" },
})
await build({ ...common, entryPoints: ['src/preload.ts'], outfile: 'build/preload.cjs', format: 'cjs' })
console.log('aplicativo empacotado em desktop/build/')
