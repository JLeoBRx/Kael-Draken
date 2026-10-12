import { connect } from '../src/lib/db/connect'
import { runMigrations } from '../src/lib/db/migrate'
import { ensureContentUpdates, ensureSettings, seedDatabase } from '../src/lib/seed'
import { loadEnv } from './env'

loadEnv()

async function main() {
  const { db, client } = connect()
  await runMigrations(db, client)
  await seedDatabase(db, { log: console.log })
  await ensureSettings(db)
  await ensureContentUpdates(db, { log: console.log })
  client.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
