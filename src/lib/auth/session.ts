import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { readSessionSecret, SESSION_COOKIE, SESSION_TTL_SECONDS, signSessionToken, verifySessionToken, type SessionPayload } from './token'

export interface AdminConfigStatus {
  configured: boolean
  missing: string[]
}

export function getAdminConfigStatus(): AdminConfigStatus {
  const missing: string[] = []
  if (!process.env.ADMIN_USERNAME?.trim()) missing.push('ADMIN_USERNAME')
  if (!process.env.ADMIN_PASSWORD_HASH?.trim()) missing.push('ADMIN_PASSWORD_HASH')
  if (!readSessionSecret()) missing.push('SESSION_SECRET (mínimo de 32 caracteres)')
  return { configured: missing.length === 0, missing }
}

/** Lê e valida a sessão do painel a partir do cookie assinado. */
export const getAdminSession = cache(async (): Promise<SessionPayload | null> => {
  const secret = readSessionSecret()
  if (!secret) return null
  const store = await cookies()
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value, secret)
  if (!session || session.sub !== process.env.ADMIN_USERNAME?.trim()) return null
  return session
})

/** Exige sessão válida; usado em toda página e ação do painel (defesa em profundidade além do proxy). */
export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getAdminSession()
  if (!session) redirect('/admin/login')
  return session
}

export async function startAdminSession(username: string) {
  const secret = readSessionSecret()
  if (!secret) throw new Error('SESSION_SECRET ausente ou curto demais.')
  const token = await signSessionToken(username, secret)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && !process.env.SITE_URL?.startsWith('http://'),
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  })
}

export async function endAdminSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}
