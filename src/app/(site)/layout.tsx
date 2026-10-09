import { PreviewBanner } from '@/components/site/PreviewBanner'
import { SiteFooter } from '@/components/site/SiteFooter'
import { SiteHeader } from '@/components/site/SiteHeader'
import { buildNav } from '@/components/site/nav'
import { listBooks } from '@/lib/content/queries'
import { getSettings } from '@/lib/content/settings'
import { getViewer } from '@/lib/content/viewer'
import { paths } from '@/lib/routes'
import '@/styles/site.css'
import '@/styles/atlas.css'

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [viewer, settings] = await Promise.all([getViewer(), getSettings()])
  const books = await listBooks(viewer)
  const bookHref = books[0] ? paths.book(books[0].slug) : paths.books
  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      {viewer.preview ? <PreviewBanner /> : null}
      <SiteHeader nav={buildNav(bookHref)} spoiler={viewer.chosenSpoiler} />
      <main id="conteudo" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter bookHref={bookHref} authorName={settings.author_name} description={settings.site_description} />
    </>
  )
}
