'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { Glyph } from '@/components/ui/glyphs'
import { Fleuron } from '@/components/ui/ornaments'

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <div className="container error-page">
      <Glyph name="manuscritos" className="error-page__glyph" />
      <h1>Algo se perdeu no arquivo</h1>
      <Fleuron align="start" />
      <p>Não foi possível carregar esta página. Tente novamente em instantes.{error.digest ? ` Código: ${error.digest}` : ''}</p>
      <div className="error-page__actions">
        <button className="btn btn--primary" type="button" onClick={reset}>
          Tentar novamente
        </button>
        <Link className="btn" href="/">
          Voltar ao início
        </Link>
      </div>
    </div>
  )
}
