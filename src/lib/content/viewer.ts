import 'server-only'
import { cookies, draftMode } from 'next/headers'
import { cache } from 'react'
import { getAdminSession } from '../auth/session'
import { parseSpoilerLevel, SPOILER_COOKIE, type SpoilerLevel } from '../editorial'

export interface Viewer {
  /** Nível efetivo usado para filtrar conteúdo. */
  spoiler: SpoilerLevel
  /** Nível escolhido pelo visitante (exibido no seletor). */
  chosenSpoiler: SpoilerLevel
  /** Pré-visualização do painel: mostra rascunhos, notas privadas e todos os spoilers. */
  preview: boolean
}

export const getViewer = cache(async (): Promise<Viewer> => {
  const store = await cookies()
  const chosenSpoiler = parseSpoilerLevel(store.get(SPOILER_COOKIE)?.value)
  const draft = await draftMode()
  const preview = draft.isEnabled && !!(await getAdminSession())
  return { spoiler: preview ? 2 : chosenSpoiler, chosenSpoiler, preview }
})
