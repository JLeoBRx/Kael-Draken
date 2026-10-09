import { draftMode } from 'next/headers'
import { redirect } from 'next/navigation'
import { getAdminSession } from '@/lib/auth/session'

/** Ativa a pré-visualização (rascunhos, notas privadas e todos os spoilers) apenas para o painel autenticado. */
export async function GET(request: Request) {
  const session = await getAdminSession()
  if (!session) return new Response('Acesso negado', { status: 401 })
  const target = new URL(request.url).searchParams.get('caminho') ?? '/'
  const safe = target.startsWith('/') && !target.startsWith('//') ? target : '/'
  ;(await draftMode()).enable()
  redirect(safe)
}
