import Link from 'next/link'
import { BrandMark } from '@/components/ui/icons'
import { Fleuron } from '@/components/ui/ornaments'

interface FooterProps {
  bookHref: string
  galleryHref: string | null
  authorName: string
  description: string
  epigraph: string
}

export function SiteFooter({ bookHref, galleryHref, authorName, description, epigraph }: FooterProps) {
  const year = new Date().getFullYear()
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div className="site-footer__brand">
          <Link href="/" className="site-footer__mark" aria-label="Kael Draken — Arquivo da Chama Antiga, página inicial">
            <BrandMark />
          </Link>
          <p className="site-footer__title">
            Kael Draken
            <em>O Sussurro da Chama Antiga</em>
          </p>
          {epigraph ? (
            <blockquote className="site-footer__epigraph">
              <p>“{epigraph}”</p>
            </blockquote>
          ) : null}
          <p>{description}</p>
          <p className="site-footer__note">
            Este é um universo em construção. Conteúdos marcados como propostas ou em aberto podem mudar à medida que a saga é escrita.
          </p>
        </div>
        <nav aria-label="O universo">
          <h2>O universo</h2>
          <ul>
            <li><Link href="/atlas">Atlas dos Seis Reinos</Link></li>
            <li><Link href="/atlas#reinos">Os seis reinos</Link></li>
            <li><Link href="/personagens">Personagens</Link></li>
            <li><Link href="/mitologia">Mitologia e história antiga</Link></li>
            <li><Link href="/ressonancia">Sistema da Ressonância</Link></li>
            <li><Link href="/cronologia">Cronologia</Link></li>
            <li><Link href="/locais">Cidades e locais</Link></li>
            <li><Link href="/manuscritos">Manuscritos e documentos</Link></li>
            <li><Link href="/misterios">Mistérios</Link></li>
          </ul>
        </nav>
        <nav aria-label="O livro">
          <h2>O livro</h2>
          <ul>
            <li><Link href={bookHref}>Livro I — O Sussurro da Chama Antiga</Link></li>
            {galleryHref ? <li><Link href={galleryHref}>Ilustrações do Livro I</Link></li> : null}
            <li><Link href="/novidades">Novidades e diário de desenvolvimento</Link></li>
          </ul>
        </nav>
        <nav aria-label="O arquivo">
          <h2>O arquivo</h2>
          <ul>
            <li><Link href="/sobre">Sobre o arquivo</Link></li>
            <li><Link href="/sobre#estados-editoriais">Estados editoriais</Link></li>
            <li><Link href="/sobre#niveis-de-spoiler">Níveis de spoiler</Link></li>
            <li><Link href="/busca">Buscar no arquivo</Link></li>
          </ul>
        </nav>
      </div>
      <Fleuron className="site-footer__fleuron" />
      <div className="container site-footer__legal">
        <span>
          © {year} {authorName ? `${authorName} · ` : ''}Kael Draken. Todos os direitos reservados.
        </span>
        <span>Arquivo da Chama Antiga — enciclopédia oficial e diário de desenvolvimento</span>
      </div>
    </footer>
  )
}
