import Link from 'next/link'

export function PreviewBanner() {
  return (
    <div className="preview-banner" role="status">
      <span>
        <strong>Pré-visualização do painel</strong> — rascunhos, notas privadas e todos os níveis de spoiler estão visíveis.
      </span>
      <Link href="/admin">Voltar ao painel</Link>
      {/* rota de API: precisa de navegação completa para limpar o cookie de pré-visualização */}
      <a href="/api/preview/sair">Sair da pré-visualização</a>
    </div>
  )
}
