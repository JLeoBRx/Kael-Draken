import 'server-only'
import { getIllustrationFeature } from '../content/illustrations'
import type { FeatureImage } from '../content/media'
import type { Viewer } from '../content/viewer'
import type { ArtSource } from './art'

/**
 * Converte uma arte do registro em imagem exibível. Ilustrações de capítulo
 * são buscadas no banco: valem a imagem, a legenda e o estado de publicação
 * definidos no painel (despublicada, ela some também daqui).
 */
export async function resolveArt(source: ArtSource | null | undefined, viewer: Viewer): Promise<FeatureImage | null> {
  if (!source) return null
  if ('illustration' in source) {
    const image = await getIllustrationFeature(source.illustration, viewer)
    return image ? { ...image, focus: source.focus } : null
  }
  return source
}
