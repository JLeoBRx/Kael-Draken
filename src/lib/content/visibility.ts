import { and, eq, lte, ne, type SQL } from 'drizzle-orm'
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { Viewer } from './viewer'

interface EditorialColumns {
  status: AnySQLiteColumn
  canon: AnySQLiteColumn
  spoiler: AnySQLiteColumn
}

/**
 * Condição para listagens: publicado, não arquivado e dentro do nível de
 * spoiler do visitante. Na pré-visualização, inclui rascunhos.
 */
export function listable(t: EditorialColumns, viewer: Viewer): SQL {
  if (viewer.preview) return and(ne(t.status, 'arquivado'), ne(t.canon, 'arquivado'))!
  return and(eq(t.status, 'publicado'), ne(t.canon, 'arquivado'), lte(t.spoiler, viewer.spoiler))!
}

/**
 * Condição para acesso direto por endereço. O nível de spoiler é tratado
 * pela página (exibindo um aviso em vez do conteúdo).
 */
export function reachable(t: EditorialColumns, viewer: Viewer): SQL | undefined {
  if (viewer.preview) return undefined
  return and(eq(t.status, 'publicado'), ne(t.canon, 'arquivado'))
}

export function isVisible(row: { status: string; canon: string; spoiler: number }, viewer: Viewer): boolean {
  if (viewer.preview) return true
  return row.status === 'publicado' && row.canon !== 'arquivado' && row.spoiler <= viewer.spoiler
}

export function isLocked(row: { spoiler: number }, viewer: Viewer): boolean {
  return !viewer.preview && row.spoiler > viewer.spoiler
}
