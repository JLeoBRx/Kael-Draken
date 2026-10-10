import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { imageSize } from 'image-size'
import { describe, expect, it } from 'vitest'
import { chapterLabel, defaultIllustrationSlug, effectiveDpi, illustrationTitle, pixelsForCm, PRINT_RATIO, PRINT_SPEC, printWarnings, ratioDeviation } from '@/lib/illustrations'
import { SEED_CHAPTERS, SEED_ILLUSTRATIONS } from '@/lib/seed/content'

const DIR = path.join(process.cwd(), 'public', 'images', 'livro-1', 'ilustracoes')

function fileFor(slug: string) {
  for (const ext of ['png', 'webp', 'jpg', 'jpeg']) {
    const file = path.join(DIR, `${slug}.${ext}`)
    if (existsSync(file)) return file
  }
  return null
}

describe('formato de impressão das ilustrações', () => {
  it('15,5 × 23 cm a 300 DPI correspondem a 1831 × 2717 px (31:46)', () => {
    expect(pixelsForCm(PRINT_SPEC.widthCm)).toBe(PRINT_SPEC.widthPx)
    expect(pixelsForCm(PRINT_SPEC.heightCm)).toBe(PRINT_SPEC.heightPx)
    expect(PRINT_RATIO).toBeCloseTo(31 / 46, 6)
    expect(effectiveDpi(1831)).toBe(300)
  })

  it('aceita a imagem no formato exato e avisa sobre resolução, proporção e orientação', () => {
    expect(printWarnings(1831, 2717)).toEqual([])
    const low = printWarnings(1240, 1820)
    expect(low).toHaveLength(1)
    expect(low[0]).toMatch(/203 DPI/)
    expect(printWarnings(1831, 2000).join(' ')).toMatch(/proporção/)
    expect(printWarnings(2000, 1333).join(' ')).toMatch(/horizontal/)
    expect(ratioDeviation(1831, 2717)).toBeLessThan(0.001)
  })

  it('nomeia capítulos e arquivos de forma previsível', () => {
    expect(chapterLabel(10)).toBe('Capítulo X')
    expect(illustrationTitle(3, 'A casa no fim da estrada')).toBe('Capítulo III — A casa no fim da estrada')
    expect(defaultIllustrationSlug(1, 'O lugar que não existia')).toBe('capitulo-01-o-lugar-que-nao-existia')
  })
})

describe('ilustrações do Livro I', () => {
  it('há um registro por capítulo, de I a X, em ordem', () => {
    expect(SEED_CHAPTERS.map((c) => c.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(SEED_ILLUSTRATIONS.map((i) => i.chapter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(new Set(SEED_ILLUSTRATIONS.map((i) => i.slug)).size).toBe(10)
    for (const ill of SEED_ILLUSTRATIONS) expect(ill.slug).toMatch(new RegExp(`^capitulo-${String(ill.chapter).padStart(2, '0')}-[a-z0-9-]+$`))
  })

  it('cada arquivo existe; as artes finais estão em 1831 × 2717 px', () => {
    for (const ill of SEED_ILLUSTRATIONS) {
      const file = fileFor(ill.slug)
      expect(file, ill.slug).not.toBeNull()
      const size = imageSize(readFileSync(file!))
      if (ill.artState === 'final') {
        expect([size.width, size.height], ill.slug).toEqual([PRINT_SPEC.widthPx, PRINT_SPEC.heightPx])
      } else {
        // a versão provisória continua vertical e sem corte perceptível
        expect(ratioDeviation(size.width!, size.height!)).toBeLessThan(0.02)
      }
    }
  })

  it('a única imagem fora do padrão de impressão está marcada como provisória', () => {
    const provisional = SEED_ILLUSTRATIONS.filter((i) => i.artState !== 'final').map((i) => i.chapter)
    expect(provisional).toEqual([2])
  })

  it('textos públicos descrevem as imagens sem revelar mistérios', () => {
    for (const ill of SEED_ILLUSTRATIONS) {
      expect(ill.alt.length, ill.slug).toBeGreaterThan(60)
      expect(ill.caption.length).toBeGreaterThan(5)
      for (const text of [ill.alt, ill.caption]) {
        expect(text).not.toMatch(/linhagem|herdeiro|portal|Safra|Skrugheim|verdadeira identidade/i)
      }
    }
  })
})
