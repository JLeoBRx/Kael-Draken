import Link from 'next/link'
import { ArrowRight } from '@/components/ui/icons'
import { MediaImage } from '@/components/ui/media'
import type { ImageData } from '@/lib/content/media'

/** Detalhe da carta do manuscrito, com a região em destaque e o caminho para o Atlas. */
export function MapDetail({ image, href, priority = false }: { image: ImageData; href: string; priority?: boolean }) {
  return (
    <figure className="map-detail">
      <div className="map-detail__frame">
        <MediaImage image={image} sizes="(min-width: 900px) 560px, 100vw" priority={priority} />
      </div>
      <figcaption className="map-detail__caption">
        <span>{image.caption}</span>
        <Link className="map-detail__link" href={href}>
          Explorar no Atlas <ArrowRight className="btn__arrow" />
        </Link>
      </figcaption>
    </figure>
  )
}
