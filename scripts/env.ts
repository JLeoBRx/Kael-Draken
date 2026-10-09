import { existsSync } from 'node:fs'

/** Carrega .env.local e .env (nessa ordem) para os scripts de linha de comando. */
export function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (existsSync(file)) process.loadEnvFile(file)
  }
}
