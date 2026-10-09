import { connect, resolveDatabaseUrl } from '../src/lib/db/connect'
import { runMigrations } from '../src/lib/db/migrate'
import { loadEnv } from './env'

loadEnv()

async function main() {
  const { db, client } = connect()
  console.log(`Aplicando migrações em ${resolveDatabaseUrl()}…`)
  await runMigrations(db, client)
  console.log('Migrações aplicadas.')
  client.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
