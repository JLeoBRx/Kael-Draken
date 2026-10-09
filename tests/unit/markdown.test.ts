import { describe, expect, it } from 'vitest'
import { collectWikiTargets, hasContent, renderMarkdown, toPlainText } from '@/lib/markdown/render'

const source = `## Título <b>x</b>

Texto %%nota secreta%% com [[reinos/safra|Safra]], [[locais/inexistente]] e <script>alert(1)</script>.

:::spoiler 1
Os outros cinco reinos.
:::

:::spoiler 2
Revelação avançada.
:::

[perigoso](javascript:alert(1)) [externo](https://example.com)

%%
nota
em várias linhas
%%
`

const links = new Map([
  ['reinos/safra', { href: '/reinos/safra', title: 'Safra' }],
  ['locais/inexistente', null],
])

describe('renderMarkdown', () => {
  it('remove blocos acima do nível de spoiler do visitante', () => {
    const level0 = renderMarkdown(source, { spoiler: 0, links })
    expect(level0.html).not.toContain('Os outros cinco reinos')
    expect(level0.html).not.toContain('Revelação avançada')
    expect(level0.hiddenCount).toBe(2)

    const level1 = renderMarkdown(source, { spoiler: 1, links })
    expect(level1.html).toContain('Os outros cinco reinos')
    expect(level1.html).not.toContain('Revelação avançada')
    expect(level1.hiddenCount).toBe(1)

    const level2 = renderMarkdown(source, { spoiler: 2, links })
    expect(level2.html).toContain('Revelação avançada')
    expect(level2.hiddenCount).toBe(0)
  })

  it('nunca expõe notas privadas no site público', () => {
    const { html } = renderMarkdown(source, { spoiler: 2, links })
    expect(html).not.toContain('nota secreta')
    expect(html).not.toContain('em várias linhas')
  })

  it('mostra notas privadas e todos os spoilers na pré-visualização', () => {
    const { html } = renderMarkdown(source, { spoiler: 0, preview: true, links })
    expect(html).toContain('private-note')
    expect(html).toContain('nota secreta')
    expect(html).toContain('Revelação avançada')
  })

  it('escapa HTML bruto e bloqueia URLs perigosas', () => {
    const { html } = renderMarkdown(source, { spoiler: 0, links })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="https://example.com"')
  })

  it('resolve referências internas e transforma as inexistentes em texto', () => {
    const { html } = renderMarkdown(source, { spoiler: 0, links })
    expect(html).toContain('<a class="wiki-link" href="/reinos/safra">Safra</a>')
    expect(html).toContain('<span class="wiki-text">inexistente</span>')
  })

  it('gera ids de títulos e aplica deslocamento de nível', () => {
    const { html, headings } = renderMarkdown(source, { spoiler: 0, headingOffset: 1 })
    expect(html).toContain('<h3 id="titulo-b-x-b">')
    expect(headings[0]).toEqual({ id: 'titulo-b-x-b', text: 'Título <b>x</b>', depth: 3 })
  })
})

describe('utilitários de texto', () => {
  it('coleta alvos de referências internas, ignorando notas privadas', () => {
    expect(collectWikiTargets('[[Reinos/Safra|S]] %%[[segredo/x]]%% [[atlas]]')).toEqual(['reinos/safra', 'atlas'])
  })

  it('gera texto simples sem spoilers nem notas', () => {
    const text = toPlainText(source)
    expect(text).not.toContain('cinco reinos')
    expect(text).not.toContain('nota secreta')
    expect(text).toContain('Safra')
  })

  it('detecta conteúdo visível', () => {
    expect(hasContent('  %%só nota%% ')).toBe(false)
    expect(hasContent('texto')).toBe(true)
    expect(hasContent('')).toBe(false)
  })
})
