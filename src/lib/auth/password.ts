import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'

const KEY_LENGTH = 64
const PARAMS = { N: 16384, r: 8, p: 1 }

function scrypt(password: string, salt: Buffer, keylen: number, opts: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, { ...opts, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

/**
 * Gera um hash no formato scrypt:N:r:p:salt:hash (base64url).
 * O separador ":" evita a expansão de "$" feita pelo carregador de .env do Next.js.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, KEY_LENGTH, PARAMS)
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64url'), key.toString('base64url')].join(':')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.trim().split(':')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, hashB64] = parts
  const expected = Buffer.from(hashB64, 'base64url')
  if (!expected.length) return false
  try {
    const key = await scrypt(password, Buffer.from(saltB64, 'base64url'), expected.length, { N: Number(n), r: Number(r), p: Number(p) })
    return key.length === expected.length && timingSafeEqual(key, expected)
  } catch {
    return false
  }
}
