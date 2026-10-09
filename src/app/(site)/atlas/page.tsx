import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { WorldAtlas } from '@/components/atlas/WorldAtlas'
import { CanonBadge } from '@/components/ui/editorial'
import { Breadcrumbs } from '@/components/ui/PageHero'
import { MediaImage } from '@/components/ui/media'
import { ART, emblemArt } from '@/lib/atlas/art'
import { getAtlasRegions } from '@/lib/atlas/regions'
import { WORLD, type MapVersionId } from '@/lib/atlas/world'
import { listKingdoms, listMaps } from '@/lib/content/queries'
import { getViewer } from '@/lib/content/viewer'
import { toRoman } from '@/lib/format'
import { paths } from '@/lib/routes'

export const metadata: Metadata = {
  title: 'Atlas dos Seis Reinos',
  description: 'Mapa interativo 2D e 3D do mundo de Kael Draken, os seis reinos e os capítulos da história antiga — uma composição conceitual em desenvolvimento.',
  alternates: { canonical: '/atlas' },
  openGraph: { images: [{ url: ART.capa.src, width: ART.capa.width, height: ART.capa.height, alt: ART.capa.alt }] },
}

const CHAPTERS = [
  { title: 'A Chama do Dragão e o Caos', href: '/mitologia/a-chama-do-dragao', image: ART.origemChama, text: 'A força que criou o mundo e aquilo que nasceu com ele.' },
  { title: 'Safra e a Noite das Cinzas', href: '/mitologia/safra-e-a-noite-das-cinzas', image: ART.quedaSafra, text: 'Uma civilização ligada às chamas, sua destruição e seu apagamento.' },
  { title: 'O Templo da Chama', href: '/mitologia/o-templo-da-chama', image: ART.templo, text: 'O lugar central ligado à proteção da Chama.' },
  { title: 'A Ressonância', href: '/ressonancia', image: ART.ressonancia, text: 'O sistema de poder: o que está estabelecido e o que é proposta.' },
  { title: 'Kael Draken', href: '/personagens/kael-draken', image: ART.sonhosKael, text: 'Dezesseis anos, uma família adotiva e sonhos impossíveis.' },
  { title: 'O Século Perdido', href: '/mitologia/o-seculo-perdido', image: ART.seculoPerdido, text: 'Cerca de seiscentos anos de história perdida.' },
  { title: 'Mistérios', href: '/misterios', image: ART.skrugheim, text: 'As perguntas em aberto — e a profecia de Skrugheim.' },
]

export default async function AtlasPage({ searchParams }: { searchParams: Promise<{ regiao?: string; versao?: string }> }) {
  const viewer = await getViewer()
  const { regiao, versao } = await searchParams
  const [regions, kingdoms, maps] = await Promise.all([getAtlasRegions(viewer), listKingdoms(viewer), listMaps(viewer)])
  const version: MapVersionId = versao === 'conhecido' ? 'conhecido' : 'original'

  return (
    <>
      <header className="atlas-opening">
        <div className="atlas-opening__art">
          <Image src={ART.capa.src} alt={ART.capa.alt} width={ART.capa.width} height={ART.capa.height} priority sizes="(min-width: 960px) 45vw, 100vw" />
        </div>
        <div className="container atlas-opening__inner">
          <Breadcrumbs items={[{ label: 'Atlas' }]} />
          <p className="eyebrow">Kael Draken — Livro I: O Sussurro da Chama Antiga</p>
          <h1 className="atlas-opening__title">
            Atlas dos <span>Seis Reinos</span>
          </h1>
          <p className="atlas-opening__lede">
            A Chama do Dragão criou o mundo. Com a criação surgiu o Caos, contido pela Chama. Seis reinos foram estabelecidos — e um deles, Safra, foi destruído e apagado da
            história oficial. Este atlas reúne os mapas, os reinos e os capítulos dessa história, distinguindo o que está estabelecido do que ainda é proposta.
          </p>
          <nav className="atlas-opening__nav" aria-label="Capítulos do atlas">
            <a href="#mapas">Mapas</a>
            <a href="#reinos">Os seis reinos</a>
            <a href="#capitulos">Capítulos</a>
            <Link href="/misterios">Mistérios</Link>
          </nav>
          <p className="art-note">Capa do Atlas: conceito artístico procedural. A capa oficial do Livro I é exibida na página do livro.</p>
        </div>
      </header>

      <section className="section" id="mapas" aria-labelledby="mapas-titulo" style={{ paddingTop: 'var(--space-7)' }}>
        <div className="container container--wide">
          <header className="section-head">
            <p className="eyebrow">Mapas</p>
            <h2 id="mapas-titulo">O mundo, em duas versões</h2>
            <p className="section-head__lede">
              O mapa do mundo original mostra os seis reinos. O mapa do mundo conhecido reproduz a versão oficial, em que Safra foi apagada. Selecione uma região para ver seus
              detalhes, ou abra a exploração em três dimensões.
            </p>
          </header>
          <WorldAtlas
            regions={regions}
            images={{ original: ART.mapaOriginal, conhecido: ART.mapaConhecido }}
            heightmap={{ src: WORLD.relevo.arquivo, width: WORLD.relevo.largura, height: WORLD.relevo.altura, seaLevel: WORLD.relevo.nivelDoMar }}
            maskSrc={WORLD.mascaraTerra}
            initialVersion={version}
            initialRegion={regiao ?? null}
          />
          <p className="notice" role="note" style={{ marginTop: 'var(--space-5)' }}>
            <span>
              <strong>Geografia conceitual.</strong> {WORLD.nota} As zonas dos reinos, o relevo do modo 3D e as costas servem apenas à visualização e podem ser editados quando a
              cartografia for aprovada.
            </span>
          </p>

          {maps.length ? (
            <div style={{ marginTop: 'var(--space-7)' }}>
              <h3 className="eyebrow" style={{ marginBottom: 'var(--space-4)' }}>
                Outros mapas do arquivo
              </h3>
              <ul className="card-grid">
                {maps.map((m) => (
                  <li key={m.id}>
                    <Link className="char-card" href={paths.map(m.slug)} style={{ gridTemplateColumns: m.image ? '120px 1fr' : '1fr' }}>
                      {m.image ? <MediaImage image={m.image} sizes="120px" /> : null}
                      <span className="char-card__body">
                        <span className="char-card__name">{m.title}</span>
                        <span className="char-card__summary">{m.description}</span>
                        <span className="badges">
                          <CanonBadge canon={m.canon} />
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      <section className="section" id="reinos" style={{ paddingTop: 0 }} aria-labelledby="reinos-titulo">
        <div className="container">
          <header className="section-head">
            <p className="eyebrow">Os reinos</p>
            <h2 id="reinos-titulo">Os seis reinos</h2>
            <p className="section-head__lede">
              Safra é o reino desaparecido. Os outros cinco são os reinos conhecidos — seus nomes, capitais e características ainda podem mudar. Brasões e paisagens são propostas
              visuais.
            </p>
          </header>
          <figure className="heraldry-panel">
            <MediaImage image={ART.painelReinos} sizes="(min-width: 1240px) 1240px, 100vw" />
            <figcaption className="art-note">{ART.painelReinos.caption}</figcaption>
          </figure>
          <div className="kingdom-sections">
            {kingdoms.map((k, i) => {
              const panorama = ART.reino[k.slug]
              const emblem = k.emblem ?? emblemArt(k.slug)
              return (
                <article key={k.id} className="kingdom-band kingdom-band--art" style={{ '--k-accent': k.accent } as CSSProperties} aria-labelledby={`reino-${k.slug}`}>
                  <div className="kingdom-band__emblem">
                    {emblem ? <Image src={emblem.src} alt={emblem.alt} width={emblem.width} height={emblem.height} unoptimized={emblem.src.endsWith('.svg')} /> : null}
                  </div>
                  <div>
                    <p className="kingdom-band__num">Reino {toRoman(i + 1)}</p>
                    <h3 id={`reino-${k.slug}`}>
                      <Link href={paths.kingdom(k.slug)}>{k.name}</Link>
                    </h3>
                    {k.epithet ? <p className="kingdom-band__epithet">{k.epithet}</p> : null}
                    {k.government ? <p className="kingdom-band__epithet">{k.government}</p> : null}
                    <p style={{ marginTop: 'var(--space-3)' }}>{k.summary}</p>
                    <div className="badges" style={{ marginTop: 'var(--space-3)' }}>
                      <CanonBadge canon={k.canon} />
                      <Link className="text-link" href={`${paths.atlas}?regiao=${k.slug}#mapas`}>
                        Ver no mapa
                      </Link>
                    </div>
                  </div>
                  {panorama ? (
                    <Link className="kingdom-band__panorama" href={paths.kingdom(k.slug)} aria-label={`Abrir o verbete de ${k.name}`}>
                      <MediaImage image={panorama} sizes="(min-width: 900px) 360px, 100vw" alt="" />
                    </Link>
                  ) : null}
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="section" id="capitulos" style={{ paddingTop: 0 }} aria-labelledby="capitulos-titulo">
        <div className="container">
          <header className="section-head">
            <p className="eyebrow">Capítulos</p>
            <h2 id="capitulos-titulo">A história do mundo</h2>
          </header>
          <ul className="chapter-grid">
            {CHAPTERS.map((c) => (
              <li key={c.href}>
                <Link className="chapter-card" href={c.href}>
                  <MediaImage image={c.image} sizes="(min-width: 1000px) 400px, 100vw" alt="" />
                  <span className="chapter-card__body">
                    <span className="chapter-card__title">{c.title}</span>
                    <span className="chapter-card__text">{c.text}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  )
}
