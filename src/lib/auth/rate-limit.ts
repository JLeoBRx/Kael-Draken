/**
 * Limite simples de tentativas de login, em memória (por processo).
 * Suficiente para uma instância única; em múltiplas instâncias, use um
 * armazenamento compartilhado.
 */

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

const attempts = new Map<string, { count: number; first: number }>()

export function isRateLimited(key: string, now = Date.now()): boolean {
  const entry = attempts.get(key)
  if (!entry) return false
  if (now - entry.first > WINDOW_MS) {
    attempts.delete(key)
    return false
  }
  return entry.count >= MAX_ATTEMPTS
}

export function registerFailedAttempt(key: string, now = Date.now()) {
  const entry = attempts.get(key)
  if (!entry || now - entry.first > WINDOW_MS) attempts.set(key, { count: 1, first: now })
  else entry.count++
}

export function clearAttempts(key: string) {
  attempts.delete(key)
}
