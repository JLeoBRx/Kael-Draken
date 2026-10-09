import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BrandMark } from '@/components/ui/icons'
import { getAdminConfigStatus, getAdminSession } from '@/lib/auth/session'
import { LoginForm } from './LoginForm'

export const metadata: Metadata = { title: 'Entrar' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getAdminSession()) redirect('/admin')
  const { next = '/admin' } = await searchParams
  const config = getAdminConfigStatus()
  return (
    <main className="adm-login" id="conteudo">
      <div className="adm-login__card">
        <BrandMark className="adm-login__mark" />
        <h1>Painel do Arquivo</h1>
        <p className="adm-help">Área restrita à edição do Arquivo da Chama Antiga.</p>
        {!config.configured ? (
          <div className="adm-error-box" role="alert">
            <p>
              <strong>O painel ainda não está configurado.</strong> Defina as variáveis de ambiente abaixo e reinicie o servidor (veja o README):
            </p>
            <ul>
              {config.missing.map((m) => (
                <li key={m}>
                  <code>{m}</code>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <LoginForm next={next} disabled={!config.configured} />
        <p>
          <Link className="adm-link" href="/">
            ← Voltar ao site
          </Link>
        </p>
      </div>
    </main>
  )
}
