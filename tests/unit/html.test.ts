import { describe, expect, it } from 'vitest'
import { LinkTable, createMarkdown, isPublic } from '../../scripts/html/kit'
import { registerLinks } from '../../scripts/html/pages'

describe('versão em HTML', () => {
  const links = new LinkTable()
  registerLinks(links)
  const md = createMarkdown(links, new Map([['/images/atlas/mapa-mundo-conhecido.webp', { src: 'assets/mapa-conhecido.webp', width: 1536, height: 1024 }]]))

  it('remove blocos de spoiler e notas privadas, sem aviso de trecho oculto', () => {
    const html = md('Texto público.\n\n:::spoiler 1\nRevelação reservada.\n:::\n\nFim %%nota interna%%.')
    expect(html).toContain('Texto público.')
    expect(html).not.toContain('Revelação reservada')
    expect(html).not.toContain('Trecho oculto')
    expect(html).not.toContain('nota interna')
  })

  it('aponta referências internas para as páginas desta versão (e o que não existe vira texto)', () => {
    const html = md('[[reinos/safra|Safra]], [[mitologia/a-chama-do-dragao|a Chama]], [[atlas|Atlas]] e [[personagens/alguem|alguém]].')
    expect(html).toContain('href="reino-safra.html"')
    expect(html).toContain('href="mitologia-a-chama-do-dragao.html"')
    expect(html).toContain('href="atlas.html"')
    expect(html).not.toContain('personagem-alguem.html')
    expect(html).toContain('alguém')
  })

  it('troca imagens do site pelas cópias em assets/', () => {
    const html = md('![Carta](/images/atlas/mapa-mundo-conhecido.webp "O mundo conhecido")')
    expect(html).toContain('src="assets/mapa-conhecido.webp"')
    expect(() => md('![x](/images/atlas/inexistente.webp)')).toThrow()
  })

  it('só publica verbetes sem spoiler e não arquivados', () => {
    expect(isPublic({ spoiler: 0, canon: 'canonico' })).toBe(true)
    expect(isPublic({ canon: 'provisorio' })).toBe(true)
    expect(isPublic({ spoiler: 1, canon: 'canonico' })).toBe(false)
    expect(isPublic({ spoiler: 0, canon: 'arquivado' })).toBe(false)
  })
})
