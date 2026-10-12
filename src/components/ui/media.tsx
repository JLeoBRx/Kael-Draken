import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import type { FeatureImage, ImageData } from '@/lib/content/media'
import { ArrowRight, BookIcon, ImageIcon, PortraitIcon } from './icons'

export function MediaImage({
  image,
  sizes = '(min-width: 1000px) 50vw, 100vw',
  className,
  priority = false,
  alt,
}: {
  image: ImageData
  sizes?: string
  className?: string
  priority?: boolean
  alt?: string
}) {
  return (
    <Image
      src={image.src}
      width={image.width}
      height={image.height}
      alt={alt ?? image.alt}
      sizes={sizes}
      className={className}
      priority={priority}
      style={image.focus ? { objectPosition: image.focus } : undefined}
    />
  )
}

/** Área neutra reservada para uma ilustração oficial futura. */
export function ImageSlot({ label = 'Ilustração em preparação', ratio = '4 / 3', kind = 'image' }: { label?: string; ratio?: string; kind?: 'image' | 'portrait' }) {
  return (
    <div className="image-slot" style={{ '--slot-ratio': ratio } as CSSProperties} role="img" aria-label={label}>
      <div className="image-slot__inner">
        {kind === 'portrait' ? <PortraitIcon /> : <ImageIcon />}
        <span className="image-slot__label">{label}</span>
      </div>
    </div>
  )
}

/** Imagens verticais (como as ilustrações dos capítulos) viram pranchas, com a legenda ao lado. */
function isPortrait(image: ImageData) {
  return image.height > image.width * 1.1
}

export function Figure({ image, sizes, priority }: { image: FeatureImage; sizes?: string; priority?: boolean }) {
  if (isPortrait(image) || image.kicker) {
    return (
      <figure className={`plate-figure${isPortrait(image) ? '' : ' plate-figure--wide'}`}>
        <div className="plate-figure__media">
          <MediaImage image={image} sizes={sizes ?? (isPortrait(image) ? '(min-width: 700px) 300px, 72vw' : '(min-width: 1000px) 520px, 100vw')} priority={priority} />
        </div>
        <figcaption className="plate-figure__text">
          {image.kicker ? <span className="plate-figure__kicker">{image.kicker}</span> : null}
          {image.title ? <span className="plate-figure__title">{image.title}</span> : null}
          {image.caption ? <span className="plate-figure__caption">{image.caption}</span> : null}
          {image.note ? <span className="plate-figure__note">{image.note}</span> : null}
          {image.credit ? <span className="plate-figure__credit">Crédito: {image.credit}</span> : null}
          {image.href ? (
            <Link className="plate-figure__link" href={image.href}>
              {image.hrefLabel ?? 'Ver mais'} <ArrowRight className="btn__arrow" />
            </Link>
          ) : null}
        </figcaption>
      </figure>
    )
  }
  return (
    <figure className="prose-figure">
      <MediaImage image={image} sizes={sizes} priority={priority} />
      {image.caption || image.credit ? (
        <figcaption>
          {image.caption}
          {image.caption && image.credit ? ' · ' : ''}
          {image.credit ? `Crédito: ${image.credit}` : ''}
        </figcaption>
      ) : null}
    </figure>
  )
}

/**
 * Capa oficial aprovada. Sem o arquivo, exibe uma moldura neutra —
 * a capa nunca é redesenhada nem substituída pelo site.
 */
export function BookCover({ cover, title, priority = false, note }: { cover: ImageData | null; title: string; priority?: boolean; note?: ReactNode }) {
  if (cover) {
    return (
      <figure className="book-cover">
        <Image
          src={cover.src}
          width={cover.width}
          height={cover.height}
          alt={cover.alt || `Capa oficial de ${title}`}
          className="book-cover__img"
          sizes="(min-width: 960px) 380px, 80vw"
          priority={priority}
        />
      </figure>
    )
  }
  return (
    <div className="cover-slot" role="img" aria-label={`Espaço reservado para a capa oficial de ${title}`}>
      <div className="cover-slot__inner">
        <BookIcon />
        <span className="cover-slot__label">Capa oficial</span>
        <span className="cover-slot__note">{note ?? 'A capa aprovada será exibida aqui.'}</span>
      </div>
    </div>
  )
}

/** Emblema do reino ou, enquanto não houver emblema oficial, um escudo neutro com a inicial. */
export function Emblem({ image, name, accent }: { image: ImageData | null; name: string; accent?: string }) {
  const style = accent ? ({ '--k-accent': accent } as CSSProperties) : undefined
  if (image) {
    return (
      <div className="emblem" style={style}>
        <Image src={image.src} width={image.width} height={image.height} alt={image.alt || `Emblema de ${name}`} sizes="240px" unoptimized={image.src.endsWith('.svg')} />
      </div>
    )
  }
  return (
    <div className="emblem" style={style} role="img" aria-label={`Emblema de ${name} em criação`}>
      <svg viewBox="0 0 120 140" aria-hidden="true">
        <path d="M60 6 110 22v44c0 34-22 56-50 68C32 122 10 100 10 66V22Z" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M60 16 100 29v37c0 28-18 47-40 57-22-10-40-29-40-57V29Z" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
        <text x="60" y="88" textAnchor="middle" className="emblem__initial">
          {name.charAt(0)}
        </text>
      </svg>
    </div>
  )
}
