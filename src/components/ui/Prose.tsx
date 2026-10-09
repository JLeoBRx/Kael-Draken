import type { RenderResult } from '@/lib/markdown/render'

/** Exibe HTML produzido pelo renderizador do arquivo (HTML bruto do autor é sempre escapado). */
export function Prose({ result, className = '' }: { result: RenderResult | string; className?: string }) {
  const html = typeof result === 'string' ? result : result.html
  if (!html.trim()) return null
  return <div className={`prose ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />
}
