/**
 * Especificações e utilidades das ilustrações de capítulo. Sem dependências
 * de servidor: usado pelo site, pelo painel e pelos testes.
 */

import type { ArtState } from './editorial'
import { toRoman } from './format'
import { slugify } from './slug'

/** Tamanho de referência da ilustração impressa (não é o formato da página do miolo). */
export const PRINT_SPEC = {
  widthCm: 15.5,
  heightCm: 23,
  dpi: 300,
  widthPx: 1831,
  heightPx: 2717,
} as const

/** Proporção largura/altura de 15,5 × 23 cm (= 31:46). */
export const PRINT_RATIO = PRINT_SPEC.widthCm / PRINT_SPEC.heightCm

/** Tolerância de proporção antes de o painel avisar (2%). */
export const RATIO_TOLERANCE = 0.02

const CM_PER_INCH = 2.54

export function pixelsForCm(cm: number, dpi: number = PRINT_SPEC.dpi): number {
  return Math.round((cm / CM_PER_INCH) * dpi)
}

/** DPI efetivo de uma imagem impressa na largura de referência. */
export function effectiveDpi(widthPx: number, widthCm: number = PRINT_SPEC.widthCm): number {
  return Math.round(widthPx / (widthCm / CM_PER_INCH))
}

/** Desvio relativo entre a proporção da imagem e 31:46 (0 = idêntica). */
export function ratioDeviation(width: number, height: number): number {
  if (!width || !height) return 1
  return Math.abs(width / height / PRINT_RATIO - 1)
}

/** Avisos sobre uma imagem destinada à impressão (lista vazia = adequada). */
export function printWarnings(width: number, height: number): string[] {
  if (!width || !height) return ['Não foi possível ler as dimensões da imagem.']
  const warnings: string[] = []
  if (width >= height) warnings.push(`A imagem está na horizontal (${width} × ${height} px); as ilustrações dos capítulos são verticais.`)
  else if (ratioDeviation(width, height) > RATIO_TOLERANCE) {
    const pct = (ratioDeviation(width, height) * 100).toFixed(1).replace('.', ',')
    warnings.push(`A proporção de ${width} × ${height} px difere de 31:46 (15,5 × 23 cm) em ${pct}%. O site não corta a imagem, mas ela ficará com margens.`)
  }
  const dpi = effectiveDpi(width)
  if (dpi < PRINT_SPEC.dpi) {
    warnings.push(`Em 15,5 × 23 cm, ${width} × ${height} px equivalem a ${dpi} DPI. Para impressão, o recomendado é ${PRINT_SPEC.dpi} DPI (${PRINT_SPEC.widthPx} × ${PRINT_SPEC.heightPx} px).`)
  }
  return warnings
}

export function chapterLabel(number: number): string {
  return `Capítulo ${toRoman(number)}`
}

/** Rótulo usado nas listagens do painel. */
export function illustrationTitle(number: number, chapterTitle: string): string {
  return `${chapterLabel(number)} — ${chapterTitle}`
}

/** Identificador padrão (também o nome do arquivo): capitulo-01-titulo-do-capitulo. */
export function defaultIllustrationSlug(number: number, chapterTitle: string): string {
  const base = slugify(chapterTitle)
  return `capitulo-${String(Math.max(0, Math.floor(number))).padStart(2, '0')}${base ? `-${base}` : ''}`
}

/** Pasta pública dos arquivos versionados das ilustrações de um volume. */
export function illustrationPublicDir(volume: number): string {
  return `/images/livro-${volume}/ilustracoes`
}

export const ILLUSTRATION_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg', 'avif'] as const

/** Dados públicos de uma ilustração, como chegam aos componentes do site. */
export interface IllustrationItem {
  slug: string
  roman: string
  label: string
  chapterTitle: string
  artState: ArtState
  stateLabel: string
  stateDescription: string
  image: { src: string; width: number; height: number; alt: string } | null
  caption: string
  credit: string
  chapterHref: string | null
}
