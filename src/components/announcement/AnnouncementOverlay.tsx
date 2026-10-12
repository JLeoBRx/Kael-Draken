'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { CloseIcon } from '../ui/icons'

const SEEN_KEY = 'kd_anuncio'
const OPT_OUT_KEY = 'kd_anuncio_ocultar'

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // navegação privada ou armazenamento bloqueado: o pergaminho apenas volta a aparecer
  }
}

/**
 * Exibe o pergaminho uma vez por visitante (por versão do texto). Fecha com
 * Esc, com o botão Fechar, com "Entrar no Arquivo" ou com um clique fora.
 * Conta como visto ao abrir — sem depender do evento "close", que o navegador
 * pode não disparar para diálogos abertos sem interação do usuário.
 */
export function AnnouncementOverlay({ version, children }: { version: string; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (read(OPT_OUT_KEY) === '1' || read(SEEN_KEY) === version) return
    const timer = window.setTimeout(() => {
      if (dialog.open) return
      dialog.showModal()
      write(SEEN_KEY, version)
    }, 350)
    return () => window.clearTimeout(timer)
  }, [version])

  return (
    <dialog
      ref={dialogRef}
      className="announce-dialog"
      aria-labelledby="anuncio-titulo"
      onClick={(e) => {
        if (e.target === e.currentTarget) dialogRef.current?.close()
      }}
    >
      <div className="announce-dialog__frame">
        <button type="button" className="announce-dialog__close" onClick={() => dialogRef.current?.close()} aria-label="Fechar o anúncio">
          <CloseIcon width={22} height={22} />
        </button>
        {children}
      </div>
    </dialog>
  )
}

/** Botão que fecha o diálogo em que estiver (usado dentro do pergaminho). */
export function EnterArchiveButton({ label = 'Entrar no Arquivo' }: { label?: string }) {
  return (
    <button
      type="button"
      className="btn btn--primary"
      onClick={(e) => {
        const dialog = (e.currentTarget as HTMLElement).closest('dialog')
        dialog?.close()
      }}
    >
      {label}
    </button>
  )
}
