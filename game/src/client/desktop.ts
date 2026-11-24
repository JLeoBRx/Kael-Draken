/**
 * Ponte com o aplicativo de computador (Electron). No navegador não existe
 * (`desktop()` devolve null) e o jogo funciona igual; no aplicativo, o
 * preload expõe `window.ucDesktop` com o que o navegador não pode fazer:
 * hospedar uma partida na rede local (um servidor de verdade, em outro
 * processo) e sair do jogo.
 */

export interface DesktopHosting {
  port: number
  name: string
  /** IPs deste computador na rede (para os outros digitarem). */
  addresses: string[]
}

export interface DesktopBridge {
  readonly version: string
  /** Plataforma online padrão (vazio = pedir o endereço). */
  readonly platform: string
  hosting(): Promise<DesktopHosting | null>
  host(opts: { name: string }): Promise<DesktopHosting>
  stopHost(): Promise<void>
  toggleFullscreen(): void
  quit(): void
}

export function desktop(): DesktopBridge | null {
  return (globalThis as { ucDesktop?: DesktopBridge }).ucDesktop ?? null
}
