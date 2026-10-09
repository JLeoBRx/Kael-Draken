import type { Metadata } from 'next'
import Link from 'next/link'
import { CanonBadge, CertaintyBadge, CertaintyMark, SpoilerBadge } from '@/components/ui/editorial'
import { HashOpener } from '@/components/site/HashOpener'
import { PageHero } from '@/components/ui/PageHero'
import { Prose } from '@/components/ui/Prose'
import { getTermLabels, getTimeline } from '@/lib/content/queries'
import { prepareRichText } from '@/lib/content/rich'
import { getViewer } from '@/lib/content/viewer'
import { CERTAINTY_INFO, CERTAINTY_STATES } from '@/lib/editorial'

export const metadata: Metadata = {
  title: 'Cronologia',
  description: 'Linha do tempo do universo de Kael Draken: eras, períodos e acontecimentos, com o grau de certeza de cada data.',
  alternates: { canonical: '/cronologia' },
}

type TimelineEvent = Awaited<ReturnType<typeof getTimeline>>['undated'][number]

function EventItem({ event, render, types }: { event: TimelineEvent; render: Awaited<ReturnType<typeof prepareRichText>>; types: Map<string, string> }) {
  const body = render(event.body, { headingOffset: 2, idPrefix: `ev-${event.slug}-` })
  return (
    <li className="event" id={`evento-${event.slug}`}>
      <CertaintyMark certainty={event.certainty} />
      <details className="event__details">
        <summary className="event__summary">
          <span className="event__summary-top">
            <span className="event__date">{event.dateLabel || 'Data não estabelecida'}</span>
            <span className="badges">
              <CertaintyBadge certainty={event.certainty} />
              <SpoilerBadge level={event.spoiler} />
            </span>
          </span>
          <span className="event__title">{event.title}</span>
          {event.summary ? <span className="event__lede">{event.summary}</span> : null}
          <span className="event__toggle">
            <span className="event__toggle-open">Abrir detalhes</span>
            <span className="event__toggle-close">Fechar detalhes</span>
          </span>
        </summary>
        <div className="event__body">
          {body.html.trim() ? <Prose result={body} /> : <p className="timeline-empty">Sem detalhes adicionais documentados.</p>}
          <div className="badges">
            <CanonBadge canon={event.canon} />
            {event.eventType && types.get(event.eventType) ? <span className="badge badge--plain">{types.get(event.eventType)}</span> : null}
          </div>
          {event.related.length ? (
            <ul className="inline-links" aria-label="Relacionados">
              {event.related.map((r) => (
                <li key={r.href}>
                  <Link href={r.href}>{r.title}</Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </details>
    </li>
  )
}

export default async function TimelinePage() {
  const viewer = await getViewer()
  const [timeline, types] = await Promise.all([getTimeline(viewer), getTermLabels('event_type')])
  const allEvents = [...timeline.eras.flatMap((e) => e.events), ...timeline.undated]
  const render = await prepareRichText(viewer, allEvents.map((e) => e.body))

  return (
    <>
      <PageHero
        eyebrow="Linha do tempo"
        title="Cronologia"
        lede="Eras, períodos e acontecimentos do mundo. Nenhuma data exata é atribuída antes de ser estabelecida: cada acontecimento traz o seu grau de certeza."
        crumbs={[{ label: 'Cronologia' }]}
      />
      <HashOpener />
      <div className="container timeline-layout">
        <aside>
          <nav className="era-nav" aria-label="Períodos">
            <h2>Períodos</h2>
            <ol>
              {timeline.eras.map((era) => (
                <li key={era.id}>
                  <a href={`#era-${era.slug}`}>{era.name}</a>
                </li>
              ))}
              {timeline.undated.length ? (
                <li>
                  <a href="#sem-periodo">Sem período definido</a>
                </li>
              ) : null}
            </ol>
          </nav>
          <section className="legend" aria-labelledby="legenda-titulo">
            <h2 id="legenda-titulo">Grau de certeza</h2>
            <ul>
              {CERTAINTY_STATES.map((c) => (
                <li key={c}>
                  <CertaintyMark certainty={c} />
                  <span>
                    <strong>{CERTAINTY_INFO[c].label}</strong>
                    {CERTAINTY_INFO[c].description}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </aside>

        <div className="timeline">
          <p className="notice" role="note">
            <span>
              <strong>Sequência provisória.</strong> A ordem dos períodos segue a bíblia narrativa; intervalos e datas exatas ainda não foram estabelecidos, e os nomes de alguns
              períodos são apenas organizacionais.
            </span>
          </p>
          {timeline.eras.map((era) => (
            <section key={era.id} className="era" id={`era-${era.slug}`} aria-labelledby={`era-${era.slug}-titulo`}>
              <header className="era__head">
                <p className="era__date">{era.dateLabel || 'Período não datado'}</p>
                <h2 id={`era-${era.slug}-titulo`}>{era.name}</h2>
                {era.summary ? <p>{era.summary}</p> : null}
                <div className="badges">
                  <CanonBadge canon={era.canon} />
                </div>
              </header>
              {era.events.length ? (
                <ol className="events">
                  {era.events.map((event) => (
                    <EventItem key={event.id} event={event} render={render} types={types} />
                  ))}
                </ol>
              ) : (
                <p className="timeline-empty">Nenhum acontecimento documentado neste período até o momento.</p>
              )}
            </section>
          ))}
          {timeline.undated.length ? (
            <section className="era" id="sem-periodo" aria-labelledby="sem-periodo-titulo">
              <header className="era__head">
                <p className="era__date">Datação indefinida</p>
                <h2 id="sem-periodo-titulo">Sem período definido</h2>
                <p>Acontecimentos cuja posição na linha do tempo ainda não foi estabelecida.</p>
              </header>
              <ol className="events">
                {timeline.undated.map((event) => (
                  <EventItem key={event.id} event={event} render={render} types={types} />
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      </div>
    </>
  )
}
