import Image from 'next/image'
import Link from 'next/link'
import { ART } from '@/lib/atlas/art'
import type { AtlasRegionView } from '@/lib/atlas/regions'

/** Prévia estática do mapa do mundo, com os rótulos como texto real. */
export function WorldPreview({ regions, href }: { regions: AtlasRegionView[]; href: string }) {
  const image = ART.mapaOriginal
  return (
    <Link href={href} className="world-preview" aria-label="Abrir o Atlas dos Seis Reinos e o mapa interativo">
      <Image src={image.src} alt={image.alt} width={image.width} height={image.height} sizes="(min-width: 1000px) 60vw, 100vw" />
      {regions.map((r) => (
        <span key={r.id} className="atlas-label" style={{ left: `${r.label[0] * 100}%`, top: `${r.label[1] * 100}%` }} aria-hidden="true">
          {r.name}
        </span>
      ))}
      <span className="world-preview__cta">Explorar em 2D e 3D →</span>
      <span className="map-viewer__ribbon" style={{ position: 'absolute' }}>
        Composição conceitual
      </span>
    </Link>
  )
}
