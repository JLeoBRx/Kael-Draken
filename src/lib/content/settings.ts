import 'server-only'
import { cache } from 'react'
import { db, schema as s } from '../db'
import { SEED_SETTINGS } from '../seed/content'

export const getSettings = cache(async (): Promise<Record<string, string>> => {
  const rows = await db.select().from(s.settings)
  return { ...SEED_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) }
})
