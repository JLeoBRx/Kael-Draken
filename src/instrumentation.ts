/**
 * Executado uma vez quando o servidor inicia: aplica as migrações do banco
 * e carrega o conteúdo inicial se o banco estiver vazio. Desative com
 * AUTO_MIGRATE=false (por exemplo, se as migrações forem aplicadas no deploy).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.AUTO_MIGRATE === 'false') return
  const { connect } = await import('./lib/db/connect')
  const { runMigrations } = await import('./lib/db/migrate')
  const { ensureBookIllustrations, ensureSettings, seedDatabase } = await import('./lib/seed')
  const { db, client } = connect()
  try {
    await runMigrations(db, client)
    await seedDatabase(db, { log: (m) => console.log(`[arquivo] ${m}`) })
    await ensureSettings(db)
    await ensureBookIllustrations(db, { log: (m) => console.log(`[arquivo] ${m}`) })
  } catch (error) {
    console.error('[arquivo] Falha ao preparar o banco de dados:', error)
  } finally {
    client.close()
  }
}
