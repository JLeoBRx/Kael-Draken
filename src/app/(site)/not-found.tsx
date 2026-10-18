import Link from 'next/link'
import { Glyph } from '@/components/ui/glyphs'
import { Fleuron } from '@/components/ui/ornaments'

export default function NotFound() {
  return (
    <div className="container error-page">
      <Glyph name="busca" className="error-page__glyph" />
      <p className="error-page__code">404</p>
      <h1>Este verbete não está no arquivo</h1>
      <Fleuron align="start" />
      <p>O endereço pode estar incorreto, o conteúdo pode ter sido retirado ou ainda não foi publicado.</p>
      <div className="error-page__actions">
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
