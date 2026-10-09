import { describe, expect, it } from 'vitest'
import { SEED_ARTICLES, SEED_BOOK, SEED_CHARACTERS, SEED_DOCUMENTS, SEED_ERAS, SEED_EVENTS, SEED_MYSTERIES } from '@/lib/seed/content'
import { renderMarkdown, toPlainText } from '@/lib/markdown/render'

const PROPHECY = 'Quando a Chama despertar, não o fará sozinha. Skrugheim abrirá suas portas, e a morte caminhará entre os vivos.'

describe('fidelidade do conteúdo inicial', () => {
  it('mantém a profecia exatamente como escrita', () => {
    const doc = SEED_DOCUMENTS.find((d) => d.slug === 'quando-a-chama-despertar')!
    expect(doc.transcription.split('\n').join(' ')).toBe(PROPHECY)
  })

  it('não revela a origem real de Kael sem revelações avançadas', () => {
    const kael = SEED_CHARACTERS.find((c) => c.slug === 'kael-draken')!
    for (const field of [kael.summary, kael.personality, kael.history, kael.family, kael.storyRole]) {
      expect(field ?? '').not.toMatch(/linhagem real/i)
    }
    const level1 = renderMarkdown(kael.secrets ?? '', { spoiler: 1 }).html
    expect(level1).not.toMatch(/linhagem real/)
    const level2 = renderMarkdown(kael.secrets ?? '', { spoiler: 2 }).html
    expect(level2).toMatch(/linhagem real/)
  })

  it('não atribui datas exatas nem ISBN', () => {
    const texts = [...SEED_ERAS.map((e) => e.dateLabel), ...SEED_EVENTS.map((e) => e.dateLabel), SEED_BOOK.editorialInfo]
    for (const t of texts) {
      expect(t).not.toMatch(/\b\d{3,4}\b/)
      expect(t).not.toMatch(/ISBN/i)
    }
  })

  it('preserva a duração aproximada do Século Perdido', () => {
    const seculo = SEED_ARTICLES.find((a) => a.slug === 'o-seculo-perdido')!
    expect(seculo.summary).toMatch(/seiscentos anos/)
  })

  it('mantém o herdeiro e o portal atrás de revelações iniciais', () => {
    const safra = SEED_ARTICLES.find((a) => a.slug === 'safra-e-a-noite-das-cinzas')!
    expect(toPlainText(safra.body ?? '')).not.toMatch(/portal/)
    expect(SEED_MYSTERIES.find((m) => m.slug === 'o-portal')?.spoiler).toBe(1)
    expect(SEED_EVENTS.find((e) => e.slug === 'o-herdeiro-atravessa-o-portal')?.spoiler).toBe(1)
  })

  it('não define o que é Skrugheim', () => {
    const all = JSON.stringify([SEED_ARTICLES, SEED_DOCUMENTS, SEED_MYSTERIES])
    expect(all).toMatch(/Skrugheim/)
    expect(all).not.toMatch(/Skrugheim (é|era) (um|uma|o|a) /)
  })
})
