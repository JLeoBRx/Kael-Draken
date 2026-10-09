import Link from 'next/link'
import '@/styles/site.css'

export default function RootNotFound() {
  return (
    <main className="container error-page" id="conteudo">
      <p className="error-page__code">404</p>
      <h1>Página não encontrada</h1>
      <p>Este endereço não existe no Arquivo da Chama Antiga.</p>
      <Link className="btn btn--primary" href="/">
        Voltar ao início
      </Link>
    </main>
  )
}
