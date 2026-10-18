import { createHash } from 'node:crypto'
import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { AnnouncementOverlay, EnterArchiveButton } from '@/components/announcement/AnnouncementOverlay'
import { Parchment } from '@/components/announcement/Parchment'
import { PortolanTexture } from '@/components/atlas/Cartography'
import { WorldPreview } from '@/components/atlas/WorldPreview'
import { CanonBadge } from '@/components/ui/editorial'
import { Glyph, type GlyphName } from '@/components/ui/glyphs'
import { ArrowRight } from '@/components/ui/icons'
import { BookCover, MediaImage } from '@/components/ui/media'
import { Fleuron } from '@/components/ui/ornaments'
import { Prose } from '@/components/ui/Prose'
import { ART } from '@/lib/atlas/art'
import { getAtlasRegions } from '@/lib/atlas/regions'
import { listBookIllustrations, toIllustrationItems } from '@/lib/content/illustrations'
import { getOfficialCover } from '@/lib/content/media'
import { getRecentEntries, getSectionCounts, getTermLabels, listArticles, listBooks, listKingdoms, listMysteries, listPosts } from '@/lib/content/queries'
import { prepareRichText } from '@/lib/content/rich'
import { getSettings } from '@/lib/content/settings'
import { getViewer } from '@/lib/content/viewer'
import { ENTITY_LABELS } from '@/lib/editorial'
import { formatShortDate, plural, toRoman } from '@/lib/format'
import { paths } from '@/lib/routes'

/** Fundamentos do universo: capítulos estabelecidos da crônica, mostrados quando publicados. */
const FOUNDATIONS = ['a-chama-do-dragao', 'o-aparecimento-dos-seis-reinos', 'safra-e-a-noite-das-cinzas', 'o-seculo-perdido']

interface IndexEntry {
  glyph: GlyphName
  title: string
  href: string
  text: string
  meta: string
}

export default async function HomePage() {
  const viewer = await getViewer()
  const settings = await getSettings()
  const [cover, kingdoms, regions, posts, recent, counts, mythology, resonance, mysteries, books, postCategories] = await Promise.all([
    getOfficialCover(settings.cover_media_id, 'Capa oficial de Kael Draken — O Sussurro da Chama Antiga'),
    listKingdoms(viewer),
    getAtlasRegions(viewer),
    listPosts(viewer, { limit: 3 }),
    getRecentEntries(viewer, 6),
    getSectionCounts(viewer),
    listArticles('mitologia', viewer),
    listArticles('ressonancia', viewer),
    listMysteries(viewer),
    listBooks(viewer),
    getTermLabels('post_category'),
  ])
  const book = books[0]
  const bookHref = book ? paths.book(book.slug) : paths.books
  const galleryHref = book ? paths.bookIllustrations(book.slug) : paths.books
  // só as artes definitivas: estudos e versões provisórias ficam na galeria, com o seu estado indicado
  const illustrations = book ? toIllustrationItems(await listBookIllustrations(book, viewer)).filter((it) => it.image && it.artState === 'final') : []
  const epigraph = settings.book_epigraph?.trim()
  const foundations = FOUNDATIONS.map((slug) => mythology.find((a) => a.slug === slug)).filter((a): a is NonNullable<typeof a> => !!a)

  // Textos do painel com Markdown (filtrados pelo nível de spoiler do leitor)
  const announcementOn = settings.announcement_enabled !== '0' && !!settings.announcement_title?.trim()
  const render = await prepareRichText(viewer, [settings.announcement_body, book?.synopsis, book?.editorialInfo])
  const announcement = announcementOn ? render(settings.announcement_body ?? '') : null
  const announcementVersion = createHash('sha1')
    .update(`${settings.announcement_kicker}|${settings.announcement_title}|${settings.announcement_body}`)
    .digest('hex')
    .slice(0, 12)
  const synopsis = book ? render(book.synopsis, { headingOffset: 2 }) : null
  const editorialInfo = book ? render(book.editorialInfo, { headingOffset: 2 }) : null

  const index: IndexEntry[] = [
    { glyph: 'reinos', title: 'Reinos', href: `${paths.atlas}#reinos`, text: 'Seis reinos erguidos sobre fragmentos do poder primordial — e um deles desapareceu.', meta: plural(kingdoms.length, 'reino', 'reinos') },
    { glyph: 'personagens', title: 'Personagens', href: paths.characters, text: 'Quem vive, lembra e sonha neste mundo, com segredos guardados pelo seu nível de spoiler.', meta: plural(counts.characters, 'verbete', 'verbetes') },
    { glyph: 'mitologia', title: 'Mitologia', href: paths.mythology, text: 'A história do mundo contada como um livro de crônicas, da criação ao presente.', meta: plural(mythology.length, 'capítulo', 'capítulos') },
    { glyph: 'ressonancia', title: 'Sistema da Ressonância', href: paths.resonance, text: 'O sistema que descreve o poder neste mundo: o que está estabelecido e o que é proposta.', meta: plural(resonance.length, 'verbete', 'verbetes') },
    { glyph: 'cronologia', title: 'Cronologia', href: paths.timeline, text: 'Eras, períodos e acontecimentos, cada um com o seu grau de certeza.', meta: plural(counts.events, 'acontecimento', 'acontecimentos') },
    { glyph: 'locais', title: 'Cidades e locais', href: paths.locations, text: 'Cidades, vilarejos, ruínas, templos e regiões ainda inexploradas.', meta: plural(counts.locations, 'local', 'locais') },
    { glyph: 'manuscritos', title: 'Manuscritos', href: paths.documents, text: 'Documentos recolhidos entre ruínas e bibliotecas — alguns contradizem a história oficial.', meta: plural(counts.documents, 'documento', 'documentos') },
    { glyph: 'misterios', title: 'Mistérios', href: paths.mysteries, text: 'Lacunas intencionais da história, em aberto até que a própria narrativa as resolva.', meta: plural(mysteries.length, 'pergunta em aberto', 'perguntas em aberto') },
  ]

  return (
    <>
      {/* ── Abertura ─────────────────────────────────────────── */}
      <section className="home-hero" aria-labelledby="titulo-principal">
        <div className="home-hero__art" aria-hidden="true">
          <Image src={ART.cenaCapa.src} alt="" width={ART.cenaCapa.width} height={ART.cenaCapa.height} priority quality={90} sizes="(min-width: 960px) 66vw, 100vw" />
        </div>
        <div className="home-hero__texture" aria-hidden="true">
          <PortolanTexture />
        </div>
        <div className="container home-hero__inner">
          <div className="home-hero__text reveal">
            <p className="eyebrow home-hero__kicker">Arquivo da Chama Antiga · Saga Kael Draken</p>
            <h1 className="home-hero__title" id="titulo-principal">
              <span className="visually-hidden">Kael Draken — O Sussurro da Chama Antiga</span>
              <Image className="home-hero__logo" src={ART.logotipo.src} alt="" width={ART.logotipo.width} height={ART.logotipo.height} priority sizes="(min-width: 720px) 520px, 86vw" />
            </h1>
            {epigraph ? (
              <figure className="home-hero__epigraph">
                <Fleuron />
                <blockquote>
                  <p>{epigraph}</p>
                </blockquote>
                <figcaption>Epígrafe do Livro I</figcaption>
              </figure>
            ) : null}
            <div className="home-hero__actions">
              <Link className="btn btn--primary" href={bookHref}>
                Conhecer o Livro <ArrowRight className="btn__arrow" />
              </Link>
              <Link className="btn" href="#universo">
                Explorar o Universo
              </Link>
            </div>
          </div>
        </div>
        <p className="home-hero__credit">Arte da capa oficial do Livro I</p>
      </section>

      {/* ── O universo ───────────────────────────────────────── */}
      <section className="section home-universe" id="universo" aria-labelledby="universo-titulo">
        <div className="container home-universe__grid">
          <div className="home-universe__intro">
            <p className="eyebrow">O universo</p>
            <h2 id="universo-titulo">Um mundo nascido da Chama</h2>
            <Fleuron align="start" />
            {settings.home_intro ? <p className="home-universe__lede">{settings.home_intro}</p> : null}
            <p>
              <Link className="text-link" href={paths.mythology}>
                Ler a crônica do mundo <ArrowRight className="btn__arrow" />
              </Link>
            </p>
          </div>
          {settings.home_quote ? (
            <figure className="home-prophecy">
              <Glyph name="misterios" className="home-prophecy__glyph" />
              <p className="eyebrow eyebrow--ember">A profecia</p>
              <blockquote>
                <p>“{settings.home_quote}”</p>
              </blockquote>
              <figcaption>
                {settings.home_quote_source ? <cite>{settings.home_quote_source}</cite> : null}
                {settings.home_quote_href ? (
                  <Link className="text-link" href={settings.home_quote_href}>
                    ver no arquivo
                  </Link>
                ) : null}
              </figcaption>
            </figure>
          ) : null}
        </div>
        {foundations.length ? (
          <div className="container">
            <ol className="foundations" aria-label="Os fundamentos da história">
              {foundations.map((a, i) => (
                <li key={a.id}>
                  <Link className="foundations__item" href={paths.article('mitologia', a.slug)}>
                    <span className="foundations__num" aria-hidden="true">
                      {toRoman(i + 1)}
                    </span>
                    <span className="foundations__title">{a.title}</span>
                    {a.subtitle ? <span className="foundations__subtitle">{a.subtitle}</span> : null}
                    {a.summary ? <span className="foundations__summary">{a.summary}</span> : null}
                    <span className="foundations__meta">
                      <CanonBadge canon={a.canon} short />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </section>

      {/* ── Atlas ────────────────────────────────────────────── */}
      <section className="section home-atlas" aria-labelledby="atlas-titulo">
        <div className="container">
          <header className="section-head section-head--split">
            <div className="section-head__main">
              <p className="eyebrow">Atlas</p>
              <h2 id="atlas-titulo">Atlas dos Seis Reinos</h2>
              <Fleuron align="start" />
              <p className="section-head__lede">
                Seis reinos estabelecidos sobre fragmentos do poder primordial da Chama. Um deles desapareceu. Explore a carta do manuscrito em duas versões — e erga o
                relevo em três dimensões.
              </p>
            </div>
            <div className="home-atlas__actions">
              <Link className="btn btn--primary" href={paths.atlas}>
                Explorar o Atlas dos Seis Reinos <ArrowRight className="btn__arrow" />
              </Link>
              <Link className="btn" href={`${paths.atlas}#reinos`}>
                Ver os seis reinos
              </Link>
            </div>
          </header>
          <div className="home-atlas__grid">
            <div className="home-atlas__map">
              <WorldPreview regions={regions} href={paths.atlas} />
              <p className="art-note">Carta do manuscrito. Nomes, capitais e fronteiras são conceituais e podem mudar.</p>
            </div>
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

      {/* ── Índice do Arquivo ────────────────────────────────── */}
      <section className="section home-index" id="explorar" aria-labelledby="explorar-titulo">
        <div className="container">
          <header className="section-head section-head--center">
            <p className="eyebrow">Índice do Arquivo</p>
            <h2 id="explorar-titulo">Explore o universo</h2>
            <Fleuron />
            <p className="section-head__lede">
              Cada verbete mostra o que está estabelecido, o que ainda é proposta e o que permanece em aberto — também para quem vive neste mundo.
            </p>
          </header>
          <ol className="archive-index">
            {index.map((entry, i) => (
              <li key={entry.href}>
                <Link className="archive-index__item" href={entry.href}>
                  <span className="archive-index__top">
                    <span className="archive-index__seal">
                      <Glyph name={entry.glyph} />
                    </span>
                    <span className="archive-index__num" aria-hidden="true">
                      {toRoman(i + 1)}
                    </span>
                  </span>
                  <span className="archive-index__title">{entry.title}</span>
                  <span className="archive-index__text">{entry.text}</span>
                  <span className="archive-index__meta">
                    {entry.meta}
                    <ArrowRight className="btn__arrow" />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Livro I ──────────────────────────────────────────── */}
      {book ? (
        <section className="section home-book" id="livro" aria-labelledby="livro-titulo">
          <div className="container home-book__grid">
            <div className="home-book__cover">
              <BookCover cover={cover} title={`Kael Draken — ${book.title}`} />
            </div>
            <div className="home-book__text">
              <p className="eyebrow">Livro {toRoman(book.volume)}</p>
              <h2 id="livro-titulo" className="home-book__title">
                <span className="home-book__saga">Kael Draken</span>
                {book.title}
              </h2>
              {settings.author_name?.trim() ? <p className="home-book__author">por {settings.author_name.trim()}</p> : null}
              <Fleuron align="start" />
              {synopsis ? <Prose result={synopsis} className="home-book__synopsis" /> : null}
              {editorialInfo?.html.trim() ? (
                <div className="home-book__facts">
                  <h3 className="eyebrow">Informações editoriais</h3>
                  <Prose result={editorialInfo} />
                </div>
              ) : null}
              <div className="home-book__actions">
                <Link className="btn btn--primary" href={bookHref}>
                  Conhecer o Livro <ArrowRight className="btn__arrow" />
                </Link>
                <Link className="btn" href={galleryHref}>
                  Ver as ilustrações
                </Link>
              </div>
            </div>
          </div>
          {illustrations.length ? (
            <div className="container">
              <ol className="folio-strip" aria-label="Ilustrações dos capítulos">
                {illustrations.map((it) => (
                  <li key={it.slug}>
                    <Link className="folio-strip__item" href={`${galleryHref}#${it.slug}`} aria-label={`${it.label}: ${it.chapterTitle}`}>
                      <Image src={it.image!.src} width={it.image!.width} height={it.image!.height} alt="" sizes="(min-width: 1100px) 116px, (min-width: 700px) 14vw, 30vw" />
                      <span className="folio-strip__num" aria-hidden="true">
                        {it.roman}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── O livro voltou (pergaminho do painel) ────────────── */}
      {announcement ? (
        <>
          <section className="announce-section" id="o-livro-voltou" aria-labelledby="anuncio-secao-titulo">
            <div className="container">
              <Parchment
                kicker={settings.announcement_kicker}
                title={settings.announcement_title}
                html={announcement.html}
                titleId="anuncio-secao-titulo"
                actions={
                  <>
                    <Link className="btn btn--primary" href={bookHref}>
                      Conhecer o Livro <ArrowRight className="btn__arrow" />
                    </Link>
                    <Link className="btn btn--ink" href={galleryHref}>
                      Ver as ilustrações
                    </Link>
                  </>
                }
              />
            </div>
          </section>
          <AnnouncementOverlay version={announcementVersion}>
            <Parchment
              unroll
              kicker={settings.announcement_kicker}
              title={settings.announcement_title}
              html={announcement.html}
              titleId="anuncio-titulo"
              actions={
                <>
                  <EnterArchiveButton />
                  <Link className="btn btn--ink" href={bookHref}>
                    Conhecer o Livro
                  </Link>
                </>
              }
            />
          </AnnouncementOverlay>
        </>
      ) : null}

      {/* ── Novidades ────────────────────────────────────────── */}
      <section className="section home-news" aria-labelledby="novidades-titulo">
        <div className="container home-news__grid">
          <div>
            <header className="section-head">
              <p className="eyebrow">Diário de desenvolvimento</p>
              <h2 id="novidades-titulo">Novidades</h2>
              <Fleuron align="start" />
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
              <div className="empty-note">
                <Glyph name="novidades" className="empty-note__glyph" />
                <p>Nenhuma publicação no diário ainda. Os anúncios de novos mapas, documentos e verbetes aparecerão aqui.</p>
              </div>
            )}
            <p className="home-news__more">
              <Link className="text-link" href={paths.news}>
                Todas as novidades <ArrowRight className="btn__arrow" />
              </Link>
            </p>
          </div>
          {recent.length ? (
            <aside className="home-news__recent" aria-labelledby="recentes-titulo">
              <h3 className="eyebrow" id="recentes-titulo">
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
          ) : null}
        </div>
      </section>
    </>
  )
}
