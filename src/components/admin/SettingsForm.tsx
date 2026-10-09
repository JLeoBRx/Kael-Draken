'use client'

import { useActionState } from 'react'
import { saveSettingsAction, type FormState } from '@/app/admin/actions'
import type { FieldDef } from '@/lib/admin/collections'
import { MediaField, type MediaItem } from './fields'

export function SettingsForm({ values, media, coverFileFound }: { values: Record<string, string>; media: MediaItem[]; coverFileFound: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveSettingsAction, {})
  const coverField: FieldDef = {
    name: 'cover_media_id',
    label: 'Capa oficial do Livro I',
    type: 'media',
    help: 'Use somente a capa aprovada. Ela aparece na página inicial, na página do livro e nos metadados de compartilhamento.',
  }
  return (
    <form action={action} className="adm-form adm-form--single">
      <div className="adm-form__main">
        {state.message ? <p className="adm-ok">{state.message}</p> : null}
        {state.error ? <p className="adm-error">{state.error}</p> : null}
        <fieldset className="adm-group">
          <legend>Identidade</legend>
          <MediaField field={coverField} value={values.cover_media_id ?? ''} media={media} />
          <p className="adm-help">
            {coverFileFound
              ? 'Também há um arquivo em public/capa/; a imagem escolhida aqui tem prioridade.'
              : 'Alternativa: coloque o arquivo aprovado em public/capa/capa-oficial.jpg (ou .png/.webp) no repositório.'}
          </p>
          <div className="adm-field">
            <label className="adm-label" htmlFor="author_name">
              Nome do autor (rodapé)
            </label>
            <input id="author_name" name="author_name" defaultValue={values.author_name} />
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="site_description">
              Descrição do site (rodapé e buscadores)
            </label>
            <textarea id="site_description" name="site_description" rows={2} defaultValue={values.site_description} />
          </div>
        </fieldset>
        <fieldset className="adm-group">
          <legend>Página inicial</legend>
          <div className="adm-field">
            <label className="adm-label" htmlFor="home_intro">
              Introdução
            </label>
            <textarea id="home_intro" name="home_intro" rows={4} defaultValue={values.home_intro} />
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="home_quote">
              Citação em destaque
            </label>
            <textarea id="home_quote" name="home_quote" rows={3} defaultValue={values.home_quote} />
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="home_quote_source">
              Fonte da citação
            </label>
            <input id="home_quote_source" name="home_quote_source" defaultValue={values.home_quote_source} />
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="home_quote_href">
              Link da citação (endereço interno)
            </label>
            <input id="home_quote_href" name="home_quote_href" defaultValue={values.home_quote_href} placeholder="/manuscritos/…" />
          </div>
        </fieldset>
        <button type="submit" className="adm-btn adm-btn--primary" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </div>
    </form>
  )
}
