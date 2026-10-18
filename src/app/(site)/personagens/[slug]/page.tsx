import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CertaintyBadge, EditorialBadges, SpoilerBadge } from '@/components/ui/editorial'
import { EntrySection, Facts, Gallery, HiddenNotice, PendingSections, RelatedList, SpoilerGate, TagList, Toc } from '@/components/ui/entry'
import { Figure, ImageSlot, MediaImage } from '@/components/ui/media'
import { PageHero } from '@/components/ui/PageHero'
import { artImage } from '@/lib/atlas/art'
import { resolveArt } from '@/lib/atlas/resolve'
import { getCharacter, getTermLabels } from '@/lib/content/queries'
import { prepareRichText } from '@/lib/content/rich'
import { getViewer } from '@/lib/content/viewer'
import { isLocked } from '@/lib/content/visibility'
import { entryMetadata, lockedMetadata } from '@/lib/metadata'
import { paths } from '@/lib/routes'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getCharacter(slug, viewer)
  if (!data) return {}
  if (isLocked(data.character, viewer)) return lockedMetadata
  return entryMetadata({ title: data.character.name, description: data.character.summary, path: paths.character(slug), image: data.portrait })
}

export default async function CharacterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const viewer = await getViewer()
  const data = await getCharacter(slug, viewer)
  if (!data) notFound()
  const { character: c } = data
  if (isLocked(c, viewer)) return <SpoilerGate level={c.spoiler} />

  const [roles, relationKinds] = await Promise.all([getTermLabels('character_role'), getTermLabels('relation_kind')])
  const render = await prepareRichText(viewer, [c.personality, c.history, c.family, c.abilities, c.storyRole, c.secrets, ...data.relations.map((r) => r.description)])
  const illustration = await resolveArt(artImage('character', c.slug), viewer)

  const sections = [
    { id: 'personalidade', title: 'Personalidade', source: c.personality },
    { id: 'historia', title: 'História', source: c.history },
    { id: 'familia', title: 'Relações familiares', source: c.family },
    { id: 'capacidades', title: 'Capacidades e conhecimentos', source: c.abilities },
    { id: 'participacao', title: 'Participação na história', source: c.storyRole },
  ].map((s) => ({ ...s, result: render(s.source, { headingOffset: 1, idPrefix: `${s.id}-` }) }))
  // A seção de segredos inteira exige ao menos "revelações iniciais"; blocos internos podem exigir mais.
  const hasSecrets = !!c.secrets.trim()
  const secretsVisible = viewer.preview || viewer.spoiler >= 1
  const secrets = hasSecrets && secretsVisible ? render(c.secrets, { headingOffset: 1, idPrefix: 'segredos-' }) : null
  const hidden = sections.reduce((n, s) => n + s.result.hiddenCount, 0) + (hasSecrets ? (secrets ? secrets.hiddenCount : 1) : 0)

  const filled = sections.filter((s) => s.result.html.trim())
  const pending = sections.filter((s) => !s.result.html.trim()).map((s) => s.title)
  if (!data.relations.length) pending.push('Amizades, rivalidades e relacionamentos')
  if (!data.chapters.length) pending.push('Aparições em capítulos')

  const tocItems = [
    ...filled.map((s) => ({ id: s.id, title: s.title })),
    ...(data.relations.length ? [{ id: 'relacoes', title: 'Relações' }] : []),
    ...(data.chapters.length ? [{ id: 'capitulos', title: 'Aparições em capítulos' }] : []),
    ...(hasSecrets ? [{ id: 'segredos', title: 'Segredos e revelações' }] : []),
  ]

  return (
    <article>
      <PageHero glyph="personagens" eyebrow="Personagem" title={c.name} subtitle={c.titles || undefined} crumbs={[{ label: 'Personagens', href: paths.characters }, { label: c.name }]}>
        <EditorialBadges canon={c.canon} spoiler={c.spoiler} status={c.status} preview={viewer.preview} />
      </PageHero>

      <div className="container entry-layout">
        <aside className="entry-aside">
          <div className="infobox">
            <div className="infobox__media">
              {data.portrait ? (
                <MediaImage image={data.portrait} sizes="300px" alt={data.portrait.alt || `Retrato de ${c.name}`} />
              ) : (
                <ImageSlot kind="portrait" ratio="3 / 4" label="Retrato ainda não definido" />
              )}
            </div>
            <div className="infobox__body">
              <Facts
                items={[
                  { label: 'Idade', value: c.age || <span className="muted">Não informada</span> },
                  { label: 'Papel narrativo', value: roles.get(c.role) ?? (c.role || null) },
                  { label: 'Origem', value: data.origin ? <Link href={paths.location(data.origin.slug)}>{data.origin.name}</Link> : <span className="muted">Não documentada</span> },
                  { label: 'Reino', value: data.kingdom ? <Link href={paths.kingdom(data.kingdom.slug)}>{data.kingdom.name}</Link> : null },
                ]}
              />
              <TagList tags={data.tags} />
            </div>
          </div>
          <Toc items={tocItems} />
        </aside>

        <div className="entry-main">
          {c.summary ? <p className="prose prose--lead">{c.summary}</p> : null}
          <HiddenNotice count={hidden} level={viewer.spoiler} />
          {illustration ? <Figure image={illustration} priority /> : null}

          {filled.map((s) => (
            <EntrySection key={s.id} id={s.id} title={s.title} result={s.result} />
          ))}

          {data.relations.length ? (
            <EntrySection id="relacoes" title="Amizades, rivalidades e relacionamentos">
              <ul className="related-list">
                {data.relations.map((r) => {
                  const desc = render(r.description)
                  return (
                    <li key={r.id}>
                      <Link href={paths.character(r.related.slug)}>
                        <span className="related-list__title">{r.related.name}</span>
                        <span className="related-list__meta">
                          {relationKinds.get(r.kind) ?? r.kind}
                          {r.spoiler ? (
                            <>
                              {' '}
                              <SpoilerBadge level={r.spoiler} />
                            </>
                          ) : null}
                        </span>
                        {desc.html ? <span className="related-list__meta" dangerouslySetInnerHTML={{ __html: desc.html }} /> : null}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </EntrySection>
          ) : null}

          {data.chapters.length ? (
            <EntrySection id="capitulos" title="Aparições em capítulos">
              <ul className="chapter-list">
                {data.chapters.map((ch) => (
                  <li key={`${ch.bookSlug}-${ch.number}`}>
                    <Link href={paths.chapter(ch.bookSlug, ch.number)}>
                      <span className="chapter-list__num">{ch.number}</span>
                      <span>
                        <span className="chapter-list__title">{ch.title}</span>
                        <span className="related-list__meta" style={{ display: 'block' }}>
                          {ch.bookTitle}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </EntrySection>
          ) : null}

          {hasSecrets ? (
            <section className="entry-section" id="segredos" aria-labelledby="segredos-titulo">
              <h2 className="entry-section__title" id="segredos-titulo">
                Segredos e revelações
                <small>restritos por nível de spoiler</small>
              </h2>
              {secrets ? (
                <div className="prose" dangerouslySetInnerHTML={{ __html: secrets.html }} />
              ) : (
                <p className="spoiler-hidden" role="note">
                  <span className="spoiler-hidden__label">Seção oculta</span> Os segredos deste personagem aparecem a partir do nível “Revelações iniciais”.
                </p>
              )}
            </section>
          ) : null}

          <PendingSections titles={pending} />

          {data.locations.length || data.events.length || data.documents.length ? (
            <section className="entry-section" id="relacionados" aria-labelledby="relacionados-titulo">
              <h2 className="entry-section__title" id="relacionados-titulo">
                Referências cruzadas
              </h2>
              <div className="related-grid">
                <RelatedList title="Lugares" items={data.locations.map((l) => ({ title: l.name, href: paths.location(l.slug), meta: l.summary }))} />
                <RelatedList
                  title="Na cronologia"
                  items={data.events.map((e) => ({ title: e.title, href: paths.event(e.slug), meta: <CertaintyBadge certainty={e.certainty} /> }))}
                />
                <RelatedList title="Documentos" items={data.documents.map((d) => ({ title: d.title, href: paths.document(d.slug), meta: d.excerpt }))} />
              </div>
            </section>
          ) : null}

          <Gallery images={data.gallery} />
        </div>
      </div>
    </article>
  )
}
