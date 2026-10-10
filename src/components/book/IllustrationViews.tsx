import Image from 'next/image'
import Link from 'next/link'
import type { IllustrationItem } from '@/lib/illustrations'
import { ImageSlot } from '../ui/media'
import { ArrowRight } from '../ui/icons'
import { ArtStateBadge } from './IllustrationGallery'

/** Seção da página do livro: os capítulos ilustrados, em miniatura, levando à galeria. */
export function IllustrationStrip({ items, galleryHref, volume, intro }: { items: IllustrationItem[]; galleryHref: string; volume: string; intro: string }) {
  if (!items.length) return null
  return (
    <section className="entry-section" id="ilustracoes" aria-labelledby="ilustracoes-titulo">
      <h2 className="entry-section__title" id="ilustracoes-titulo">
        Ilustrações do Livro {volume}
      </h2>
      <p className="illus-strip__intro">“{intro}”</p>
      <ol className="illus-strip">
        {items.map((it) => (
          <li key={it.slug}>
            <Link href={`${galleryHref}#${it.slug}`} className="illus-strip__item" aria-label={`${it.label}: ${it.chapterTitle} (${it.stateLabel.toLowerCase()})`}>
              {it.image ? (
                <Image src={it.image.src} width={it.image.width} height={it.image.height} alt="" sizes="(min-width: 1000px) 110px, 18vw" className="illus-strip__img" />
              ) : (
                <ImageSlot ratio="31 / 46" label="Em produção" />
              )}
              <span className="illus-strip__num" aria-hidden="true">
                {it.roman}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <p>
        <Link className="btn btn--gold btn--small" href={galleryHref}>
          Ver as ilustrações dos capítulos <ArrowRight className="btn__arrow" width={14} height={14} />
        </Link>
      </p>
    </section>
  )
}

/** Abertura do capítulo publicado: a ilustração correspondente, com seu estado. */
export function ChapterIllustration({ item, galleryHref }: { item: IllustrationItem; galleryHref: string }) {
  return (
    <figure className="chapter-illustration">
      {item.image ? (
        <Link href={`${galleryHref}#${item.slug}`} className="chapter-illustration__frame" aria-label={`Ampliar a ilustração do ${item.label.toLowerCase()}`}>
          <Image
            src={item.image.src}
            width={item.image.width}
            height={item.image.height}
            alt={item.image.alt}
            sizes="(min-width: 800px) 420px, 80vw"
            className="chapter-illustration__img"
            priority
          />
        </Link>
      ) : (
        <div className="chapter-illustration__frame">
          <ImageSlot ratio="31 / 46" label={`${item.stateLabel} — ${item.label}`} />
        </div>
      )}
      <figcaption className="chapter-illustration__caption">
        <ArtStateBadge state={item.artState} label={item.stateLabel} />
        {item.caption ? <span>{item.caption}</span> : null}
        {item.credit ? <span className="chapter-illustration__credit">Crédito: {item.credit}</span> : null}
      </figcaption>
    </figure>
  )
}
