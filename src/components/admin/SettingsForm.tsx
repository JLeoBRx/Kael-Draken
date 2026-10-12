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
        <fieldset className="adm-group">
          <legend>Pergaminho de anúncio</legend>
          <p className="adm-help">
            Aparece uma vez para cada visitante ao entrar na página inicial e fica como seção logo abaixo do topo. Ao mudar o texto, ele volta a aparecer para quem já o
            tinha fechado.
          </p>
          <div className="adm-field adm-field--check">
            <input id="announcement_enabled" name="announcement_enabled" type="checkbox" defaultChecked={values.announcement_enabled !== '0'} />
            <label htmlFor="announcement_enabled">Exibir o pergaminho</label>
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="announcement_kicker">
              Linha superior
            </label>
            <input id="announcement_kicker" name="announcement_kicker" defaultValue={values.announcement_kicker} />
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="announcement_title">
              Título
            </label>
            <input id="announcement_title" name="announcement_title" defaultValue={values.announcement_title} />
          </div>
          <div className="adm-field">
            <label className="adm-label" htmlFor="announcement_body">
              Texto (Markdown)
            </label>
            <textarea id="announcement_body" name="announcement_body" rows={14} defaultValue={values.announcement_body} aria-describedby="announcement_body_help" />
            <p className="adm-help" id="announcement_body_help">
              Revelações vão entre <code>:::spoiler 1</code> (ou <code>2</code>) e <code>:::</code>: só aparecem para quem escolheu esse nível. Notas entre{' '}
              <code>%% %%</code> nunca são publicadas.
            </p>
          </div>
        </fieldset>
        <button type="submit" className="adm-btn adm-btn--primary" disabled={pending}>
          {pending ? 'Salvando…' : 'Salvar configurações'}
        </button>
      </div>
    </form>
  )
}
