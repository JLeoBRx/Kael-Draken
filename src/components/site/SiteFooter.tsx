import Link from 'next/link'

export function SiteFooter({ bookHref, authorName, description }: { bookHref: string; authorName: string; description: string }) {
  const year = new Date().getFullYear()
  return (
    <footer className="site-footer">
      <div className="container site-footer__grid">
        <div>
          <p className="site-footer__title">
            Kael Draken
            <em>O Sussurro da Chama Antiga</em>
          </p>
          <p>{description}</p>
          <p style={{ marginTop: '1rem' }}>
            Este é um universo em construção. Conteúdos marcados como provisórios ou em desenvolvimento podem mudar à medida que a saga é escrita.
          </p>
        </div>
        <nav aria-label="Seções do arquivo">
          <h2>Arquivo</h2>
          <ul>
            <li><Link href="/atlas">Atlas dos Seis Reinos</Link></li>
            <li><Link href="/personagens">Biblioteca de personagens</Link></li>
            <li><Link href="/mitologia">Mitologia e história antiga</Link></li>
            <li><Link href="/cronologia">Cronologia</Link></li>
            <li><Link href="/ressonancia">Sistema da Ressonância</Link></li>
            <li><Link href="/locais">Cidades e locais</Link></li>
            <li><Link href="/manuscritos">Manuscritos e documentos</Link></li>
          </ul>
        </nav>
        <nav aria-label="Sobre o projeto">
          <h2>Projeto</h2>
          <ul>
            <li><Link href={bookHref}>Livro I — O Sussurro da Chama Antiga</Link></li>
            <li><Link href="/novidades">Novidades e diário de desenvolvimento</Link></li>
            <li><Link href="/sobre">Sobre o arquivo</Link></li>
            <li><Link href="/sobre#estados-editoriais">Estados editoriais</Link></li>
            <li><Link href="/sobre#niveis-de-spoiler">Níveis de spoiler</Link></li>
            <li><Link href="/busca">Buscar</Link></li>
          </ul>
        </nav>
      </div>
      <div className="container site-footer__legal">
        <span>
          © {year} {authorName ? `${authorName} · ` : ''}Kael Draken. Todos os direitos reservados.
        </span>
        <span>Arquivo da Chama Antiga</span>
      </div>
    </footer>
  )
}
