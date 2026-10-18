import type { Metadata } from 'next'
import Link from 'next/link'
import { CanonBadge } from '@/components/ui/editorial'
import { PageHero } from '@/components/ui/PageHero'
import { CANON_INFO, CANON_STATES, SPOILER_INFO, SPOILER_LEVELS } from '@/lib/editorial'

export const metadata: Metadata = {
  title: 'Sobre o arquivo',
  description: 'Como funciona o Arquivo da Chama Antiga: estados editoriais, níveis de spoiler e a natureza das ilustrações.',
  alternates: { canonical: '/sobre' },
}

const LEGACY: Record<string, string> = {
  canonico: 'canônico',
  provisorio: 'provisório',
  em_desenvolvimento: 'em desenvolvimento',
  desconhecido: 'mistério',
  arquivado: 'arquivado',
}

export default function AboutPage() {
  return (
    <>
      <PageHero glyph="arquivo"
        eyebrow="O projeto"
        title="Sobre o arquivo"
        lede="O Arquivo da Chama Antiga é a enciclopédia oficial e o diário de desenvolvimento do universo de Kael Draken — O Sussurro da Chama Antiga. Ele cresce junto com a escrita da saga."
        crumbs={[{ label: 'Sobre' }]}
      />
      <div className="container container--narrow" style={{ paddingBlock: 'var(--space-7) var(--space-8)', display: 'grid', gap: 'var(--space-8)' }}>
        <section id="estados-editoriais" aria-labelledby="estados-titulo" style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <h2 id="estados-titulo">Estados editoriais</h2>
          <p className="prose">
            O universo está em construção. Por isso, nenhum verbete é tratado automaticamente como fato definitivo: cada um indica o seu estado. Mistérios continuam mistérios até
            serem resolvidos na própria narrativa.
          </p>
          <dl className="legend-table">
            {CANON_STATES.map((c) => (
              <div key={c}>
                <dt>
                  <CanonBadge canon={c} />
                </dt>
                <dd>
                  {CANON_INFO[c].description} <span style={{ color: 'var(--text-faint)' }}>(no painel: {LEGACY[c]})</span>
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="niveis-de-spoiler" aria-labelledby="spoiler-titulo" style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <h2 id="spoiler-titulo">Níveis de spoiler</h2>
          <p className="prose">
            Use o seletor no topo de qualquer página. Trechos acima do nível escolhido são removidos no servidor, antes de a página chegar ao seu navegador. Por padrão, o arquivo não
            revela nada além do que se pode saber antes de abrir o livro.
          </p>
          <dl className="legend-table">
            {SPOILER_LEVELS.map((level) => (
              <div key={level}>
                <dt>{SPOILER_INFO[level].label}</dt>
                <dd>{SPOILER_INFO[level].description}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="ilustracoes" aria-labelledby="ilustracoes-titulo" style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <h2 id="ilustracoes-titulo">Sobre as ilustrações e os mapas</h2>
          <div className="prose">
            <p>
              A capa oficial, as ilustrações dos capítulos e a carta do Atlas dos Seis Reinos vêm da <strong>edição ilustrada do manuscrito</strong>. Na carta, nomes, capitais e
              fronteiras continuam sendo propostas: podem mudar à medida que a saga é escrita. O relevo do modo 3D é uma interpretação dessa carta.
            </p>
            <p>
              Os panoramas dos reinos, os brasões e as cenas da mitologia foram produzidos por código, a partir de ruído procedural, geometria e desenho vetorial. São{' '}
              <strong>conceitos artísticos</strong>: a arquitetura, as paisagens e os brasões dos cinco reinos conhecidos são propostas visuais, não fatos confirmados.
            </p>
          </div>
        </section>

        <section aria-labelledby="explorar-titulo" style={{ display: 'grid', gap: 'var(--space-4)' }}>
          <h2 id="explorar-titulo">Por onde começar</h2>
          <ul className="inline-links">
            <li><Link href="/atlas">Atlas dos Seis Reinos</Link></li>
            <li><Link href="/mitologia">Mitologia</Link></li>
            <li><Link href="/misterios">Mistérios</Link></li>
            <li><Link href="/personagens/kael-draken">Kael Draken</Link></li>
          </ul>
        </section>
      </div>
    </>
  )
}
