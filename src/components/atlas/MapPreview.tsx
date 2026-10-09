import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { ImageData } from '@/lib/content/media'
import type { MarkerView } from '@/lib/content/queries'
import { CartographicBase } from './Cartography'

/** Prévia estática (sem JavaScript) do mapa principal, usada na página inicial. */
export function MapPreview({ title, image, markers, provisional, href }: { title: string; image: ImageData | null; markers: MarkerView[]; provisional: boolean; href: string }) {
  const ratio = image ? image.width / image.height : 1.6
  return (
    <Link href={href} className="map-viewer map-viewer--compact" style={{ display: 'block' }} aria-label={`${title} — abrir o atlas`}>
      <div className="map-viewer__viewport" style={{ '--map-ratio': `${ratio}` } as CSSProperties}>
        <div className="map-viewer__canvas" style={{ width: '100%', height: '100%' }}>
          {image ? (
            <Image className="map-viewer__image" src={image.src} alt={image.alt || title} width={image.width} height={image.height} sizes="(min-width: 1000px) 60vw, 100vw" />
          ) : (
            <CartographicBase title={title} />
          )}
          {markers.map((m) => (
            <span key={m.id} className="marker" data-type={m.markerType} data-provisional={m.provisional} style={{ left: `${m.x}%`, top: `${m.y}%` }} aria-hidden="true">
              <span className="marker__glyph" />
            </span>
          ))}
        </div>
        {provisional ? <p className="map-viewer__ribbon">Mapa provisório</p> : null}
      </div>
    </Link>
  )
}
