'use client'

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ background: '#0e0d0c', color: '#ebe4d4', fontFamily: 'Georgia, serif', padding: '4rem 1.5rem' }}>
        <h1>O arquivo encontrou um erro inesperado</h1>
        <p>Tente recarregar a página.</p>
        <button type="button" onClick={reset} style={{ marginTop: '1rem', padding: '0.6rem 1.2rem' }}>
          Tentar novamente
        </button>
      </body>
    </html>
  )
}
