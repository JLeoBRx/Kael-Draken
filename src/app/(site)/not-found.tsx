import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="container error-page">
      <p className="error-page__code">404</p>
      <h1>Este verbete não está no arquivo</h1>
      <p>O endereço pode estar incorreto, o conteúdo pode ter sido retirado ou ainda não foi publicado.</p>
      <div className="hero__actions">
        <Link className="btn btn--primary" href="/">
          Voltar ao início
        </Link>
        <Link className="btn" href="/busca">
          Buscar no arquivo
        </Link>
      </div>
    </div>
  )
}
