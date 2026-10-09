import type { Metadata, Viewport } from 'next'
import { Cormorant_Garamond, Literata } from 'next/font/google'
import { SITE_NAME, SITE_TITLE, siteUrl } from '@/lib/site'
import '@/styles/tokens.css'
import '@/styles/base.css'

const display = Cormorant_Garamond({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-cormorant',
  display: 'swap',
})

const body = Literata({
  subsets: ['latin', 'latin-ext'],
  style: ['normal', 'italic'],
  variable: '--font-literata',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: SITE_TITLE, template: `%s — Arquivo da Chama Antiga` },
  description: 'Enciclopédia oficial e arquivo de desenvolvimento do universo de Kael Draken — O Sussurro da Chama Antiga.',
  applicationName: SITE_NAME,
  openGraph: { type: 'website', locale: 'pt_BR', siteName: SITE_NAME },
  twitter: { card: 'summary_large_image' },
}

export const viewport: Viewport = {
  themeColor: '#0e0d0c',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  )
}
