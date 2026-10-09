import type { Metadata } from 'next'
import { asc } from 'drizzle-orm'
import { TermsEditor } from '@/components/admin/TermsEditor'
import { db, schema as s } from '@/lib/db'
import { VOCABULARIES, type Vocabulary } from '@/lib/editorial'

export const metadata: Metadata = { title: 'Categorias e tags' }

export default async function TermsPage() {
  const terms = await db.select().from(s.terms).orderBy(asc(s.terms.sortOrder), asc(s.terms.label))
  return (
    <>
      <header className="adm-head">
        <h1>Categorias e tags</h1>
        <p className="adm-help">Vocabulários usados nos formulários e filtros do site. Alterar o identificador de um termo desvincula os itens que o usam.</p>
      </header>
      {(Object.keys(VOCABULARIES) as Vocabulary[]).map((v) => (
        <TermsEditor key={v} vocabulary={v} title={VOCABULARIES[v]} terms={terms.filter((t) => t.vocabulary === v)} />
      ))}
    </>
  )
}
