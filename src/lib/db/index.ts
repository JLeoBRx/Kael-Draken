import 'server-only'
import type { Client } from '@libsql/client'
import { connect, type Database } from './connect'
import * as schema from './schema'

const globalForDb = globalThis as unknown as { __kd?: { client: Client; db: Database } }

const connection = globalForDb.__kd ?? connect()
if (process.env.NODE_ENV !== 'production') globalForDb.__kd = connection

export const client: Client = connection.client
export const db: Database = connection.db
export type { Database }
export { schema }
