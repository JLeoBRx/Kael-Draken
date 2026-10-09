import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import * as schema from './schema'

export type Database = LibSQLDatabase<typeof schema>

export function resolveDatabaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || 'file:./data/kael-draken.db'
}

/** Cria a conexão libSQL. Usado pelo app e pelos scripts (migração e carga inicial). */
export function connect(url = resolveDatabaseUrl()): { client: Client; db: Database } {
  if (url.startsWith('file:')) {
    const filePath = url.slice('file:'.length)
    mkdirSync(path.dirname(path.resolve(/*turbopackIgnore: true*/ filePath)), { recursive: true })
  }
  const client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined })
  return { client, db: drizzle(client, { schema }) }
}
