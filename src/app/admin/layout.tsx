import type { Metadata } from 'next'
import '@/styles/site.css'
import '@/styles/admin.css'

export const metadata: Metadata = {
  title: { default: 'Painel', template: '%s — Painel do Arquivo' },
  robots: { index: false, follow: false },
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="adm-root">{children}</div>
}
