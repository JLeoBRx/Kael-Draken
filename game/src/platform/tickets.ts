import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { HostAuth, TicketClaims } from '../server/core/game-host'

/**
 * Bilhetes de entrada nos servidores de jogo: a plataforma decide quem joga
 * em qual servidor (e em que grupo) e assina; o servidor de jogo só confere
 * a assinatura, o servidor de destino e a validade — não precisa consultar
 * a plataforma, então pode rodar em outra máquina com o mesmo segredo.
 *
 *   base64url(JSON) + "." + base64url(HMAC-SHA256(segredo, JSON))
 */

export interface TicketPayload extends TicketClaims {
  /** Servidor de jogo de destino. */
  srv: string
  /** Validade (ms desde 1970). */
  exp: number
}

export function newSecret(): string {
  return randomBytes(32).toString('base64url')
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function signTicket(secret: string, p: TicketPayload): string {
  const body = Buffer.from(JSON.stringify(p), 'utf8').toString('base64url')
  return `${body}.${sign(secret, body)}`
}

/** Confere e devolve o conteúdo; null se adulterado, vencido ou de outro servidor. */
export function verifyTicket(secret: string, ticket: string, server: string, now = Date.now()): TicketPayload | null {
  const dot = ticket.indexOf('.')
  if (dot <= 0 || ticket.length > 1024) return null
  const body = ticket.slice(0, dot)
  const sig = Buffer.from(ticket.slice(dot + 1), 'base64url')
  const want = Buffer.from(sign(secret, body), 'base64url')
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null
  let p: TicketPayload
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TicketPayload
  } catch {
    return null
  }
  if (typeof p !== 'object' || p === null) return null
  if (p.srv !== server || typeof p.exp !== 'number' || p.exp < now) return null
  if (typeof p.uid !== 'string' || typeof p.name !== 'string' || !Number.isInteger(p.skin) || !Number.isInteger(p.team)) return null
  return p
}

/** Verificador para o GameHost de um servidor específico. */
export function ticketAuth(secret: string, server: string, clock: () => number = Date.now): HostAuth {
  return {
    verify(ticket) {
      const p = verifyTicket(secret, ticket, server, clock())
      return p ? { uid: p.uid, name: p.name, skin: p.skin, team: p.team } : null
    },
  }
}
