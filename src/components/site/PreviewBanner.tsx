export function PreviewBanner() {
  return (
    <div className="preview-banner" role="status">
      <span>
        <strong>Pré-visualização do painel</strong> — rascunhos, notas privadas e todos os níveis de spoiler estão visíveis.
      </span>
      <a href="/admin">Voltar ao painel</a>
      <a href="/api/preview/sair">Sair da pré-visualização</a>
    </div>
  )
}
