import type { Metadata } from 'next'
import Link from 'next/link'
import { COLLECTIONS } from '@/lib/admin/collections'
import { dashboard } from '@/lib/admin/data'
import { getAdminConfigStatus } from '@/lib/auth/session'
import { PUBLICATION_INFO, type PublicationState } from '@/lib/editorial'
import { formatShortDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Visão geral' }

export default async function DashboardPage() {
  const { stats, recent, mediaCount } = await dashboard()
  const config = getAdminConfigStatus()
  return (
    <>
      <header className="adm-head">
        <h1>Visão geral</h1>
        <p className="adm-help">Crie, revise e publique o conteúdo do arquivo. Nada é publicado automaticamente.</p>
      </header>
      {!process.env.SITE_URL ? <p className="adm-warn">SITE_URL não definido: links absolutos (sitemap, Open Graph) usam http://localhost:3000.</p> : null}
      {!config.configured ? <p className="adm-warn">Configuração incompleta: {config.missing.join(', ')}.</p> : null}
      <section className="adm-stats" aria-label="Conteúdo por coleção">
        {stats.map((s) => (
          <Link key={s.key} href={`/admin/${s.key}`} className="adm-stat">
            <span className="adm-stat__label">{s.label}</span>
            <span className="adm-stat__value">{s.publicado + s.rascunho + s.arquivado}</span>
            <span className="adm-stat__meta">
              {s.publicado} publicados · {s.rascunho} rascunhos{s.arquivado ? ` · ${s.arquivado} arquivados` : ''}
            </span>
          </Link>
        ))}
        <Link href="/admin/midia" className="adm-stat">
          <span className="adm-stat__label">Imagens</span>
          <span className="adm-stat__value">{mediaCount}</span>
          <span className="adm-stat__meta">na biblioteca</span>
        </Link>
      </section>
      <section className="adm-card" aria-labelledby="recentes">
        <h2 id="recentes">Editados recentemente</h2>
        <ul className="adm-list">
          {recent.map((r) => (
            <li key={`${r.key}-${r.id}`}>
              <Link href={`/admin/${r.key}/${r.id}`} className="adm-row">
                <span className="adm-row__title">{r.title}</span>
                <span className="adm-row__meta">{COLLECTIONS[r.key].singular}</span>
                <span className={`adm-pill adm-pill--${r.status}`}>{PUBLICATION_INFO[r.status as PublicationState]?.label ?? r.status}</span>
                <span className="adm-row__meta">{formatShortDate(r.updatedAt)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <section className="adm-card">
        <h2>Atalhos</h2>
        <div className="adm-actions">
          <Link className="adm-btn" href="/admin/publicacoes/novo">
            Nova publicação
          </Link>
          <Link className="adm-btn" href="/admin/personagens/novo">
            Novo personagem
          </Link>
          <Link className="adm-btn" href="/admin/manuscritos/novo">
            Novo documento
          </Link>
          <Link className="adm-btn" href="/admin/midia">
            Enviar imagens
          </Link>
        </div>
      </section>
    </>
  )
}
