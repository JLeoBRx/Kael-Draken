import Link from 'next/link'
import { BrandMark } from '@/components/ui/icons'
import { COLLECTION_KEYS, COLLECTIONS } from '@/lib/admin/collections'
import { requireAdmin } from '@/lib/auth/session'
import { logoutAction } from '../actions'

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin()
  return (
    <div className="adm-shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <aside className="adm-nav" aria-label="Navegação do painel">
        <Link href="/admin" className="adm-nav__brand">
          <BrandMark className="adm-nav__mark" />
          <span>
            Painel
            <small>Arquivo da Chama Antiga</small>
          </span>
        </Link>
        <details className="adm-nav__menu" open>
          <summary>Menu</summary>
          <nav>
            <p className="adm-nav__title">Conteúdo</p>
            <ul>
              {COLLECTION_KEYS.map((key) => (
                <li key={key}>
                  <Link href={`/admin/${key}`}>{COLLECTIONS[key].label}</Link>
                </li>
              ))}
            </ul>
            <p className="adm-nav__title">Arquivo</p>
            <ul>
              <li>
                <Link href="/admin/midia">Imagens</Link>
              </li>
              <li>
                <Link href="/admin/categorias">Categorias e tags</Link>
              </li>
              <li>
                <Link href="/admin/configuracoes">Configurações e capa</Link>
              </li>
            </ul>
          </nav>
        </details>
        <div className="adm-nav__foot">
          <p className="adm-help">Conectado como {session.sub}</p>
          <a className="adm-link" href="/" target="_blank" rel="noopener">
            Ver o site ↗
          </a>
          <form action={logoutAction}>
            <button type="submit" className="adm-btn adm-btn--ghost">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="adm-main" id="conteudo" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
