import type { Metadata } from 'next'
import Link from 'next/link'
import { CanonBadge, SpoilerBadge } from '@/components/ui/editorial'
import { MediaImage } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { ART } from '@/lib/atlas/art'
import { listArticles, listMysteries } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { paths } from '@/lib/routes'

export const metadata: Metadata = {
  title: 'Mitologia e história antiga',
  description: 'A história do universo de Kael Draken desde a criação: o Vazio, a Chama do Dragão, os seis reinos, a Noite das Cinzas, o Século Perdido e a ascensão do Caos.',
  alternates: { canonical: '/mitologia' },
}

export default async function MythologyPage() {
  const viewer = await getViewer()
  const [articles, mysteries] = await Promise.all([listArticles('mitologia', viewer), listMysteries(viewer)])

  return (
    <>
      <PageHero
        eyebrow="Crônica"
        title="Mitologia e história antiga"
        lede="A história do mundo contada como um livro de crônicas, da criação ao presente. Cada capítulo traz o seu estado editorial: o que está estabelecido, o que é proposta e o que permanece desconhecido — também para quem vive neste mundo."
        crumbs={[{ label: 'Mitologia' }]}
      />

      <section className="section" style={{ paddingTop: 'var(--space-7)' }} aria-labelledby="fundamentos-titulo">
        <div className="container">
          <header className="section-head">
            <p className="eyebrow">Os fundamentos</p>
            <h2 id="fundamentos-titulo">A Chama e o Caos</h2>
            <p className="section-head__lede">
              A Chama do Dragão criou o mundo. Com a criação surgiu o Caos, a princípio contido pela Chama. Quando a Chama desapareceu, durante a catástrofe que destruiu Safra, o
              equilíbrio se rompeu — e o Caos pôde se tornar uma ameaça.
            </p>
          </header>
          <div className="diptych">
            <Link className="diptych__item" href={paths.article('mitologia', 'a-chama-do-dragao')}>
              <MediaImage image={ART.selo.chama} sizes="(min-width: 900px) 50vw, 100vw" />
              <span className="diptych__caption">
                <span className="eyebrow">Criação</span>
                <span className="diptych__title">A Chama do Dragão</span>
              </span>
            </Link>
            <Link className="diptych__item" href={paths.article('mitologia', 'a-ascensao-do-caos')}>
              <MediaImage image={ART.selo.caos} sizes="(min-width: 900px) 50vw, 100vw" />
              <span className="diptych__caption">
                <span className="eyebrow">O que nasceu junto</span>
                <span className="diptych__title">O Caos</span>
              </span>
            </Link>
          </div>
          <p className="art-note">Selos simbólicos do Arquivo — não representam a aparência da Chama nem a do Caos, cuja natureza integral não é revelada neste arquivo.</p>
        </div>
      </section>

      <section className="section" style={{ paddingTop: 0 }} aria-labelledby="cronica-titulo">
        <div className="container container--narrow">
          <header className="section-head">
            <p className="eyebrow">Índice</p>
            <h2 id="cronica-titulo">Capítulos da crônica</h2>
          </header>
          <ol className="chronicle-toc">
            {articles.map((a) => (
              <li key={a.id}>
                <Link href={paths.article('mitologia', a.slug)}>
                  <span className="chronicle-toc__title">{a.title}</span>
                  <span className="chronicle-toc__sub">{a.subtitle ? `${a.subtitle}. ` : ''}{a.summary}</span>
                  <span className="badges">
                    <CanonBadge canon={a.canon} short />
                    <SpoilerBadge level={a.spoiler} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {mysteries.length ? (
        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="misterios-titulo" id="misterios">
          <div className="container container--narrow">
            <header className="section-head">
              <p className="eyebrow">Perguntas em aberto</p>
              <h2 id="misterios-titulo">Mistérios preservados</h2>
              <p className="section-head__lede">Lacunas intencionais da história. Elas permanecem mistérios até que sejam resolvidas na própria narrativa.</p>
            </header>
            <ul className="mystery-list">
              {mysteries.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <Link href={m.relatedHref || paths.mysteries}>
                    <span className="mystery-list__mark" aria-hidden="true">?</span>
                    <span>
                      <span className="mystery-list__title">{m.title}</span>
                      <span className="mystery-list__desc">{m.description}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p style={{ marginTop: 'var(--space-5)' }}>
              <Link className="text-link" href={paths.mysteries}>
                Ver todos os mistérios →
              </Link>
            </p>
          </div>
        </section>
      ) : null}
    </>
  )
}
