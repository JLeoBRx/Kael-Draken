/**
 * Tokens de sessão assinados com HMAC-SHA256 (Web Crypto), utilizáveis
 * tanto no proxy quanto no servidor Node.
 */

export const SESSION_COOKIE = 'kd_admin'
export const SESSION_TTL_SECONDS = 60 * 60 * 12

export interface SessionPayload {
  sub: string
  iat: number
  exp: number
}

const encoder = new TextEncoder()

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function signSessionToken(sub: string, secret: string, ttlSeconds = SESSION_TTL_SECONDS, now = Date.now()): Promise<string> {
  const iat = Math.floor(now / 1000)
  const payload: SessionPayload = { sub, iat, exp: iat + ttlSeconds }
  const body = toBase64Url(encoder.encode(JSON.stringify(payload)))
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body))
  return `${body}.${toBase64Url(new Uint8Array(signature))}`
}

export async function verifySessionToken(token: string | undefined, secret: string, now = Date.now()): Promise<SessionPayload | null> {
  if (!token || !secret) return null
  const [body, signature, extra] = token.split('.')
  if (!body || !signature || extra !== undefined) return null
  try {
    const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromBase64Url(signature), encoder.encode(body))
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as SessionPayload
    if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null
    if (payload.exp * 1000 <= now) return null
    return payload
  } catch {
    return null
  }
}

/** O segredo precisa ter ao menos 32 caracteres; caso contrário o painel fica desativado. */
export function readSessionSecret(): string | null {
  const secret = process.env.SESSION_SECRET?.trim() ?? ''
  return secret.length >= 32 ? secret : null
}
