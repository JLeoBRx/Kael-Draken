'use server'

import { cookies } from 'next/headers'
import { parseSpoilerLevel, SPOILER_COOKIE } from '@/lib/editorial'

/** Grava o nível de spoiler escolhido pelo visitante. A página é renderizada novamente no servidor. */
export async function setSpoilerLevel(formData: FormData) {
  const level = parseSpoilerLevel(formData.get('level'))
  const store = await cookies()
  store.set(SPOILER_COOKIE, String(level), {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' && !process.env.SITE_URL?.startsWith('http://'),
  })
}
