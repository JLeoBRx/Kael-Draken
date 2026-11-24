import { createHmac, timingSafeEqual } from 'node:crypto'
import type { MatchSummary, PlayerResult } from '../server/core/game-host'
import type { ServerSpec } from './game-spec'

/**
 * Conversa entre a plataforma e os nós de servidor de jogo (outras
 * máquinas), em JSON sobre WebSocket em /nodes:
 *
 *   plataforma → nó   challenge (ao conectar), welcome, create, release, error
 *   nó → plataforma   hello (prova o segredo), created, createFailed,
 *                     report (a cada 2 s), result, matchEnd, finished, drain
 *
 * O nó prova que conhece o segredo da plataforma respondendo ao desafio com
 * HMAC (o segredo nunca passa pela rede). Os jogadores conectam direto no
 * nó (`publicUrl`), com bilhetes que a plataforma assinou para cada servidor.
 *
 * Se a conexão cair, o nó mantém as partidas e guarda o que precisa contar
 * (resultados, fins de partida); ao voltar, o hello lista os servidores que
 * ainda estão rodando e a plataforma os adota de novo (mesmo depois de a
 * plataforma reiniciar).
 */

export const NODE_PROTOCOL = 1

/** Dados da plataforma guardados no nó (devolvidos no hello para readoção). */
export interface ServerMeta {
  kind: ServerSpec['kind']
  region: string
  teamSize: number
  code: string | null
  matchId: number | null
  avgMmr: number
}

export interface ServerReport {
  id: string
  players: number
  phase: number
  tickMs: number
  alive: number
  /** Contas conectadas (ou com personagem esperando a volta). */
  uids: string[]
}

export interface RunningServer {
  id: string
  spec: ServerSpec
  meta: ServerMeta
  report: ServerReport
}

export type PlatformToNode =
  | { t: 'challenge'; nonce: string; protocol: number }
  | { t: 'welcome'; node: string }
  | { t: 'create'; id: string; spec: ServerSpec; meta: ServerMeta }
  | { t: 'meta'; id: string; meta: ServerMeta }
  | { t: 'release'; id: string; why: string }
  | { t: 'error'; message: string }

export type NodeToPlatform =
  | {
      t: 'hello'
      name: string
      region: string
      publicUrl: string
      capacity: number
      nodeProtocol: number
      gameProtocol: number
      proof: string
      servers: RunningServer[]
    }
  | { t: 'created'; id: string }
  | { t: 'createFailed'; id: string; message: string }
  | { t: 'report'; servers: ServerReport[]; rssMb: number; load: number }
  | { t: 'result'; id: string; result: PlayerResult }
  | { t: 'matchEnd'; id: string; summary: MatchSummary }
  | { t: 'finished'; id: string }
  /** O nó vai desligar: não recebe partidas novas (as atuais terminam). */
  | { t: 'drain' }

export function nodeProof(secret: string, nonce: string, name: string): string {
  return createHmac('sha256', secret).update(`no|${nonce}|${name}`).digest('base64url')
}

export function checkNodeProof(secret: string, nonce: string, name: string, proof: string): boolean {
  const want = Buffer.from(nodeProof(secret, nonce, name), 'base64url')
  const got = Buffer.from(typeof proof === 'string' ? proof : '', 'base64url')
  return got.length === want.length && timingSafeEqual(got, want)
}

/** Nome de nó: letras, números, ponto, hífen e sublinhado (aparece em logs e métricas). */
export function validNodeName(name: unknown): name is string {
  return typeof name === 'string' && /^[A-Za-z0-9._-]{1,32}$/.test(name)
}

/**
 * Endereço público do nó para os navegadores: ws:// ou wss://, com um
 * prefixo de caminho opcional (atrás de um proxy: wss://jogo.exemplo/n/no-1).
 * Os servidores ficam em <endereço>/game/<id>.
 */
export function validPublicUrl(url: unknown): url is string {
  if (typeof url !== 'string' || url.length > 200) return false
  try {
    const u = new URL(url)
    return (u.protocol === 'ws:' || u.protocol === 'wss:') && /^[A-Za-z0-9/_.-]*$/.test(u.pathname) && !u.search && !u.hash && !u.username
  } catch {
    return false
  }
}
