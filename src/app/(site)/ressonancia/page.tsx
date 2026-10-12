import type { Metadata } from 'next'
import Link from 'next/link'
import { parseFaceNames, ResonanceDiagram } from '@/components/content/ResonanceDiagram'
import { CanonBadge } from '@/components/ui/editorial'
import { Figure } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { ART } from '@/lib/atlas/art'
import { listArticles } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { paths } from '@/lib/routes'

export const metadata: Metadata = {
  title: 'Sistema da Ressonância',
  description: 'O sistema mágico do universo de Kael Draken: a natureza da Chama, a Ressonância, o Lume, o Lastro, o Eco e as seis faces propostas.',
  alternates: { canonical: '/ressonancia' },
}

const GROUPS: Array<{ key: string; title: string; lede: string }> = [
  { key: 'fundamentos', title: 'Fundamentos', lede: 'A origem do poder e o nome do sistema.' },
  { key: 'pratica', title: 'Manifestação, custo e sociedade', lede: 'Como, a que preço e com que consequências o poder se manifesta.' },
]

export default async function ResonancePage() {
  const viewer = await getViewer()
  const articles = await listArticles('ressonancia', viewer)
  const concepts = articles.filter((a) => a.group === 'conceitos')
  const facesArticle = articles.find((a) => a.slug === 'as-seis-faces')
  const faceArticles = articles.filter((a) => a.group === 'faces' && a.slug !== 'as-seis-faces')
  const faceNames = faceArticles.length ? faceArticles.map((a) => ({ name: a.title, href: paths.article('ressonancia', a.slug) })) : parseFaceNames(facesArticle?.body ?? '').map((name) => ({ name }))

  return (
    <>
      <PageHero
        eyebrow="Sistema mágico"
        title="A Ressonância"
        lede="O sistema que descreve o poder neste mundo. O que está estabelecido aparece marcado como tal; nomes e definições ainda em proposta são identificados em cada verbete."
        crumbs={[{ label: 'Ressonância' }]}
        className="resonance-hero"
      />

      <section className="section" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="container">
          <Figure image={ART.selo.ressonancia} priority />
        </div>
      </section>

      {GROUPS.map((group) => {
        const items = articles.filter((a) => a.group === group.key)
        if (!items.length) return null
        return (
          <section key={group.key} className="section" style={{ paddingTop: 0 }} aria-labelledby={`grupo-${group.key}`}>
            <div className="container">
              <header className="section-head">
                <h2 id={`grupo-${group.key}`}>{group.title}</h2>
                <p className="section-head__lede">{group.lede}</p>
              </header>
              <ul className="entry-list">
                {items.map((a) => (
                  <li key={a.id}>
                    <Link className="entry-row" href={paths.article('ressonancia', a.slug)}>
                      <span className="entry-row__kicker">{group.title}</span>
                      <span>
                        <span className="entry-row__title">{a.title}</span>
                        <span className="entry-row__summary">{a.summary}</span>
                      </span>
                      <span className="badges">
                        <CanonBadge canon={a.canon} short />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )
      })}

      {concepts.length ? (
        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="conceitos-titulo">
          <div className="container">
            <header className="section-head">
              <h2 id="conceitos-titulo">Conceitos fundamentais propostos</h2>
              <p className="section-head__lede">Três termos do sistema cujas definições ainda estão em desenvolvimento.</p>
            </header>
            <div className="concept-row">
              {concepts.map((a) => (
                <Link key={a.id} className="concept" href={paths.article('ressonancia', a.slug)}>
                  <span className="concept__name">{a.title}</span>
                  <p>{a.summary}</p>
                  <span className="badges">
                    <CanonBadge canon={a.canon} short />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {faceNames.length ? (
        <section className="section" style={{ paddingTop: 0 }} aria-labelledby="faces-titulo">
          <div className="container">
            <header className="section-head">
              <h2 id="faces-titulo">As seis faces</h2>
              <p className="section-head__lede">{facesArticle?.summary}</p>
              {facesArticle ? (
                <div className="badges">
                  <CanonBadge canon={facesArticle.canon} />
                </div>
              ) : null}
            </header>
            <ResonanceDiagram faces={faceNames} href={paths.article('ressonancia', 'as-seis-faces')} />
          </div>
        </section>
      ) : null}
    </>
  )
}
