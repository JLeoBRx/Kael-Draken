import { migrate } from 'drizzle-orm/libsql/migrator'
import path from 'node:path'
import type { Client } from '@libsql/client'
import type { Database } from './connect'

/** Aplica as migrações SQL versionadas na pasta ./drizzle. */
export async function runMigrations(db: Database, client: Client, migrationsFolder = path.resolve(process.cwd(), 'drizzle')) {
  const url = process.env.DATABASE_URL ?? ''
  if (!url || url.startsWith('file:')) {
    // WAL melhora leituras concorrentes no SQLite local; a configuração persiste no arquivo.
    await client.execute('PRAGMA journal_mode = WAL')
  }
  await migrate(db, { migrationsFolder })
}
