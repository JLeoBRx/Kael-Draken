import type { Metadata } from 'next'
import Link from 'next/link'
import { CanonBadge, SpoilerBadge } from '@/components/ui/editorial'
import { EmptyState } from '@/components/ui/entry'
import { MediaImage } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { ART } from '@/lib/atlas/art'
import { getDocument, listMysteries } from '@/lib/content/queries'
import { getSettings } from '@/lib/content/settings'
import { getViewer } from '@/lib/content/viewer'
import { paths } from '@/lib/routes'

export const metadata: Metadata = {
  title: 'Mistérios',
  description: 'As grandes perguntas ainda em aberto no universo de Kael Draken: a Chama, Safra, o Caos, o Século Perdido, o Templo e Skrugheim.',
  alternates: { canonical: '/misterios' },
}

const PROPHECY_SLUG = 'quando-a-chama-despertar'

export default async function MysteriesPage() {
  const viewer = await getViewer()
  const [mysteries, prophecy, settings] = await Promise.all([listMysteries(viewer), getDocument(PROPHECY_SLUG, viewer), getSettings()])
  const prophecyLines = prophecy && prophecy.document.spoiler <= viewer.spoiler ? prophecy.document.transcription.split('\n').filter(Boolean) : settings.home_quote ? [settings.home_quote] : []

  return (
    <>
      <PageHero
        eyebrow="Perguntas em aberto"
        title="Mistérios"
        lede="Lacunas intencionais da história. Nenhuma delas é respondida neste arquivo: as perguntas permanecem abertas até que a própria narrativa as resolva."
        crumbs={[{ label: 'Mistérios' }]}
      />

      {prophecyLines.length ? (
        <section className="prophecy" aria-labelledby="profecia-titulo">
          <div className="prophecy__art">
            <MediaImage image={ART.selo.skrugheim} sizes="100vw" />
          </div>
          <div className="container prophecy__inner">
            <p className="eyebrow" id="profecia-titulo">
              A profecia
            </p>
            <blockquote className="prophecy__quote">
              {prophecyLines.map((line) => (
                <span key={line}>{line} </span>
              ))}
            </blockquote>
            <p className="prophecy__note">
              O que é Skrugheim permanece desconhecido.{' '}
              {prophecy ? (
                <Link className="text-link" href={paths.document(PROPHECY_SLUG)}>
                  Ver o documento no arquivo →
                </Link>
              ) : null}
            </p>
          </div>
        </section>
      ) : null}

      <section className="section" aria-labelledby="perguntas-titulo">
        <div className="container">
          <header className="section-head">
            <h2 id="perguntas-titulo">As perguntas</h2>
            <p className="section-head__lede">Cada mistério leva ao verbete em que ele aparece. Alguns só são exibidos a partir de determinado nível de spoiler.</p>
          </header>
          {mysteries.length ? (
            <ol className="mystery-grid">
              {mysteries.map((m, i) => (
                <li key={m.id}>
                  <Link className="mystery-card" href={m.relatedHref || paths.mysteries}>
                    <span className="mystery-card__num">{String(i + 1).padStart(2, '0')}</span>
                    <span className="mystery-card__title">{m.title}</span>
                    <span className="mystery-card__desc">{m.description}</span>
                    <span className="badges">
                      <CanonBadge canon={m.canon} />
                      <SpoilerBadge level={m.spoiler} />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="Nenhum mistério publicado" />
          )}
        </div>
      </section>
    </>
  )
}
