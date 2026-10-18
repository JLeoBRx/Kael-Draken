import Link from 'next/link'
import { Glyph } from '@/components/ui/glyphs'
import '@/styles/site.css'

export default function RootNotFound() {
  return (
    <main className="container error-page" id="conteudo">
      <Glyph name="busca" className="error-page__glyph" />
      <p className="error-page__code">404</p>
      <h1>Página não encontrada</h1>
      <p>Este endereço não existe no Arquivo da Chama Antiga.</p>
      <Link className="btn btn--primary" href="/">
        Voltar ao início
      </Link>
    </main>
  )
}
