import { NextResponse, type NextRequest } from 'next/server'
import { readSessionSecret, SESSION_COOKIE, verifySessionToken } from './lib/auth/token'

/**
 * Verificação otimista do painel: redireciona visitantes sem sessão para o login.
 * A autorização definitiva acontece em cada página e ação (requireAdmin).
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (pathname === '/admin/login') return NextResponse.next()

  const secret = readSessionSecret()
  const session = secret ? await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, secret) : null
  if (!session) {
    const url = new URL('/admin/login', request.url)
    url.searchParams.set('next', pathname + search)
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
