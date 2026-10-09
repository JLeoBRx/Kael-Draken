import type { Metadata } from 'next'
import { desc } from 'drizzle-orm'
import { MediaLibrary } from '@/components/admin/MediaLibrary'
import { db, schema as s } from '@/lib/db'
import { maxUploadBytes } from '@/lib/media/storage'

export const metadata: Metadata = { title: 'Imagens' }

export default async function MediaPage() {
  const rows = await db.select().from(s.media).orderBy(desc(s.media.createdAt))
  return (
    <>
      <header className="adm-head">
        <h1>Imagens</h1>
        <p className="adm-help">
          Biblioteca de imagens enviadas pelo painel. As artes conceituais do Atlas ficam no repositório (public/images/atlas) e são substituídas automaticamente quando você envia uma imagem
          para o mesmo reino, local ou verbete.
        </p>
      </header>
      <MediaLibrary
        maxMb={Math.round(maxUploadBytes() / 1024 / 1024)}
        items={rows.map((m) => ({ id: m.id, src: `/media/${m.path}`, alt: m.alt, caption: m.caption, credit: m.credit, width: m.width, height: m.height, size: m.size, name: m.originalName }))}
      />
    </>
  )
}
