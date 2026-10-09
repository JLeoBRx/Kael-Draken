import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { signSessionToken, verifySessionToken } from '@/lib/auth/token'

const SECRET = 'a'.repeat(48)

describe('senha (scrypt)', () => {
  it('verifica a senha correta e rejeita a incorreta', async () => {
    const hash = await hashPassword('uma senha longa de teste')
    expect(hash.startsWith('scrypt:')).toBe(true)
    expect(hash).not.toContain('$')
    expect(await verifyPassword('uma senha longa de teste', hash)).toBe(true)
    expect(await verifyPassword('outra senha', hash)).toBe(false)
  })

  it('rejeita hashes malformados', async () => {
    expect(await verifyPassword('x', '')).toBe(false)
    expect(await verifyPassword('x', 'scrypt:1:2')).toBe(false)
    expect(await verifyPassword('x', 'texto-plano')).toBe(false)
  })
})

describe('token de sessão', () => {
  it('aceita um token válido', async () => {
    const token = await signSessionToken('autor', SECRET)
    const payload = await verifySessionToken(token, SECRET)
    expect(payload?.sub).toBe('autor')
  })

  it('rejeita token adulterado, com outro segredo ou expirado', async () => {
    const token = await signSessionToken('autor', SECRET, 60)
    const [body, sig] = token.split('.')
    const forged = Buffer.from(JSON.stringify({ sub: 'intruso', iat: 0, exp: 9999999999 })).toString('base64url')
    expect(await verifySessionToken(`${forged}.${sig}`, SECRET)).toBeNull()
    expect(await verifySessionToken(`${body}.${sig}x`, SECRET)).toBeNull()
    expect(await verifySessionToken(token, 'b'.repeat(48))).toBeNull()
    expect(await verifySessionToken(token, SECRET, Date.now() + 61_000)).toBeNull()
    expect(await verifySessionToken(undefined, SECRET)).toBeNull()
  })
})
