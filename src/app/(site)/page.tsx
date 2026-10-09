import Link from 'next/link'
import { PortolanTexture } from '@/components/atlas/Cartography'
import { WorldPreview } from '@/components/atlas/WorldPreview'
import Image from 'next/image'
import { ART } from '@/lib/atlas/art'
import { getAtlasRegions } from '@/lib/atlas/regions'
import { CanonBadge, Reliability } from '@/components/ui/editorial'
import { ArrowRight } from '@/components/ui/icons'
import { BookCover, MediaImage } from '@/components/ui/media'
import { getOfficialCover } from '@/lib/content/media'
import { getRecentEntries, getSectionCounts, getTermLabels, listArticles, listBooks, listDocuments, listKingdoms, listPosts } from '@/lib/content/queries'
import { getSettings } from '@/lib/content/settings'
import { getViewer } from '@/lib/content/viewer'
import { ENTITY_LABELS } from '@/lib/editorial'
import { formatShortDate, plural, toRoman } from '@/lib/format'
import { paths } from '@/lib/routes'
import type { CSSProperties } from 'react'

export default async function HomePage() {
  const viewer = await getViewer()
  const settings = await getSettings()
  const [cover, kingdoms, regions, posts, recent, documents, counts, mythology, resonance, books, docTypes, postCategories] = await Promise.all([
    getOfficialCover(settings.cover_media_id, 'Capa oficial de Kael Draken — O Sussurro da Chama Antiga'),
    listKingdoms(viewer),
    getAtlasRegions(viewer),
    listPosts(viewer, { limit: 3 }),
    getRecentEntries(viewer, 6),
    listDocuments(viewer),
    getSectionCounts(viewer),
    listArticles('mitologia', viewer),
    listArticles('ressonancia', viewer),
    listBooks(viewer),
    getTermLabels('document_type'),
    getTermLabels('post_category'),
  ])
  const book = books[0]
  const bookHref = book ? paths.book(book.slug) : paths.books

  return (
    <>
      <section className="hero" aria-labelledby="titulo-principal">
        <div className="hero__art" aria-hidden="true">
          <Image src={ART.capa.src} alt="" width={ART.capa.width} height={ART.capa.height} priority sizes="(min-width: 960px) 50vw, 100vw" />
        </div>
        <div className="hero__bg">
          <PortolanTexture />
        </div>
        <div className="container hero__grid">
          <div className="hero__text reveal">
            <p className="eyebrow">Saga Kael Draken · Livro I</p>
            <h1 className="hero__title" id="titulo-principal">
              <span className="hero__name">Kael Draken</span>
              <span className="hero__subtitle">— O Sussurro da Chama Antiga</span>
            </h1>
            {settings.home_intro ? <p className="hero__intro">{settings.home_intro}</p> : null}
            <div className="hero__actions">
              <Link className="btn btn--primary" href={paths.atlas}>
                Explorar o Atlas dos Seis Reinos <ArrowRight className="btn__arrow" />
              </Link>
              <Link className="btn" href={bookHref}>
                Conhecer o Livro I
              </Link>
            </div>
          </div>
          <div className="hero__cover reveal reveal--delay">
            <BookCover cover={cover} title="Kael Draken — O Sussurro da Chama Antiga" priority />
          </div>
        </div>
      </section>

      {settings.home_quote ? (
        <section className="quote-band" aria-label="Fragmento">
          <figure className="container">
            <blockquote>
              <p>“{settings.home_quote}”</p>
            </blockquote>
            <figcaption>
              {settings.home_quote_source ? <cite>{settings.home_quote_source}</cite> : null}
              {settings.home_quote_href ? (
                <>
                  {' · '}
                  <Link className="text-link" href={settings.home_quote_href}>
                    ver no arquivo
                  </Link>
                </>
              ) : null}
            </figcaption>
          </figure>
        </section>
      ) : null}

      <section className="section" aria-labelledby="atlas-titulo">
        <div className="container">
          <header className="section-head section-head--split">
            <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
              <p className="eyebrow">Atlas</p>
              <h2 id="atlas-titulo">Os Seis Reinos</h2>
              <p className="section-head__lede">
                Seis reinos estabelecidos sobre fragmentos do poder primordial da Chama. Um deles desapareceu. A geografia do mundo ainda está sendo traçada.
              </p>
            </div>
            <Link className="btn btn--gold" href={paths.atlas}>
              Abrir o atlas <ArrowRight className="btn__arrow" />
            </Link>
          </header>
          <div className="home-atlas__grid">
            <WorldPreview regions={regions} href={paths.atlas} />
            <ol className="kingdom-index" aria-label="Reinos">
              {kingdoms.map((k, i) => (
                <li key={k.id}>
                  <Link href={paths.kingdom(k.slug)} style={{ '--k-accent': k.accent } as CSSProperties}>
                    <span className="kingdom-index__num">{toRoman(i + 1)}</span>
                    <span>
                      <span className="kingdom-index__name">{k.name}</span>
                      <span className="kingdom-index__meta">{k.epithet || k.government || 'Em desenvolvimento'}</span>
                    </span>
                    <span className="kingdom-index__accent" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="section section--ruled" aria-labelledby="arquivo-titulo" style={{ paddingTop: 0 }}>
        <div className="container">
          <header className="section-head">
            <p className="eyebrow">O arquivo</p>
            <h2 id="arquivo-titulo">Explore o universo</h2>
          </header>
          <div className="explore__grid">
            <Link className="explore-item" href={paths.characters}>
              <span className="explore-item__num">I</span>
              <h3>Personagens</h3>
              <p>Retratos, origens, relações e segredos — revelados apenas no nível de spoiler que você escolher.</p>
              <span className="explore-item__meta">{plural(counts.characters, 'verbete', 'verbetes')}</span>
            </Link>
            <Link className="explore-item" href={paths.mythology}>
              <span className="explore-item__num">II</span>
              <h3>Mitologia</h3>
              <p>Do Vazio anterior à criação à ascensão do Caos: a história antiga contada como um livro de crônicas.</p>
              <span className="explore-item__meta">{plural(mythology.length, 'capítulo', 'capítulos')}</span>
            </Link>
            <Link className="explore-item" href={paths.timeline}>
              <span className="explore-item__num">III</span>
              <h3>Cronologia</h3>
              <p>Eras e acontecimentos, com o grau de certeza de cada data — confirmada, aproximada, hipotética ou desconhecida.</p>
              <span className="explore-item__meta">{plural(counts.events, 'acontecimento', 'acontecimentos')}</span>
            </Link>
            <Link className="explore-item" href={paths.resonance}>
              <span className="explore-item__num">IV</span>
              <h3>Ressonância</h3>
              <p>O sistema mágico do universo: a Chama, o Lume, o Lastro, o Eco e as seis faces propostas.</p>
              <span className="explore-item__meta">{plural(resonance.length, 'verbete', 'verbetes')}</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="section archive-strip" aria-labelledby="manuscritos-titulo">
        <div className="container archive-strip__grid">
          <header className="section-head">
            <p className="eyebrow">Arquivo</p>
            <h2 id="manuscritos-titulo">Manuscritos, profecias e fragmentos</h2>
            <p className="section-head__lede">Documentos recolhidos entre ruínas e bibliotecas, cada um com sua origem, seu contexto e seu grau de confiabilidade.</p>
            <p>
              <Link className="text-link" href={paths.documents}>
                Abrir o arquivo de manuscritos →
              </Link>
            </p>
          </header>
          {documents.length ? (
            <ul className="doc-shelf">
              {documents.slice(0, 3).map((d) => (
                <li key={d.id}>
                  <Link className="doc-slip parchment" href={paths.document(d.slug)}>
                    <span className="doc-slip__type">{docTypes.get(d.docType) ?? 'Documento'}</span>
                    <span className="doc-slip__title">{d.title}</span>
                    {d.excerpt ? <span className="doc-slip__excerpt">“{d.excerpt}”</span> : null}
                    <span className="doc-slip__meta">
                      <span>Origem: {d.origin || 'desconhecida'}</span>
                      <Reliability value={d.reliability} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="timeline-empty">Nenhum documento publicado ainda.</p>
          )}
        </div>
      </section>

      <section className="section" aria-labelledby="novidades-titulo">
        <div className="container news-home__grid">
          <div>
            <header className="section-head" style={{ marginBottom: 'var(--space-5)' }}>
              <p className="eyebrow">Diário de desenvolvimento</p>
              <h2 id="novidades-titulo">Novidades</h2>
            </header>
            {posts.length ? (
              <ul className="post-list">
                {posts.map((p) => (
                  <li key={p.id} className={`post-item${p.image ? ' post-item--with-image' : ''}`}>
                    {p.image ? (
                      <div className="post-item__image">
                        <MediaImage image={p.image} sizes="180px" />
                      </div>
                    ) : null}
                    <div>
                      <p className="post-item__meta">
                        <time dateTime={p.publishedAt ?? p.createdAt}>{formatShortDate(p.publishedAt ?? p.createdAt)}</time>
                        {p.category ? <span className="post-item__category">{postCategories.get(p.category) ?? p.category}</span> : null}
                      </p>
                      <h3>
                        <Link href={paths.post(p.slug)}>{p.title}</Link>
                      </h3>
                      {p.excerpt ? <p>{p.excerpt}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="timeline-empty">Nenhuma publicação ainda.</p>
            )}
            <p style={{ marginTop: 'var(--space-5)' }}>
              <Link className="text-link" href={paths.news}>
                Todas as novidades →
              </Link>
            </p>
          </div>
          <aside aria-labelledby="recentes-titulo">
            <h3 className="eyebrow" id="recentes-titulo" style={{ marginBottom: 'var(--space-3)' }}>
              Atualizado no arquivo
            </h3>
            <ul className="recent-list">
              {recent.map((r) => (
                <li key={`${r.type}-${r.href}`}>
                  <Link href={r.href}>
                    <span className="recent-list__type">{ENTITY_LABELS[r.type].singular}</span>
                    <span className="recent-list__title">{r.title}</span>
                    <span className="recent-list__date">
                      <CanonBadge canon={r.canon} short />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>
    </>
  )
}
