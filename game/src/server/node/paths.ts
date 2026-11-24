import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Pasta raiz do jogo (onde ficam dist/client e data/), achada subindo a
 * partir do arquivo em execução até o package.json do jogo. Funciona igual
 * rodando o código-fonte (tsx src/...), o pacote de produção
 * (dist/server/*.mjs) e dentro do contêiner. UC_ROOT tem prioridade.
 */
export function gameRoot(fromUrl: string): string {
  if (process.env.UC_ROOT) return resolve(process.env.UC_ROOT)
  let dir = dirname(fileURLToPath(fromUrl))
  for (let k = 0; k < 8; k++) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) {
      try {
        if ((JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string }).name === 'ultima-chama') return dir
      } catch {
        // package.json ilegível: continua subindo
      }
    }
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  return process.cwd()
}
