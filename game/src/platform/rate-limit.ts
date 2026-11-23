/**
 * Limite por chave (IP, conta) em balde de fichas: `burst` de uma vez e
 * `perSecond` repostas por segundo. Usado no login, nas mensagens da
 * plataforma, nos pedidos de amizade e nas conexões aos servidores de jogo.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; at: number }>()

  constructor(private readonly burst: number, private readonly perSecond: number, private readonly clock: () => number = Date.now) {}

  /** Gasta uma ficha; false se a chave estourou o limite. */
  take(key: string, cost = 1): boolean {
    const now = this.clock()
    let b = this.buckets.get(key)
    if (!b) {
      b = { tokens: this.burst, at: now }
      this.buckets.set(key, b)
    }
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.perSecond)
    b.at = now
    if (b.tokens < cost) return false
    b.tokens -= cost
    // limpeza de baldes cheios (chaves que pararam de aparecer)
    if (this.buckets.size > 10_000) for (const [k, v] of this.buckets) if (v.tokens >= this.burst) this.buckets.delete(k)
    return true
  }
}
