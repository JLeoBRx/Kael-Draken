import 'server-only'
import { collectWikiTargets, renderMarkdown, type RenderOptions, type RenderResult } from '../markdown/render'
import { resolveWikiTargets } from './links'
import type { Viewer } from './viewer'

export type RichRenderer = (source: string, options?: Pick<RenderOptions, 'headingOffset' | 'idPrefix'>) => RenderResult

/**
 * Prepara a renderização de vários campos de texto de uma página: as
 * referências internas de todos eles são resolvidas de uma só vez.
 */
export async function prepareRichText(viewer: Viewer, sources: Array<string | null | undefined>): Promise<RichRenderer> {
  const targets = new Set<string>()
  for (const source of sources) if (source) for (const t of collectWikiTargets(source)) targets.add(t)
  const links = await resolveWikiTargets([...targets], viewer)
  return (source, options = {}) => renderMarkdown(source ?? '', { spoiler: viewer.spoiler, preview: viewer.preview, links, ...options })
}
