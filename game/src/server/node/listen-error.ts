/** Erro ao abrir a porta, em português e sem pilha (porta ocupada, sem permissão). */
export function exitOnListenError(err: unknown, port: number | string): never {
  const e = err as NodeJS.ErrnoException
  if (e?.code === 'EADDRINUSE') console.error(`A porta ${port} já está em uso (outro servidor aberto?). Feche-o ou use --port <outra>.`)
  else if (e?.code === 'EACCES') console.error(`Sem permissão para usar a porta ${port}. Use uma porta acima de 1024 (--port).`)
  else console.error(e instanceof Error ? e.stack ?? e.message : String(e))
  process.exit(1)
}
