import { readUpload } from '@/lib/media/storage'

const TYPES: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' }

/** Serve as imagens enviadas pelo painel (pasta UPLOADS_DIR). Os nomes são únicos, então o cache é imutável. */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const relative = path.join('/')
  const ext = relative.split('.').pop()?.toLowerCase() ?? ''
  const type = TYPES[ext]
  if (!type || relative.includes('..')) return new Response('Não encontrado', { status: 404 })
  const data = await readUpload(relative)
  if (!data) return new Response('Não encontrado', { status: 404 })
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': type,
      'Content-Length': String(data.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
}
