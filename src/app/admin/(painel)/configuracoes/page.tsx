import type { Metadata } from 'next'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { SettingsForm } from '@/components/admin/SettingsForm'
import { mediaOptions } from '@/lib/admin/data'
import { getSettings } from '@/lib/content/settings'

export const metadata: Metadata = { title: 'Configurações' }

export default async function SettingsPage() {
  const [settings, media] = await Promise.all([getSettings(), mediaOptions()])
  const coverFileFound = ['jpg', 'jpeg', 'png', 'webp'].some((ext) => existsSync(path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', 'capa', `capa-oficial.${ext}`)))
  return (
    <>
      <header className="adm-head">
        <h1>Configurações</h1>
        <p className="adm-help">Capa oficial, textos da página inicial e informações gerais do site.</p>
      </header>
      <SettingsForm values={settings} media={media} coverFileFound={coverFileFound} />
    </>
  )
}
